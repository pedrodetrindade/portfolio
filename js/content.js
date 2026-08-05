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
  /* compartilhado entre applyGlobalTokens e applySectionSpacing */
  function clampNum(v, min, max) {
    v = Number(v);
    if (!isFinite(v)) return null;
    return Math.min(max, Math.max(min, v));
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
    /* Cada cor do painel tem hex e opacidade. Até aqui só o hex chegava ao
       site: a opacidade era gravada no JSON e ignorada por tudo que não fosse
       borda, então mexer no slider não mudava nada na tela. Abaixo de 100% o
       token agora sai como rgba(), que vale em qualquer lugar onde a cor
       sólida valia (background, color, border-color). Em 100% continua saindo
       o hex — mais legível ao inspecionar e sem depender de alpha onde nunca
       houve. Os triplets --*-rgb continuam separados: eles alimentam os
       rgba() que já compõem alpha próprio no CSS e não podem levar alpha
       embutido, senão a cor viraria rgba(rgba(...)). */
    function setSolid(varName, colorObj) {
      if (!colorObj || !colorObj.hex) return;
      var op = (typeof colorObj.opacity === 'number') ? clampNum(colorObj.opacity, 0, 100) : 100;
      if (op === null) op = 100;
      var rgb = op >= 100 ? null : hexToRgb(colorObj.hex);
      root.setProperty(varName, rgb ? 'rgba(' + rgb.join(',') + ',' + (op / 100) + ')' : colorObj.hex);
    }

    var c = g.colors || {};
    /* --ink, --paper etc continuam sendo a cor sólida (hex) usada direto em
       várias regras; --ink-rgb/--paper-rgb/--warm-rgb alimentam os rgba().
       Setar rgba(...,1) no lugar do hex teria o mesmo efeito visual, mas
       manter os dois tokens sólidos evita depender de opacidade 100% em
       todo lugar que hoje usa a cor "pura". */
    setSolid('--ink', c.background); setColorRgb('--ink-rgb', c.background);
    setSolid('--ink-2', c.backgroundSecondary);
    setSolid('--ink-3', c.surface);
    setSolid('--paper', c.textPrimary); setColorRgb('--paper-rgb', c.textPrimary);
    setSolid('--muted', c.textSecondary);
    setSolid('--muted-2', c.textMuted);
    setSolid('--accent', c.accent);
    setSolid('--cream', c.highlight);
    setSolid('--color-hero-name', c.heroName);
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
    /* Espaçamento e gap agora têm três níveis: {desktop, tablet, mobile}.
       tablet:null herda o desktop já resolvido; mobile:null herda o tablet
       já resolvido — por isso a resolução acontece nesta ordem, tablet
       antes de mobile, cada um podendo cair no valor do nível anterior. */
    function resolveTiers(obj, min, max) {
      if (!obj || typeof obj !== 'object') return null;
      var d = clampNum(obj.desktop, min, max);
      if (d === null) return null;
      var tRaw = (obj.tablet == null) ? null : clampNum(obj.tablet, min, max);
      var t = tRaw !== null ? tRaw : d;
      var mRaw = (obj.mobile == null) ? null : clampNum(obj.mobile, min, max);
      var mo = mRaw !== null ? mRaw : t;
      return { desktop: d, tablet: t, mobile: mo };
    }
    function setTieredPx(prefix, obj, min, max) {
      var r = resolveTiers(obj, min, max);
      if (!r) return null;
      root.setProperty(prefix + '-desktop', r.desktop + 'px');
      root.setProperty(prefix + '-tablet', r.tablet + 'px');
      root.setProperty(prefix + '-mobile', r.mobile + 'px');
      return r;
    }
    var globalPadTop = setTieredPx('--section-pad-top', l.sectionSpacingTop, 0, 600);
    var globalPadBottom = setTieredPx('--section-pad-bottom', l.sectionSpacingBottom, 0, 600);
    setTieredPx('--grid-gap', l.gridGap, 0, 200);
    /* guardado para applySectionSpacing poder herdar o padrão global sem
       precisar ler content/global.json de novo */
    window.__CMS_GLOBAL_SPACING__ = { top: globalPadTop, bottom: globalPadBottom };

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
  /* help, faq e contact usam o padrão global quando não têm valor próprio
     (é assim que já funcionavam antes desta seção existir: o CSS deles
     nasceu igual ao número global). work e about já tinham um respiro maior
     que o padrão antes do CMS existir, escrito direto no CSS deles — então,
     sem valor próprio configurado aqui, eles não devem herdar o número
     genérico do padrão global, e sim continuar no literal do próprio CSS.
     É por isso que esta lista existe: sem ela, ligar o CMS empurraria work e
     about para o espaçamento menor de help/faq/contact, uma mudança visual
     que ninguém pediu. */
  var SECOES_USAM_PADRAO_GLOBAL = { help: true, faq: true, contact: true, work: false, about: false };

  function resolveSectionTier(sectionTiers, globalTiers, useGlobalDefault, min, max) {
    /* sectionTiers: {desktop,tablet,mobile}, cada um number|null.
       globalTiers: {desktop,tablet,mobile} já resolvidos (todos number) ou null.
       Devolve {desktop,tablet,mobile} com algum number, ou null onde não há
       nada para escrever (e então a var() correspondente fica sem valor,
       caindo no literal do próprio CSS).
       A regra que importa aqui: um nível só herda do nível anterior DESTA
       MESMA seção quando a seção tem algum valor próprio configurado. Se a
       seção inteira está em branco (nenhum nível seu, em lugar nenhum), ela
       não deve herdar o "desktop emprestado do global" como se fosse seu -
       cada nível dela herda o nível equivalente do global diretamente. Sem
       essa distinção, faq (que não tem valor próprio) acabava herdando
       tablet = desktop (96), perdendo o tablet real do global (104). */
    sectionTiers = sectionTiers || {};
    var ownDesktop = (sectionTiers.desktop == null) ? null : clampNum(sectionTiers.desktop, min, max);
    var hasOwnDesktop = ownDesktop !== null;
    var desktop = hasOwnDesktop ? ownDesktop : (useGlobalDefault && globalTiers ? globalTiers.desktop : null);

    var ownTablet = (sectionTiers.tablet == null) ? null : clampNum(sectionTiers.tablet, min, max);
    var hasOwnTablet = ownTablet !== null;
    var tablet;
    if (hasOwnTablet) tablet = ownTablet;
    else if (hasOwnDesktop) tablet = desktop; /* herda o desktop PRÓPRIO desta seção */
    else tablet = (useGlobalDefault && globalTiers) ? globalTiers.tablet : desktop; /* sem override nenhum: usa o tablet do global */

    var ownMobile = (sectionTiers.mobile == null) ? null : clampNum(sectionTiers.mobile, min, max);
    var hasOwnMobile = ownMobile !== null;
    var mobile;
    if (hasOwnMobile) mobile = ownMobile;
    else if (hasOwnTablet || hasOwnDesktop) mobile = tablet; /* seção tem override em algum nível: herda o tablet resolvido dela */
    else mobile = (useGlobalDefault && globalTiers) ? globalTiers.mobile : tablet;

    return { desktop: desktop, tablet: tablet, mobile: mobile };
  }

  function applySectionSpacing(home) {
    var sections = (home && home.sections) || {};
    var root2 = document.documentElement.style;
    var g = window.__CMS_GLOBAL_SPACING__ || {};
    var keys = ['work', 'about', 'help', 'faq', 'contact'];
    keys.forEach(function (key) {
      var s = sections[key];
      if (!s) return;
      var useGlobal = SECOES_USAM_PADRAO_GLOBAL[key];
      var top = resolveSectionTier(s.spacingTop, g.top, useGlobal, 0, 600);
      var bottom = resolveSectionTier(s.spacingBottom, g.bottom, useGlobal, 0, 600);
      ['desktop', 'tablet', 'mobile'].forEach(function (tier) {
        if (top[tier] !== null) root2.setProperty('--' + key + '-pad-top-' + tier, top[tier] + 'px');
        if (bottom[tier] !== null) root2.setProperty('--' + key + '-pad-bottom-' + tier, bottom[tier] + 'px');
      });
    });
  }
  if (!isCase) applySectionSpacing(window.__CMS_HOME__);

  /* ---------- prévia ao vivo do painel administrativo ----------
     Listener ÚNICO da prévia. Ele é a única porta de entrada de dados vindos
     do painel, e por isso concentra toda a validação.

     Só existe quando três coisas são verdade ao mesmo tempo:
       1. a página está dentro de um <iframe> (visita normal nunca entra aqui);
       2. a URL declara a origem do painel em ?cmsOrigin=... (ou no fragmento
          equivalente, preservado por redirects canônicos) — é o painel que
          monta esse endereço, sem origem de ambiente fixa no código;
       3. a mensagem vem de window.parent E de uma origem igual à declarada.

     O que entra é dado, nunca código: postMessage usa clone estruturado, que
     não transporta função, e o payload é lido campo a campo — nada é avaliado
     e nada vira seletor ou HTML sem passar pelo esc() do content-render.
     Nada disso toca o GitHub ou o localStorage: os valores vivem só nesta aba
     e somem ao recarregar. */
  window.__CMS_APPLY__ = { global: applyGlobalTokens, sections: applySectionSpacing };

  var PREVIEW_PROTOCOL = 1;

  function origemDoPainel() {
    try {
      var declarada = new URLSearchParams(location.search).get('cmsOrigin');
      if (!declarada && location.hash) {
        declarada = new URLSearchParams(location.hash.slice(1)).get('cmsOrigin');
      }
      if (!declarada) return null;
      /* normaliza e recusa qualquer coisa que não seja uma origem http(s)
         limpa — sem caminho, sem credencial, sem query */
      var u = new URL(declarada);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.origin;
    } catch (e) { return null; }
  }

  /* Enquadrado (iframe da prévia) ou aberto pelo painel numa aba nova. Os dois
     casos existem: "abrir prévia em nova aba" precisa continuar recebendo
     rascunho, senão mostraria só o que já está publicado. Em qualquer visita
     normal do site, nenhuma das duas condições é verdadeira. */
  var enquadrado = window.parent !== window;
  if (enquadrado || window.opener) {
    var ORIGEM_PAINEL = origemDoPainel();
    if (ORIGEM_PAINEL) {
      window.addEventListener('message', function (event) {
        var remetenteEsperado = enquadrado ? window.parent : window.opener;
        if (!remetenteEsperado || event.source !== remetenteEsperado) return;
        if (event.origin !== ORIGEM_PAINEL) return;
        var msg = event.data;
        if (!msg || msg.__cms__ !== 'preview' || msg.v !== PREVIEW_PROTOCOL) return;

        if (msg.type === 'lang') {
          if (window.__CMS_SETLANG__) window.__CMS_SETLANG__(msg.lang === 'en' ? 'en' : 'pt');
          return;
        }
        if (msg.type !== 'content') return;

        var d = msg.data || {};
        /* tokens visuais primeiro: eles são só variáveis de CSS e não dependem
           do HTML, então aplicam mesmo se a re-renderização de texto falhar */
        if (d.global && typeof d.global === 'object') applyGlobalTokens(d.global);
        if (d.home && typeof d.home === 'object') applySectionSpacing(d.home);

        var R = window.__CMS_RENDER__;
        var mexeuNoTexto = false;
        if (R) {
          try {
            if (d.home && typeof d.home === 'object') { R.home(d.home, d.projectsIndex || null); mexeuNoTexto = true; }
            if (d.project && typeof d.project === 'object') { R.project(d.project, d.projectsIndex || null); mexeuNoTexto = true; }
            /* índice sozinho (reordenar, ocultar, renomear projeto) também
               reconstrói a grade da home */
            if (!d.home && d.projectsIndex && typeof d.projectsIndex === 'object') {
              R.home(window.__CMS_HOME__, d.projectsIndex); mexeuNoTexto = true;
            }
          } catch (e) { /* HTML já renderizado continua valendo */ }
        }
        /* religa acordeão, refaz scrub e divisão por palavra, remede entradas */
        if (mexeuNoTexto && window.__CMS_REINIT__) window.__CMS_REINIT__();
      });
    }
  }
})();
