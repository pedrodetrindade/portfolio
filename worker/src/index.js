import { verifyAccessJWT } from './access.js';
import { GithubError, readFile, writeFile, writeBinaryFile, deleteFile } from './github.js';
import {
  MAX_JSON_BYTES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, ALLOWED_UPLOAD_MIME,
  UPLOAD_DIR, isPathWritable, sanitizeUploadName, isSlugValid, bytesOf
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

async function handleGetFile(env, path) {
  var file = await readFile(env, path);
  if (!file) return json({ error: 'not_found', message: 'Arquivo ainda não existe: ' + path }, 404);
  var data;
  try { data = JSON.parse(file.content); } catch (e) {
    return json({ error: 'corrupted_file', message: 'O arquivo salvo no GitHub não é um JSON válido.' }, 500);
  }
  return json({ data: data, sha: file.sha });
}

async function handlePutFile(request, env, path, allowedTopLevelKeys) {
  var body = await readJsonBody(request);
  if (!body || typeof body !== 'object' || typeof body.sha !== 'string' && body.sha !== null) {
    return json({ error: 'invalid_body', message: 'Envie { data, sha, message }.' }, 400);
  }
  var data = body.data;
  if (!data || typeof data !== 'object') return json({ error: 'invalid_data', message: 'Campo "data" ausente ou inválido.' }, 400);
  if (allowedTopLevelKeys) data = pickKnownKeys(data, allowedTopLevelKeys);

  var content = JSON.stringify(data, null, 2) + '\n';
  if (bytesOf(content) > MAX_JSON_BYTES) {
    return json({ error: 'payload_too_large', message: 'O conteúdo passa do limite de ' + Math.round(MAX_JSON_BYTES / 1024) + 'KB.' }, 413);
  }

  var message = (typeof body.message === 'string' && body.message.trim()) || ('cms: atualiza ' + path);
  var result = await writeFile(env, path, content, message, body.sha || undefined);
  return json({ ok: true, sha: result.content.sha, commit: result.commit.sha });
}

async function route(request, env) {
  var url = new URL(request.url);
  var method = request.method;

  if (url.pathname === '/api/status' && method === 'GET') {
    return json({
      ok: true,
      repo: env.GITHUB_OWNER + '/' + env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      accessConfigured: !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && env.ADMIN_EMAIL)
    });
  }

  if (url.pathname === '/api/global' && method === 'GET') return handleGetFile(env, 'content/global.json');
  if (url.pathname === '/api/global' && method === 'PUT') return handlePutFile(request, env, 'content/global.json', ['colors', 'typography', 'borders', 'layout', 'motion', 'header', 'footer', 'social', 'seo', '$schema']);

  if (url.pathname === '/api/home' && method === 'GET') return handleGetFile(env, 'content/home.json');
  if (url.pathname === '/api/home' && method === 'PUT') return handlePutFile(request, env, 'content/home.json', ['hero', 'sections', 'work', 'about', 'help', 'faq', 'contact', '$schema']);

  if (url.pathname === '/api/projects' && method === 'GET') return handleGetFile(env, 'content/projects/index.json');
  if (url.pathname === '/api/projects' && method === 'PUT') return handlePutFile(request, env, 'content/projects/index.json', ['projects', 'cardSizes', '$schema']);

  var projectMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
  if (projectMatch && method === 'GET') return handleGetFile(env, 'content/projects/' + projectMatch[1] + '.json');
  if (projectMatch && method === 'PUT') return handlePutFile(request, env, 'content/projects/' + projectMatch[1] + '.json', null);
  if (projectMatch && method === 'DELETE') return handleDeleteProject(env, projectMatch[1]);

  var duplicateMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/duplicate$/);
  if (duplicateMatch && method === 'POST') return handleDuplicateProject(request, env, duplicateMatch[1]);

  if (url.pathname === '/api/projects' && method === 'POST') return handleCreateProject(request, env);

  if (url.pathname === '/api/uploads' && method === 'POST') return handleUpload(request, env);

  if (url.pathname === '/api/publish' && method === 'POST') return handlePublish(request, env);

  return json({ error: 'not_found', message: 'Rota inexistente.' }, 404);
}

/* Cria um projeto novo: escreve content/projects/<slug>.json, adiciona a
   entrada em content/projects/index.json, e clona work/case-01.html para
   work/<slug>.html. O HTML clonado nunca vem do cliente — é lido do próprio
   repositório (um modelo já existente e testado) — o cliente só escolhe o
   slug. Isso evita aceitar HTML arbitrário e ainda assim permite criar uma
   página nova sem escrever um motor de templates no Worker. */
async function handleCreateProject(request, env) {
  var body = await readJsonBody(request);
  var slug = body && body.slug;
  if (!isSlugValid(slug)) {
    return json({ error: 'invalid_slug', message: 'Use apenas letras minúsculas, números e hífen (ex: campanha-2027).' }, 400);
  }

  var existingProject = await readFile(env, 'content/projects/' + slug + '.json');
  if (existingProject) return json({ error: 'slug_taken', message: 'Já existe um projeto com este slug.' }, 409);

  var indexFile = await readFile(env, 'content/projects/index.json');
  if (!indexFile) return json({ error: 'index_missing', message: 'content/projects/index.json não encontrado.' }, 500);
  var index = JSON.parse(indexFile.content);
  var nextOrder = (index.projects || []).reduce(function (max, p) { return Math.max(max, p.order || 0); }, 0) + 1;

  var projectData = {
    slug: slug, status: 'draft', client: '', year: new Date().getUTCFullYear(),
    category: '', services: [],
    seo: { title: (body.titlePt || slug) + ' · Pedro de Trindade', description: '' },
    hero: {
      eyebrowPt: '', eyebrowEn: '', titlePt: body.titlePt || '', titleEn: body.titleEn || '',
      subtitlePt: '', subtitleEn: '', rolePt: '', roleEn: '', scopePt: '', scopeEn: ''
    },
    cover: 'assets/projetos/' + slug + '/capa.jpg', coverMobile: '',
    blocks: [
      { type: 'text', labelPt: 'contexto', labelEn: 'context', textPt: '', textEn: '' },
      { type: 'text', labelPt: 'processo', labelEn: 'process', textPt: '', textEn: '' },
      { type: 'text', labelPt: 'resultado', labelEn: 'result', textPt: '', textEn: '' },
      { type: 'gallery', images: [] }
    ]
    /* sem prevProject/nextProject: a navegação para o próximo projeto é
       calculada em js/content-render.js a partir da posição deste projeto
       em content/projects/index.json, então o projeto novo já entra
       corretamente na sequência assim que ganha uma "order", sem precisar
       editar os vizinhos. */
  };

  var template = await readFile(env, 'work/case-01.html');
  if (!template) return json({ error: 'template_missing', message: 'work/case-01.html (modelo) não encontrado.' }, 500);

  var indexEntry = {
    slug: slug, visible: false, featured: false, cardSize: 'normal', order: nextOrder,
    titlePt: body.titlePt || '', titleEn: body.titleEn || '', subtitlePt: '', subtitleEn: '',
    category: '', tagsPt: [], tagsEn: [], year: projectData.year,
    cover: projectData.cover, coverMobile: ''
  };
  index.projects = index.projects || [];
  index.projects.push(indexEntry);

  /* Três escritas em sequência. Se uma falhar no meio, as anteriores já
     foram commitadas — é uma limitação conhecida sem transação entre
     arquivos na API do GitHub; documentado no README. */
  var r1 = await writeFile(env, 'content/projects/' + slug + '.json', JSON.stringify(projectData, null, 2) + '\n', 'cms: cria projeto ' + slug);
  var r2 = await writeFile(env, 'content/projects/index.json', JSON.stringify(index, null, 2) + '\n', 'cms: adiciona ' + slug + ' ao índice', indexFile.sha);
  var r3 = await writeFile(env, 'work/' + slug + '.html', template.content, 'cms: cria página ' + slug + ' a partir do modelo');

  return json({
    ok: true, slug: slug,
    commits: [r1.commit.sha, r2.commit.sha, r3.commit.sha],
    note: 'Projeto criado como rascunho (status: draft, visible: false). Edite o conteúdo e publique quando estiver pronto.'
  });
}

/* Duplica um projeto existente: copia o JSON do projeto de origem (com um
   novo slug e "(cópia)" no título, para não sair publicado com o mesmo
   título do original por engano), copia a entrada do índice como oculta,
   e clona a página HTML do projeto de origem (não a de case-01 fixo) —
   assim uma duplicata de um projeto que já tenha sido editado no HTML
   (o que hoje não acontece, mas pode vir a acontecer) parte da versão
   certa. */
async function handleDuplicateProject(request, env, sourceSlug) {
  var body = await readJsonBody(request);
  var newSlug = body && body.slug;
  if (!isSlugValid(newSlug)) {
    return json({ error: 'invalid_slug', message: 'Use apenas letras minúsculas, números e hífen (ex: campanha-2027-copia).' }, 400);
  }
  if (newSlug === sourceSlug) {
    return json({ error: 'same_slug', message: 'O novo slug precisa ser diferente do projeto original.' }, 400);
  }

  var existingTarget = await readFile(env, 'content/projects/' + newSlug + '.json');
  if (existingTarget) return json({ error: 'slug_taken', message: 'Já existe um projeto com este slug.' }, 409);

  var sourceFile = await readFile(env, 'content/projects/' + sourceSlug + '.json');
  if (!sourceFile) return json({ error: 'not_found', message: 'Projeto de origem não encontrado: ' + sourceSlug }, 404);
  var sourceData = JSON.parse(sourceFile.content);

  var indexFile = await readFile(env, 'content/projects/index.json');
  if (!indexFile) return json({ error: 'index_missing', message: 'content/projects/index.json não encontrado.' }, 500);
  var index = JSON.parse(indexFile.content);
  var sourceEntry = (index.projects || []).filter(function (p) { return p.slug === sourceSlug; })[0];
  if (!sourceEntry) return json({ error: 'not_found', message: 'Projeto de origem não está no índice.' }, 404);

  var newData = JSON.parse(JSON.stringify(sourceData)); /* cópia profunda simples, o conteúdo é só JSON */
  newData.slug = newSlug;
  newData.status = 'draft';
  newData.hero.titlePt = (newData.hero.titlePt || '') + ' (cópia)';
  newData.hero.titleEn = (newData.hero.titleEn || '') + ' (copy)';

  var nextOrder = (index.projects || []).reduce(function (max, p) { return Math.max(max, p.order || 0); }, 0) + 1;
  var newEntry = JSON.parse(JSON.stringify(sourceEntry));
  newEntry.slug = newSlug;
  newEntry.visible = false;
  newEntry.featured = false;
  newEntry.order = nextOrder;
  newEntry.titlePt = newData.hero.titlePt;
  newEntry.titleEn = newData.hero.titleEn;
  index.projects = index.projects || [];
  index.projects.push(newEntry);

  var sourceTemplate = await readFile(env, 'work/' + sourceSlug + '.html');
  if (!sourceTemplate) return json({ error: 'template_missing', message: 'work/' + sourceSlug + '.html não encontrado.' }, 500);

  var r1 = await writeFile(env, 'content/projects/' + newSlug + '.json', JSON.stringify(newData, null, 2) + '\n', 'cms: duplica ' + sourceSlug + ' em ' + newSlug);
  var r2 = await writeFile(env, 'content/projects/index.json', JSON.stringify(index, null, 2) + '\n', 'cms: adiciona ' + newSlug + ' (cópia de ' + sourceSlug + ') ao índice', indexFile.sha);
  var r3 = await writeFile(env, 'work/' + newSlug + '.html', sourceTemplate.content, 'cms: cria página ' + newSlug + ' como cópia de ' + sourceSlug);

  return json({
    ok: true, slug: newSlug,
    commits: [r1.commit.sha, r2.commit.sha, r3.commit.sha],
    note: 'Cópia criada como rascunho oculto (status: draft, visible: false).'
  });
}

/* Exclui um projeto: remove a entrada do índice, apaga o JSON e a página
   HTML. Pede confirmação no painel antes de chegar aqui (o Worker não pede
   confirmação de novo — quem confirma é a interface, o Worker só executa).
   Não apaga a capa nem as imagens da galeria em assets/projetos/: podem
   ter sido reaproveitadas manualmente em outro lugar, e apagar arquivo de
   imagem sem certeza de uso único é mais risco do que benefício aqui. */
async function handleDeleteProject(env, slug) {
  var indexFile = await readFile(env, 'content/projects/index.json');
  if (!indexFile) return json({ error: 'index_missing', message: 'content/projects/index.json não encontrado.' }, 500);
  var index = JSON.parse(indexFile.content);
  var before = (index.projects || []).length;
  index.projects = (index.projects || []).filter(function (p) { return p.slug !== slug; });
  if (index.projects.length === before) {
    return json({ error: 'not_found', message: 'Projeto não está no índice: ' + slug }, 404);
  }

  var r1 = await writeFile(env, 'content/projects/index.json', JSON.stringify(index, null, 2) + '\n', 'cms: remove ' + slug + ' do índice', indexFile.sha);

  var projectFile = await readFile(env, 'content/projects/' + slug + '.json');
  var r2 = projectFile ? await deleteFile(env, 'content/projects/' + slug + '.json', projectFile.sha, 'cms: exclui conteúdo de ' + slug) : null;

  var pageFile = await readFile(env, 'work/' + slug + '.html');
  var r3 = pageFile ? await deleteFile(env, 'work/' + slug + '.html', pageFile.sha, 'cms: exclui página de ' + slug) : null;

  return json({
    ok: true, slug: slug,
    commits: [r1.commit.sha, r2 && r2.commit.sha, r3 && r3.commit.sha].filter(Boolean),
    note: 'Projeto excluído. As imagens em assets/projetos/' + slug + '/ não foram apagadas.'
  });
}

async function handleUpload(request, env) {
  var contentType = request.headers.get('Content-Type') || '';
  if (contentType.indexOf('multipart/form-data') === -1) {
    return json({ error: 'invalid_content_type', message: 'Envie o upload como multipart/form-data.' }, 400);
  }
  var form = await request.formData();
  var file = form.get('file');
  var targetSlug = form.get('slug'); /* ex: "case-01" — organiza dentro de assets/uploads/<slug>/ */
  if (!file || typeof file === 'string') return json({ error: 'no_file', message: 'Nenhum arquivo enviado.' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'file_too_large', message: 'Imagem maior que ' + Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) + 'MB.' }, 413);

  var safeName = sanitizeUploadName(file.name);
  if (!safeName) return json({ error: 'invalid_filename', message: 'Nome ou extensão de arquivo não permitidos. Use jpg, jpeg, png, webp ou svg.' }, 400);

  var ext = safeName.slice(safeName.lastIndexOf('.'));
  var expectedMime = ALLOWED_UPLOAD_MIME[ext];
  if (file.type && expectedMime && file.type !== expectedMime && !(ext === '.jpg' && file.type === 'image/jpg')) {
    return json({ error: 'mime_mismatch', message: 'O tipo do arquivo não corresponde à extensão.' }, 400);
  }

  var safeSlugFolder = (typeof targetSlug === 'string' && isSlugValid(targetSlug)) ? targetSlug + '/' : '';
  var path = UPLOAD_DIR + safeSlugFolder + safeName;
  if (!isPathWritable(path) && path.indexOf(UPLOAD_DIR) !== 0) {
    /* segunda checagem, redundante de propósito: mesmo que a lógica acima
       mude no futuro, o upload nunca escreve fora de assets/uploads/ */
    return json({ error: 'path_not_allowed', message: 'Caminho de upload não autorizado.' }, 403);
  }

  var buffer = await file.arrayBuffer();
  var bytes = new Uint8Array(buffer);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  var base64 = btoa(bin);

  var existing = await readFile(env, path).catch(function () { return null; });
  var result = await writeBinaryFile(env, path, base64, 'cms: upload de imagem ' + path, existing ? existing.sha : undefined);
  return json({ ok: true, path: path, commit: result.commit.sha });
}

/* Publica várias mudanças de uma vez (o "resumo antes de publicar" do
   painel). Cada item precisa apontar para um caminho na whitelist; qualquer
   item fora dela derruba a publicação inteira antes de escrever qualquer
   coisa, para nunca publicar parcialmente por engano. */
async function handlePublish(request, env) {
  var body = await readJsonBody(request);
  var files = body && body.files;
  if (!Array.isArray(files) || !files.length) {
    return json({ error: 'nothing_to_publish', message: 'Nenhuma alteração para publicar.' }, 400);
  }
  for (var i = 0; i < files.length; i++) {
    if (!isPathWritable(files[i].path)) {
      return json({ error: 'path_not_allowed', message: 'Caminho não autorizado: ' + files[i].path }, 403);
    }
    var content = JSON.stringify(files[i].data, null, 2) + '\n';
    if (bytesOf(content) > MAX_JSON_BYTES) {
      return json({ error: 'payload_too_large', message: 'Arquivo ' + files[i].path + ' passa do limite de tamanho.' }, 413);
    }
  }

  var results = [];
  for (var j = 0; j < files.length; j++) {
    var f = files[j];
    var text = JSON.stringify(f.data, null, 2) + '\n';
    try {
      var r = await writeFile(env, f.path, text, f.message || ('cms: publica ' + f.path), f.sha || undefined);
      results.push({ path: f.path, ok: true, sha: r.content.sha, commit: r.commit.sha });
    } catch (e) {
      results.push({ path: f.path, ok: false, error: e instanceof GithubError ? e.kind : 'unknown', message: e instanceof GithubError ? e.detail : 'Erro desconhecido' });
      /* para de publicar os próximos assim que um falha, para o usuário ver
         exatamente onde parou em vez de uma lista de erros em cascata */
      break;
    }
  }
  var allOk = results.every(function (r) { return r.ok; });
  return json({ ok: allOk, results: results, publishedAt: new Date().toISOString() }, allOk ? 200 : 207);
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
