(function(){
  /* marca que o JS está vivo: sem isso o CSS não esconde nada, e a página
     continua legível caso este arquivo falhe ao carregar */
  document.documentElement.classList.add('js');

  /* largura real da barra de rolagem: 100vw a inclui, então elementos que
     sangram de ponta a ponta precisam descontá-la para não gerar overflow */
  const setScrollbarWidth = () => document.documentElement.style
    .setProperty('--sbw', (window.innerWidth - document.documentElement.clientWidth) + 'px');
  setScrollbarWidth();
  window.addEventListener('resize', setScrollbarWidth, { passive: true });

  const base = location.pathname.includes('/work/') ? '../' : '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;

  const MENU = [
    { pt:'Início',      en:'Home',       href: base + 'index.html',           scene:'p2' },
    { pt:'Trabalhos',   en:'Work',       href: base + 'index.html#work',      scene:'p1' },
    { pt:'Sobre',       en:'About',      href: base + 'index.html#about',     scene:'p3' }
  ];

  document.body.insertAdjacentHTML('beforeend', `
    <div class="veil" aria-hidden="true"></div>

    <div class="overlay" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="overlay-sheet">
        <div class="overlay-top">
          <span class="brand">Pedro de Trindade<span>.</span></span>
          <span class="overlay-note" data-pt="aberto a novos projetos" data-en="open to new projects">aberto a novos projetos</span>
          <button class="overlay-x" data-close data-pt-label="Fechar" data-en-label="Close" aria-label="Fechar">✕</button>
        </div>
        <nav class="menu-list">
          ${MENU.map(i => `
            <a class="menu-item" href="${i.href}">
              <span data-pt="${i.pt}" data-en="${i.en}">${i.pt}</span>
              <span class="menu-thumb"><i class="scene ${i.scene}"></i></span>
            </a>`).join('')}
        </nav>
        <div class="overlay-foot">
          <div class="k" data-pt="redes" data-en="social">redes</div>
          <a class="soc" href="https://www.linkedin.com/in/pedrodetrindade" target="_blank" rel="noopener"><svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>LinkedIn</a>
          <a class="soc" href="https://www.behance.net/pedrodetrindade" target="_blank" rel="noopener"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="18" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="17" fill="currentColor">Bē</text></svg>Behance</a>
        </div>
      </div>
    </div>

    <div class="overlay" id="contact-panel" role="dialog" aria-modal="true" data-pt-label="Contato" data-en-label="Contact" aria-label="Contato">
      <div class="overlay-sheet">
        <div class="overlay-top">
          <span class="brand">Pedro de Trindade<span>.</span></span>
          <button class="overlay-x" data-close data-pt-label="Fechar" data-en-label="Close" aria-label="Fechar">✕</button>
        </div>
        <div class="cform">
          <h2 data-pt="Vamos construir o futuro da sua marca." data-en="Let's build the future of your brand.">Vamos construir o futuro da sua marca.</h2>
          <form id="cform">
            <label>
              <span class="k" data-pt="nome" data-en="name">nome</span>
              <input type="text" name="name" required autocomplete="name">
            </label>
            <label>
              <span class="k" data-pt="e-mail" data-en="email">e-mail</span>
              <input type="email" name="email" required autocomplete="email">
            </label>
            <label>
              <span class="k" data-pt="mensagem" data-en="message">mensagem</span>
              <textarea name="message" rows="5" required></textarea>
            </label>
            <button type="submit" class="cform-submit" data-pt="Enviar" data-en="Send">Enviar</button>
            <p class="cform-alt" data-pt="ou escreva direto para <a href='mailto:contact@pedrodetrindade.com'>contact@pedrodetrindade.com</a>" data-en="or write directly to <a href='mailto:contact@pedrodetrindade.com'>contact@pedrodetrindade.com</a>">ou escreva direto para <a href="mailto:contact@pedrodetrindade.com">contact@pedrodetrindade.com</a></p>
          </form>
        </div>
      </div>
    </div>
  `);

  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  const clock = document.getElementById('clock');
  if (clock) {
    const tick = () => {
      clock.textContent = new Date().toLocaleTimeString('pt-BR', {
        timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit'
      });
    };
    tick();
    setInterval(tick, 30000);
  }

  let buildScrub = null;

  /* ---- botão de contato: quanto o ícone anda para chegar ao centro ----
     Depende da largura do rótulo, que muda com o idioma. Precisa estar
     declarado antes de setLang: nas páginas sem portal o setLang roda ainda
     durante este IIFE, e uma const declarada abaixo estouraria na zona morta
     temporal, matando todo o resto do script. */
  function measureCta(){
    const cta = document.querySelector('.nav-cta');
    if (!cta) return;
    const label = cta.querySelector('.nc-label');
    if (!label || getComputedStyle(label).display === 'none') {
      cta.style.setProperty('--nc-shift', '0px');
      return;
    }
    const gap = parseFloat(getComputedStyle(cta).columnGap) || 0;
    cta.style.setProperty('--nc-shift', ((label.offsetWidth + gap) / 2) + 'px');
  }

  function setLang(lang){
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    document.querySelectorAll('[data-pt]').forEach(el => {
      const v = lang === 'pt' ? el.dataset.pt : el.dataset.en;
      if (v !== undefined) el.innerHTML = v;
    });
    document.querySelectorAll('[data-pt-label]').forEach(el => {
      const v = lang === 'pt' ? el.dataset.ptLabel : el.dataset.enLabel;
      if (v !== undefined) el.setAttribute('aria-label', v);
    });
    document.querySelectorAll('.lang-sw button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
    localStorage.setItem('lang', lang);
    if (buildScrub) buildScrub();
    measureCta();
  }

  const headEl = document.querySelector('header');
  const mainEl = document.querySelector('main');
  const footEl = document.querySelector('footer');
  function lockBackground(state){
    [headEl, mainEl, footEl].forEach(el => { if (el) el.inert = state; });
  }

  const gate = document.getElementById('gate');
  if (gate) {
    lockBackground(true);
    /* foco no contêiner, não no primeiro botão: focar o botão de português
       pintava nele o anel de :focus-visible e o fazia parecer selecionado */
    gate.focus({ preventScroll: true });
    requestAnimationFrame(() => gate.classList.add('in'));

    let leaving = false;
    document.querySelectorAll('#gate .langbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (leaving) return;                 // trava clique duplo
        leaving = true;
        setLang(btn.dataset.lang);
        btn.classList.add('chosen');
        /* 300ms só para a confirmação do botão ser percebida antes da saída */
        setTimeout(() => gate.classList.add('leaving'), 300);

        /* a home entra enquanto a intro ainda sai: ~350ms de sobreposição,
           sem tela vazia e sem corte entre os dois estados */
        setTimeout(() => {
          document.body.classList.remove('locked');
          lockBackground(false);
          document.body.classList.add('entering');
        }, 640);
        setTimeout(() => { gate.classList.add('hide'); }, 700);
        setTimeout(() => {
          if (mainEl) mainEl.focus({ preventScroll: true });
          document.body.classList.remove('entering');
          if (gate.parentNode) gate.remove();   // para as massas de luz
        }, 1750);
      });
    });
  } else {
    setLang(localStorage.getItem('lang') || 'pt');
  }
  document.querySelectorAll('.lang-sw button').forEach(btn => btn.addEventListener('click', () => setLang(btn.dataset.lang)));

  /* ---- overlays ----
     modal=true  : painel de contato, trava fundo e move o foco
     modal=false : menu em hover no desktop, não trava nada nem rouba foco */
  let lastFocused = null, modalOpen = false;
  function openOverlay(el, modal = true){
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    el.classList.add('open');
    modalOpen = modal;
    if (!modal) return;
    lastFocused = document.activeElement;
    document.body.classList.add('locked');
    lockBackground(true);
    const focusTarget = el.querySelector('.overlay-x');
    if (focusTarget) focusTarget.focus();
  }
  function closeOverlays(){
    const wasOpen = document.querySelector('.overlay.open');
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    if (!gate || gate.classList.contains('hide')) document.body.classList.remove('locked');
    lockBackground(false);
    /* devolver o foco só faz sentido se ele tiver sido movido na abertura */
    if (wasOpen && modalOpen && lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    modalOpen = false;
  }

  const menu = document.getElementById('menu');
  const contactPanel = document.getElementById('contact-panel');

  document.addEventListener('click', e => {
    const openMenu = e.target.closest('[data-menu]');
    const openContact = e.target.closest('[data-contact]');
    const close = e.target.closest('[data-close]');
    if (openMenu) {
      e.preventDefault();
      /* clique alterna, para quem prefere clicar e para o teclado */
      if (menu.classList.contains('open')) closeOverlays();
      else openOverlay(menu, true);
      return;
    }
    if (openContact) { e.preventDefault(); openOverlay(contactPanel); return; }
    if (close) { e.preventDefault(); closeOverlays(); return; }
    if (e.target.classList.contains('overlay')) closeOverlays();
    /* no modo dropdown o véu não cobre a página, então fechar ao clicar fora
       precisa ser explícito */
    if (menu.classList.contains('open') && menu.classList.contains('dropdown') &&
        !e.target.closest('.overlay-sheet') && !e.target.closest('[data-menu]')) closeOverlays();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlays(); });
  document.querySelectorAll('.menu-item').forEach(a => a.addEventListener('click', closeOverlays));

  /* ---- menu por hover no desktop ----
     Abre sem atraso, fecha com 170ms de carência. A região interativa cobre
     o botão, o painel e a ponte invisível entre eles, então o cursor pode
     atravessar o vão sem piscar. */
  if (fine) {
    menu.classList.add('dropdown');
    const trigger = document.querySelector('[data-menu]');
    const sheet = menu.querySelector('.overlay-sheet');
    let closeTimer = null;
    const hold = () => { clearTimeout(closeTimer); closeTimer = null; };
    const openSoft = () => { hold(); if (!menu.classList.contains('open')) openOverlay(menu, false); };
    const closeSoon = () => { hold(); closeTimer = setTimeout(closeOverlays, 170); };
    [trigger, menu, sheet].forEach(el => {
      if (!el) return;
      el.addEventListener('mouseenter', openSoft);
      el.addEventListener('mouseleave', closeSoon);
    });
    /* foco por teclado no botão também abre, sem mover o foco */
    if (trigger) {
      trigger.addEventListener('focus', openSoft);
      menu.addEventListener('focusout', ev => {
        if (!menu.contains(ev.relatedTarget) && ev.relatedTarget !== trigger) closeSoon();
      });
    }
  }

  measureCta();
  window.addEventListener('resize', measureCta, { passive: true });

  document.getElementById('cform').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const subject = encodeURIComponent(`Contato via site — ${f.name.value}`);
    const body = encodeURIComponent(`${f.message.value}\n\n---\n${f.name.value}\n${f.email.value}`);
    location.href = `mailto:contact@pedrodetrindade.com?subject=${subject}&body=${body}`;
  });

  /* ---- page transitions ---- */
  const veil = document.querySelector('.veil');
  requestAnimationFrame(() => document.body.classList.add('ready'));

  if (!reduced) {
    document.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || a.target === '_blank' || href.startsWith('#') || href.startsWith('mailto:') || a.closest('.overlay')) return;
      if (a.origin !== location.origin) return;
      e.preventDefault();
      veil.classList.add('on');
      setTimeout(() => { location.href = a.href; }, 420);
      setTimeout(() => veil.classList.remove('on'), 3000);
    });
    window.addEventListener('pageshow', ev => { if (ev.persisted) veil.classList.remove('on'); });
  }

  /* Entrada: dispara assim que o elemento encosta na viewport, escalonando
     em 70ms. O teto de 6 passos evita que o último item de uma leva grande
     fique meio segundo esperando. */
  const io = new IntersectionObserver(es => {
    let i = 0;
    es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.style.setProperty('--d', Math.min(i++, 6) * 70 + 'ms');
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { threshold: .15, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ================== UM ÚNICO LAÇO DE SCROLL ==================
     Header, inversão sobre a faixa clara e scrub dividem o mesmo frame.
     Listeners separados brigavam pelo mesmo tick e liam layout três vezes. */
  let scrubWords = [], wordTops = [], litCount = 0;
  let lastY = window.scrollY, queued = false;

  /* mede uma vez e guarda a posição absoluta: ler rect de 120 palavras por
     frame era o caminho curto para perder quadros */
  const measureWords = () => {
    const sy = window.scrollY;
    wordTops = scrubWords.map(w => w.getBoundingClientRect().top + sy);
    litCount = 0;
    scrubWords.forEach(w => w.classList.remove('lit'));
  };

  /* só as palavras que cruzaram a linha mudam de classe, não a lista toda */
  const paintScrub = limit => {
    let n = litCount;
    while (n < scrubWords.length && wordTops[n] < limit) scrubWords[n++].classList.add('lit');
    while (n > 0 && wordTops[n - 1] >= limit) scrubWords[--n].classList.remove('lit');
    litCount = n;
  };

  const readScroll = () => {
    queued = false;
    const y = window.scrollY;

    headEl.style.transform = (y > lastY && y > 200) ? 'translateY(-130%)' : 'translateY(0)';
    lastY = y;

    if (scrubWords.length) paintScrub(y + window.innerHeight * .72);
  };

  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(readScroll); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { if (scrubWords.length) measureWords(); onScroll(); }, { passive: true });

  if (!reduced) {
    buildScrub = () => {
      document.querySelectorAll('.about p, .case-section p').forEach(p => {
        p.classList.add('scrub');
        p.innerHTML = p.textContent.trim().split(/\s+/)
          .map(w => `<span class="w">${w}</span>`).join(' ');
      });
      scrubWords = [...document.querySelectorAll('.scrub .w')];
      measureWords();
      readScroll();
    };
    buildScrub();
    /* a fonte chega depois do primeiro layout e desloca tudo */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (scrubWords.length) { measureWords(); readScroll(); } });
    }
  }
  readScroll();

  /* ---- scroll suave por inércia ----
     Só a roda do mouse é interceptada. Toque, teclado, âncoras e barra de
     rolagem seguem nativos, e o alvo resincroniza quando a rolagem vem de
     outra origem. Decaimento por tempo, para não acelerar em telas de 120Hz. */
  if (!reduced && fine) {
    const LERP = .115;   // um pouco mais macio, ainda sem atraso perceptível
    const WHEEL = .9;    // multiplicador da roda
    let target = window.scrollY, curr = target, raf = 0, driving = false, prev = 0;
    const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const release = () => { if (raf) cancelAnimationFrame(raf); raf = 0; driving = false; prev = 0; };

    const step = now => {
      const dt = prev ? Math.min(now - prev, 50) : 16.7;
      prev = now;
      curr += (target - curr) * (1 - Math.pow(1 - LERP, dt / 16.7));
      if (Math.abs(target - curr) < .4) { curr = target; window.scrollTo(0, curr); release(); return; }
      window.scrollTo(0, curr);
      raf = requestAnimationFrame(step);
    };

    window.addEventListener('wheel', e => {
      if (e.ctrlKey) return;                                   // pinça de zoom
      if (document.body.classList.contains('locked')) return;  // portal ou overlay aberto
      if (e.target.closest && e.target.closest('.overlay')) return;
      e.preventDefault();
      if (!driving) { curr = target = window.scrollY; driving = true; prev = 0; }
      const delta = (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * WHEEL;
      target = Math.min(maxY(), Math.max(0, target + delta));
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: false });

    window.addEventListener('scroll', () => { if (!driving) target = curr = window.scrollY; }, { passive: true });
    /* âncoras e skip link rolam nativo: devolve o controle antes de brigarem */
    document.addEventListener('click', e => { if (e.target.closest('a[href^="#"]')) release(); }, true);
    window.addEventListener('pagehide', release);
  }

  const glow = document.querySelector('.cursor-glow');
  if (glow && fine && !reduced) {
    document.addEventListener('mousemove', e => {
      glow.style.setProperty('--mx', e.clientX + 'px');
      glow.style.setProperty('--my', e.clientY + 'px');
      glow.classList.add('on');
    });
    document.addEventListener('mouseleave', () => glow.classList.remove('on'));
  }

  const cue = document.querySelector('.card-cue');
  const cards = document.querySelectorAll('.card');
  if (cue && fine && cards.length) {
    document.addEventListener('mousemove', e => {
      cue.style.left = e.clientX + 'px';
      cue.style.top = e.clientY + 'px';
    });
    cards.forEach(card => {
      card.addEventListener('mouseenter', () => cue.classList.add('show'));
      card.addEventListener('mouseleave', () => cue.classList.remove('show'));
    });
  }
})();
