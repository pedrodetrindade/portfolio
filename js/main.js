(function(){
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
    const firstLangBtn = gate.querySelector('.langbtn');
    if (firstLangBtn) firstLangBtn.focus();
    document.querySelectorAll('#gate .langbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.lang);
        gate.classList.add('hide');
        document.body.classList.remove('locked');
        lockBackground(false);
      });
    });
  } else {
    setLang(localStorage.getItem('lang') || 'pt');
  }
  document.querySelectorAll('.lang-sw button').forEach(btn => btn.addEventListener('click', () => setLang(btn.dataset.lang)));

  /* ---- overlays ---- */
  let lastFocused = null;
  function openOverlay(el){
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    lastFocused = document.activeElement;
    el.classList.add('open');
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
    if (wasOpen && lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  const menu = document.getElementById('menu');
  const contactPanel = document.getElementById('contact-panel');

  document.addEventListener('click', e => {
    const openMenu = e.target.closest('[data-menu]');
    const openContact = e.target.closest('[data-contact]');
    const close = e.target.closest('[data-close]');
    if (openMenu) { e.preventDefault(); openOverlay(menu); return; }
    if (openContact) { e.preventDefault(); openOverlay(contactPanel); return; }
    if (close) { e.preventDefault(); closeOverlays(); return; }
    if (e.target.classList.contains('overlay')) closeOverlays();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlays(); });
  document.querySelectorAll('.menu-item').forEach(a => a.addEventListener('click', closeOverlays));

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

  const io = new IntersectionObserver(es => {
    const shown = es.filter(e => e.isIntersecting);
    shown.forEach((e, i) => {
      e.target.style.setProperty('--d', (i * 90) + 'ms');
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  if (!reduced) {
    let words = [];
    let ticking = false;

    const paint = () => {
      ticking = false;
      const line = window.innerHeight * .72;
      words.forEach(w => w.classList.toggle('lit', w.getBoundingClientRect().top < line));
    };

    buildScrub = () => {
      document.querySelectorAll('.about p, .case-section p').forEach(p => {
        p.classList.add('scrub');
        p.innerHTML = p.textContent.trim().split(/\s+/)
          .map(w => `<span class="w">${w}</span>`).join(' ');
      });
      words = [...document.querySelectorAll('.scrub .w')];
      paint();
    };

    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }, { passive: true });

    buildScrub();
  }

  let last = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    headEl.style.transform = (y > last && y > 200) ? 'translateY(-130%)' : 'translateY(0)';
    last = y;
  });

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
