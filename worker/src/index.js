import { verifyAccessJWT } from './access.js';
/* writeFile, writeBinaryFile e deleteFile continuam em github.js (Contents
   API), mas o Worker não os importa mais: toda escrita passa pela Git Data
   API, num commit único. */
import {
  GithubError, readFile,
  getRef, getCommit, createBlob, createTree, createCommit, updateRef, getFileSha
} from './github.js';
import {
  MAX_JSON_BYTES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME,
  isPathWritable, isPagePathWritable, isUploadPathWritable,
  MAX_OPS_POR_PUBLICACAO, MAX_BYTES_POR_PUBLICACAO,
  isSlugValid, bytesOf
} from './validate.js';

/* Cabeçalhos de segurança em toda resposta da API. Como painel e API vivem
   na mesma origem (o mesmo Worker serve os dois), não existe necessidade de
   CORS — e por isso nenhum header de CORS é enviado. */
var SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'"
};

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, SECURITY_HEADERS, extraHeaders || {})
  });
}

/* Mensagens de erro voltadas para quem não programa, nunca o detalhe cru do
   GitHub nem qualquer coisa que possa conter o token. */
function errorResponse(e) {
  if (e instanceof GithubError) {
    return json({ error: e.kind, message: e.detail }, e.status);
  }
  console.error('[worker] erro inesperado:', e && e.message);
  return json({ error: 'internal_error', message: 'Algo deu errado no Worker. Tente novamente; se persistir, veja os logs (wrangler tail).' }, 500);
}

async function readJsonBody(request) {
  var text = await request.text();
  if (bytesOf(text) > MAX_JSON_BYTES) {
    throw new GithubError('payload_too_large', 413, 'O conteúdo enviado passa do limite de ' + Math.round(MAX_JSON_BYTES / 1024) + 'KB.');
  }
  try { return JSON.parse(text); } catch (e) {
    throw new GithubError('invalid_json', 400, 'O corpo da requisição não é um JSON válido.');
  }
}

/* Bloqueia campos desconhecidos: só os nomes de topo esperados sobrevivem.
   Não impede um objeto aninhado incorreto (isso é responsabilidade de cada
   rota), mas impede que um payload traga chaves estranhas escondidas junto
   com as válidas. */
function pickKnownKeys(obj, knownKeys) {
  var out = {};
  knownKeys.forEach(function (k) { if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; });
  return out;
}

/* Chaves de topo aceitas por arquivo. Herdado das rotas PUT que a publicação
   atômica substituiu: sem isto, a publicação seria MAIS permissiva que a rota
   que veio substituir, e um payload poderia enfiar chaves estranhas escondidas
   junto com as válidas. Arquivo de projeto fica de fora porque sua estrutura
   varia legitimamente (blocks, coverSpacing, seo...). */
/* A ORDEM importa: pickKnownKeys reescreve o arquivo seguindo esta lista, e
   uma ordem diferente da que os arquivos já têm produz um diff cosmético
   gigante na primeira publicação. $schema vem primeiro porque é onde ele está
   nos arquivos hoje. */
var CHAVES_DE_TOPO = {
  'content/global.json': ['$schema', 'colors', 'typography', 'borders', 'layout', 'motion', 'header', 'footer', 'social', 'seo'],
  'content/home.json': ['$schema', 'hero', 'sections', 'work', 'about', 'help', 'faq', 'contact'],
  'content/projects/index.json': ['$schema', 'projects', 'cardSizes']
};

async function handleGetFile(env, path) {
  var file = await readFile(env, path);
  if (!file) return json({ error: 'not_found', message: 'Arquivo ainda não existe: ' + path }, 404);
  var data;
  try { data = JSON.parse(file.content); } catch (e) {
    return json({ error: 'corrupted_file', message: 'O arquivo salvo no GitHub não é um JSON válido.' }, 500);
  }
  return json({ data: data, sha: file.sha });
}

async function route(request, env) {
  var url = new URL(request.url);
  var method = request.method;

  if (url.pathname === '/api/status' && method === 'GET') {
    /* Chegar até aqui já significa que verifyAccessJWT aprovou a requisição
       (checagem em fetch(), antes de route() ser chamado) — logo authenticated
       é sempre true neste ponto. authMode só troca o rótulo: accessConfigured
       distingue "Access não configurado" (o caso normal aqui, em dev) de
       "Access configurado" (produção), sem que o frontend precise inferir
       autenticação a partir dessa flag, como acontecia antes. */
    return json({
      ok: true,
      authenticated: true,
      authMode: env.DEV_AUTH_BYPASS === 'true' ? 'local-bypass' : 'cloudflare-access',
      repo: env.GITHUB_OWNER + '/' + env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      accessConfigured: !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && env.ADMIN_EMAIL)
    });
  }

  /* ===== LEITURA ===== */
  if (url.pathname === '/api/global' && method === 'GET') return handleGetFile(env, 'content/global.json');
  if (url.pathname === '/api/home' && method === 'GET') return handleGetFile(env, 'content/home.json');
  if (url.pathname === '/api/projects' && method === 'GET') return handleGetFile(env, 'content/projects/index.json');

  var projectMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
  if (projectMatch && method === 'GET') return handleGetFile(env, 'content/projects/' + projectMatch[1] + '.json');

  /* ===== ESCRITA: UMA PORTA SÓ =====
     /api/publish é o único caminho de escrita que existe. As rotas que havia
     aqui antes — PUT em cada arquivo, POST /api/projects, POST .../duplicate,
     DELETE /api/projects/:slug e POST /api/uploads — cada uma criava commit
     na hora, fora de qualquer revisão. Enquanto elas existissem, a promessa
     de "nada vai ao GitHub antes de Publicar" dependeria de o painel não
     chamá-las, e não de o Worker recusar. Foram removidas: agora nenhum
     caminho de escrita contorna a publicação atômica.
     Se uma aba antiga tentar uma delas, recebe 410 com explicação em vez de
     um 404 seco. */
  var ROTAS_REMOVIDAS = [
    { m: 'PUT', re: /^\/api\/(global|home|projects)$/ },
    { m: 'PUT', re: /^\/api\/projects\/[a-z0-9-]+$/ },
    { m: 'DELETE', re: /^\/api\/projects\/[a-z0-9-]+$/ },
    { m: 'POST', re: /^\/api\/projects$/ },
    { m: 'POST', re: /^\/api\/projects\/[a-z0-9-]+\/duplicate$/ },
    { m: 'POST', re: /^\/api\/uploads$/ }
  ];
  for (var ri = 0; ri < ROTAS_REMOVIDAS.length; ri++) {
    if (method === ROTAS_REMOVIDAS[ri].m && ROTAS_REMOVIDAS[ri].re.test(url.pathname)) {
      return json({
        error: 'gone',
        message: 'Esta rota foi removida. Toda escrita passa por /api/publish, num commit único. Recarregue o painel.'
      }, 410);
    }
  }

  if (url.pathname === '/api/publish' && method === 'POST') return handlePublish(request, env);

  return json({ error: 'not_found', message: 'Rota inexistente.' }, 404);
}

/* ===== PUBLICAÇÃO ATÔMICA =====
   Recebe TODAS as operações pendentes e as transforma em UM commit.

   A versão anterior fazia um writeFile por arquivo pela Contents API: quatro
   arquivos alterados viravam quatro commits, e se o terceiro falhasse os dois
   primeiros já estavam publicados, sem desfazer. O `break` no erro evitava a
   cascata, mas não a publicação parcial.

   Agora tudo é validado primeiro, depois vira blob, depois UMA árvore, depois
   UM commit, e só no fim a branch se move uma única vez. Enquanto a
   referência não é movida, nada existe para quem clona o repositório — então
   falhar no meio não deixa resto.

   Tipos de operação aceitos:
     json    — conteúdo estruturado, whitelist de content/
     binary  — mídia em base64, whitelist de assets/uploads/
     page    — página de projeto; o HTML NUNCA vem do cliente, o Worker lê o
               modelo do próprio repositório
     delete  — remoção de um caminho de qualquer uma das whitelists  */
async function handlePublish(request, env) {
  var body = await readJsonBody(request);
  /* aceita o formato antigo ({files:[...]}) para uma aba que ficou aberta
     durante o deploy não quebrar: vira uma lista de operações json */
  var ops = body && Array.isArray(body.ops) ? body.ops
    : (body && Array.isArray(body.files) ? body.files.map(function (f) {
      return { type: 'json', path: f.path, data: f.data, sha: f.sha };
    }) : null);

  if (!Array.isArray(ops) || !ops.length) {
    return json({ error: 'nothing_to_publish', message: 'Nenhuma alteração para publicar.' }, 400);
  }
  if (ops.length > MAX_OPS_POR_PUBLICACAO) {
    return json({ error: 'too_many_ops', message: 'Publicação com operações demais (limite de ' + MAX_OPS_POR_PUBLICACAO + ').' }, 413);
  }

  /* ---- 1. validação: nada toca o GitHub antes de tudo passar ---- */
  var preparadas = [], totalBytes = 0, vistos = {};
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i] || {};
    var tipo = op.type;
    var caminho = op.path;

    if (tipo === 'page') {
      if (!isSlugValid(op.slug)) return json({ error: 'invalid_slug', message: 'Slug inválido para página de projeto.' }, 400);
      if (op.fromSlug != null && !isSlugValid(op.fromSlug)) return json({ error: 'invalid_slug', message: 'Slug de origem inválido.' }, 400);
      caminho = 'work/' + op.slug + '.html';
      if (!isPagePathWritable(caminho)) return json({ error: 'path_not_allowed', message: 'Caminho de página não autorizado.' }, 403);
    } else if (tipo === 'json') {
      if (!isPathWritable(caminho)) return json({ error: 'path_not_allowed', message: 'Caminho não autorizado: ' + caminho }, 403);
      if (!op.data || typeof op.data !== 'object') {
        return json({ error: 'invalid_data', message: 'Conteúdo ausente ou inválido em ' + caminho + '.' }, 400);
      }
      var permitidas = CHAVES_DE_TOPO[caminho];
      var texto = JSON.stringify(permitidas ? pickKnownKeys(op.data, permitidas) : op.data, null, 2) + '\n';
      var b = bytesOf(texto);
      if (b > MAX_JSON_BYTES) return json({ error: 'payload_too_large', message: 'Arquivo ' + caminho + ' passa do limite de tamanho.' }, 413);
      totalBytes += b;
      op.__texto = texto;
    } else if (tipo === 'binary') {
      if (!isUploadPathWritable(caminho)) return json({ error: 'path_not_allowed', message: 'Caminho de mídia não autorizado: ' + caminho }, 403);
      if (typeof op.contentBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(op.contentBase64)) {
        return json({ error: 'invalid_upload', message: 'Conteúdo de mídia inválido em ' + caminho + '.' }, 400);
      }
      var bruto = Math.floor(op.contentBase64.length * 3 / 4);
      if (bruto > MAX_UPLOAD_BYTES) return json({ error: 'file_too_large', message: 'Arquivo ' + caminho + ' maior que ' + Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) + 'MB.' }, 413);
      /* extensão x MIME declarado, a mesma checagem do upload avulso */
      var ext = caminho.slice(caminho.lastIndexOf('.'));
      var mimeEsperado = ALLOWED_UPLOAD_MIME[ext];
      if (op.mime && mimeEsperado && op.mime !== mimeEsperado && !(ext === '.jpg' && op.mime === 'image/jpg')) {
        return json({ error: 'mime_mismatch', message: 'O tipo do arquivo não corresponde à extensão em ' + caminho + '.' }, 400);
      }
      totalBytes += bruto;
    } else if (tipo === 'delete') {
      if (!isPathWritable(caminho) && !isPagePathWritable(caminho) && !isUploadPathWritable(caminho)) {
        return json({ error: 'path_not_allowed', message: 'Caminho não autorizado para exclusão: ' + caminho }, 403);
      }
    } else {
      return json({ error: 'invalid_op', message: 'Tipo de operação desconhecido.' }, 400);
    }

    if (vistos[caminho]) return json({ error: 'duplicate_path', message: 'O mesmo caminho aparece duas vezes: ' + caminho }, 400);
    vistos[caminho] = true;
    op.__path = caminho;
    preparadas.push(op);
  }
  if (totalBytes > MAX_BYTES_POR_PUBLICACAO) {
    return json({ error: 'payload_too_large', message: 'Publicação maior que ' + Math.round(MAX_BYTES_POR_PUBLICACAO / 1024 / 1024) + 'MB no total.' }, 413);
  }

  try {
    /* ---- 2. conflito: confere cada caminho tocado contra o remoto ----
       Antes de montar qualquer coisa. Se alguém mexeu no mesmo arquivo desde
       que o painel leu, a publicação inteira para e o trabalho local fica
       intacto para a pessoa decidir o que fazer. */
    var conflitos = [];
    for (var c = 0; c < preparadas.length; c++) {
      var pc = preparadas[c];
      if (pc.type === 'page' || pc.sha === undefined) continue;  /* página nova não tem base */
      var atual = await getFileSha(env, pc.__path);
      var esperado = pc.sha || null;
      if ((atual || null) !== esperado) conflitos.push(pc.__path);
    }
    if (conflitos.length) {
      return json({
        error: 'conflict',
        message: 'Estes arquivos mudaram no repositório desde que você abriu o painel: ' + conflitos.join(', ') + '. Nada foi publicado.',
        paths: conflitos
      }, 409);
    }

    /* ---- 3. blobs ---- */
    var entradas = [];
    for (var p = 0; p < preparadas.length; p++) {
      var o = preparadas[p];
      if (o.type === 'delete') {
        entradas.push({ path: o.__path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      var blobSha;
      if (o.type === 'json') {
        blobSha = await createBlob(env, o.__texto, 'utf-8');
      } else if (o.type === 'binary') {
        blobSha = await createBlob(env, o.contentBase64, 'base64');
      } else { /* page */
        /* o HTML nunca vem do cliente: é lido de um modelo já versionado e
           testado, e o cliente só escolhe o slug */
        var modeloPath = 'work/' + (o.fromSlug || 'case-01') + '.html';
        var modelo = await readFile(env, modeloPath);
        if (!modelo) return json({ error: 'template_missing', message: 'Modelo de página não encontrado: ' + modeloPath }, 500);
        blobSha = await createBlob(env, modelo.content, 'utf-8');
      }
      entradas.push({ path: o.__path, mode: '100644', type: 'blob', sha: blobSha });
    }

    /* ---- 4. uma árvore, um commit, um movimento da branch ---- */
    var refSha = await getRef(env, env.GITHUB_BRANCH);
    var commitBase = await getCommit(env, refSha);
    var treeSha = await createTree(env, commitBase.tree.sha, entradas);
    var mensagem = (typeof body.message === 'string' && body.message.trim()) || ('cms: publica ' + preparadas.length + ' alteração(ões)');
    var novoCommit = await createCommit(env, mensagem, treeSha, refSha);
    await updateRef(env, env.GITHUB_BRANCH, novoCommit);

    /* SHAs novos, para o painel seguir detectando conflito na próxima vez */
    var shasFinais = {};
    for (var s = 0; s < preparadas.length; s++) {
      var ps = preparadas[s];
      if (ps.type === 'delete') continue;
      shasFinais[ps.__path] = await getFileSha(env, ps.__path);
    }

    return json({
      ok: true, commit: novoCommit, publishedAt: new Date().toISOString(),
      paths: preparadas.map(function (x) { return x.__path; }), shas: shasFinais
    });
  } catch (e) {
    /* Falhou em qualquer ponto: a branch não foi movida, então não existe
       publicação parcial. Blobs eventualmente criados ficam órfãos e o GitHub
       os recolhe sozinho — nenhum deles é alcançável por nenhuma branch. */
    var kind = e instanceof GithubError ? e.kind : 'unknown';
    var detalhe = e instanceof GithubError ? e.detail : 'Erro inesperado ao publicar.';
    return json({ error: kind, message: detalhe + ' Nada foi publicado.' }, kind === 'conflict' ? 409 : 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (!['GET', 'PUT', 'POST', 'DELETE'].includes(request.method)) {
      return json({ error: 'method_not_allowed' }, 405);
    }

    var access = await verifyAccessJWT(request, env);
    if (!access.ok) {
      return json({ error: 'unauthorized', reason: access.reason }, 401);
    }
    /* leitura pode ser feita por qualquer sessão autenticada pelo Access;
       escrita também exige o Access (já verificado acima) — a rota em si
       não distingue leitura/escrita além disso, porque só existe uma
       pessoa autorizada (ADMIN_EMAIL) em todo este sistema. */

    try {
      return await route(request, env);
    } catch (e) {
      return errorResponse(e);
    }
  }
};
