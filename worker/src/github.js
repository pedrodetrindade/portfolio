/* ===== INTEGRAÇÃO COM A API DO GITHUB =====
   Só usa a API oficial de Conteúdo (Contents API) via fetch — sem
   dependência externa (sem Octokit), para o Worker ficar pequeno, sem passo
   de build e fácil de auditar por inteiro num arquivo.
   GITHUB_TOKEN nunca é lido de outro lugar além de env (um Cloudflare
   Secret) e nunca é devolvido em nenhuma resposta, log ou mensagem de erro. */

var API = 'https://api.github.com';

function authHeaders(env) {
  return {
    'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    /* obrigatório pela API do GitHub; identifica o app, não a pessoa */
    'User-Agent': 'portfolio-cms-worker'
  };
}

function utf8ToBase64(str) {
  var bytes = new TextEncoder().encode(str);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* Classe de erro própria: carrega um "kind" que as rotas usam para decidir
   o código HTTP e a mensagem pública, sem nunca expor o corpo cru da
   resposta do GitHub (que pode conter detalhes internos). */
function GithubError(kind, status, detail) {
  this.name = 'GithubError';
  this.kind = kind;
  this.status = status;
  this.detail = detail;
}
GithubError.prototype = Object.create(Error.prototype);

async function githubRequest(env, method, path, body) {
  var url = API + '/repos/' + env.GITHUB_OWNER + '/' + env.GITHUB_REPO + '/' + path;
  var res = await fetch(url, {
    method: method,
    headers: Object.assign(authHeaders(env), body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });

  var remaining = res.headers.get('x-ratelimit-remaining');
  if (res.status === 403 && remaining === '0') {
    throw new GithubError('rate_limited', 429, 'Limite de chamadas da API do GitHub atingido. Tente novamente em alguns minutos.');
  }
  if (res.status === 401) {
    throw new GithubError('token_invalid', 502, 'O token do GitHub não foi aceito. Ele pode estar expirado, revogado ou digitado errado no Secret do Worker.');
  }
  if (res.status === 404) {
    throw new GithubError('not_found', 404, 'Arquivo ou repositório não encontrado (ou o token não tem acesso a ele).');
  }
  if (res.status === 409) {
    throw new GithubError('conflict', 409, 'O arquivo foi alterado por outra pessoa (ou outra aba) desde a última leitura. Recarregue e tente de novo.');
  }
  if (!res.ok) {
    var text = '';
    try { text = await res.text(); } catch (e) { }
    throw new GithubError('github_error', 502, 'O GitHub recusou a operação (status ' + res.status + ').' + (text ? ' ' : ''));
  }
  if (res.status === 204) return null;
  return res.json();
}

/* Lê um arquivo de texto (JSON) do repositório. Devolve {content, sha} ou
   null se o arquivo não existir ainda (criação de projeto novo, por
   exemplo). */
async function readFile(env, path) {
  try {
    var data = await githubRequest(env, 'GET', 'contents/' + encodeURIComponent(path).replace(/%2F/g, '/') + '?ref=' + env.GITHUB_BRANCH);
    if (Array.isArray(data)) throw new GithubError('not_a_file', 400, 'O caminho aponta para uma pasta, não um arquivo.');
    var content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    return { content: content, sha: data.sha };
  } catch (e) {
    if (e instanceof GithubError && e.kind === 'not_found') return null;
    throw e;
  }
}

/* Escreve (cria ou atualiza) um arquivo de texto. Se expectedSha for
   passado, o GitHub só aceita a escrita se o arquivo ainda estiver
   exatamente naquele estado — é o controle de concorrência: se alguém mais
   mudou o arquivo entre a leitura e a escrita, a API responde 409 e a
   função lança GithubError('conflict', ...), tratado pela rota chamadora. */
async function writeFile(env, path, content, message, expectedSha) {
  var body = {
    message: message,
    content: utf8ToBase64(content),
    branch: env.GITHUB_BRANCH
  };
  if (expectedSha) body.sha = expectedSha;
  return githubRequest(env, 'PUT', 'contents/' + path, body);
}

/* Upload de imagem: mesma API de conteúdo, só que o corpo já vem em base64
   (a imagem crua), sem passar por texto/UTF-8. */
async function writeBinaryFile(env, path, base64Content, message, expectedSha) {
  var body = {
    message: message,
    content: base64Content,
    branch: env.GITHUB_BRANCH
  };
  if (expectedSha) body.sha = expectedSha;
  return githubRequest(env, 'PUT', 'contents/' + path, body);
}

export { GithubError, readFile, writeFile, writeBinaryFile };
