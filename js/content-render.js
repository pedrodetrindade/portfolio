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
  function isWorkPath() { return location.pathname.indexOf('/work/') !== -1; }
  function isWorkIndex() {
    if (!isWorkPath()) return false;
    var workPath = location.pathname.split('/work/')[1].replace(/^\/+|\/+$/g, '');
    return !workPath || workPath === 'index.html';
  }
  function isProjectPage() { return isWorkPath() && !isWorkIndex(); }
  var base = location.protocol === 'file:' ? (isProjectPage() ? '../../' : (isWorkPath() ? '../' : '')) : '/';

  function slugValido(slug) {
    return typeof slug === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
  }
  function projectUrl(slug) {
    return slugValido(slug) ? '/work/' + encodeURIComponent(slug) + '/' : '';
  }
  function projetosPublicos(idx) {
    return ((idx && idx.projects) || []).filter(function (p) {
      return p && p.visible !== false && slugValido(p.slug);
    }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function emBreve(p) { return p && p.availability === 'coming-soon'; }
  function projectMedia(p, breakpoint) {
    var cover = resolveAssetUrl(p && p.cover);
    var coverMobile = resolveAssetUrl(p && p.coverMobile);
    if (!cover) return '';
    var source = coverMobile ? '<source media="(max-width:' + breakpoint + 'px)" srcset="' + esc(coverMobile) + '">' : '';
    return '<picture>' + source + '<img src="' + esc(cover) + '" alt="" onerror="this.remove()"></picture>';
  }

  /* Caminho do repositório recebe o prefixo da página; URL HTTPS externa fica
     intacta. Qualquer outro esquema vira vazio mesmo durante a prévia, antes
     de o Worker aplicar a validação definitiva na publicação. */
  function resolveAssetUrl(valor) {
    var t = typeof valor === 'string' ? valor.trim() : '';
    if (!t || /[<>"'`\\]/.test(t)) return '';
    if (/^https:\/\//i.test(t)) {
      try {
        var u = new URL(t);
        if (u.protocol !== 'https:' || u.username || u.password) return '';
        return u.href;
      } catch (e) { return ''; }
    }
    if (/^(assets|content)\//.test(t) && t.indexOf('..') === -1) {
      try { return new URL(base + t, location.href).href; } catch (e) { return ''; }
    }
    return '';
  }

  /* ===== APARÊNCIA DE FUNDO E RUÍDO =====
     A imagem é uma camada de fundo da seção, nunca conteúdo: o CSS usa um
     pseudo-elemento e mantém texto, links e mídia no fluxo normal. O ruído é
     uma única textura fixa para a página inteira. O padrão global permanece
     contínuo no conteúdo; capa e rodapé podem desligá-lo individualmente. */
  function grainGlobalLigado() {
    var G = window.__CMS_GLOBAL__ || {};
    return !(G.effects && G.effects.grain && G.effects.grain.enabled === false);
  }

  function grainOpacityGlobal() {
    var G = window.__CMS_GLOBAL__ || {};
    var valor = G.effects && G.effects.grain ? Number(G.effects.grain.opacity) : 10;
    if (!isFinite(valor)) valor = 10;
    return Math.max(0, Math.min(12, valor)) / 100;
  }

  function aplicarGrainNaSuperficie(el, ligado) {
    if (!el) return;
    var layer = null;
    for (var i = 0; i < el.children.length; i++) {
      if (el.children[i].classList && el.children[i].classList.contains('cms-section-grain')) { layer = el.children[i]; break; }
    }
    if (ligado && !layer) {
      layer = document.createElement('span');
      layer.className = 'cms-section-grain';
      layer.setAttribute('aria-hidden', 'true');
      el.insertBefore(layer, el.firstChild);
    }
    if (layer) layer.hidden = !ligado;
    el.classList.toggle('has-section-grain', !!ligado);
    el.style.setProperty('--section-grain-opacity', String(grainOpacityGlobal()));
  }

  function aplicarFundoDaSecao(el, key, visual) {
    if (!el) return;
    visual = visual || {};
    el.classList.add('cms-section-surface');
    var imagem = resolveAssetUrl(visual.backgroundImage);
    el.classList.toggle('has-section-image', !!imagem);
    if (imagem) el.style.setProperty('--section-image', 'url("' + encodeURI(imagem) + '")');
    else el.style.removeProperty('--section-image');

    var opacidade = Number(visual.backgroundImageOpacity);
    if (!isFinite(opacidade)) opacidade = 100;
    el.style.setProperty('--section-image-opacity', String(Math.max(0, Math.min(100, opacidade)) / 100));
    var posicoes = { center: '50% 50%', top: '50% 0%', bottom: '50% 100%' };
    el.style.setProperty('--section-image-position', posicoes[visual.backgroundPosition] || posicoes.center);

    var grainLigado = grainGlobalLigado() && visual.grainEnabled !== false;
    el.setAttribute('data-grain-enabled', grainLigado ? 'true' : 'false');
    el.setAttribute('data-grain-opacity', String(grainOpacityGlobal()));
    aplicarGrainNaSuperficie(el, grainLigado);
  }

  function aplicarAparenciaHome(H) {
    var sections = (H && H.sections) || {};
    var mapa = {
      hero: document.querySelector('.hero'),
      work: document.getElementById('work'),
      about: document.querySelector('.about-break'),
      help: document.getElementById('help'),
      faq: document.getElementById('faq')
    };
    Object.keys(mapa).forEach(function (key) { aplicarFundoDaSecao(mapa[key], key, sections[key]); });
  }

  function chaveDaSecao(id) { return id === 'top' ? 'hero' : id; }
  function secaoVisivel(id, H) {
    var sections = H && H.sections;
    var key = chaveDaSecao(id);
    return !(sections && sections[key] && sections[key].visible === false);
  }
  function aplicarVisibilidadeHome(H) {
    var mapa = {
      top: document.querySelector('.hero'),
      work: document.getElementById('work'),
      about: document.getElementById('about'),
      help: document.getElementById('help'),
      faq: document.getElementById('faq'),
      contact: document.querySelector('.site-footer-contact')
    };
    Object.keys(mapa).forEach(function (id) {
      var visivel = secaoVisivel(id, H);
      var el = mapa[id];
      if (el) {
        el.hidden = !visivel;
        el.classList.toggle('cms-section-hidden', !visivel);
      }
      document.querySelectorAll('.menu-item[data-secao="' + id + '"],.site-footer-nav [data-footer-section="' + id + '"]').forEach(function (link) {
        link.hidden = !visivel;
      });
    });
    var footer = document.querySelector('.site-footer');
    if (footer) footer.classList.toggle('cms-contact-hidden', !secaoVisivel('contact', H));
  }

  function aplicarAparenciaPagina() {
    var ligado = grainGlobalLigado();
    document.documentElement.setAttribute('data-grain-page', ligado ? 'true' : 'false');
    document.documentElement.setAttribute('data-grain-page-opacity', String(grainOpacityGlobal()));
    var main = document.querySelector('main');
    if (main) {
      main.classList.add('cms-section-surface');
      main.setAttribute('data-grain-enabled', ligado ? 'true' : 'false');
      aplicarGrainNaSuperficie(main, ligado);
    }
  }

  function footerExternalUrl(value) {
    var t = typeof value === 'string' ? value.trim() : '';
    if (!/^https?:\/\//i.test(t)) return '';
    try {
      var u = new URL(t);
      return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password ? u.href : '';
    } catch (e) { return ''; }
  }

  function footerNavHref(section) {
    if (section === 'contact') return '#site-footer';
    if (!isWorkPath()) return section === 'top' ? '#top' : '#' + section;
    if (section === 'work') return '/work/';
    return '/' + (section === 'top' ? '' : '#' + section);
  }

  function footerSection(item) {
    var allowed = ['top', 'work', 'about', 'help', 'faq', 'contact'];
    if (item && allowed.indexOf(item.section) !== -1) return item.section;
    var href = String(item && (item.hrefHome || item.href) || '');
    var hash = href.indexOf('#') !== -1 ? href.split('#').pop() : 'top';
    return allowed.indexOf(hash) !== -1 ? hash : 'top';
  }

  function footerVimeoConfig(value) {
    if (typeof value !== 'string' || /[<>"'`\\]/.test(value)) return null;
    var u;
    try { u = new URL(value.trim()); } catch (e) { return null; }
    var host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].indexOf(host) === -1 || u.username || u.password) return null;
    var parts = u.pathname.split('/').filter(Boolean), id = '', hash = null;
    if (host === 'player.vimeo.com') {
      if (parts[0] !== 'video') return null;
      id = parts[1] || '';
      hash = u.searchParams.get('h');
    } else {
      id = parts[0] || '';
      hash = parts[1] || null;
    }
    if (!/^[0-9]{6,12}$/.test(id) || (hash && !/^[a-zA-Z0-9]{6,20}$/.test(hash))) return null;
    return { videoId: id, hash: hash };
  }

  function footerMediaHtml(background) {
    background = background && typeof background === 'object' ? background : {};
    var type = ['solid', 'image', 'video'].indexOf(background.type) !== -1 ? background.type : 'solid';
    var image = resolveAssetUrl(background.image);
    var vimeo = footerVimeoConfig(background.video);
    var video = vimeo ? '' : resolveAssetUrl(background.video);
    var poster = resolveAssetUrl(background.poster);
    var media = '';
    if (type === 'image' && image) {
      media = '<picture class="site-footer-picture"><img data-footer-lazy data-src="' + esc(image) + '" alt="" onerror="this.remove()"></picture>';
    } else if (type === 'video' && (video || vimeo)) {
      if (poster) media += '<picture class="site-footer-picture"><img src="' + esc(poster) + '" alt="" onerror="this.remove()"></picture>';
      if (vimeo) {
        media += '<iframe class="site-footer-video site-footer-vimeo" title="" aria-hidden="true" tabindex="-1" allow="autoplay; fullscreen; picture-in-picture" data-footer-vimeo data-src="' + esc(urlDoPlayerVimeo(vimeo)) + '"></iframe>';
      } else {
        media += '<video class="site-footer-video" muted loop playsinline aria-hidden="true" tabindex="-1" preload="none" data-footer-video data-src="' + esc(video) + '"></video>';
      }
    }
    return { type: type, html: media };
  }

  function initFooterMedia(footer, mediaType) {
    if (window.__CMS_FOOTER_MEDIA_OBSERVER__) window.__CMS_FOOTER_MEDIA_OBSERVER__.disconnect();
    var trigger = footer.querySelector('[data-footer-media-trigger]');
    if (!trigger || mediaType === 'solid') return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function activate() {
      if (mediaType === 'video' && reduce) {
        if (window.__CMS_FOOTER_MEDIA_OBSERVER__) window.__CMS_FOOTER_MEDIA_OBSERVER__.disconnect();
        return;
      }
      var image = footer.querySelector('[data-footer-lazy]');
      if (image && image.dataset.src && !image.src) image.src = image.dataset.src;
      var video = footer.querySelector('[data-footer-video]');
      if (video && video.dataset.src && !video.src) {
        video.src = video.dataset.src;
        video.preload = 'metadata';
        video.addEventListener('playing', function () { footer.classList.add('is-footer-video-playing'); }, { once: true });
        video.load();
        var play = video.play();
        if (play && play.catch) play.catch(function () { /* poster/fundo sólido permanecem */ });
      }
      var vimeo = footer.querySelector('[data-footer-vimeo]');
      if (vimeo && vimeo.dataset.src && !vimeo.src) {
        vimeo.addEventListener('load', function () { footer.classList.add('is-footer-video-playing'); }, { once: true });
        vimeo.src = vimeo.dataset.src;
      }
      if (window.__CMS_FOOTER_MEDIA_OBSERVER__) window.__CMS_FOOTER_MEDIA_OBSERVER__.disconnect();
    }
    if (trigger.classList.contains('in')) { activate(); return; }
    var observer = new MutationObserver(function () {
      if (trigger.classList.contains('in')) activate();
    });
    observer.observe(trigger, { attributes: true, attributeFilter: ['class'] });
    window.__CMS_FOOTER_MEDIA_OBSERVER__ = observer;
  }

  function initFooterCopy(footer) {
    var button = footer.querySelector('[data-footer-copy]');
    if (!button) return;
    var flash = footer.querySelector('[data-footer-copy-status]');
    var timer = null;
    button.addEventListener('click', function () {
      var text = button.getAttribute('data-copy') || '';
      var task;
      if (navigator.clipboard && window.isSecureContext) task = navigator.clipboard.writeText(text);
      else {
        task = new Promise(function (resolve, reject) {
          var area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.cssText = 'position:fixed;top:-999px;opacity:0';
          document.body.appendChild(area);
          area.select();
          var ok = document.execCommand('copy');
          area.remove();
          ok ? resolve() : reject(new Error('copy_failed'));
        });
      }
      task.then(function () {
        var pt = (document.documentElement.lang || 'pt').indexOf('pt') === 0;
        button.classList.add('done');
        if (flash) flash.textContent = pt ? 'Copiado' : 'Copied';
        clearTimeout(timer);
        timer = setTimeout(function () {
          button.classList.remove('done');
          if (flash) flash.textContent = '';
        }, 2100);
      }).catch(function () {
        var pt = (document.documentElement.lang || 'pt').indexOf('pt') === 0;
        if (flash) flash.textContent = pt ? 'Selecione e copie' : 'Select and copy';
      });
    });
  }

  function renderGlobalFooter(G) {
    var footer = document.querySelector('footer');
    if (!footer) return;
    /* Se o XHR bloqueante falhar (rede, cache intermediário ou servidor local),
       não reconstrói o rodapé a partir de {}. Era isso que apagava navegação,
       redes, e-mail e crédito e ainda reativava a assinatura pelo fallback do
       nome da marca. Esta reserva completa só entra quando o global realmente
       não chegou; com JSON válido, o CMS continua sendo a única fonte. */
    if (!G || !G.footer || !G.social || !G.header) {
      G = {
        footer: {
          kickerPt: 'Contato', kickerEn: 'Contact',
          headlinePt: 'Projetos, colaborações e novas conversas.',
          headlineEn: 'Projects, collaborations and new conversations.',
          supportPt: 'Se você tem uma ideia, uma marca ou um desafio que pede direção criativa, vamos conversar.',
          supportEn: "If you have an idea, a brand or a challenge that needs creative direction, let's talk.",
          copyrightPt: '© {year} Pedro de Trindade. Pensado, dirigido e desenvolvido por mim. Movido a playlists e só mais um ajustezinho.',
          copyrightEn: '© {year} Pedro de Trindade. Designed, directed and built by me. Powered by playlists and one last little adjustment.',
          showSignature: false
        },
        social: {
          linkedin: 'https://www.linkedin.com/in/pedrodetrindade',
          behance: 'https://www.behance.net/trind9de',
          email: 'contact@pedrodetrindade.com'
        },
        header: { menu: [
          { section:'top', pt:'Início', en:'Home' },
          { section:'work', pt:'Trabalhos', en:'Work' },
          { section:'about', pt:'Sobre', en:'About' },
          { section:'help', pt:'O que eu faço', en:'What I do' },
          { section:'faq', pt:'FAQ', en:'FAQ' },
          { section:'contact', pt:'Contato', en:'Contact' }
        ] },
        brand: { name:'Pedro de Trindade' }
      };
    }
    var f = G.footer || {}, social = G.social || {}, brand = G.brand || {};
    var background = f.background && typeof f.background === 'object' ? f.background : {};
    var media = footerMediaHtml(background);
    var solid = /^#[0-9a-f]{6}$/i.test(background.color || '') ? background.color : '#151111';
    var overlay = Number(background.overlayOpacity);
    if (!isFinite(overlay)) overlay = media.type === 'solid' ? 0 : 62;
    overlay = Math.max(0, Math.min(100, overlay));
    var email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(social.email || '') ? social.email.trim() : '';
    var menu = G.header && Array.isArray(G.header.menu) ? G.header.menu : [];
    var nav = menu.filter(function (item) {
      return item && item.visible !== false && secaoVisivel(footerSection(item), window.__CMS_HOME__);
    }).map(function (item) {
      var section = footerSection(item);
      var current = section === 'work' && isWorkIndex() ? ' aria-current="page"' : '';
      return '<a href="' + esc(footerNavHref(section)) + '"' + current + ' data-footer-section="' + esc(section) + '" data-pt="' + esc(item.pt || '') + '" data-en="' + esc(item.en || item.pt || '') + '">' + esc(item.pt || '') + '</a>';
    }).join('');
    var socials = [];
    var linkedin = social.linkedinActive === false ? '' : footerExternalUrl(social.linkedin);
    var behance = social.behanceActive === false ? '' : footerExternalUrl(social.behance);
    if (linkedin) socials.push('<a href="' + esc(linkedin) + '" target="_blank" rel="noopener noreferrer"><span class="cta-blur-label">LinkedIn</span><span aria-hidden="true">↗</span></a>');
    if (behance) socials.push('<a href="' + esc(behance) + '" target="_blank" rel="noopener noreferrer"><span class="cta-blur-label">Behance</span><span aria-hidden="true">↗</span></a>');
    var year = new Date().getFullYear();
    function withYear(value) { return String(value || '').replace(/\{year\}/g, year); }
    var copyPt = withYear(f.copyrightPt || ('© ' + year + ' · ' + (f.disclaimerPt || '')));
    var copyEn = withYear(f.copyrightEn || ('© ' + year + ' · ' + (f.disclaimerEn || '')));
    var signature = f.marqueeText || brand.name || 'Pedro de Trindade.';
    var showEmail = f.showEmail !== false && email;
    var showCopyEmail = f.showCopyEmail !== false;
    var showNav = f.showNavigation !== false && nav;
    var showSocial = f.showSocial !== false && socials.length;
    var showSignature = f.showSignature !== false && signature;
    var footerGrainLigado = grainGlobalLigado() && f.grainEnabled !== false;
    footer.id = 'site-footer';
    footer.className = 'site-footer';
    if (showNav) footer.classList.add('has-footer-nav');
    if (showSocial) footer.classList.add('has-footer-social');
    /* O CSS precisa saber que o marquee saiu: sem ele o bloco de crédito passa
       a ser o último e cairia dentro do desfoque fixo da base da janela, além
       de deixar um vão morto no meio do rodapé. Ver .has-footer-marquee. */
    if (showSignature) footer.classList.add('has-footer-marquee');
    footer.style.setProperty('--site-footer-bg', solid);
    footer.style.setProperty('--site-footer-overlay', String(overlay / 100));
    var topSpacing = Number(f.topSpacing);
    if (isFinite(topSpacing)) footer.style.setProperty('--site-footer-pad-top', Math.max(48, Math.min(120, topSpacing)) + 'px');
    else footer.style.removeProperty('--site-footer-pad-top');
    var emailOffset = Number(f.emailOffset);
    if (isFinite(emailOffset)) footer.style.setProperty('--site-footer-email-offset', Math.max(-40, Math.min(60, emailOffset)) + 'px');
    else footer.style.removeProperty('--site-footer-email-offset');
    var legalOffset = Number(f.legalOffset);
    if (isFinite(legalOffset)) footer.style.setProperty('--site-footer-legal-offset', Math.max(-60, Math.min(40, legalOffset)) + 'px');
    else footer.style.removeProperty('--site-footer-legal-offset');
    footer.innerHTML =
      '<span class="site-footer-media-trigger reveal" data-footer-media-trigger aria-hidden="true"></span>' +
      '<span class="site-footer-contact-anchor" id="contact" aria-hidden="true" data-grain-enabled="' + (footerGrainLigado ? 'true' : 'false') + '" data-grain-opacity="' + grainOpacityGlobal() + '"></span>' +
      '<div class="site-footer-media" aria-hidden="true">' + media.html + '</div>' +
      '<div class="site-footer-overlay" aria-hidden="true"></div>' +
      '<div class="site-footer-inner wrap">' +
        '<div class="site-footer-grid">' +
          '<section class="site-footer-contact" aria-labelledby="site-footer-title">' +
            '<p class="site-footer-kicker" data-pt="' + esc(f.kickerPt || 'Contato') + '" data-en="' + esc(f.kickerEn || 'Contact') + '">' + esc(f.kickerPt || 'Contato') + '</p>' +
            '<h2 id="site-footer-title" data-pt="' + esc(f.headlinePt || 'Projetos, colaborações e novas conversas.') + '" data-en="' + esc(f.headlineEn || 'Projects, collaborations and new conversations.') + '">' + esc(f.headlinePt || 'Projetos, colaborações e novas conversas.') + '</h2>' +
            '<p class="site-footer-support" data-pt="' + esc(f.supportPt || '') + '" data-en="' + esc(f.supportEn || '') + '">' + esc(f.supportPt || '') + '</p>' +
            (showEmail ? '<div class="site-footer-email-row"><a class="site-footer-email" href="mailto:' + esc(email) + '">' + esc(email) + ' <span aria-hidden="true">↗</span></a>' +
              (showCopyEmail ? '<button class="site-footer-copy" type="button" data-footer-copy data-copy="' + esc(email) + '" data-pt-label="Copiar endereço de e-mail" data-en-label="Copy email address" aria-label="Copiar endereço de e-mail"><svg class="ico-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.6"/><path d="M15.5 5.2A2.7 2.7 0 0 0 12.9 4H6.6A2.6 2.6 0 0 0 4 6.6v6.3c0 1.2.8 2.2 1.9 2.5"/></svg><svg class="ico-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.8 12.6l4.6 4.6L19.2 7.4"/></svg></button><span class="site-footer-copy-status" data-footer-copy-status role="status" aria-live="polite"></span>' : '') + '</div>' : '') +
          '</section>' +
          (showNav ? '<nav class="site-footer-nav" aria-label="Footer"><p data-pt="Navegação" data-en="Navigation">Navegação</p>' + nav + '</nav>' : '') +
          (showSocial ? '<div class="site-footer-social"><p data-pt="Redes" data-en="Social">Redes</p>' + socials.join('') + '</div>' : '') +
        '</div>' +
        '<div class="site-footer-bottom"><p class="foot-copy" data-pt="' + esc(copyPt) + '" data-en="' + esc(copyEn) + '">' + esc(copyPt) + '</p>' +
          '<button class="site-footer-top" type="button" data-top data-pt-label="Voltar ao topo da página" data-en-label="Back to the top of the page" aria-label="Voltar ao topo da página"><span class="cta-blur-label" data-pt="Voltar ao topo" data-en="Back to top">Voltar ao topo</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5.6"/><path d="M5.8 11.8L12 5.6l6.2 6.2"/></svg></button></div>' +
        (showSignature ? '<div class="site-footer-marquee" aria-hidden="true"><div class="site-footer-marquee-track">' +
          '<span class="site-footer-marquee-group"><b>' + esc(signature) + '</b><i>·</i><b>' + esc(signature) + '</b><i>·</i><b>' + esc(signature) + '</b><i>·</i></span>' +
          '<span class="site-footer-marquee-group"><b>' + esc(signature) + '</b><i>·</i><b>' + esc(signature) + '</b><i>·</i><b>' + esc(signature) + '</b><i>·</i></span>' +
        '</div></div>' : '') +
      '</div>';
    aplicarGrainNaSuperficie(footer, footerGrainLigado);
    initFooterMedia(footer, media.type);
    initFooterCopy(footer);
  }

  /* Header/footer são compartilhados por Home e cases. Esta aplicação não
     pode morar dentro de renderHome(): aquela função sai cedo em /work/ e os
     cases ficavam presos ao disclaimer estático do HTML. */
  function renderSharedChrome() {
    var G = window.__CMS_GLOBAL__ || {};
    renderGlobalFooter(G);
    var brand = G.brand || {};
    function brandSrc(path) { return /^https?:\/\//i.test(path || '') ? path : (isWorkPath() ? '../' : '') + path; }
    var brandLinks = document.querySelectorAll('a.brand');
    for (var bi = 0; bi < brandLinks.length; bi++) {
      if (brand.logo) {
        var logoEscuro = brand.logoDark || brand.logo;
        var logoClaro = brand.logoLight || brand.logo;
        brandLinks[bi].innerHTML = '<img class="brand-logo brand-logo--dark" src="' + esc(brandSrc(logoEscuro)) + '" alt="' + esc(brand.alt || brand.name || '') + '">' +
          '<img class="brand-logo brand-logo--light" src="' + esc(brandSrc(logoClaro)) + '" alt="">';
      } else if (brand.name) {
        brandLinks[bi].textContent = brand.name;
      }
    }
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
      if (G.social.linkedinActive === false) for (var li = 0; li < linkedinLinks.length; li++) linkedinLinks[li].hidden = true;
      if (G.social.behanceActive === false) for (var be = 0; be < behanceLinks.length; be++) behanceLinks[be].hidden = true;
    }
  }

  /* Declarada AQUI, acima das duas chamadas abaixo, e não junto do resto do
     código de blocos. `var` é hasteada como undefined, não como o valor: lá
     embaixo, esta lista ainda não existiria quando renderProject() rodasse, e
     o .indexOf estouraria dentro do try, que engole o erro em silêncio — a
     página cairia para o HTML estático sem nada indicar por quê. É a mesma
     armadilha que já custou caro com measureCta em js/main.js. */
  var TIPOS_DE_BLOCO = ['text', 'gallery', 'image', 'quote', 'video'];

  /* A ponte precisa existir mesmo quando um renderer de conteúdo cai no
     fallback estático. As funções abaixo são declarações hasteadas, então a
     exposição pode acontecer antes das primeiras renderizações sem duplicar
     lógica nem depender do restante da inicialização. */
  window.__CMS_RENDER__ = { home: renderHome, work: renderWorkIndex, project: renderProject, shared: renderSharedChrome };

  try { renderHome(); } catch (e) { /* mantém o HTML estático */ }
  try { renderWorkIndex(); } catch (e) { /* mantém a introdução estática */ }
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
    liquidBg.classList.remove('has-video', 'video-pronto');
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
      /* Mesmo fundido cruzado do Vimeo. loadeddata e não o src: com as massas
         agora saindo por opacidade em vez de display:none, elas continuariam
         cobrindo um vídeo que ainda não tem quadro para mostrar. */
      if (video.readyState >= 2) liquidBg.classList.add('video-pronto');
      else video.addEventListener('loadeddata', function () {
        liquidBg.classList.add('video-pronto');
      }, { once: true });
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
      /* video-pronto vai no .liquid-bg, e não só no iframe, porque quem some
         é irmão do iframe: são as massas de gradiente que precisam saber que
         chegou a hora de sair. As duas classes entram no mesmo quadro, então o
         fundido é cruzado de verdade — uma camada entra enquanto a outra sai,
         sem intervalo em que a capa fique sem fundo. */
      frame.addEventListener('load', function () {
        frame.classList.add('is-pronto');
        liquidBg.classList.add('video-pronto');
      });
      liquidBg.appendChild(frame);
      liquidBg.classList.add('has-video');
    }
  }

  function renderHome(overrideHome, overrideIndex) {
    renderSharedChrome();
    if (isWorkPath()) return;
    var H = overrideHome || window.__CMS_HOME__;
    if (!H || !H.hero) return;
    aplicarVisibilidadeHome(H);
    aplicarAparenciaHome(H);

    var hero = H.hero;
    setText(document.querySelector('.hero-tag'), hero.tagPt, hero.tagEn);
    var when = document.querySelector('.hero-when b');
    setText(when, hero.locationPt, hero.locationEn);
    var heroClaim = document.querySelector('.hero-claim');
    setText(heroClaim, hero.claimPt, hero.claimEn);
    if (heroClaim) {
      var claimOffset = Number(hero.claimOffset);
      if (hero.claimOffset === null || hero.claimOffset === undefined || !isFinite(claimOffset)) heroClaim.style.removeProperty('--hero-claim-offset');
      else heroClaim.style.setProperty('--hero-claim-offset', Math.max(0, Math.min(120, claimOffset)) + 'px');
    }
    var availSpan = document.querySelector('.avail span:not(.avail-dot)');
    if (availSpan) {
      setText(availSpan, hero.availabilityPt, hero.availabilityEn);
      if (hero.availabilityShortPt) availSpan.setAttribute('data-pt-short', hero.availabilityShortPt);
      if (hero.availabilityShortEn) availSpan.setAttribute('data-en-short', hero.availabilityShortEn);
    }
    /* O elemento é criado por main.js, que roda depois deste arquivo: na carga
       inicial estes seletores são null e é o próprio main.js quem aplica o
       dado. Aqui o caminho que importa é o da prévia ao vivo, quando o painel
       reenvia o conteúdo e o indicador já existe no DOM.
       setOptionalLabel e não setText: texto vazio precisa esconder a linha, em
       vez de deixar um span sem conteúdo ocupando o gap da coluna. */
    var nextHint = document.querySelector('.hero .next-hint');
    if (nextHint) {
      setOptionalLabel(nextHint.querySelector('.nh-label'), hero.nextHintLabelPt, hero.nextHintLabelEn);
      setOptionalLabel(nextHint.querySelector('.nh-name'), hero.nextHintNamePt, hero.nextHintNameEn);
      nextHint.hidden = hero.showNextHint === false;
    }

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
      var talkBtn = document.querySelector('.about-actions .ghost-cta[data-contact] .cta-blur-label');
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
        var list = projetosPublicos(idx).filter(function (p) {
          return p.featured === true;
        }).slice(0, 4);
        var cardsEl = document.querySelector('.cards');
        if (cardsEl) {
          cardsEl.innerHTML = list.map(function (p, cardIndex) {
            var tagsPt = p.tagsPt || [], tagsEn = p.tagsEn || [];
            var tagsHtml = tagsPt.map(function (t, i) {
              return '<span data-pt="' + esc(t) + '" data-en="' + esc(tagsEn[i] || t) + '">' + esc(t) + '</span>';
            }).join('');
            var sizes = ['normal', 'largo', 'alto', 'grande', 'largura-completa'];
            var size = sizes.indexOf(p.cardSize) !== -1 ? p.cardSize : 'normal';
            var media = projectMedia(p, 639);
            var coming = emBreve(p);
            var tag = coming ? 'article' : 'a';
            var href = coming ? '' : ' href="' + esc(projectUrl(p.slug)) + '"';
            return '' +
              '<' + tag + ' class="' + (coming ? 'home-teaser' : 'card') + ' reveal card--' + esc(size) + (coming ? ' home-teaser--coming' : '') + (p.coverLight ? ' card--light' : '') + '"' + href + '>' +
              '  <div class="scene p' + ((cardIndex % 4) + 1) + '">' + media + '</div>' +
              '  <div class="card-tags">' + tagsHtml + '</div>' +
              '  <div class="card-foot">' +
              '    <div>' +
              '      <h3 data-pt="' + esc(p.titlePt) + '" data-en="' + esc(p.titleEn) + '">' + esc(p.titlePt) + '</h3>' +
              '      <div class="sub" data-pt="' + esc(p.subtitlePt) + '" data-en="' + esc(p.subtitleEn) + '">' + esc(p.subtitlePt) + '</div>' +
              '    </div>' +
              '    <div class="yr">' + (coming ? '<span class="coming-label" data-pt="Em breve" data-en="Coming soon">Em breve</span> · ' : '') + esc(p.year) + '</div>' +
              '  </div>' +
              '</' + tag + '>';
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
  function renderWorkIndex(overrideIndex) {
    if (!isWorkIndex()) return;
    aplicarAparenciaPagina();
    renderSharedChrome();
    var idx = overrideIndex || window.__CMS_PROJECTS_INDEX__;
    if (!idx) return;
    var list = projetosPublicos(idx);
    var count = document.querySelector('[data-work-count]');
    if (count) {
      var pt = list.length === 1 ? '1 PROJETO' : list.length + ' PROJETOS';
      var en = list.length === 1 ? '1 PROJECT' : list.length + ' PROJECTS';
      setText(count, pt, en);
      count.textContent = pt;
    }
    var grid = document.querySelector('.work-archive-grid');
    if (!grid) return;
    grid.innerHTML = list.map(function (p, i) {
      var number = String(i + 1).padStart(2, '0');
      var coming = emBreve(p);
      var tag = coming ? 'article' : 'a';
      var href = coming ? '' : ' href="' + esc(projectUrl(p.slug)) + '"';
      var titleId = 'work-title-' + number;
      var tagsPt = Array.isArray(p.tagsPt) ? p.tagsPt : [];
      var tagsEn = Array.isArray(p.tagsEn) ? p.tagsEn : [];
      var tags = tagsPt.map(function (item, tagIndex) {
        return '<span data-pt="' + esc(item) + '" data-en="' + esc(tagsEn[tagIndex] || item) + '">' + esc(item) + '</span>';
      }).join('<i aria-hidden="true">·</i>');
      return '<' + tag + ' class="work-archive-card reveal' + (coming ? ' work-archive-card--coming' : '') +
        (p.coverLight ? ' card--light' : '') + '"' + href + (coming ? ' aria-labelledby="' + titleId + '"' : '') + '>' +
        '<div class="work-archive-card-top"><span>' + number + '</span><span>' + esc(p.year) + '</span></div>' +
        '<div class="work-archive-media"><div class="scene p' + ((i % 4) + 1) + '">' + projectMedia(p, 639) + '</div></div>' +
        '<div class="work-archive-info">' +
          '<div><h2 id="' + titleId + '" data-pt="' + esc(p.titlePt) + '" data-en="' + esc(p.titleEn) + '">' + esc(p.titlePt) + '</h2>' +
          '<p data-pt="' + esc(p.subtitlePt || p.category || '') + '" data-en="' + esc(p.subtitleEn || p.category || '') + '">' + esc(p.subtitlePt || p.category || '') + '</p></div>' +
          (coming ? '<span class="work-archive-state" data-pt="Em breve" data-en="Coming soon">Em breve</span>' : '') +
        '</div>' +
        (tags ? '<div class="work-archive-tags">' + tags + '</div>' : '') +
        '</' + tag + '>';
    }).join('');
  }

  function urlDoVimeoDeBloco(cfg) {
    var u = 'https://player.vimeo.com/video/' + encodeURIComponent(cfg.videoId) +
      '?autopause=0&dnt=1';
    if (cfg.hash) u += '&h=' + encodeURIComponent(cfg.hash);
    return u;
  }

  function htmlDoBloco(b, css) {
    if (b.type === 'gallery') {
      var imgs = Array.isArray(b.images) ? b.images : [];
      var galleryLayout = ['adaptive', 'single', 'two', 'three'].indexOf(b.layout) !== -1 ? b.layout : '';
      var galleryClass = 'case-gallery' + (galleryLayout ? ' case-gallery--' + galleryLayout : '');
      return '<div class="' + galleryClass + '" style="' + css + '">' + imgs.map(function (img) {
        return '<div class="thumb reveal" data-case-media><div class="scene"><img src="' + esc(resolveAssetUrl(img.src)) +
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
      return '<figure class="' + cls + '" data-case-media style="' + css + '">' +
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
      return '<figure class="case-video reveal" data-case-media style="' + css + '">' + miolo + capV + '</figure>';
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
        return '<section class="case-block-group case-block-group--text" data-case-block="text"><div class="case-body">' + corpo + '</div></section>';
      }
      var b = g[0];
      var gap = b.type === 'gallery' ? 18 : null;
      var css = blockStyleCss(b.spacing, 18, 0, gap);
      if (b.type === 'video' && b.mode === 'vimeo' && b.vimeo && b.vimeo.videoId) vimeos.push(b.vimeo);
      return '<section class="case-block-group case-block-group--' + esc(b.type) + '" data-case-block="' + esc(b.type) + '">' + htmlDoBloco(b, css) + '</section>';
    }).join('');

    host.querySelectorAll('.case-gallery:not(.case-gallery--legacy) img').forEach(function (img) {
      var gallery = img.closest('.case-gallery');
      if (!gallery || !/case-gallery--(adaptive|single|two|three)/.test(gallery.className)) return;
      function aplicarProporcao() {
        if (!img.naturalWidth || !img.naturalHeight) return;
        var thumb = img.closest('.thumb');
        if (!thumb) return;
        var ratio = img.naturalWidth / img.naturalHeight;
        thumb.style.setProperty('--gallery-ratio', String(ratio));
        thumb.style.setProperty('--gallery-basis', Math.round(ratio * 240) + 'px');
      }
      if (img.complete) aplicarProporcao();
      else img.addEventListener('load', aplicarProporcao, { once: true });
    });

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
    if (!isProjectPage()) return;
    var P = overrideProject || window.__CMS_PROJECT__;
    if (!P || !P.hero) return;
    aplicarAparenciaPagina();
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

    var coverScene = document.querySelector('.case-cover .scene');
    var coverImg = coverScene && coverScene.querySelector('img');
    /* Capas de listagem e do case são superfícies independentes. A ordem
       mobile preserva rigorosamente o comportamento legado: antes desta
       separação o case nunca lia coverMobile, então um projeto antigo segue
       usando cover dentro do case em todas as larguras. Só um campo interno
       explícito muda isso. */
    var caseCover = P.caseCover || P.cover;
    var caseCoverMobile = P.caseCoverMobile || P.caseCover || P.cover;
    if (coverImg && caseCover) {
      var picture = coverImg.parentElement && coverImg.parentElement.tagName === 'PICTURE'
        ? coverImg.parentElement : null;
      if (!picture && coverScene) {
        picture = document.createElement('picture');
        coverImg.parentNode.insertBefore(picture, coverImg);
        picture.appendChild(coverImg);
      }
      var source = picture && picture.querySelector('source[data-case-cover-mobile]');
      var mobileEhDiferente = caseCoverMobile && caseCoverMobile !== caseCover;
      if (mobileEhDiferente) {
        if (!source) {
          source = document.createElement('source');
          source.setAttribute('data-case-cover-mobile', '');
          source.setAttribute('media', '(max-width:639px)');
          picture.insertBefore(source, coverImg);
        }
        source.setAttribute('srcset', resolveAssetUrl(caseCoverMobile));
      } else if (source) source.remove();
      coverImg.setAttribute('src', resolveAssetUrl(caseCover));
    } else if (coverImg) {
      var oldSource = coverScene && coverScene.querySelector('source[data-case-cover-mobile]');
      if (oldSource) oldSource.remove();
      coverImg.removeAttribute('src');
    }
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
        var visible = projetosPublicos(idx).filter(function (p) { return !emBreve(p); });
        var myPos = -1;
        for (var vi = 0; vi < visible.length; vi++) if (visible[vi].slug === P.slug) { myPos = vi; break; }
        var prevP = myPos !== -1 && visible.length > 1 ? visible[(myPos - 1 + visible.length) % visible.length] : null;
        var nextP = myPos !== -1 && visible.length > 1 ? visible[(myPos + 1) % visible.length] : null;
        navEl.hidden = !nextP;
        if (prevP && nextP) {
          var links = navEl.querySelectorAll('a');
          if (links[0]) {
            links[0].setAttribute('href', projectUrl(prevP.slug));
            var prevSpans = links[0].querySelectorAll('span');
            setText(prevSpans[0], 'anterior', 'previous');
            setText(prevSpans[1], prevP.titlePt, prevP.titleEn);
          }
          if (links[1]) {
            links[1].setAttribute('href', projectUrl(nextP.slug));
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
})();
