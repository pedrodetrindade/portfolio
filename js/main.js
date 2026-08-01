(function(){
  const base = location.pathname.includes('/work/') ? '../' : '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;

  const MENU = [
    { pt:'Início',      en:'Home',       href: base + 'index.html',           scene:'p2' },
    { pt:'Trabalhos',   en:'Work',       href: base + 'index.html#work',      scene:'p1' },
    { pt:'Sobre',       en:'About',      href: base + 'index.html#about',     scene:'p3' },
    { pt:'Experiência', en:'Experience', href: base + 'index.html#experience',scene:'p4' }
  ];

  document.body.insertAdjacentHTML('beforeend', `
    <div class="veil" aria-hidden="true"></div>

    <div class="overlay" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="overlay-sheet">
        <div class="overlay-top">
          <span class="brand">Pedro de Trindade<span>.</span></span>
          <span class="overlay-note" data-pt="aberto a novos projetos" data-en="open to new projects">aberto a novos projetos</span>
          <button class="overlay-x" data-close aria-label="Fechar">✕</button>
        </div>
        <nav class="menu-list">
          ${MENU.map(i => `
            <a class="menu-item" href="${i.href}">
              <span data-pt="${i.pt}" data-en="${i.en}">${i.pt}</span>
              <span class="menu-thumb"><i class="scene ${i.scene}"></i></span>
            </a>`).join('')}
        </nav>
        <button class="menu-cta" data-contact>
          <span data-pt="Vamos conversar" data-en="Let's talk">Vamos conversar</span><i>→</i>
        </button>
        <div class="overlay-foot">
          <div class="k" data-pt="redes" data-en="social">redes</div>
          <a href="https://www.linkedin.com/in/pedrodetrindade" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://www.behance.net/pedrodetrindade" target="_blank" rel="noopener">Behance</a>
          <a href="https://www.instagram.com/pedrodetrindade" target="_blank" rel="noopener">Instagram</a>
        </div>
      </div>
    </div>

    <div class="overlay" id="contact-panel" role="dialog" aria-modal="true" aria-label="Contato">
      <div class="overlay-sheet">
        <div class="overlay-top">
          <span class="brand">Pedro de Trindade<span>.</span></span>
          <button class="overlay-x" data-close aria-label="Fechar">✕</button>
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

  function setLang(lang){
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    document.querySelectorAll('[data-pt]').forEach(el => {
      const v = lang === 'pt' ? el.dataset.pt : el.dataset.en;
      if (v !== undefined) el.innerHTML = v;
    });
    document.querySelectorAll('.lang-sw button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
    localStorage.setItem('lang', lang);
  }

  const gate = document.getElementById('gate');
  if (gate) {
    document.querySelectorAll('#gate .langbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.lang);
        gate.classList.add('hide');
        document.body.classList.remove('locked');
      });
    });
  } else {
    setLang(localStorage.getItem('lang') || 'pt');
  }
  document.querySelectorAll('.lang-sw button').forEach(btn => btn.addEventListener('click', () => setLang(btn.dataset.lang)));

  /* ---- overlays ---- */
  function openOverlay(el){
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    el.classList.add('open');
    document.body.classList.add('locked');
  }
  function closeOverlays(){
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    if (!gate || gate.classList.contains('hide')) document.body.classList.remove('locked');
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
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  let last = 0;
  const head = document.querySelector('header');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    head.style.transform = (y > last && y > 200) ? 'translateY(-130%)' : 'translateY(0)';
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
