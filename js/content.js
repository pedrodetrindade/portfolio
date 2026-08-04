/* ===== CAMADA DE CONTEÚDO DO CMS =====
   Este arquivo lê os arquivos content/*.json e aplica o resultado ao site em
   duas fases:

   FASE A (bloqueante, síncrona, roda em <head> antes do CSS e antes do body
   existir): busca content/global.json e, se a página precisar, o JSON da
   própria página (home.json ou o do projeto), e aplica cores, bordas,
   arredondamento, largura e espaçamento como CSS custom properties no
   :root. Usa XMLHttpRequest síncrono de propósito — é a única forma de gerar
   zero flash de conteúdo antigo em um site sem build e sem servidor de
   template. O arquivo é pequeno (poucos KB) e do mesmo domínio, então o
   custo é desprezível; documentado em CLAUDE.md e no README do CMS.

   FASE B (roda no fim do body, antes de js/main.js): agora que o HTML da
   página existe, sobrescreve texto e imagens usando os data-pt/data-en já
   existentes (o sistema de idioma do main.js continua sendo quem decide o
   que aparece) e reconstrói as listas (projetos, FAQ, "o que eu faço",
   galeria) inteiras a partir do JSON, porque essas podem crescer, encolher
   ou trocar de ordem, o que um simples "substituir texto no lugar" não
   cobre.

   Se qualquer JSON faltar, estiver corrompido ou vier vazio, cada função
   aqui falha em silêncio e o HTML estático (o que já está escrito nos
   arquivos .html) continua valendo. Nada quebra por ausência de dado. */
(function () {
  'use strict';

  var isCase = location.pathname.indexOf('/work/') !== -1;
  var base = isCase ? '../' : '';

  function xhrJSON(path) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', base + path, false); /* síncrono: ver nota acima */
      x.send(null);
      if (x.status !== 200 && x.status !== 0) return null;
      return JSON.parse(x.responseText);
    } catch (e) { return null; }
  }

  function num(v, fallback) {
    return (typeof v === 'number' && isFinite(v)) ? v : fallback;
  }

  /* ---------- FASE A: tokens visuais ---------- */
  var GLOBAL = xhrJSON('content/global.json?v=1') || {};
  window.__CMS_GLOBAL__ = GLOBAL;

  function applyGlobalTokens(g) {
    var root = document.documentElement.style;

    function hexToRgb(hex) {
      if (typeof hex !== 'string') return null;
      hex = hex.replace('#', '').trim();
      if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
      var n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function clampNum(v, min, max) {
      v = Number(v);
      if (!isFinite(v)) return null;
      return Math.min(max, Math.max(min, v));
    }
    /* cada cor tem limite de opacidade 0-100%, igual ao resto dos limites
       de segurança do sistema (ver LIMITS mais abaixo, espelhado no Worker) */
    function setColorRgb(rgbVar, colorObj) {
      if (!colorObj || !colorObj.hex) return;
      var rgb = hexToRgb(colorObj.hex);
      if (!rgb) return;
      root.setProperty(rgbVar, rgb.join(','));
    }
    function setOpacity(varName, colorObj) {
      if (!colorObj || typeof colorObj.opacity !== 'number') return;
      var op = clampNum(colorObj.opacity, 0, 100);
      if (op === null) return;
      root.setProperty(varName, String(op / 100));
    }
    function setPx(varName, value, min, max) {
      var v = clampNum(value, min, max);
      if (v === null) return;
      root.setProperty(varName, v + 'px');
    }

    var c = g.colors || {};
    /* --ink, --paper etc continuam sendo a cor sólida (hex) usada direto em
       várias regras; --ink-rgb/--paper-rgb/--warm-rgb alimentam os rgba().
       Setar rgba(...,1) no lugar do hex teria o mesmo efeito visual, mas
       manter os dois tokens sólidos evita depender de opacidade 100% em
       todo lugar que hoje usa a cor "pura". */
    if (c.background && c.background.hex) { root.setProperty('--ink', c.background.hex); setColorRgb('--ink-rgb', c.background); }
    if (c.backgroundSecondary && c.backgroundSecondary.hex) root.setProperty('--ink-2', c.backgroundSecondary.hex);
    if (c.surface && c.surface.hex) root.setProperty('--ink-3', c.surface.hex);
    if (c.textPrimary && c.textPrimary.hex) { root.setProperty('--paper', c.textPrimary.hex); setColorRgb('--paper-rgb', c.textPrimary); }
    if (c.textSecondary && c.textSecondary.hex) root.setProperty('--muted', c.textSecondary.hex);
    if (c.textMuted && c.textMuted.hex) root.setProperty('--muted-2', c.textMuted.hex);
    if (c.accent && c.accent.hex) root.setProperty('--accent', c.accent.hex);
    if (c.highlight && c.highlight.hex) root.setProperty('--cream', c.highlight.hex);
    if (c.heroName && c.heroName.hex) root.setProperty('--color-hero-name', c.heroName.hex);
    /* a cor da borda alimenta --warm-rgb; as duas opacidades (fraca/forte)
       vêm de --border-opacity e --border-opacity-strong, que --line e
       --line-strong já leem (ver css/style.css) */
    if (c.borderColor && c.borderColor.hex) setColorRgb('--warm-rgb', c.borderColor);
    setOpacity('--border-opacity', c.borderColor);
    setOpacity('--border-opacity-strong', c.borderColorStrong);

    var b = g.borders || {};
    setPx('--radius-card', b.radiusCard, 0, 200);
    setPx('--radius-image', b.radiusImage, 0, 200);
    setPx('--radius-button', b.radiusButton, 0, 200);
    setPx('--radius-field', b.radiusField, 0, 200);

    var l = g.layout || {};
    setPx('--content-max', l.contentMaxWidth, 320, 2560);
    /* o gutter continua fluido: reconstruímos o clamp() com o piso e o teto
       vindos do JSON, e o meio (3vw) continua igual ao original */
    var gMobile = clampNum(l.pageGutterMobile, 0, 200);
    var gDesktop = clampNum(l.pageGutterDesktop, 0, 200);
    if (gMobile !== null && gDesktop !== null) {
      root.setProperty('--page-gutter', 'clamp(' + gMobile + 'px,3vw,' + gDesktop + 'px)');
    }
    setPx('--section-pad-top', l.sectionSpacingTop, 0, 600);
    setPx('--section-pad-bottom', l.sectionSpacingBottom, 0, 600);
    setPx('--grid-gap', l.gridGap, 0, 200);

    var m = g.motion || {};
    if (typeof m.durationHover === 'number') root.setProperty('--dur-hover', clampNum(m.durationHover, 0, 3000) + 'ms');
    if (typeof m.durationMicro === 'number') root.setProperty('--dur-micro', clampNum(m.durationMicro, 0, 3000) + 'ms');
  }
  applyGlobalTokens(GLOBAL);

  /* Página só usa a própria seção de dados a partir daqui; guardamos tudo em
     window para a Fase B (chamada de outro <script>, no fim do body,
     depois que o HTML existe) reaproveitar sem novo pedido de rede. */
  if (!isCase) {
    window.__CMS_HOME__ = xhrJSON('content/home.json?v=1') || {};
  } else {
    var slug = location.pathname.split('/').pop().replace('.html', '');
    window.__CMS_PROJECT__ = xhrJSON('content/projects/' + slug + '.json?v=1') || {};
    window.__CMS_PROJECTS_INDEX__ = xhrJSON('content/projects/index.json?v=1') || {};
  }

  /* Aplica as sobreposições de espaçamento por seção da Home (hierarquia:
     global -> seção). Só faz sentido na Home; nas páginas de projeto não há
     seções desse tipo ainda. */
  function applySectionSpacing(home) {
    var sections = (home && home.sections) || {};
    var root2 = document.documentElement.style;
    var keys = ['work', 'about', 'help', 'faq', 'contact'];
    keys.forEach(function (key) {
      var s = sections[key];
      if (!s) return;
      if (typeof s.spacingTop === 'number') root2.setProperty('--' + key + '-pad-top', Math.max(0, Math.min(600, s.spacingTop)) + 'px');
      if (typeof s.spacingBottom === 'number') root2.setProperty('--' + key + '-pad-bottom', Math.max(0, Math.min(600, s.spacingBottom)) + 'px');
    });
  }
  if (!isCase) applySectionSpacing(window.__CMS_HOME__);

  /* ---------- prévia ao vivo do painel administrativo ---------- */
  /* Só faz algo quando a página está dentro de um <iframe> (o painel embute
     o site assim para mostrar a prévia) e alguém manda uma mensagem no
     formato certo. Fora desse caso — toda visita normal do site público —
     isto nunca dispara. Os valores recebidos por postMessage não tocam o
     GitHub nem o localStorage: são só aplicados na página desta aba, que
     está rodando dentro do iframe do painel, e desaparecem ao recarregar. */
  window.__CMS_APPLY__ = { global: applyGlobalTokens, sections: applySectionSpacing };
  if (window.parent !== window) {
    window.addEventListener('message', function (event) {
      var msg = event.data;
      if (!msg || msg.__cmsPreview__ !== true) return;
      if (msg.global) applyGlobalTokens(msg.global);
      if (msg.home) applySectionSpacing(msg.home);
    });
  }
})();
