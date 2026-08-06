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
  MAX_OPS_POR_PUBLICACAO, MAX_BYTES_POR_PUBLICACAO, MAX_REQUEST_BYTES_POR_PUBLICACAO,
  MODOS_VIDEO, VIMEO_HOSTS, isVimeoConfigValido, isPosterValido,
  isSlugValid, bytesOf, erroNosBlocos, erroNoSpacing
} from './validate.js';

/* Cabeçalhos de segurança em toda resposta do Worker — painel (HTML/JS/CSS
   estáticos) e API. Como os dois vivem na mesma origem, não existe necessidade
   de CORS, e por isso nenhum header de CORS é enviado.

   Até a Entrega 4 estes cabeçalhos só chegavam às respostas JSON da API: a
   função json() os aplicava, mas env.ASSETS.fetch(request) — o caminho que
   serve index.html, app.js e styles.css do painel — devolvia a resposta crua,
   sem nenhum deles. O painel administrativo rodava sem CSP, sem
   X-Frame-Options, sem nada. Corrigido em applyBaseHeaders(), chamado no fim
   de fetch() para toda resposta, dos dois caminhos.

   frame-src 'self' https: — o painel embute a prévia do site num <iframe>
   (Fase 1), e o destino é o que a pessoa configurar em "URL da prévia":
   localhost durante o desenvolvimento, ou o domínio real em produção. Não dá
   para prever o host com antecedência, e é exatamente essa prévia que o
   escopo desta auditoria pede para não quebrar — por isso https: (não *) em
   vez de restringir a uma lista, que exigiria editar código toda vez que o
   domínio de preview mudasse.
   Isto não abre uma porta nova: a página do painel já podia (e continua
   podendo) embutir qualquer coisa via <iframe>, porque nenhum CSP existia
   antes. O que muda é que passa a ter alguma restrição (https, não http nem
   dado arbitrário) em vez de nenhuma.
   O SITE PÚBLICO (index.html raiz, publicado pelo GitHub Pages) não é servido
   por este Worker — está fora do alcance destes cabeçalhos. É lá que o
   <iframe> do Vimeo é criado; ver a nota em conferirVimeoExiste sobre o motivo
   de a validação de existência do vídeo acontecer aqui e não lá. */
var SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cache-Control': 'no-store',
  /* frame-src precisa aceitar http://localhost:* além de https: — a prévia
     local (worker/public/app.js, urlDaPrevia()) roda contra
     http://localhost:5500 ou :8123 durante o desenvolvimento, e todo o
     workflow de teste deste projeto depende disso (ver CLAUDE.md). Restringir
     a https: sozinho quebraria exatamente a prévia que esta auditoria pediu
     para preservar. Em produção a URL de prévia normalmente aponta para o
     domínio publicado (https), que já cai em "https:". */
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; frame-src 'self' https: http://localhost:*; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};

/* Aplica o conjunto acima por cima de QUALQUER resposta, sem depender de cada
   rota lembrar de chamar json(). Preserva status e corpo originais; só
   acrescenta cabeçalho que ainda não exista (uma resposta de erro específica
   pode declarar o próprio Content-Type, por exemplo, e não deve perdê-lo). */
function comCabecalhosDeSeguranca(response) {
  var h = new Headers(response.headers);
  Object.keys(SECURITY_HEADERS).forEach(function (k) { h.set(k, SECURITY_HEADERS[k]); });
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

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

async function readJsonBody(request, maxBytes) {
  var limite = maxBytes || MAX_JSON_BYTES;
  var rotuloLimite = limite >= 1024 * 1024
    ? Math.round(limite / 1024 / 1024) + 'MB'
    : Math.round(limite / 1024) + 'KB';
  var declarado = Number(request.headers.get('content-length'));
  if (declarado && declarado > limite) {
    throw new GithubError('payload_too_large', 413, 'O conteúdo enviado passa do limite de ' + rotuloLimite + '.');
  }
  var text = await request.text();
  if (bytesOf(text) > limite) {
    throw new GithubError('payload_too_large', 413, 'O conteúdo enviado passa do limite de ' + rotuloLimite + '.');
  }
  try { return JSON.parse(text); } catch (e) {
    throw new GithubError('invalid_json', 400, 'O corpo da requisição não é um JSON válido.');
  }
}


/* Reordena o objeto seguindo a lista conhecida, para o arquivo publicado não
   trocar de ordem de chaves a cada publicação (o que produziria um diff
   cosmético enorme). SÓ reordena: nada é removido aqui.
   A versão anterior usava pickKnownKeys, que descartava em silêncio o que não
   reconhecia. Isso era destrutivo: um campo novo, legítimo, adicionado fora do
   CMS desaparecia na primeira publicação sem ninguém ficar sabendo. Agora
   chave desconhecida derruba a publicação (422) antes de chegar aqui. */
function reordenarChaves(obj, ordem) {
  var out = {};
  ordem.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; });
  return out;
}

/* Chaves de topo aceitas por arquivo.
   A ORDEM importa: reordenarChaves reescreve o arquivo seguindo esta lista, e
   uma ordem diferente da que os arquivos já têm produz um diff cosmético
   gigante. $schema vem primeiro porque é onde ele está nos arquivos hoje. */
var CHAVES_DE_TOPO = {
  'content/global.json': ['$schema', 'colors', 'typography', 'borders', 'layout', 'motion', 'effects', 'header', 'footer', 'social', 'seo'],
  'content/home.json': ['$schema', 'hero', 'sections', 'work', 'about', 'help', 'faq', 'contact'],
  /* cardSizes antes de projects: é a ordem que o arquivo tem hoje. Trocar
     produziria um diff cosmético de 14 linhas na primeira publicação. */
  'content/projects/index.json': ['$schema', 'cardSizes', 'projects'],
  /* coverSpacing entra aqui porque o painel pode criá-lo (espaçamento da capa)
     mesmo que nenhum projeto o tenha hoje */
  '__projeto__': ['$schema', 'slug', 'status', 'grainEnabled', 'client', 'year', 'category', 'services',
    'seo', 'hero', 'cover', 'coverMobile', 'coverSpacing', 'blocks']
};

/* O arquivo de um projeto tem slug variável, então não cabe numa chave fixa do
   mapa acima. */
function chavesPermitidasPara(caminho) {
  if (CHAVES_DE_TOPO[caminho]) return CHAVES_DE_TOPO[caminho];
  if (/^content\/projects\/[a-z0-9-]+\.json$/.test(caminho)) return CHAVES_DE_TOPO.__projeto__;
  return null;
}

function erroNosEfeitosGlobais(effects) {
  if (effects === undefined) return null;
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) return 'effects precisa ser um objeto.';
  if (effects.grain === undefined) return null;
  var grain = effects.grain;
  if (!grain || typeof grain !== 'object' || Array.isArray(grain)) return 'effects.grain precisa ser um objeto.';
  if (grain.enabled !== undefined && typeof grain.enabled !== 'boolean') return 'effects.grain.enabled precisa ser verdadeiro ou falso.';
  if (grain.opacity !== undefined && (typeof grain.opacity !== 'number' || !Number.isFinite(grain.opacity) || grain.opacity < 0 || grain.opacity > 12)) {
    return 'effects.grain.opacity precisa estar entre 0 e 12%.';
  }
  return null;
}

function erroNaAparenciaDaHome(home) {
  var status = home && home.hero ? home.hero.availabilityStatus : undefined;
  if (status !== undefined && ['available', 'unavailable', 'hidden'].indexOf(status) === -1) {
    return 'hero.availabilityStatus precisa ser available, unavailable ou hidden.';
  }
  var sections = home && home.sections;
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return null;
  var ids = ['hero', 'work', 'about', 'help', 'faq', 'contact'];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i], s = sections[id];
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    if (s.backgroundImage !== undefined && s.backgroundImage !== '' && !isPosterValido(s.backgroundImage)) {
      return 'sections.' + id + '.backgroundImage precisa ser uma imagem em assets/ ou uma URL HTTPS válida.';
    }
    if (s.backgroundImageOpacity !== undefined && (typeof s.backgroundImageOpacity !== 'number' || !Number.isFinite(s.backgroundImageOpacity) || s.backgroundImageOpacity < 0 || s.backgroundImageOpacity > 100)) {
      return 'sections.' + id + '.backgroundImageOpacity precisa estar entre 0 e 100%.';
    }
    if (s.backgroundPosition !== undefined && ['center', 'top', 'bottom'].indexOf(s.backgroundPosition) === -1) {
      return 'sections.' + id + '.backgroundPosition precisa ser center, top ou bottom.';
    }
    if (s.grainEnabled !== undefined && typeof s.grainEnabled !== 'boolean') {
      return 'sections.' + id + '.grainEnabled precisa ser verdadeiro ou falso.';
    }
  }
  return null;
}

/* Confere o vídeo de fundo da capa. Devolve null quando está tudo bem, ou
   {status, corpo} para a rota responder e abortar a publicação inteira.
   Nada de conteúdo antigo é exigido: hero sem videoMode e sem vimeo continua
   passando, porque é exatamente o que existe hoje no repositório. */
function validarVideoDaCapa(hero) {
  if (!hero || typeof hero !== 'object') return null;

  if (hero.videoMode !== undefined) {
    if (MODOS_VIDEO.indexOf(hero.videoMode) === -1) {
      return {
        status: 422,
        corpo: {
          error: 'invalid_video_mode',
          message: 'Modo de vídeo da capa inválido: "' + String(hero.videoMode) +
            '". Use um de: ' + MODOS_VIDEO.join(', ') + '. Nada foi publicado.',
          path: 'content/home.json'
        }
      };
    }
  }

  if (hero.vimeo !== undefined && hero.vimeo !== null) {
    if (!isVimeoConfigValido(hero.vimeo)) {
      return {
        status: 422,
        corpo: {
          error: 'invalid_vimeo',
          message: 'Endereço do Vimeo inválido. Aceita apenas https em ' + VIMEO_HOSTS.join(', ') +
            ', com id numérico e, se houver, hash alfanumérico. Nada foi publicado.',
          path: 'content/home.json'
        }
      };
    }
  }
  /* modo vimeo sem configuração renderizaria uma capa vazia */
  if (hero.videoMode === 'vimeo' && !isVimeoConfigValido(hero.vimeo)) {
    return {
      status: 422,
      corpo: {
        error: 'invalid_vimeo',
        message: 'O modo Vimeo está selecionado mas não há um endereço válido salvo. Nada foi publicado.',
        path: 'content/home.json'
      }
    };
  }

  if (hero.backgroundVideoPoster !== undefined && !isPosterValido(hero.backgroundVideoPoster)) {
    return {
      status: 422,
      corpo: {
        error: 'invalid_poster',
        message: 'O poster deve ser uma imagem, não o link do vídeo. Nada foi publicado.',
        path: 'content/home.json'
      }
    };
  }
  return null;
}

/* O site não consegue saber se um vídeo do Vimeo existe: o iframe é de outra
   origem, e o player responde 200 com a PRÓPRIA tela de erro ("Desculpe, este
   vídeo não existe"), que apareceria por cima da capa. Detectar isso no
   navegador exigiria o SDK (player.js), que o escopo proíbe.
   Então a checagem acontece aqui, uma vez, na publicação: oEmbed é um endpoint
   público de metadados, não o SDK, e responde 404 ou 403 para vídeo
   inexistente ou privado.
   Falha de REDE não derruba a publicação: publicar não pode depender de o
   Vimeo estar no ar. Só uma resposta explícita de indisponível bloqueia. */
async function conferirVimeoExiste(cfg) {
  if (!cfg || !cfg.videoId) return null;
  var alvo = 'https://vimeo.com/' + cfg.videoId + (cfg.hash ? '/' + cfg.hash : '');
  var res;
  try {
    res = await fetch('https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(alvo), {
      headers: { 'User-Agent': 'portfolio-cms-worker' }
    });
  } catch (e) {
    return null;   /* Vimeo inalcançável: segue em frente */
  }
  if (res.status === 404 || res.status === 403 || res.status === 401) {
    return {
      status: 422,
      corpo: {
        error: 'vimeo_indisponivel',
        message: 'O Vimeo respondeu que este vídeo não está disponível (' + res.status +
          '). Confira se o id está certo e se o vídeo é público ou não listado com o hash correto. Nada foi publicado.',
        path: 'content/home.json'
      }
    };
  }
  return null;
}

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
  /* /api/publish inclui mídia em base64. Usar aqui o teto editorial de 200KB
     era o verdadeiro bloqueio que fazia arquivos pequenos falharem antes da
     validação específica de mídia. */
  var body = await readJsonBody(request, MAX_REQUEST_BYTES_POR_PUBLICACAO);
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
      /* Chave de topo desconhecida derruba a publicação inteira, em vez de
         ser descartada. Descartar em silêncio era destrutivo: um campo novo e
         legítimo, adicionado fora do CMS, desaparecia na primeira publicação
         sem ninguém ficar sabendo. Bloquear devolve a decisão a quem edita —
         ou o campo entra na lista de conhecidos, ou sai do arquivo. */
      var permitidas = chavesPermitidasPara(caminho);
      if (permitidas) {
        var desconhecidas = Object.keys(op.data).filter(function (k) { return permitidas.indexOf(k) === -1; });
        if (desconhecidas.length) {
          return json({
            error: 'unknown_fields',
            message: 'Campo desconhecido em ' + caminho + ': ' + desconhecidas.join(', ') +
              '. Nada foi publicado. Remova o campo ou inclua-o na lista de campos conhecidos do Worker.',
            path: caminho,
            keys: desconhecidas
          }, 422);
        }
      }
      /* Validação do vídeo de fundo da capa. Fica aqui, e não só no painel,
         porque o painel é conveniência: quem decide é o Worker. Um payload
         montado à mão não pode enfiar iframe, script ou domínio de terceiro
         no JSON e esperar que o site renderize. */
      /* Blocos do projeto. Mesma razão da validação acima: o painel é
         conveniência, o Worker é quem decide. Um bloco com tipo inventado ou
         com src apontando para fora do repositório não pode ser gravado só
         porque alguém montou o JSON à mão. */
      if (/^content\/projects\/[a-z0-9-]+\.json$/.test(caminho)) {
        var slugDoCaminho = caminho.match(/^content\/projects\/([a-z0-9-]+)\.json$/)[1];
        if (!isSlugValid(op.data.slug) || op.data.slug !== slugDoCaminho) {
          return json({
            error: 'slug_mismatch',
            message: 'O slug interno do projeto precisa ser igual ao nome do arquivo em ' + caminho + '.',
            path: caminho
          }, 422);
        }
        if (op.data.grainEnabled !== undefined && typeof op.data.grainEnabled !== 'boolean') {
          return json({
            error: 'invalid_grain',
            message: 'grainEnabled precisa ser verdadeiro ou falso em ' + caminho + '.',
            path: caminho
          }, 422);
        }
        var erroCapaSpacing = erroNoSpacing(op.data.coverSpacing, false);
        if (erroCapaSpacing) {
          return json({
            error: 'invalid_spacing',
            message: 'Em ' + caminho + ', coverSpacing: ' + erroCapaSpacing + ' Nada foi publicado.',
            path: caminho
          }, 422);
        }
        var erroBloco = erroNosBlocos(op.data.blocks);
        if (erroBloco) {
          return json({
            error: 'invalid_block',
            message: 'Em ' + caminho + ', ' + erroBloco + ' Nada foi publicado.',
            path: caminho
          }, 422);
        }
      }
      if (caminho === 'content/home.json') {
        var erroAparencia = erroNaAparenciaDaHome(op.data);
        if (erroAparencia) return json({ error: 'invalid_appearance', message: erroAparencia + ' Nada foi publicado.', path: caminho }, 422);
        var erroVideo = validarVideoDaCapa(op.data.hero);
        if (erroVideo) return json(erroVideo.corpo, erroVideo.status);
        op.__conferirVimeo = op.data.hero && op.data.hero.videoMode === 'vimeo' ? op.data.hero.vimeo : null;
      }
      if (caminho === 'content/global.json') {
        var erroEfeitos = erroNosEfeitosGlobais(op.data.effects);
        if (erroEfeitos) return json({ error: 'invalid_effects', message: erroEfeitos + ' Nada foi publicado.', path: caminho }, 422);
      }
      var texto = JSON.stringify(permitidas ? reordenarChaves(op.data, permitidas) : op.data, null, 2) + '\n';
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

  /* ---- 1b. o vídeo do Vimeo existe mesmo? ----
     Ainda antes de tocar o GitHub. Só bloqueia com resposta explícita de
     indisponível; Vimeo fora do ar não impede publicar. */
  for (var v = 0; v < preparadas.length; v++) {
    if (!preparadas[v].__conferirVimeo) continue;
    var erroVimeo = await conferirVimeoExiste(preparadas[v].__conferirVimeo);
    if (erroVimeo) return json(erroVimeo.corpo, erroVimeo.status);
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
      var estatico = await env.ASSETS.fetch(request);
      return comCabecalhosDeSeguranca(estatico);
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
      var resposta = await route(request, env);
      return comCabecalhosDeSeguranca(resposta);
    } catch (e) {
      return comCabecalhosDeSeguranca(errorResponse(e));
    }
  }
};
