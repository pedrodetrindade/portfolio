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

var MAX_JSON_BYTES = 200 * 1024; /* 200KB por arquivo de conteúdo, não por mídia */
var MAX_UPLOAD_BYTES = 25 * 1024 * 1024; /* 25MB por arquivo de mídia */
/* .pdf entrou por causa do currículo da seção Sobre, que o painel troca sem
   passar por código. A lista continua fechada: qualquer extensão fora dela é
   recusada antes de o arquivo chegar ao GitHub. */
/* GIF, MP4 e WebM são conteúdo normal de case. AVIF entra como alternativa
   compacta para fotografia. Arquivos maiores que 25MB continuam fora do Git:
   vídeo pesado deve usar Vimeo ou uma URL HTTPS direta no bloco. */
var ALLOWED_UPLOAD_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg', '.gif', '.mp4', '.webm', '.pdf'];
var ALLOWED_UPLOAD_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
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
   projeto chamavam writeFile direto em work/<slug>/index.html SEM passar por
   isPathWritable — a whitelist existia e era contornada. Agora cada tipo de
   escrita tem sua própria lista, e nada escreve fora de uma delas. */
var WRITABLE_PAGE_PATTERN = /^work\/[a-z0-9-]+\/index\.html$/;
var WRITABLE_LEGACY_PAGE_PATTERN = /^work\/[a-z0-9-]+\.html$/;

function isPagePathWritable(path) {
  if (typeof path !== 'string') return false;
  if (path.indexOf('..') !== -1 || path.indexOf('\0') !== -1) return false;
  return WRITABLE_PAGE_PATTERN.test(path) || WRITABLE_LEGACY_PAGE_PATTERN.test(path);
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
var MAX_BYTES_POR_PUBLICACAO = 32 * 1024 * 1024;
/* A publicação transporta binário em base64, que cresce cerca de 4/3. Este
   teto vale para o JSON HTTP completo e é separado dos 200KB de cada arquivo
   editorial. Sem essa separação, qualquer mídia acima de ~150KB era recusada
   antes mesmo de chegar à validação de upload. */
var MAX_REQUEST_BYTES_POR_PUBLICACAO = 48 * 1024 * 1024;

/* ===== VÍDEO DE FUNDO DA CAPA =====
   Quatro modos. 'liquid' é o fundo animado em CSS que sempre existiu, e é o
   padrão de quem nunca configurou nada. */
var MODOS_VIDEO = ['liquid', 'file', 'vimeo', 'none'];

/* Hostnames aceitos, comparados por igualdade exata do hostname já
   normalizado pelo parser de URL. Não é comparação por substring: "vimeo.com"
   dentro de "vimeo.com.evil.tld" não passa, porque o hostname daquele
   endereço é "vimeo.com.evil.tld" e não bate com nenhum item da lista. */
var VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

/* Extrai APENAS id e hash de uma URL do Vimeo. Nada mais do endereço original
   é reaproveitado: quem monta a URL final é o site, a partir destes dois
   valores. Assim, um endereço com parâmetros arbitrários (ou com HTML, script
   e esquemas perigosos) não tem por onde chegar ao iframe.
   Devolve {videoId, hash} ou null. */
function parseVimeoUrl(valor) {
  if (typeof valor !== 'string') return null;
  var texto = valor.trim();
  if (!texto) return null;
  /* recusa de cara qualquer coisa que não seja um endereço: marcação, script,
     esquemas perigosos e aspas usadas para escapar de atributo */
  if (/[<>"'`\\]/.test(texto)) return null;
  if (/^\s*(javascript|data|vbscript|file|blob)\s*:/i.test(texto)) return null;

  var u;
  try { u = new URL(texto); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;                 /* só HTTPS */
  if (VIMEO_HOSTS.indexOf(u.hostname.toLowerCase()) === -1) return null;
  if (u.username || u.password) return null;                /* sem credencial embutida */

  var partes = u.pathname.split('/').filter(Boolean);
  var id = null, hash = null;
  if (u.hostname.toLowerCase() === 'player.vimeo.com') {
    /* player.vimeo.com/video/<id> — o hash vem em ?h= */
    if (partes[0] !== 'video' || !partes[1]) return null;
    id = partes[1];
    hash = u.searchParams.get('h');
  } else {
    /* vimeo.com/<id> ou vimeo.com/<id>/<hash> (vídeo não listado) */
    if (!partes[0]) return null;
    id = partes[0];
    if (partes[1]) hash = partes[1];
  }
  if (!/^[0-9]{6,12}$/.test(id)) return null;               /* id é só dígitos */
  if (hash != null) {
    hash = String(hash);
    if (!/^[a-zA-Z0-9]{6,20}$/.test(hash)) return null;     /* hash alfanumérico */
  }
  return { videoId: id, hash: hash || null };
}

/* Confere o objeto salvo no JSON. Exige que id e hash sejam coerentes com a
   URL guardada: um payload não pode declarar uma URL inofensiva e um videoId
   diferente, porque é o videoId que o site usa para montar o iframe. */
function isVimeoConfigValido(v) {
  if (!v || typeof v !== 'object') return false;
  var p = parseVimeoUrl(v.url);
  if (!p) return false;
  if (String(v.videoId || '') !== p.videoId) return false;
  var hashGuardado = v.hash == null ? null : String(v.hash);
  if (hashGuardado !== p.hash) return false;
  return true;
}

/* Poster tem de ser imagem, nunca o endereço do player: um link de vídeo no
   atributo poster não renderiza nada e some sem explicação. Aceita caminho do
   repositório ou URL https de imagem. */
function isPosterValido(valor) {
  if (typeof valor !== 'string') return false;
  var t = valor.trim();
  if (!t) return true;                                       /* vazio é válido */
  if (/[<>"'`\\]/.test(t)) return false;
  if (/vimeo\.com/i.test(t)) return false;                   /* é vídeo, não imagem */
  var ext = t.toLowerCase().split('?')[0];
  ext = ext.slice(ext.lastIndexOf('.'));
  if (['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'].indexOf(ext) === -1) return false;
  if (/^https:\/\//i.test(t)) return true;
  if (/^(assets|content)\//.test(t) && t.indexOf('..') === -1) return true;
  return false;
}

/* ===== BLOCOS DA PÁGINA DE PROJETO =====
   Cada tipo declara as chaves que aceita. Chave fora da lista derruba a
   publicação com 422, pela mesma razão que vale para as chaves de topo: um
   campo descartado em silêncio some sem ninguém ficar sabendo.
   Toda referência a arquivo passa por caminhoDeMidiaValido, que é o que
   impede um payload montado à mão de apontar src para um domínio de
   terceiro, um javascript: ou um caminho fora do repositório. */
var CHAVES_DE_BLOCO = {
  text:    ['type', 'labelPt', 'labelEn', 'showLabel', 'textPt', 'textEn', 'spacing'],
  gallery: ['type', 'images', 'layout', 'spacing'],
  image:   ['type', 'src', 'alt', 'fit', 'width', 'captionPt', 'captionEn', 'spacing'],
  quote:   ['type', 'quotePt', 'quoteEn', 'authorPt', 'authorEn', 'spacing'],
  video:   ['type', 'mode', 'src', 'poster', 'vimeo', 'captionPt', 'captionEn', 'spacing']
};
var AJUSTES_DE_IMAGEM = ['cover', 'auto'];
var LAYOUTS_DE_GALERIA = ['adaptive', 'single', 'two', 'three'];
var LARGURAS_DE_BLOCO = ['content', 'full'];
var MODOS_DE_VIDEO_DE_BLOCO = ['file', 'vimeo'];
var EXT_DE_VIDEO = ['.mp4', '.webm'];

/* Referência de mídia: caminho controlado dentro de assets/ ou URL HTTPS
   direta. A URL externa permite usar R2/CDN sem engordar o repositório, mas
   continua fechada por protocolo, credenciais, caracteres e extensão. */
function caminhoDeMidiaValido(valor, extensoes) {
  if (typeof valor !== 'string') return false;
  var t = valor.trim();
  if (!t) return false;
  if (t.indexOf('..') !== -1 || t.indexOf('\0') !== -1) return false;
  if (/[<>"'`\\]/.test(t)) return false;
  var caminho = t;
  if (/^https:\/\//i.test(t)) {
    var u;
    try { u = new URL(t); } catch (e) { return false; }
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    caminho = u.pathname;
  } else if (!/^assets\//.test(t)) {
    return false;
  }
  var ext = caminho.toLowerCase();
  ext = ext.slice(ext.lastIndexOf('.'));
  return extensoes.indexOf(ext) !== -1;
}

var EXT_DE_IMAGEM = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'];

function erroNoSpacing(spacing, incluiGap) {
  if (spacing === undefined) return null;
  if (!spacing || typeof spacing !== 'object' || Array.isArray(spacing)) return 'spacing precisa ser um objeto.';
  var campos = incluiGap ? ['marginTop', 'marginBottom', 'gap'] : ['marginTop', 'marginBottom'];
  var extra = Object.keys(spacing).filter(function (k) { return campos.indexOf(k) === -1; });
  if (extra.length) return 'spacing tem campo desconhecido: ' + extra.join(', ') + '.';
  for (var c = 0; c < campos.length; c++) {
    var nome = campos[c], niveis = spacing[nome];
    if (niveis === undefined) continue;
    if (!niveis || typeof niveis !== 'object' || Array.isArray(niveis)) return 'spacing.' + nome + ' precisa ser um objeto.';
    var nivelExtra = Object.keys(niveis).filter(function (k) { return ['desktop', 'tablet', 'mobile'].indexOf(k) === -1; });
    if (nivelExtra.length) return 'spacing.' + nome + ' tem nível desconhecido: ' + nivelExtra.join(', ') + '.';
    var limite = nome === 'gap' ? LIMITS.gap : LIMITS.spacing;
    var dispositivos = ['desktop', 'tablet', 'mobile'];
    for (var d = 0; d < dispositivos.length; d++) {
      var valor = niveis[dispositivos[d]];
      /* null continua aceito apenas para ler os JSON antigos; o painel novo
         grava níveis herdados como chaves ausentes. */
      if (valor == null) continue;
      if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < limite[0] || valor > limite[1]) {
        return 'spacing.' + nome + '.' + dispositivos[d] + ' precisa estar entre ' + limite[0] + ' e ' + limite[1] + 'px.';
      }
    }
  }
  return null;
}

/* Devolve null quando está tudo bem, ou uma mensagem dizendo qual bloco e o
   quê. A posição entra na mensagem porque "bloco inválido" sozinho não ajuda
   ninguém a achar o problema num projeto com dez blocos. */
function erroNosBlocos(blocks) {
  if (blocks === undefined) return null;                     /* projeto sem blocos é válido */
  if (!Array.isArray(blocks)) return 'O campo blocks precisa ser uma lista.';
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i], onde = 'bloco ' + (i + 1);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return onde + ': não é um objeto.';
    var permitidas = CHAVES_DE_BLOCO[b.type];
    if (!permitidas) return onde + ': tipo desconhecido (' + String(b.type) + ').';
    var extra = Object.keys(b).filter(function (k) { return permitidas.indexOf(k) === -1; });
    if (extra.length) return onde + ' (' + b.type + '): campo desconhecido: ' + extra.join(', ') + '.';
    if (b.type === 'text' && b.showLabel != null && typeof b.showLabel !== 'boolean') {
      return onde + ': showLabel precisa ser verdadeiro ou falso.';
    }
    var erroSpacing = erroNoSpacing(b.spacing, b.type === 'gallery');
    if (erroSpacing) return onde + ': ' + erroSpacing;

    if (b.type === 'gallery') {
      if (!Array.isArray(b.images)) return onde + ': images precisa ser uma lista.';
      if (b.layout != null && LAYOUTS_DE_GALERIA.indexOf(b.layout) === -1) {
        return onde + ': layout precisa ser adaptive, single, two ou three.';
      }
      for (var g = 0; g < b.images.length; g++) {
        var im = b.images[g];
        if (!im || typeof im !== 'object') return onde + ': imagem ' + (g + 1) + ' inválida.';
        var sobra = Object.keys(im).filter(function (k) { return ['src', 'alt'].indexOf(k) === -1; });
        if (sobra.length) return onde + ': imagem ' + (g + 1) + ' tem campo desconhecido: ' + sobra.join(', ') + '.';
        if (!caminhoDeMidiaValido(im.src, EXT_DE_IMAGEM)) return onde + ': imagem ' + (g + 1) + ' com caminho inválido.';
      }
    }
    if (b.type === 'image') {
      if (b.src && !caminhoDeMidiaValido(b.src, EXT_DE_IMAGEM)) return onde + ': caminho de imagem inválido.';
      if (b.fit != null && AJUSTES_DE_IMAGEM.indexOf(b.fit) === -1) return onde + ': fit precisa ser cover ou auto.';
      if (b.width != null && LARGURAS_DE_BLOCO.indexOf(b.width) === -1) return onde + ': width precisa ser content ou full.';
    }
    if (b.type === 'video') {
      if (MODOS_DE_VIDEO_DE_BLOCO.indexOf(b.mode) === -1) return onde + ': mode precisa ser file ou vimeo.';
      if (b.mode === 'file' && !caminhoDeMidiaValido(b.src, EXT_DE_VIDEO)) return onde + ': caminho de vídeo inválido.';
      if (b.mode === 'vimeo' && !isVimeoConfigValido(b.vimeo)) return onde + ': configuração do Vimeo inválida.';
      if (b.poster != null && b.poster !== '' && !isPosterValido(b.poster)) return onde + ': poster inválido.';
    }
  }
  return null;
}

export {
  CHAVES_DE_BLOCO, erroNosBlocos, erroNoSpacing, caminhoDeMidiaValido,
  LIMITS, MAX_JSON_BYTES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, ALLOWED_UPLOAD_MIME,
  UPLOAD_DIR, isPathWritable, isPagePathWritable, isUploadPathWritable,
  MAX_OPS_POR_PUBLICACAO, MAX_BYTES_POR_PUBLICACAO, MAX_REQUEST_BYTES_POR_PUBLICACAO,
  MODOS_VIDEO, VIMEO_HOSTS, parseVimeoUrl, isVimeoConfigValido, isPosterValido,
  sanitizeUploadName, isSlugValid, clamp, bytesOf
};
