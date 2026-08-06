/* ===== FASE B: TEXTO E LISTAS =====
   Roda no fim do body, depois que o HTML da página existe e depois da Fase A
   (js/content.js, que já buscou o JSON e está em window.__CMS_HOME__ /
   __CMS_PROJECT__ / __CMS_PROJECTS_INDEX__ / __CMS_GLOBAL__).
   Precisa terminar ANTES de js/main.js: main.js lê os atributos data-pt/
   data-en para decidir o idioma exibido, então esta função só precisa
   corrigir esses atributos (e reconstruir listas) — main.js cuida do resto
   exatamente como já cuidava.
   Cada bloco abaixo é independente e protegido por try/catch: se um dado
   faltar ou vier no formato errado, aquele bloco é ignorado e o HTML
   estático (o que já estava no arquivo) continua valendo. */
(function () {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setText(el, pt, en) {
    if (!el) return;
    if (pt != null) el.setAttribute('data-pt', pt);
    if (en != null) el.setAttribute('data-en', en);
  }
  /* Ausência do booleano mantém conteúdo antigo visível. O texto continua no
     dado quando o rótulo é desligado, mas o próprio elemento some do layout;
     conteúdo vazio também não deixa uma caixa ornamental sem texto. */
  function setOptionalLabel(el, pt, en, show) {
    if (!el) return;
    setText(el, pt, en);
    var hasText = String(pt || '').trim() || String(en || '').trim();
    el.hidden = show === false || !hasText;
  }
  function isCase() { return location.pathname.indexOf('/work/') !== -1; }
  var base = isCase() ? '../' : '';

  /* Caminho do repositório recebe o prefixo da página; URL HTTPS externa fica
     intacta. Qualquer outro esquema vira vazio mesmo durante a prévia, antes
     de o Worker aplicar a validação definitiva na publicação. */
  function resolveAssetUrl(valor) {
    var t = typeof valor === 'string' ? valor.trim() : '';
    if (/^https:\/\//i.test(t)) return t;
    if (/^(assets|content)\//.test(t) && t.indexOf('..') === -1) return base + t;
    return '';
  }

  /* Header/footer são compartilhados por Home e cases. Esta aplicação não
     pode morar dentro de renderHome(): aquela função sai cedo em /work/ e os
     cases ficavam presos ao disclaimer estático do HTML. */
  function renderSharedChrome() {
    var G = window.__CMS_GLOBAL__ || {};
    if (G.social && G.social.email) {
      var mailLink = document.querySelector('.mail-link');
      if (mailLink) { mailLink.setAttribute('href', 'mailto:' + G.social.email); mailLink.textContent = G.social.email; }
      var copyBtn = document.querySelector('.copy-btn');
      if (copyBtn) copyBtn.setAttribute('data-copy', G.social.email);
    }
    if (G.social) {
      var linkedinLinks = document.querySelectorAll('a[href*="linkedin.com"]');
      var behanceLinks = document.querySelectorAll('a[href*="behance.net"]');
      if (G.social.linkedin) for (var i = 0; i < linkedinLinks.length; i++) linkedinLinks[i].setAttribute('href', G.social.linkedin);
      if (G.social.behance) for (var j = 0; j < behanceLinks.length; j++) behanceLinks[j].setAttribute('href', G.social.behance);
    }
    if (!G.footer) return;
    var copyEl = document.querySelector('.foot-copy');
    if (copyEl) {
      var ano = new Date().getFullYear();
      var comAno = function (txt) { return String(txt).replace(/\{year\}/g, ano); };
      var pt = G.footer.copyrightPt || ('© ' + ano + ' · ' + (G.footer.disclaimerPt || ''));
      var en = G.footer.copyrightEn || ('© ' + ano + ' · ' + (G.footer.disclaimerEn || ''));
      setText(copyEl, comAno(pt), comAno(en));
    }
    if (G.footer.marqueeText) {
      var mqBs = document.querySelectorAll('.mq-group b');
      for (var k = 0; k < mqBs.length; k++) mqBs[k].textContent = G.footer.marqueeText;
    }
  }

  /* Declarada AQUI, acima das duas chamadas abaixo, e não junto do resto do
     código de blocos. `var` é hasteada como undefined, não como o valor: lá
     embaixo, esta lista ainda não existiria quando renderProject() rodasse, e
     o .indexOf estouraria dentro do try, que engole o erro em silêncio — a
     página cairia para o HTML estático sem nada indicar por quê. É a mesma
     armadilha que já custou caro com measureCta em js/main.js. */
  var TIPOS_DE_BLOCO = ['text', 'gallery', 'image', 'quote', 'video'];

  try { renderHome(); } catch (e) { /* mantém o HTML estático */ }
  try { renderProject(); } catch (e) { /* mantém o HTML estático */ }

  /* ===== FUNDO DA CAPA =====
     Quatro modos: liquid (o fundo animado em CSS que sempre existiu), file
     (mp4/webm do repositório), vimeo e none.

     Compatibilidade: hero sem videoMode é lido pelo que já existe —
     backgroundVideo preenchido significa 'file', vazio significa 'liquid'.
     Nenhum conteúdo antigo precisa ser migrado.

     O iframe é construído com createElement e setAttribute, nunca por
     innerHTML, e a URL é REMONTADA a partir de id e hash. Nada do endereço que
     a pessoa colou é reaproveitado, então parâmetro arbitrário, marcação ou
     esquema perigoso não têm por onde chegar aqui.
     player.js (o SDK do Vimeo) não é carregado: background=1 já entrega
     autoplay sem controles, e o SDK só serviria para uma API que não usamos. */
  function modoDoVideo(hero) {
    if (hero.videoMode && ['liquid', 'file', 'vimeo', 'none'].indexOf(hero.videoMode) !== -1) return hero.videoMode;
    return hero.backgroundVideo ? 'file' : 'liquid';
  }

  function urlDoPlayerVimeo(cfg) {
    var u = 'https://player.vimeo.com/video/' + encodeURIComponent(cfg.videoId) +
      '?background=1&autopause=0&muted=1&loop=1&autoplay=1';
    if (cfg.hash) u += '&h=' + encodeURIComponent(cfg.hash);
    return u;
  }

  function aplicarVideoDaCapa(hero) {
    var liquidBg = document.querySelector('.hero .liquid-bg');
    if (!liquidBg) return;
    var video = liquidBg.querySelector('.hero-video');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var modo = modoDoVideo(hero);
    var poster = typeof hero.backgroundVideoPoster === 'string' ? hero.backgroundVideoPoster.trim() : '';

    /* Limpa o estado anterior SEMPRE, antes de decidir o novo. É o que impede
       iframe duplicado quando a prévia do CMS reenvia dados a cada tecla. */
    var iframeAntigo = liquidBg.querySelector('.hero-vimeo');
    if (iframeAntigo) iframeAntigo.remove();
    if (video) { video.hidden = true; video.removeAttribute('src'); }
    liquidBg.classList.remove('has-video');
    liquidBg.style.removeProperty('--hero-poster');

    /* Poster primeiro, sempre que existir: ele aparece antes do iframe, se o
       Vimeo estiver bloqueado, e é o que fica sob movimento reduzido. */
    if (poster && !/vimeo\.com/i.test(poster)) {
      liquidBg.style.setProperty('--hero-poster', 'url("' + encodeURI(resolveAssetUrl(poster)) + '")');
      liquidBg.classList.add('has-poster');
    } else {
      liquidBg.classList.remove('has-poster');
    }

    /* Movimento reduzido: nada de autoplay. Fica o poster, ou o fundo animado
       em CSS, que nesse modo já está parado (ver main.js/pintarFundos). */
    if (reduced || modo === 'none' || modo === 'liquid') return;

    if (modo === 'file' && hero.backgroundVideo) {
      if (!video) return;
      video.setAttribute('src', resolveAssetUrl(hero.backgroundVideo));
      if (poster) video.setAttribute('poster', resolveAssetUrl(poster));
      video.hidden = false;
      liquidBg.classList.add('has-video');
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay recusado: fica o poster */ });
      return;
    }

    if (modo === 'vimeo' && hero.vimeo && hero.vimeo.videoId) {
      var frame = document.createElement('iframe');
      frame.className = 'hero-vimeo';
      frame.setAttribute('src', urlDoPlayerVimeo(hero.vimeo));
      frame.setAttribute('title', '');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
      frame.setAttribute('frameborder', '0');
      frame.setAttribute('allow', 'autoplay');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      /* decorativo: não recebe clique nem foco, e o conteúdo por cima continua
         inteiramente utilizável */
      /* Só fica visível depois de carregar, para não piscar o quadro preto do
         player antes do vídeo começar. O evento load NÃO distingue sucesso de
         erro (o Vimeo responde 200 com a própria tela de "vídeo não existe"),
         então quem impede um vídeo quebrado de ir ao ar é a validação na
         publicação — ver validarVideoDaCapa no Worker. */
      frame.addEventListener('load', function () { frame.classList.add('is-pronto'); });
      liquidBg.appendChild(frame);
      liquidBg.classList.add('has-video');
    }
  }

  function renderHome(overrideHome, overrideIndex) {
    renderSharedChrome();
    if (isCase()) return;
    var H = overrideHome || window.__CMS_HOME__;
    if (!H || !H.hero) return;

    var hero = H.hero;
    setText(document.querySelector('.hero-tag'), hero.tagPt, hero.tagEn);
    var when = document.querySelector('.hero-when b');
    setText(when, hero.locationPt, hero.locationEn);
    setText(document.querySelector('.hero-claim'), hero.claimPt, hero.claimEn);
    var availSpan = document.querySelector('.avail span:not(.avail-dot)');
    if (availSpan) {
      setText(availSpan, hero.availabilityPt, hero.availabilityEn);
      if (hero.availabilityShortPt) availSpan.setAttribute('data-pt-short', hero.availabilityShortPt);
      if (hero.availabilityShortEn) availSpan.setAttribute('data-en-short', hero.availabilityShortEn);
    }
    var availWrap = document.querySelector('.ctrl-group .avail');
    if (availWrap && hero.showAvailability === false) availWrap.style.display = 'none';
    var nhLabel = document.querySelector('.hero .next-hint .nh-label');
    var nhName = document.querySelector('.hero .next-hint .nh-name');
    setText(nhLabel, hero.nextHintLabelPt, hero.nextHintLabelEn);
    setText(nhName, hero.nextHintNamePt, hero.nextHintNameEn);

    aplicarVideoDaCapa(hero);

    if (H.work) {
      setText(document.querySelector('.wi-title'), H.work.titlePt, H.work.titleEn);
      setText(document.querySelector('.wi-context'), H.work.contextPt, H.work.contextEn);
      setText(document.querySelector('.wi-aside'), H.work.asidePt, H.work.asideEn);
    }

    if (H.about) {
      var A = H.about;
      setOptionalLabel(document.querySelector('.about-k'), A.kickerPt, A.kickerEn, A.showKicker);
      setText(document.querySelector('.about-title'), A.titlePt, A.titleEn);
      setText(document.querySelector('.about-lead'), A.leadPt, A.leadEn);
      setText(document.querySelector('.about-sub'), A.subPt, A.subEn);
      setOptionalLabel(document.querySelector('.caps-k'), A.capabilitiesLabelPt, A.capabilitiesLabelEn, A.showCapabilitiesLabel);
      var talkBtn = document.querySelector('.about-actions .ghost-cta[data-contact]');
      setText(talkBtn, A.ctaTalkPt, A.ctaTalkEn);
      /* Currículo: só aparece quando existe arquivo enviado pelo painel E o
         botão está ligado. Os dois são condição, não um ou outro — desligar
         mantém o PDF no repositório sem expor o link, e apagar o caminho
         esconde o botão mesmo com ele ligado, em vez de publicar um link
         quebrado. */
      var resumeBtn = document.querySelector('.about-actions [data-resume]');
      if (resumeBtn) {
        var file = typeof A.resumeFile === 'string' ? A.resumeFile.trim() : '';
        if (file && A.showResume !== false) {
      resumeBtn.setAttribute('href', resolveAssetUrl(file));
          setText(resumeBtn, A.resumeLabelPt, A.resumeLabelEn);
          resumeBtn.hidden = false;
        } else {
          resumeBtn.hidden = true;
        }
      }
      var photo = document.querySelector('.portrait-img');
      if (photo && A.photo) photo.setAttribute('src', resolveAssetUrl(A.photo));
      var capsGrid = document.querySelector('.caps-grid');
      if (capsGrid && Array.isArray(A.capabilities)) {
        capsGrid.innerHTML = A.capabilities.map(function (item) {
          return '<li data-pt="' + esc(item.pt) + '" data-en="' + esc(item.en) + '">' + esc(item.pt) + '</li>';
        }).join('');
      }
    }

    if (H.help && Array.isArray(H.help.items)) {
      setOptionalLabel(document.querySelector('.help-k'), H.help.kickerPt, H.help.kickerEn, H.help.showKicker);
      setText(document.querySelector('.help-title'), H.help.titlePt, H.help.titleEn);
      setText(document.querySelector('.help-lead'), H.help.leadPt, H.help.leadEn);
      var helpList = document.querySelector('.help-list');
      if (helpList) {
        helpList.innerHTML = H.help.items.map(function (item, i) {
          var n = i + 1, num = String(n).padStart(2, '0');
          var tags = (item.tags || []).map(function (t) {
            return '<li data-pt="' + esc(t.pt) + '" data-en="' + esc(t.en) + '">' + esc(t.pt) + '</li>';
          }).join('');
          return '' +
            '<div class="help-item reveal">' +
            '  <span class="hi-line" aria-hidden="true"></span>' +
            '  <h3><button class="hi-q" aria-expanded="false" aria-controls="hi-r' + n + '" id="hi-b' + n + '">' +
            '    <span class="hi-num">' + num + '</span>' +
            '    <span class="hi-title" data-pt="' + esc(item.titlePt) + '" data-en="' + esc(item.titleEn) + '">' + esc(item.titlePt) + '</span>' +
            '    <i class="hi-ico" aria-hidden="true"></i>' +
            '  </button></h3>' +
            '  <div class="hi-a" id="hi-r' + n + '" role="region" aria-labelledby="hi-b' + n + '" hidden>' +
            '    <p data-pt="' + esc(item.textPt) + '" data-en="' + esc(item.textEn) + '">' + esc(item.textPt) + '</p>' +
            '    <ul class="hi-tags">' + tags + '</ul>' +
            '  </div>' +
            '</div>';
        }).join('');
      }
    }

    if (H.faq && Array.isArray(H.faq.items)) {
      setText(document.querySelector('.faq-title'), H.faq.titlePt, H.faq.titleEn);
      var faqList = document.querySelector('.faq-list');
      if (faqList) {
        faqList.innerHTML = H.faq.items.map(function (item, i) {
          var n = i + 1;
          return '' +
            '<div class="faq-item reveal">' +
            '  <h3><button class="faq-q" aria-expanded="false" aria-controls="faq-r' + n + '" id="faq-b' + n + '">' +
            '    <span data-pt="' + esc(item.qPt) + '" data-en="' + esc(item.qEn) + '">' + esc(item.qPt) + '</span>' +
            '    <i class="faq-ico" aria-hidden="true"></i>' +
            '  </button></h3>' +
            '  <div class="faq-a" id="faq-r' + n + '" role="region" aria-labelledby="faq-b' + n + '" hidden>' +
            '    <p data-pt="' + esc(item.aPt) + '" data-en="' + esc(item.aEn) + '">' + esc(item.aPt) + '</p>' +
            '  </div>' +
            '</div>';
        }).join('');
      }
    }

    if (H.contact) {
      var lines = document.querySelectorAll('.contact-big .hn-line');
      if (lines[0]) setText(lines[0], H.contact.titleLine1Pt, H.contact.titleLine1En);
      if (lines[1]) setText(lines[1], H.contact.titleLine2Pt, H.contact.titleLine2En);
      setOptionalLabel(document.querySelector('.mail-k'), H.contact.mailLabelPt, H.contact.mailLabelEn, H.contact.showMailLabel);
    }

    /* grade de projetos: reconstruída inteira a partir de projects/index.json,
       porque ordem, visibilidade e contagem podem mudar — um "substituir no
       lugar" não cobre adicionar, remover ou reordenar cards. */
    try {
      /* overrideIndex chega da prévia do painel, com a lista ainda não
         publicada. Sem ele, o índice vem do repositório como sempre. */
      var idx = overrideIndex || null;
      if (!idx) {
        var xf = new XMLHttpRequest();
        xf.open('GET', 'content/projects/index.json?v=1', false);
        xf.setRequestHeader('Cache-Control', 'no-cache');
        xf.send(null);
        if (xf.status === 200 || xf.status === 0) idx = JSON.parse(xf.responseText);
      }
      if (idx) {
        var list = (idx.projects || []).filter(function (p) {
          return p.visible !== false && typeof p.slug === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug);
        })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var cardsEl = document.querySelector('.cards');
        if (cardsEl) {
          cardsEl.innerHTML = list.map(function (p, cardIndex) {
            var tagsPt = p.tagsPt || [], tagsEn = p.tagsEn || [];
            var tagsHtml = tagsPt.map(function (t, i) {
              return '<span data-pt="' + esc(t) + '" data-en="' + esc(tagsEn[i] || t) + '">' + esc(t) + '</span>';
            }).join('');
            var sizes = ['normal', 'largo', 'alto', 'grande', 'largura-completa'];
            var size = sizes.indexOf(p.cardSize) !== -1 ? p.cardSize : 'normal';
            var cover = String(p.cover || '').trim();
            var coverMobile = String(p.coverMobile || '').trim();
            var media = cover ? ((coverMobile ? '<picture><source media="(max-width:639px)" srcset="' + esc(coverMobile) + '">' : '') +
              '<img src="' + esc(cover) + '" alt="" onerror="this.remove()">' + (coverMobile ? '</picture>' : '')) : '';
            return '' +
              '<a class="card reveal card--' + esc(size) + (p.featured ? ' card--featured' : '') + (p.coverLight ? ' card--light' : '') + '" href="work/' + esc(p.slug) + '.html">' +
              '  <div class="scene p' + ((cardIndex % 4) + 1) + '">' + media + '</div>' +
              '  <div class="card-tags">' + tagsHtml + '</div>' +
              '  <div class="card-foot">' +
              '    <div>' +
              '      <h3 data-pt="' + esc(p.titlePt) + '" data-en="' + esc(p.titleEn) + '">' + esc(p.titlePt) + '</h3>' +
              '      <div class="sub" data-pt="' + esc(p.subtitlePt) + '" data-en="' + esc(p.subtitleEn) + '">' + esc(p.subtitlePt) + '</div>' +
              '    </div>' +
              '    <div class="yr">' + esc(p.year) + '</div>' +
              '  </div>' +
              '</a>';
          }).join('');
        }
      }
    } catch (e) { /* grade estática do HTML continua valendo */ }
  }

  /* ===== BLOCOS DA PÁGINA DE PROJETO =====
     Antes existiam dois destinos fixos: todo bloco de texto caía em
     .case-body e o primeiro (e único) de galeria caía em .case-gallery. A
     ordem gravada no JSON não era lida, então intercalar uma imagem entre
     dois textos era impossível — e um segundo bloco de galeria sumia sem
     aviso. Agora os blocos são desenhados na ordem em que estão, dentro de
     .case-blocks.

     Blocos de TEXTO consecutivos são agrupados numa <section> só, e cada
     bloco de outro tipo ganha a sua. O wrapper é semântico e tem padding
     neutralizado no CSS; toda distância editável vem do próprio bloco. Textos
     consecutivos usam o mesmo default compacto de 18px dos demais blocos.

     Tipo desconhecido é ignorado no site (a página continua legível) e
     recusado na publicação pelo Worker, que é quem decide.
     TIPOS_DE_BLOCO fica lá em cima, junto das chamadas, pelo motivo explicado
     ali. */
  function urlDoVimeoDeBloco(cfg) {
    var u = 'https://player.vimeo.com/video/' + encodeURIComponent(cfg.videoId) +
      '?autopause=0&dnt=1';
    if (cfg.hash) u += '&h=' + encodeURIComponent(cfg.hash);
    return u;
  }

  function htmlDoBloco(b, css) {
    if (b.type === 'gallery') {
      var imgs = Array.isArray(b.images) ? b.images : [];
      return '<div class="case-gallery" style="' + css + '">' + imgs.map(function (img) {
        return '<div class="thumb reveal"><div class="scene"><img src="' + esc(resolveAssetUrl(img.src)) +
          '" alt="' + esc(img.alt || '') + '" onerror="this.remove()"></div></div>';
      }).join('') + '</div>';
    }
    if (b.type === 'image') {
      /* is-auto e is-full são as duas únicas variações de enquadramento. Mais
         que isso já seria construtor de página, que não é o que este CMS é. */
      var cls = 'case-figure reveal' + (b.fit === 'auto' ? ' is-auto' : '') + (b.width === 'full' ? ' is-full' : '');
      var cap = (b.captionPt || b.captionEn)
        ? '<figcaption data-pt="' + esc(b.captionPt || '') + '" data-en="' + esc(b.captionEn || '') + '">' + esc(b.captionPt || '') + '</figcaption>'
        : '';
      return '<figure class="' + cls + '" style="' + css + '">' +
        '<div class="scene"><img src="' + esc(resolveAssetUrl(b.src)) + '" alt="' + esc(b.alt || '') +
        '" onerror="this.remove()"></div>' + cap + '</figure>';
    }
    if (b.type === 'quote') {
      var autor = (b.authorPt || b.authorEn)
        ? '<cite data-pt="' + esc(b.authorPt || '') + '" data-en="' + esc(b.authorEn || '') + '">' + esc(b.authorPt || '') + '</cite>'
        : '';
      return '<blockquote class="case-quote reveal" style="' + css + '">' +
        '<p data-pt="' + esc(b.quotePt || '') + '" data-en="' + esc(b.quoteEn || '') + '">' + esc(b.quotePt || '') + '</p>' +
        autor + '</blockquote>';
    }
    if (b.type === 'video') {
      var capV = (b.captionPt || b.captionEn)
        ? '<figcaption data-pt="' + esc(b.captionPt || '') + '" data-en="' + esc(b.captionEn || '') + '">' + esc(b.captionPt || '') + '</figcaption>'
        : '';
      /* O iframe do Vimeo NÃO é montado aqui: fica um marcador, e o elemento é
         criado com createElement logo abaixo, com a URL remontada a partir de
         id e hash. É a mesma regra do vídeo de fundo da capa — nada do
         endereço colado pela pessoa entra numa string de HTML. */
      var miolo = (b.mode === 'vimeo' && b.vimeo && b.vimeo.videoId)
        ? '<div class="scene" data-vimeo="1"></div>'
        : '<div class="scene"><video src="' + esc(resolveAssetUrl(b.src)) + '"' +
          (b.poster ? ' poster="' + esc(resolveAssetUrl(b.poster)) + '"' : '') +
          ' controls playsinline preload="metadata"></video></div>';
      return '<figure class="case-video reveal" style="' + css + '">' + miolo + capV + '</figure>';
    }
    return '';
  }

  function renderBlocks(blocks, blockStyleCss) {
    var host = document.querySelector('.case-blocks');
    if (!host) return;
    var validos = blocks.filter(function (b) { return b && TIPOS_DE_BLOCO.indexOf(b.type) !== -1; });
    if (!validos.length) { host.innerHTML = ''; return; }

    /* Agrupa em fatias: uma sequência de textos vira um grupo, cada bloco de
       outro tipo vira um grupo de um. */
    var grupos = [];
    validos.forEach(function (b) {
      var ultimo = grupos[grupos.length - 1];
      if (b.type === 'text' && ultimo && ultimo[0].type === 'text') ultimo.push(b);
      else grupos.push([b]);
    });

    var vimeos = [];
    host.innerHTML = grupos.map(function (g) {
      if (g[0].type === 'text') {
        var corpo = g.map(function (b, i) {
          /* O último não leva espaço depois, porque o próximo bloco carrega a
             própria margem anterior. Textos consecutivos usam 18px. */
          var cssT = blockStyleCss(b.spacing, 0, i === g.length - 1 ? 0 : 18);
          var hasLabel = String(b.labelPt || '').trim() || String(b.labelEn || '').trim();
          var label = b.showLabel !== false && hasLabel
            ? '<div class="k reveal" data-pt="' + esc(b.labelPt) + '" data-en="' + esc(b.labelEn) + '">' + esc(b.labelPt) + '</div>'
            : '';
          return '<div class="case-section" style="' + cssT + '">' +
            label +
            '<p class="reveal" data-pt="' + esc(b.textPt) + '" data-en="' + esc(b.textEn) + '">' + esc(b.textPt) + '</p>' +
            '</div>';
        }).join('');
        return '<section class="case-block-group"><div class="case-body">' + corpo + '</div></section>';
      }
      var b = g[0];
      var gap = b.type === 'gallery' ? 18 : null;
      var css = blockStyleCss(b.spacing, 18, 0, gap);
      if (b.type === 'video' && b.mode === 'vimeo' && b.vimeo && b.vimeo.videoId) vimeos.push(b.vimeo);
      return '<section class="case-block-group">' + htmlDoBloco(b, css) + '</section>';
    }).join('');

    host.querySelectorAll('.case-video .scene[data-vimeo]').forEach(function (slot, i) {
      var cfg = vimeos[i];
      if (!cfg) return;
      var frame = document.createElement('iframe');
      frame.setAttribute('src', urlDoVimeoDeBloco(cfg));
      frame.setAttribute('title', '');
      frame.setAttribute('allow', 'fullscreen; picture-in-picture');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      slot.appendChild(frame);
    });
  }

  function renderProject(overrideProject, overrideIndex) {
    if (!isCase()) return;
    var P = overrideProject || window.__CMS_PROJECT__;
    if (!P || !P.hero) return;
    var h = P.hero;
    setOptionalLabel(document.querySelector('.case-hero .eyebrow'), h.eyebrowPt, h.eyebrowEn, h.showEyebrow);
    setText(document.querySelector('.case-hero h1'), h.titlePt, h.titleEn);
    setText(document.querySelector('.case-hero .sub'), h.subtitlePt, h.subtitleEn);

    var metaEl = document.querySelector('.case-meta');
    if (metaEl) {
      metaEl.innerHTML =
        '<div><span data-pt="papel" data-en="role">papel</span><p data-pt="' + esc(h.rolePt) + '" data-en="' + esc(h.roleEn) + '">' + esc(h.rolePt) + '</p></div>' +
        '<div><span data-pt="ano" data-en="year">ano</span><p>' + esc(P.year) + '</p></div>' +
        '<div><span data-pt="escopo" data-en="scope">escopo</span><p data-pt="' + esc(h.scopePt) + '" data-en="' + esc(h.scopeEn) + '">' + esc(h.scopePt) + '</p></div>';
    }

    /* Espaçamento por bloco: sempre escreve --block-mt-desktop e
       --block-mb-desktop (o número já resolvido — a personalização do bloco,
       se houver, ou o valor de contexto que reproduz o espaçamento atual) e
       só escreve as variáveis de tablet/celular quando existe mesmo um
       número próprio para aquele nível — sem isso, o CSS já cai em cascata
       para o nível anterior (ver css/style.css, bloco "ESPAÇAMENTO POR
       BLOCO"). É o mesmo desenho de content.js para o espaçamento de seção,
       só que embutido no próprio elemento em vez de em :root, porque aqui
       quem varia é a instância do bloco, não a página inteira. */
    function tierVars(prop, spacingField, contextualDesktopDefault) {
      var obj = spacingField || {};
      var d = typeof obj.desktop === 'number' ? obj.desktop : contextualDesktopDefault;
      var out = ['--' + prop + '-desktop:' + d + 'px'];
      if (typeof obj.tablet === 'number') out.push('--' + prop + '-tablet:' + obj.tablet + 'px');
      if (typeof obj.mobile === 'number') out.push('--' + prop + '-mobile:' + obj.mobile + 'px');
      return out;
    }
    /* devolve o CSS "nu" (sem o wrapper style="..."), para tanto montar um
       atributo dentro de um innerHTML quanto chamar setAttribute direto */
    function blockStyleCss(spacing, mtDefault, mbDefault, gapDefault) {
      spacing = spacing || {};
      var parts = tierVars('block-mt', spacing.marginTop, mtDefault).concat(tierVars('block-mb', spacing.marginBottom, mbDefault));
      if (gapDefault != null) parts = parts.concat(tierVars('block-gap', spacing.gap, gapDefault));
      return parts.join(';');
    }

    var coverImg = document.querySelector('.case-cover .scene img');
    if (coverImg && P.cover) coverImg.setAttribute('src', resolveAssetUrl(P.cover));
    var coverEl = document.querySelector('.case-cover');
    if (coverEl) coverEl.setAttribute('style', blockStyleCss(P.coverSpacing, 18, 0));

    var blocks = Array.isArray(P.blocks) ? P.blocks : [];
    renderBlocks(blocks, blockStyleCss);

    /* navegação anterior/próximo: calculada pela posição do projeto
       atual na lista visível e ordenada, nunca por um campo prevProject/
       nextProject gravado à mão. Um campo gravado à mão é exatamente o tipo
       de coisa que quebra sem avisar quando um projeto novo é criado: o
       vizinho de cima continuaria apontando para o antigo "próximo", porque
       nada o obrigaria a saber que alguém foi inserido no meio. Calculando
       na hora, inserir um projeto em qualquer posição já encaixa ele na
       sequência dos vizinhos automaticamente, sem editar mais nada. */
    try {
      var idx = overrideIndex || window.__CMS_PROJECTS_INDEX__;
      var navEl = document.querySelector('.case-nav');
      if (navEl && idx && Array.isArray(idx.projects)) {
        var visible = idx.projects.filter(function (p) { return p.visible !== false; })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var myPos = -1;
        for (var vi = 0; vi < visible.length; vi++) if (visible[vi].slug === P.slug) { myPos = vi; break; }
        var prevP = myPos !== -1 && visible.length > 1 ? visible[(myPos - 1 + visible.length) % visible.length] : null;
        var nextP = myPos !== -1 && visible.length > 1 ? visible[(myPos + 1) % visible.length] : null;
        navEl.hidden = !nextP;
        if (prevP && nextP) {
          var links = navEl.querySelectorAll('a');
          if (links[0]) {
            links[0].setAttribute('href', prevP.slug + '.html');
            var prevSpans = links[0].querySelectorAll('span');
            setText(prevSpans[0], 'anterior', 'previous');
            setText(prevSpans[1], prevP.titlePt, prevP.titleEn);
          }
          if (links[1]) {
            links[1].setAttribute('href', nextP.slug + '.html');
            var nextSpans = links[1].querySelectorAll('span');
            setText(nextSpans[0], 'próximo', 'next');
            setText(nextSpans[1], nextP.titlePt, nextP.titleEn);
          }
        }
      }
    } catch (e) { /* navegação estática continua valendo */ }

    if (P.seo && P.seo.title) document.title = P.seo.title;
  }

  /* Ponte da prévia. O listener de postMessage NÃO mora aqui: ele é único e
     fica em js/content.js, que é quem valida origem e formato antes de
     qualquer coisa. Este arquivo só expõe o que sabe fazer.

     A versão anterior tinha um segundo listener aqui, com um reapplyLanguage
     próprio que repetia à mão o laço de data-pt/data-en do main.js. Isso
     deixava três coisas para trás a cada atualização de texto: os spans da
     divisão por palavra eram apagados e não voltavam, os acordeões
     reconstruídos de FAQ e "O que eu faço" perdiam o clique, e as entradas
     não eram remedidas. Quem cuida disso agora é window.__CMS_REINIT__, em
     js/main.js, que reaproveita o setLang de verdade em vez de imitá-lo. */
  window.__CMS_RENDER__ = { home: renderHome, project: renderProject };
})();
