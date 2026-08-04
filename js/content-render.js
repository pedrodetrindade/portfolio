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
  function isCase() { return location.pathname.indexOf('/work/') !== -1; }
  var base = isCase() ? '../' : '';

  try { renderHome(); } catch (e) { /* mantém o HTML estático */ }
  try { renderProject(); } catch (e) { /* mantém o HTML estático */ }

  function renderHome(overrideHome) {
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

    /* Vídeo de fundo da capa, opcional. Ignorado sob prefers-reduced-motion:
       um vídeo autoplay é a própria coisa que essa preferência pede para não
       rodar, e as massas de vidro líquido (que ali já ficam paradas, ver
       main.js/pintarFundos) seguem servindo de fundo. */
    if (hero.backgroundVideo) {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var video = document.querySelector('.hero .hero-video');
      var liquidBg = document.querySelector('.hero .liquid-bg');
      if (video && liquidBg && !reduced) {
        video.src = hero.backgroundVideo;
        if (hero.backgroundVideoPoster) video.poster = hero.backgroundVideoPoster;
        video.hidden = false;
        liquidBg.classList.add('has-video');
        video.play().catch(function () {});
      }
    }

    if (H.work) {
      setText(document.querySelector('.wi-title'), H.work.titlePt, H.work.titleEn);
      setText(document.querySelector('.wi-context'), H.work.contextPt, H.work.contextEn);
      setText(document.querySelector('.wi-aside'), H.work.asidePt, H.work.asideEn);
    }

    if (H.about) {
      var A = H.about;
      setText(document.querySelector('.about-k'), A.kickerPt, A.kickerEn);
      setText(document.querySelector('.about-lead'), A.leadPt, A.leadEn);
      setText(document.querySelector('.about-sub'), A.subPt, A.subEn);
      setText(document.querySelector('.caps-k'), A.capabilitiesLabelPt, A.capabilitiesLabelEn);
      var talkBtn = document.querySelector('.about-actions .ghost-cta[data-contact]');
      setText(talkBtn, A.ctaTalkPt, A.ctaTalkEn);
      var photo = document.querySelector('.portrait-img');
      if (photo && A.photo) photo.setAttribute('src', base + A.photo);
      var capsGrid = document.querySelector('.caps-grid');
      if (capsGrid && Array.isArray(A.capabilities)) {
        capsGrid.innerHTML = A.capabilities.map(function (item) {
          return '<li data-pt="' + esc(item.pt) + '" data-en="' + esc(item.en) + '">' + esc(item.pt) + '</li>';
        }).join('');
      }
    }

    if (H.help && Array.isArray(H.help.items)) {
      setText(document.querySelector('.help-k'), H.help.kickerPt, H.help.kickerEn);
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
      setText(document.querySelector('.mail-k'), H.contact.mailLabelPt, H.contact.mailLabelEn);
    }

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
    if (G.footer) {
      var noteSpan = document.querySelector('.foot-note span:last-child');
      setText(noteSpan, G.footer.disclaimerPt, G.footer.disclaimerEn);
      if (G.footer.marqueeText) {
        var mqBs = document.querySelectorAll('.mq-group b');
        for (var k = 0; k < mqBs.length; k++) mqBs[k].textContent = G.footer.marqueeText;
      }
    }

    /* grade de projetos: reconstruída inteira a partir de projects/index.json,
       porque ordem, visibilidade e contagem podem mudar — um "substituir no
       lugar" não cobre adicionar, remover ou reordenar cards. */
    try {
      var xf = new XMLHttpRequest();
      xf.open('GET', 'content/projects/index.json?v=1', false);
      xf.send(null);
      if (xf.status === 200 || xf.status === 0) {
        var idx = JSON.parse(xf.responseText);
        var list = (idx.projects || []).filter(function (p) { return p.visible !== false; })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var cardsEl = document.querySelector('.cards');
        if (cardsEl && list.length) {
          cardsEl.innerHTML = list.map(function (p) {
            var tagsPt = p.tagsPt || [], tagsEn = p.tagsEn || [];
            var tagsHtml = tagsPt.map(function (t, i) {
              return '<span data-pt="' + esc(t) + '" data-en="' + esc(tagsEn[i] || t) + '">' + esc(t) + '</span>';
            }).join('');
            return '' +
              '<a class="card reveal" href="work/' + esc(p.slug) + '.html">' +
              '  <div class="scene"><img src="' + esc(p.cover) + '" alt="" onerror="this.remove()"></div>' +
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

  function renderProject(overrideProject) {
    if (!isCase()) return;
    var P = overrideProject || window.__CMS_PROJECT__;
    if (!P || !P.hero) return;
    var h = P.hero;
    setText(document.querySelector('.case-hero .eyebrow'), h.eyebrowPt, h.eyebrowEn);
    setText(document.querySelector('.case-hero h1'), h.titlePt, h.titleEn);
    setText(document.querySelector('.case-hero .sub'), h.subtitlePt, h.subtitleEn);

    var metaEl = document.querySelector('.case-meta');
    if (metaEl) {
      metaEl.innerHTML =
        '<div><span data-pt="papel" data-en="role">papel</span><p data-pt="' + esc(h.rolePt) + '" data-en="' + esc(h.roleEn) + '">' + esc(h.rolePt) + '</p></div>' +
        '<div><span data-pt="ano" data-en="year">ano</span><p>' + esc(P.year) + '</p></div>' +
        '<div><span data-pt="escopo" data-en="scope">escopo</span><p data-pt="' + esc(h.scopePt) + '" data-en="' + esc(h.scopeEn) + '">' + esc(h.scopePt) + '</p></div>';
    }

    var coverImg = document.querySelector('.case-cover .scene img');
    if (coverImg && P.cover) coverImg.setAttribute('src', base + P.cover);

    var blocks = Array.isArray(P.blocks) ? P.blocks : [];
    var bodyEl = document.querySelector('.case-body');
    if (bodyEl) {
      var textBlocks = blocks.filter(function (b) { return b.type === 'text'; });
      if (textBlocks.length) {
        bodyEl.innerHTML = textBlocks.map(function (b) {
          return '<div class="case-section">' +
            '<div class="k reveal" data-pt="' + esc(b.labelPt) + '" data-en="' + esc(b.labelEn) + '">' + esc(b.labelPt) + '</div>' +
            '<p class="reveal" data-pt="' + esc(b.textPt) + '" data-en="' + esc(b.textEn) + '">' + esc(b.textPt) + '</p>' +
            '</div>';
        }).join('');
      }
    }

    var galleryEl = document.querySelector('.case-gallery');
    if (galleryEl) {
      var galleryBlock = blocks.filter(function (b) { return b.type === 'gallery'; })[0];
      if (galleryBlock && Array.isArray(galleryBlock.images)) {
        galleryEl.innerHTML = galleryBlock.images.map(function (img) {
          return '<div class="thumb reveal"><div class="scene"><img src="' + esc(base + img.src) + '" alt="' + esc(img.alt || '') + '" onerror="this.remove()"></div></div>';
        }).join('');
      }
    }

    /* navegação para o próximo projeto: calculada pela posição do projeto
       atual na lista visível e ordenada, nunca por um campo prevProject/
       nextProject gravado à mão. Um campo gravado à mão é exatamente o tipo
       de coisa que quebra sem avisar quando um projeto novo é criado: o
       vizinho de cima continuaria apontando para o antigo "próximo", porque
       nada o obrigaria a saber que alguém foi inserido no meio. Calculando
       na hora, inserir um projeto em qualquer posição já encaixa ele na
       sequência dos vizinhos automaticamente, sem editar mais nada. */
    try {
      var idx = window.__CMS_PROJECTS_INDEX__;
      var navEl = document.querySelector('.case-nav');
      if (navEl && idx && Array.isArray(idx.projects)) {
        var visible = idx.projects.filter(function (p) { return p.visible !== false; })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var myPos = -1;
        for (var vi = 0; vi < visible.length; vi++) if (visible[vi].slug === P.slug) { myPos = vi; break; }
        var nextP = myPos !== -1 && visible.length > 1 ? visible[(myPos + 1) % visible.length] : null;
        if (nextP) {
          var links = navEl.querySelectorAll('a');
          if (links[1]) {
            links[1].setAttribute('href', nextP.slug + '.html');
            var span = links[1].querySelectorAll('span')[1];
            setText(span, nextP.titlePt, nextP.titleEn);
          }
        }
      }
    } catch (e) { /* navegação estática continua valendo */ }

    if (P.seo && P.seo.title) document.title = P.seo.title;
  }

  /* prévia ao vivo: re-renderiza texto quando o painel manda dados de
     rascunho por postMessage (ver js/content.js para a mesma ideia aplicada
     às variáveis de CSS). Depois de atualizar data-pt/data-en, repete a
     mesma leitura simples que main.js faz para decidir o texto exibido —
     sem isso, os atributos mudariam mas a tela continuaria mostrando o
     texto antigo até a próxima troca manual de idioma. */
  function reapplyLanguage() {
    var lang = document.documentElement.lang && document.documentElement.lang.indexOf('en') === 0 ? 'en' : 'pt';
    document.querySelectorAll('[data-pt]').forEach(function (el) {
      var v = lang === 'pt' ? el.getAttribute('data-pt') : el.getAttribute('data-en');
      if (v != null) el.innerHTML = v;
    });
  }
  if (window.parent !== window) {
    window.addEventListener('message', function (event) {
      var msg = event.data;
      if (!msg || msg.__cmsPreview__ !== true) return;
      if (msg.home) renderHome(msg.home);
      if (msg.project) renderProject(msg.project);
      if (msg.home || msg.project) reapplyLanguage();
    });
  }
})();
