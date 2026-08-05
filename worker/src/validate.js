/* ===== LIMITES E VALIDAÇÃO =====
   A mesma régua de limites que o painel usa nos sliders/inputs (ver
   worker/public/app.js) é aplicada aqui de novo, do lado do servidor. O
   painel existir não é motivo para confiar nele: qualquer requisição pode
   chegar aqui sem passar pelo painel (um teste, uma ferramenta externa, uma
   tentativa de ataque), então quem decide de verdade é o Worker. */

var LIMITS = {
  opacity: [0, 100],
  radius: [0, 200],
  borderWidth: [0, 20],
  contentWidth: [320, 2560],
  spacing: [0, 600],
  fontSize: [8, 300],
  columns: [1, 6],
  imageScale: [50, 200],
  gap: [0, 200]
};

var MAX_JSON_BYTES = 200 * 1024; /* 200KB por arquivo de conteúdo */
var MAX_UPLOAD_BYTES = 5 * 1024 * 1024; /* 5MB por arquivo */
/* .pdf entrou por causa do currículo da seção Sobre, que o painel troca sem
   passar por código. A lista continua fechada: qualquer extensão fora dela é
   recusada antes de o arquivo chegar ao GitHub. */
var ALLOWED_UPLOAD_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.pdf'];
var ALLOWED_UPLOAD_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
};

/* Whitelist fixa de caminhos que o Worker aceita escrever. Nunca aceita um
   caminho vindo do corpo da requisição sem checar contra isto — é a defesa
   principal contra path traversal e escrita fora do que o CMS deveria
   tocar. */
var WRITABLE_PATTERNS = [
  /^content\/global\.json$/,
  /^content\/home\.json$/,
  /^content\/projects\/index\.json$/,
  /^content\/projects\/[a-z0-9-]+\.json$/
];

/* Publicação atômica escreve mais que JSON: a página de um projeto novo e as
   mídias enviadas entram no mesmo commit. Antes, criar/duplicar/excluir
   projeto chamavam writeFile direto em work/<slug>.html SEM passar por
   isPathWritable — a whitelist existia e era contornada. Agora cada tipo de
   escrita tem sua própria lista, e nada escreve fora de uma delas. */
var WRITABLE_PAGE_PATTERN = /^work\/[a-z0-9-]+\.html$/;

function isPagePathWritable(path) {
  if (typeof path !== 'string') return false;
  if (path.indexOf('..') !== -1 || path.indexOf('\0') !== -1) return false;
  return WRITABLE_PAGE_PATTERN.test(path);
}

/* Mídia: só dentro de assets/uploads/, com nome já sanitizado e extensão da
   lista fechada. Confere o caminho inteiro, não só o prefixo, para um
   "assets/uploads/../../x" nunca passar. */
function isUploadPathWritable(path) {
  if (typeof path !== 'string') return false;
  if (path.indexOf('..') !== -1 || path.indexOf('\0') !== -1) return false;
  if (path.indexOf(UPLOAD_DIR) !== 0) return false;
  var resto = path.slice(UPLOAD_DIR.length);
  if (!resto || resto.indexOf('//') !== -1) return false;
  /* uma pasta opcional de um nível (o slug) mais o arquivo */
  if (!/^(?:[a-z0-9-]+\/)?[a-z0-9._-]+$/.test(resto)) return false;
  var ext = resto.slice(resto.lastIndexOf('.'));
  return ALLOWED_UPLOAD_EXT.indexOf(ext) !== -1;
}
/* Pasta de upload de imagens. Adaptado de "public/uploads/" (o exemplo do
   escopo original) para "assets/uploads/", que é a pasta estática real
   deste projeto — não existe pasta "public/" aqui. */
var UPLOAD_DIR = 'assets/uploads/';

function isPathWritable(path) {
  if (typeof path !== 'string') return false;
  if (path.indexOf('..') !== -1) return false;
  if (path.indexOf('\0') !== -1) return false;
  return WRITABLE_PATTERNS.some(function (re) { return re.test(path); });
}

/* Nome de arquivo seguro para upload: minúsculo, sem espaço, sem caractere
   fora de [a-z0-9._-], sem começar com ponto, extensão numa lista fechada. */
function sanitizeUploadName(name) {
  if (typeof name !== 'string' || !name) return null;
  var lower = name.toLowerCase().trim();
  var ext = lower.slice(lower.lastIndexOf('.'));
  if (ALLOWED_UPLOAD_EXT.indexOf(ext) === -1) return null;
  var base = lower.slice(0, lower.lastIndexOf('.'));
  base = base.normalize('NFD').replace(/[̀-ͯ]/g, ''); /* remove acento */
  base = base.replace(/[^a-z0-9._-]/g, '-').replace(/^\.+/, '').replace(/-+/g, '-');
  if (!base) return null;
  return base + ext;
}

function isSlugValid(slug) {
  return typeof slug === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 60;
}

function clamp(value, key) {
  var range = LIMITS[key];
  if (!range) return value;
  var n = Number(value);
  if (!isFinite(n)) return range[0];
  return Math.min(range[1], Math.max(range[0], n));
}

/* Verifica se um payload JSON está dentro do tamanho máximo ANTES de
   fazer JSON.parse — evita gastar CPU decodificando payloads gigantes. */
function bytesOf(str) { return new TextEncoder().encode(str).length; }

/* Tetos da publicação inteira, não só de cada arquivo: sem eles, um payload
   com centenas de operações ou dezenas de MB chegaria a montar blobs no
   GitHub antes de qualquer recusa. */
var MAX_OPS_POR_PUBLICACAO = 60;
var MAX_BYTES_POR_PUBLICACAO = 25 * 1024 * 1024;

export {
  LIMITS, MAX_JSON_BYTES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, ALLOWED_UPLOAD_MIME,
  UPLOAD_DIR, isPathWritable, isPagePathWritable, isUploadPathWritable,
  MAX_OPS_POR_PUBLICACAO, MAX_BYTES_POR_PUBLICACAO,
  sanitizeUploadName, isSlugValid, clamp, bytesOf
};
