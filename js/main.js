(function(){
  /* marca que o JS está vivo: sem isso o CSS não esconde nada, e a página
     continua legível caso este arquivo falhe ao carregar */
  document.documentElement.classList.add('js');

  /* Largura útil da página, medida em vez de deduzida. Antes o sangramento era
     calc(100vw - --sbw), o que assumia que 100vw inclui a barra de rolagem. Isso
     era verdade, e deixou de ser quando o html ganhou scrollbar-gutter:stable:
     o Chrome passou a resolver 100vw já sem a calha, e o desconto virou desconto
     em dobro. O sintoma era discreto e por isso durou: 7,5px de folga de cada
     lado em tudo que deveria ir de ponta a ponta.
     clientWidth é a medida direta do que existe, sem depender de como o
     navegador interpreta a unidade. --sbw continua publicada porque outras
     regras a usam. */
  const medirLargura = () => {
    const raizEstilo = document.documentElement.style;
    raizEstilo.setProperty('--sbw', (window.innerWidth - document.documentElement.clientWidth) + 'px');
    raizEstilo.setProperty('--vw', document.documentElement.clientWidth + 'px');
  };
  medirLargura();
  window.addEventListener('resize', medirLargura, { passive: true });
  /* A largura útil também muda sem evento de resize: numa página curta, abrir um
     item do FAQ faz a barra de rolagem nascer e tira 15px do conteúdo. O
     observador cobre esse caso, que o listener de resize não vê. */
  if (window.ResizeObserver) new ResizeObserver(medirLargura).observe(document.documentElement);

  const base = location.pathname.includes('/work/') ? '../' : '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  /* limiar das variantes curtas de rótulo; reavaliado ao redimensionar */
  const estreitoParaRotulo = window.matchMedia('(max-width: 900px)');

  /* ================== CHAVES DE DIAGNÓSTICO DE FLUIDEZ ==================
     O painel de preview do Claude Code não reproduz custo de pintura: mediu
     o mesmo 4,2ms por quadro com e sem backdrop-filter, com e sem blend. Logo,
     investigar engasgo exige o navegador real, e estas chaves existem para
     isolar o culpado em vez de deduzir. Combináveis:
       ?nosmooth=1  desliga a inércia (rolagem nativa, conduzida pela GPU)
       ?nograin=1   remove o grão de todas as superfícies
       ?noblend=1   remove mix-blend-mode de tudo
       ?noorbs=1    remove as duas orbes de fundo (88vw e 76vw)
       ?noscrub=1   desliga o clareamento palavra a palavra
     Nenhuma altera o site em uso normal: sem parâmetro, nada muda. */
  const flag = nome => new URLSearchParams(location.search).has(nome);
  const diag = [];
  if (flag('nograin')) {
    document.documentElement.style.setProperty('--grain-url', 'none');
    diag.push('nograin');
  }
  if (flag('noblend')) {
    diag.push('noblend');
  }
  if (flag('noorbs')) {
    diag.push('noorbs');
  }
  if (diag.length) {
    const s = document.createElement('style');
    s.textContent = [
      flag('noblend') ? '*,*::before,*::after{mix-blend-mode:normal!important}' : '',
      flag('noorbs') ? '.glow{display:none!important}' : ''
    ].join('');
    document.head.appendChild(s);
  }
  if (flag('noscrub')) diag.push('noscrub');
  if (flag('nosmooth')) diag.push('nosmooth');
  if (diag.length) console.info('[diagnóstico] desligado:', diag.join(', '));

  /* ---- itens do menu ----
     Fonte única: content/global.json > header.menu, já carregado por
     js/content.js em window.__CMS_GLOBAL__. A lista fixa que existia aqui
     virava uma segunda fonte da verdade — editar o menu pelo painel não
     mudava nada no site. O array abaixo é só rede de segurança para quando o
     JSON não carregar (mesma regra do resto do site: sem CMS, o conteúdo
     estático continua valendo). */
  /* ===== REGISTRO CANÔNICO DAS SEÇÕES DA HOME =====
     Fonte única de verdade da navegação. Cada seção tem um id ESTÁVEL, que é o
     que ancora o link; o rótulo pode mudar (pelo CMS, por tradução) sem
     quebrar o destino. Antes, o destino era deduzido do href gravado no JSON,
     e o ícone era escolhido pelo TEXTO do item — então renomear "Trabalhos"
     para "Projetos" trocava o ícone silenciosamente.

     `estrutural` reflete o que o site realmente faz, não o que seria desejável:
     hero, work e contact sustentam layout e navegação (o indicador da capa
     aponta para work, o rodapé depende do fluxo terminar em contact), e o site
     ignora `visible` nelas — por isso o CMS não deve oferecer um controle de
     visibilidade ali. about, help e faq são de fato opcionais.

     A hero não tem id próprio no HTML: o topo navegável é o <main id="top">.
     Por isso o id canônico dela é 'top' — é o elemento que existe de verdade,
     não um id paralelo inventado. */
  const SECOES = [
    { id: 'top',     pt: 'Início',         en: 'Home',      icone: 'inicio',    estrutural: true  },
    { id: 'work',    pt: 'Trabalhos',      en: 'Work',      icone: 'trabalhos', estrutural: true  },
    { id: 'about',   pt: 'Sobre',          en: 'About',     icone: 'sobre',     estrutural: false },
    { id: 'help',    pt: 'O que eu faço',  en: 'What I do', icone: 'servicos',  estrutural: false },
    { id: 'faq',     pt: 'FAQ',            en: 'FAQ',       icone: 'faq',       estrutural: false },
    { id: 'contact', pt: 'Contato',        en: 'Contact',   icone: 'contato',   estrutural: true  }
  ];
  const secaoPorId = id => SECOES.filter(s => s.id === id)[0] || null;

  /* Descobre a qual seção canônica um item do CMS aponta. Aceita o campo novo
     `section` e, para arquivos antigos que só têm href, deduz do hash — sem
     regravar nada: a dedução é em memória, a cada carregamento. */
  function secaoDoItem(item) {
    if (item.section && secaoPorId(item.section)) return item.section;
    const href = String(item.hrefHome || item.href || '');
    const hash = href.indexOf('#') !== -1 ? href.slice(href.indexOf('#') + 1) : '';
    if (hash && secaoPorId(hash)) return hash;
    /* "index.html" sem hash é o topo */
    if (href && href.indexOf('#') === -1) return 'top';
    return null;
  }

  const cfgMenu = (window.__CMS_GLOBAL__ && window.__CMS_GLOBAL__.header && Array.isArray(window.__CMS_GLOBAL__.header.menu) && window.__CMS_GLOBAL__.header.menu.length)
    ? window.__CMS_GLOBAL__.header.menu : [];

  /* Ícones temáticos, SVG inline (sem biblioteca, sem requisição). São
     decorativos: quem carrega o significado é o texto ao lado, então todos
     levam aria-hidden. A escolha é por rótulo normalizado, com um genérico
     de reserva para item novo criado no painel. */
  /* Ícones por ID CANÔNICO, nunca pelo texto: renomear "Trabalhos" para
     "Projetos" no CMS, ou trocar para inglês, não pode mudar o ícone. */
  const ICONES_MENU = {
    inicio: '<path d="M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    trabalhos: '<rect x="3.2" y="3.2" width="7" height="7" rx="1.6"/><rect x="13.8" y="3.2" width="7" height="7" rx="1.6"/><rect x="3.2" y="13.8" width="7" height="7" rx="1.6"/><rect x="13.8" y="13.8" width="7" height="7" rx="1.6"/>',
    sobre:  '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
    /* O que eu faço: camadas sobrepostas, ideia de repertório/composição */
    servicos: '<path d="M12 3.4 21 8l-9 4.6L3 8z"/><path d="M3.4 12.4 12 16.8l8.6-4.4"/><path d="M3.4 16.4 12 20.8l8.6-4.4"/>',
    /* FAQ: balão de diálogo com interrogação */
    faq: '<path d="M20.4 15.2a2.4 2.4 0 0 1-2.4 2.4H8.4L4 21V6a2.4 2.4 0 0 1 2.4-2.4H18A2.4 2.4 0 0 1 20.4 6z"/><path d="M9.9 9.1a2.2 2.2 0 0 1 4.2.8c0 1.5-2.1 2.1-2.1 2.1"/><path d="M12 14.6h.01"/>',
    contato: '<rect x="2.8" y="5" width="18.4" height="14" rx="2.6"/><path d="M3.6 7.4l7.2 5a2.1 2.1 0 0 0 2.4 0l7.2-5"/>',
    generico: '<circle cx="12" cy="12" r="7.6"/>'
  };
  function iconeDaSecao(id) {
    const s = secaoPorId(id);
    return (s && ICONES_MENU[s.icone]) || ICONES_MENU.generico;
  }

  /* Seção opcional escondida pelo CMS sai do menu: um item apontando para uma
     âncora que não existe mais é um link quebrado. Estrutural nunca sai. */
  function secaoDisponivel(id) {
    const s = secaoPorId(id);
    if (!s) return false;
    if (s.estrutural) return true;
    const secoes = window.__CMS_HOME__ && window.__CMS_HOME__.sections;
    if (secoes && secoes[id] && secoes[id].visible === false) return false;
    return true;
  }

  /* Destino relativo e seguro, sem domínio fixo:
     - na Home, âncora pura (#work) para o clique ser rolagem, não navegação.
       Era exatamente aqui que a navegação quebrava: o href gravado era
       "index.html#about" mesmo estando na Home, então o clique recarregava a
       página inteira, voltava ao topo e repetia a intro. O handler de âncora
       do smooth scroll só captura a[href^="#"] e nunca via esses links.
     - em work/, caminho relativo com ../ para voltar à Home com o hash. */
  function hrefDaSecao(id) {
    if (base) return base + 'index.html' + (id === 'top' ? '' : '#' + id);
    return '#' + id;
  }

  /* Mescla o que o CMS guarda (rótulos e ordem) com o registro canônico
     (id, ícone, estrutural). Seções ausentes na configuração são anexadas em
     memória, na ordem canônica — arquivo antigo com três itens continua
     funcionando e ganha os que faltam, sem regravar nada e sem perder rótulo
     personalizado. */
  const MENU = (function () {
    const vistos = {};
    const itens = [];
    cfgMenu.forEach(i => {
      const id = secaoDoItem(i);
      if (!id || vistos[id]) return;            /* item sem destino ou repetido */
      vistos[id] = true;
      const canon = secaoPorId(id);
      itens.push({ id, pt: i.pt || canon.pt, en: i.en || canon.en });
    });
    SECOES.forEach(s => { if (!vistos[s.id]) itens.push({ id: s.id, pt: s.pt, en: s.en }); });
    return itens
      .filter(i => secaoDisponivel(i.id))
      .map(i => ({ id: i.id, pt: i.pt, en: i.en, href: hrefDaSecao(i.id) }));
  })();

  /* ---- indicador de próxima seção ----
     Um só componente, montado a partir desta tabela e injetado no fim de cada
     seção de origem. Nada de marcação repetida por seção no HTML: mudar a
     ordem das seções é mudar esta lista. A de contato não tem próxima. */
  /* Só o da hero permanece. Os quatro que apareciam no fim de cada seção foram
     removidos: repetiam uma informação que a própria rolagem já dá e criavam
     um degrau vazio no fim de cada bloco. */
  const PROXIMA = [
    { de:'.hero', alvo:'#work', rotuloPt:'Continue para ver os projetos', rotuloEn:'Continue to see my work',
      nomePt:'Projetos',        nomeEn:'Projects' }
  ];

  PROXIMA.forEach(p => {
    const secao = document.querySelector(p.de);
    if (!secao || !document.querySelector(p.alvo)) return;
    secao.insertAdjacentHTML('beforeend', `
      <a class="next-hint reveal" href="${p.alvo}">
        <span class="nh-label" data-pt="${p.rotuloPt}" data-en="${p.rotuloEn}">${p.rotuloPt}</span>
        <span class="nh-name" data-pt="${p.nomePt}" data-en="${p.nomeEn}">${p.nomePt}</span>
        <span class="nh-arrow" aria-hidden="true">↓</span>
      </a>`);
  });

  document.body.insertAdjacentHTML('beforeend', `
    <div class="veil" aria-hidden="true"></div>

    <!-- Menu enxuto: só fechar e navegação. Marca, "aberto a novos projetos" e
         o bloco de redes saíram daqui — a marca e a disponibilidade já estão no
         header logo acima, e as redes seguem no rodapé (os dados continuam em
         global.json > social, nada foi apagado). -->
    <div class="overlay" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="overlay-sheet">
        <div class="overlay-top overlay-top--bare">
          <button class="overlay-x" data-close data-pt-label="Fechar" data-en-label="Close" aria-label="Fechar">✕</button>
        </div>
        <nav class="menu-list">
          ${MENU.map(i => `
            <a class="menu-item" href="${i.href}" data-secao="${i.id}">
              <span class="menu-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${iconeDaSecao(i.id)}</svg></span>
              <span data-pt="${i.pt}" data-en="${i.en}">${i.pt}</span>
            </a>`).join('')}
        </nav>
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

  /* ano do copyright: dinâmico, nunca escrito à mão */
  document.querySelectorAll('[data-yr]').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* ---- carimbo de data e hora do Brasil ----
     Sempre America/Sao_Paulo, nunca o fuso do aparelho. Sem segundos na
     tela, então um tique por minuto basta. */
  const stamp = document.getElementById('stamp');
  let stampTimer = null;
  function paintStamp(){
    if (!stamp) return;
    const en = document.documentElement.lang === 'en';
    const now = new Date();
    /* Sempre America/Sao_Paulo: o carimbo é a hora do Brasil, não a do
       dispositivo de quem visita. Montado por partes porque o formato pronto do
       pt-BR vem com "de" no meio ("02 de ago. de 2026") e fica verboso.
       PT: 03 ago 2026 · 17:36 BRT      EN: Aug 3, 2026 · 5:36 PM BRT */
    const p = {};
    new Intl.DateTimeFormat(en ? 'en-US' : 'pt-BR', {
      timeZone:'America/Sao_Paulo', day:'numeric', month:'short', year:'numeric',
      hour:'numeric', minute:'2-digit', hour12: en
    }).formatToParts(now).forEach(x => { p[x.type] = (p[x.type] || '') + x.value; });
    const mes = (p.month || '').replace(/\.$/, '');
    const hora = `${p.hour}:${p.minute}${p.dayPeriod ? ' ' + p.dayPeriod.toUpperCase() : ''}`;
    stamp.textContent = en
      ? `${mes} ${p.day}, ${p.year} · ${hora} BRT`
      : `${String(p.day).padStart(2,'0')} ${mes} ${p.year} · ${hora} BRT`;
  }
  if (stamp) {
    paintStamp();
    /* alinha o primeiro tique com a virada do minuto e só então periodiza */
    stampTimer = setTimeout(() => {
      paintStamp();
      stampTimer = setInterval(paintStamp, 60000);
    }, (60 - new Date().getSeconds()) * 1000);
    window.addEventListener('pagehide', () => { clearTimeout(stampTimer); clearInterval(stampTimer); });
  }

  let buildScrub = null;
  /* Divisor de palavras da entrada de destaque (data-reveal="words"). Fica ao
     lado do buildScrub pelo mesmo motivo que ele existe: o setLang reescreve o
     innerHTML de todo [data-pt] ao trocar de idioma, o que apagaria os spans.
     Os dois são reconstruídos logo depois, no fim do setLang. */
  let buildPalavras = null;

  /* ---- bandeiras ----
     SVG inline em vez de emoji: no Windows o emoji de bandeira não renderiza,
     sai como "BR". Sem clipPath, para não colidir id entre instâncias: o
     recorte circular vem do border-radius no CSS. */
  const FLAGS = {
    br: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#009B3A"/>' +
        '<path d="M12 3.6 20.4 12 12 20.4 3.6 12Z" fill="#FEDF00"/>' +
        '<circle cx="12" cy="12" r="4.1" fill="#002776"/>' +
        '<path d="M8.2 10.9a4.1 4.1 0 0 1 7.5 1.4" stroke="#fff" stroke-width="1.05" fill="none"/></svg>',
    uk: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#012169"/>' +
        '<path d="M0 0 24 24M24 0 0 24" stroke="#fff" stroke-width="5"/>' +
        '<path d="M0 0 24 24M24 0 0 24" stroke="#C8102E" stroke-width="2.6"/>' +
        '<path d="M12 0V24M0 12H24" stroke="#fff" stroke-width="8"/>' +
        '<path d="M12 0V24M0 12H24" stroke="#C8102E" stroke-width="4.6"/></svg>'
  };
  document.querySelectorAll('[data-flag]').forEach(el => {
    el.innerHTML = FLAGS[el.dataset.flag] || '';
  });

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

  /* ---- idioma inicial ----
     Sem geolocalização por IP: exigiria uma chamada de rede a cada visita,
     com latência bem na intro, dependência externa e limite de requisições.
     Dois sinais nativos resolvem melhor e de graça:
       1. navegador em português -> pt (diz o idioma que a pessoa quer ler,
          o que é mais preciso que o país onde ela está)
       2. fuso horário do Brasil -> pt (pega quem usa o sistema em inglês)
     Qualquer outro caso cai em inglês. */
  const TZ_BR = /^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Santarem|Eirunepe)$/;
  function detectLang(){
    /* escolha explícita do usuário manda em tudo */
    const saved = localStorage.getItem('lang');
    if (saved === 'pt' || saved === 'en') return saved;

    const langs = navigator.languages && navigator.languages.length
      ? navigator.languages : [navigator.language || ''];
    if (langs.some(l => /^pt\b|^pt-/i.test(l))) return 'pt';

    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    if (TZ_BR.test(tz)) return 'pt';

    return 'en';
  }

  function setLang(lang, explicit){
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    document.querySelectorAll('[data-pt]').forEach(el => {
      /* variante curta onde ela existe e a tela é estreita: encurtar pelo
         sistema de idioma, e não cortar com reticências, preserva o sentido */
      const curto = estreitoParaRotulo.matches &&
        (lang === 'pt' ? el.dataset.ptShort : el.dataset.enShort);
      const v = curto || (lang === 'pt' ? el.dataset.pt : el.dataset.en);
      if (v !== undefined) el.innerHTML = v;
    });
    document.querySelectorAll('[data-pt-label]').forEach(el => {
      const v = lang === 'pt' ? el.dataset.ptLabel : el.dataset.enLabel;
      if (v !== undefined) el.setAttribute('aria-label', v);
    });
    /* seletor: bandeira, código e o check do idioma atual */
    const flagBox = document.querySelector('[data-lp-flag]');
    const codeBox = document.querySelector('[data-lp-code]');
    if (flagBox) flagBox.innerHTML = FLAGS[lang === 'pt' ? 'br' : 'uk'];
    if (codeBox) codeBox.textContent = lang === 'pt' ? 'PT' : 'EN';
    document.querySelectorAll('.lp-menu [data-lang]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.lang === lang)));
    /* só grava quando a pessoa escolhe. Se gravasse a detecção automática,
       ela viraria uma escolha permanente e o site pararia de acompanhar
       quem trocar o idioma do navegador ou abrir de outro país. */
    if (explicit) localStorage.setItem('lang', lang);
    if (buildScrub) buildScrub();
    if (buildPalavras) buildPalavras();
    measureCta();
    paintStamp();          // o formato de data muda com o idioma
    medirDeslocamentoNome();
  }

  /* Distância entre o centro do nome na composição final e o centro exato da
     viewport. A animação da intro parte desse valor e termina em zero, então o
     nome nasce centrado na tela e sobe até o lugar dele na capa.
     Precisa ser medido: depende da altura dos metadados e da frase abaixo, que
     mudam com a largura da tela e com o idioma. */
  function medirDeslocamentoNome(){
    const n = document.querySelector('.hero-name');
    const wrap = n && n.closest('.hero-name-wrap');
    if (!n || !wrap) return;
    /* Mede pelo wrapper, não pelo próprio nome: durante a intro o nome está sob
       transform, e o rect dele devolveria a posição animada em vez da final.
       O wrapper não é transformado, e offsetHeight é altura de layout, imune à
       escala. Assim dá para remedir a qualquer momento, inclusive depois que a
       fonte carrega e muda a altura do bloco.
       É function e não const de propósito, para ser içada e poder ser chamada
       de dentro de setLang, que roda cedo no IIFE. */
    const centroNome = wrap.getBoundingClientRect().top + n.offsetHeight / 2;
    const dy = Math.round((window.innerHeight / 2 - centroNome) * 10) / 10;
    document.documentElement.style.setProperty('--nome-dy', dy + 'px');
  }

  const headEl = document.querySelector('header');
  const mainEl = document.querySelector('main');
  const footEl = document.querySelector('footer');
  function lockBackground(state){
    [headEl, mainEl, footEl].forEach(el => { if (el) el.inert = state; });
  }

  setLang(detectLang());

  /* O limiar das variantes curtas é uma media query, então precisa ser ouvido:
     sem isto o rótulo escolhido na carga ficava congelado, e quem abrisse largo
     e estreitasse a janela (ou girasse o telefone) continuava com o texto longo
     numa caixa que já não o comporta. Reaplica o idioma corrente sem gravar,
     porque isto não é uma escolha da pessoa. */
  estreitoParaRotulo.addEventListener('change', () =>
    setLang(document.documentElement.lang.startsWith('pt') ? 'pt' : 'en'));

  /* ================== INTRO ==================
     Não há dois nomes. O véu cobre a página, o próprio .hero-name sobe acima
     dele, e o que muda entre as etapas é só a escala: 1.06 -> 1. É o mesmo
     elemento, no mesmo lugar, então não existe crossfade nem salto.
     Roda em toda abertura da home, de propósito: é a assinatura de entrada e
     Pedro quer que ela seja vista sempre, não só na primeira visita. */
  /* ===== TIMELINE DA INTRO, EM UM LUGAR SÓ =====
     Duas etapas somando exatamente 3000ms. Os números saem daqui para o CSS
     via variáveis, então não existe duração escrita duas vezes nem timeout
     solto que possa divergir da animação.
       0 a 1200ms   revelação: máscara da esquerda para a direita, opacidade e
                    blur. O nome fica parado, centrado, em escala maior.
       1200 a 3000  transformação: escala e posição até o lugar da capa.
       ~2325ms      secundários começam a entrar, sobre a cauda do movimento.
     A passagem de 2s para 3s foi proporcional: tudo multiplicado por 1,5, de
     modo que a proporção entre revelação (40%) e movimento (60%) e o ponto de
     entrada dos secundários (77,5% da linha) continuam idênticos. Escalar só o
     total mudaria o ritmo interno, não a duração. */
  const INTRO = { revelacao: 1200, movimento: 1800 };
  const INTRO_MS = INTRO.revelacao + INTRO.movimento;   // 3000ms
  const SECUNDARIOS_MS = 2325;
  const VEU_MS = 2700;                                  // saída do véu, mesma escala
  const raiz = document.documentElement.style;
  raiz.setProperty('--intro-dur', INTRO_MS + 'ms');
  raiz.setProperty('--intro-reveal', INTRO.revelacao + 'ms');
  raiz.setProperty('--intro-move', INTRO.movimento + 'ms');
  raiz.setProperty('--intro-veil', VEU_MS + 'ms');
  const heroName = document.querySelector('.hero-name');
  const heroOn = () => document.body.classList.add('hero-in');

  if (!heroName) {
    heroOn();                                   // páginas de case
  } else if (reduced) {
    heroOn();                                   // movimento reduzido: direto ao conteúdo
  } else {
    document.body.classList.add('intro-mode');

    const rodarIntro = () => {
      /* Última medição antes de a animação existir. O deslocamento vertical do
         nome depende da altura real do bloco, e a fonte própria tem métrica
         diferente da de sistema: medir antes dela chegar deixava o nome uns
         10px fora do centro no primeiro quadro da intro. */
      medirDeslocamentoNome();
      requestAnimationFrame(() => document.body.classList.add('name-in'));
      /* secundários só na parte final da etapa 2: nada aparece durante a
         revelação, e eles entram sobre a cauda do movimento do nome */
      setTimeout(() => document.body.classList.add('hero-sec'), SECUNDARIOS_MS);
      /* o nome usa a intro inteira; ao chegar aqui já está em escala 1 e
         opacidade 1, e o véu começa a sair sobre um quadro idêntico ao da capa */
      setTimeout(heroOn, INTRO_MS);
      /* e o nome volta ao empilhamento normal depois que o véu terminou de sair.
         A folga acompanha a saída mais longa do véu, senão o empilhamento muda
         no meio do fundido e a troca aparece como um corte */
      setTimeout(() => document.body.classList.remove('intro-mode'), INTRO_MS + VEU_MS + 100);
    };

    /* A intro só começa quando a fonte chega. O véu já cobre tudo, então essa
       espera é invisível, e ela evita duas coisas: o nome trocar de métrica no
       meio da animação e o deslocamento vertical ser calculado com a fonte de
       sistema. O teto de 900ms existe para a intro nunca ficar refém do
       carregamento da fonte. */
    const comFonte = (document.fonts && document.fonts.ready)
      ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 900))])
      : Promise.resolve();

    /* Aba em segundo plano não desenha quadros: o rAF que levanta o nome não
       dispararia, mas os setTimeout sim, e a intro terminaria sem ninguém ver,
       deixando só um véu preto. Só começa a contar quando a página aparece. */
    const quandoVisivel = document.visibilityState === 'visible'
      ? Promise.resolve()
      : new Promise(res => document.addEventListener('visibilitychange', function aoAparecer(){
          if (document.visibilityState !== 'visible') return;
          document.removeEventListener('visibilitychange', aoAparecer);
          res();
        }));

    Promise.all([comFonte, quandoVisivel]).then(rodarIntro);
  }
  /* ---- seletor de idioma ----
     Clique, teclado e toque. Fecha ao clicar fora e com Escape, devolvendo
     o foco ao gatilho. A troca não recarrega nada e não mexe no scroll. */
  const langPick = document.querySelector('.lang-pick');
  if (langPick) {
    const toggle = langPick.querySelector('.lp-toggle');
    const opts = [...langPick.querySelectorAll('.lp-menu [data-lang]')];
    const setOpen = state => {
      langPick.classList.toggle('open', state);
      toggle.setAttribute('aria-expanded', String(state));
      if (state) opts.find(o => o.getAttribute('aria-selected') === 'true')?.focus();
    };
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(!langPick.classList.contains('open'));
    });
    opts.forEach(o => o.addEventListener('click', () => {
      setLang(o.dataset.lang, true);   // explícito: grava e passa a mandar
      setOpen(false);
      toggle.focus();
    }));
    document.addEventListener('click', e => {
      if (!langPick.contains(e.target)) setOpen(false);
    });
    langPick.addEventListener('keydown', e => {
      if (e.key === 'Escape') { setOpen(false); toggle.focus(); }
      if (e.key === 'ArrowDown' && !langPick.classList.contains('open')) {
        e.preventDefault(); setOpen(true);
      }
    });
  }

  /* ---- overlays ----
     modal=true  : painel de contato, trava fundo e move o foco
     modal=false : menu em hover no desktop, não trava nada nem rouba foco */
  let lastFocused = null, modalOpen = false;
  function openOverlay(el, modal = true){
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    el.classList.add('open');
    modalOpen = modal;
    if (window.__travarTemaHeader) window.__travarTemaHeader(true);
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
    document.body.classList.remove('locked');
    lockBackground(false);
    if (window.__travarTemaHeader) window.__travarTemaHeader(false);
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
    /* Voltar ao topo pelo mesmo sistema de rolagem do site: a rolagem nativa vai
       a zero de imediato e o laço do transform faz o deslize, com o mesmo lerp
       do resto da página. Não navega, não recarrega, não repete a intro e não
       mexe na URL. Sob movimento reduzido não existe holder, então o salto é
       direto, que é o comportamento desejado nesse modo. */
    if (e.target.closest('[data-top]')) {
      e.preventDefault();
      window.scrollTo(0, 0);
      return;
    }
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

  /* ================== ENTRADA DOS BLOCOS ==================
     Sem IntersectionObserver, de propósito. Com a rolagem suave o conteúdo é
     deslocado por transform num container fixo, e o IO não reavalia nesse caso:
     ele acompanha rolagem e layout, não transform de ancestral. O resultado era
     todo o conteúdo abaixo da primeira dobra ficar escondido para sempre, e foi
     o que fez o retrato do Sobre sumir.

     Aqui a posição de cada alvo é medida uma vez e comparada com a posição
     visual dentro do mesmo laço que já move o transform. Mais barato que o IO
     e, principalmente, correto nos dois modos de rolagem.

     Cada tipo de bloco mantém sua coreografia própria. */
  let alvos = [];

  /* 88ms entre palavras, com teto de 14 passos: acima disso um título longo
     faria a última palavra esperar demais pela primeira. O teto é contagem de
     passos, não tempo — ele não escala junto com a duração, senão a cauda do
     título cresceria duas vezes. Na escala atual o pior caso é 14 x 88ms de
     espera mais os 1248ms da própria palavra. */
  const PALAVRA_PASSO = 88, PALAVRA_TETO = 14;
  const aplicarAtrasoPalavras = el => {
    el.querySelectorAll('.rv-w').forEach((w, i) => {
      w.style.transitionDelay = Math.min(i, PALAVRA_TETO) * PALAVRA_PASSO + 'ms';
    });
  };

  const entrar = el => {
    if (el.dataset.reveal === 'words') {
      aplicarAtrasoPalavras(el);
      el.classList.add('in');
      return;
    }
    if (el.classList.contains('caps-grid')) {
      [...el.children].forEach((li, i) => { li.style.transitionDelay = (i * 55) + 'ms'; });
      el.classList.add('in');
      return;
    }
    if (el.classList.contains('help-item') || el.classList.contains('stat')) {
      const base = (+el.dataset.col || 0) * 110;
      const line = el.querySelector('.hi-line,.stat-line');
      if (line) line.style.transitionDelay = base + 'ms';
      el.querySelectorAll('.hi-num,h3,p,.stat-v').forEach((n, i) => {
        n.style.transitionDelay = (base + 120 + i * 70) + 'ms';
      });
      el.classList.add('in');
      if (el.classList.contains('stat')) countUp(el);
      return;
    }
    el.classList.add('in');
  };

  const medirAlvos = () => {
    alvos = [...document.querySelectorAll('.reveal,.mask-reveal,.caps-grid,.help-item,.stat')]
      .filter(el => !el.classList.contains('in'))
      .map(el => ({ el, topo: el.getBoundingClientRect().top + posVisual }))
      .sort((a, b) => a.topo - b.topo);
  };

  /* escalonamento em 110ms dentro da mesma leva, com teto de 5 passos para o
     último item de um bloco grande não ficar esperando */
  const pintarEntradas = limite => {
    if (!alvos.length) return;
    let n = 0, i = 0;
    while (n < alvos.length && alvos[n].topo < limite) {
      const el = alvos[n].el;
      el.style.setProperty('--d', Math.min(i++, 5) * 70 + 'ms');
      entrar(el);
      n++;
    }
    if (n) alvos = alvos.slice(n);
  };

  document.querySelectorAll('.help-item,.stat').forEach((el, i) => { el.dataset.col = i % 3; });

  /* ---- FAQ ----
     Um item aberto por vez. A altura é animada de 0 até a altura real medida e,
     ao terminar, vai para auto: assim a resposta acompanha troca de idioma e
     redimensionamento sem max-height chutado. O hidden só sai na abertura,
     senão o conteúdo fechado continuaria acessível ao leitor de tela. */
  /* Serve FAQ e "O que eu faço": os dois têm a mesma mecânica, muda só a
     classe do gatilho. Um item aberto por vez dentro de cada grupo. */
  const grupoDe = btn => btn.classList.contains('hi-q') ? 'hi' : 'faq';
  const DUR_Q = reduced ? 20 : 620;
  const timersQ = new WeakMap();

  /* O fim do movimento é resolvido por temporizador, não por transitionend:
     aquele evento não dispara se a transição for interrompida no meio, e o
     painel ficaria preso em height fixo ou sem o hidden de volta. */
  const agendarQ = (painel, fn) => {
    clearTimeout(timersQ.get(painel));
    timersQ.set(painel, setTimeout(fn, DUR_Q));
  };

  const fecharQ = btn => {
    const painel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', 'false');
    painel.style.height = painel.scrollHeight + 'px';
    void painel.offsetHeight;                 // fixa a altura antes de zerar
    painel.classList.remove('open');
    painel.style.height = '0px';
    agendarQ(painel, () => { painel.hidden = true; });
  };

  const abrirQ = btn => {
    const painel = document.getElementById(btn.getAttribute('aria-controls'));
    painel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    painel.style.height = '0px';
    void painel.offsetHeight;
    painel.classList.add('open');
    painel.style.height = painel.scrollHeight + 'px';
    /* auto no fim: a resposta acompanha troca de idioma e redimensionamento
       sem depender de um número gravado */
    agendarQ(painel, () => { painel.style.height = 'auto'; });
  };

  /* Religável e idempotente. Duas diferenças em relação à versão anterior, as
     duas por causa da prévia do CMS, que reconstrói FAQ e "O que eu faço"
     inteiros a cada alteração:
     - o botão já ligado carrega data-q-bound, então rodar de novo não duplica
       handler nos que sobreviveram à reconstrução;
     - a busca dos irmãos acontece ao vivo, e não sobre um array capturado no
       carregamento. Aquele array passaria a apontar para nós já removidos do
       documento depois de uma reconstrução, e fechar o irmão certo pararia de
       funcionar em silêncio. */
  const ligarPerguntas = () => {
    document.querySelectorAll('.faq-q, .hi-q').forEach(btn => {
      if (btn.dataset.qBound) return;
      btn.dataset.qBound = '1';
      btn.addEventListener('click', () => {
        const aberto = btn.getAttribute('aria-expanded') === 'true';
        /* fecha só os irmãos do mesmo grupo: abrir uma pergunta do FAQ não pode
           fechar um item de "O que eu faço" na outra ponta da página */
        document.querySelectorAll('.faq-q, .hi-q').forEach(o => {
          if (o !== btn && grupoDe(o) === grupoDe(btn) && o.getAttribute('aria-expanded') === 'true') fecharQ(o);
        });
        aberto ? fecharQ(btn) : abrirQ(btn);
      });
    });
  };
  ligarPerguntas();

  /* ---- count-up ----
     Só uma vez por número, só quando visível, e desacelerando no fim.
     Sob movimento reduzido o valor final aparece direto. */
  function countUp(stat){
    const node = stat.querySelector('[data-count]');
    if (!node || node.dataset.done) return;
    node.dataset.done = '1';
    const alvo = parseInt(node.dataset.count, 10);
    const pad = parseInt(node.dataset.pad || '0', 10);
    const fmt = v => String(v).padStart(pad, '0');
    if (reduced || !Number.isFinite(alvo)) { node.textContent = fmt(alvo); return; }
    const dur = 1400, t0 = performance.now();
    const passo = now => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 4);            // desacelera no fim
      node.textContent = fmt(Math.round(alvo * eased));
      if (p < 1) requestAnimationFrame(passo);
    };
    node.textContent = fmt(0);
    requestAnimationFrame(passo);
  }

  /* ---- copiar e-mail ----
     Layout preservado: o aviso é absoluto e o ícone troca por opacidade. */
  const copyBtn = document.querySelector('.copy-btn');
  if (copyBtn) {
    const flash = document.querySelector('.copy-flash');
    let resetTimer = null;
    copyBtn.addEventListener('click', async () => {
      const txt = copyBtn.dataset.copy;
      let ok = true;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(txt);
        } else {
          /* fallback para file:// e contextos sem Clipboard API */
          const ta = document.createElement('textarea');
          ta.value = txt;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:-999px;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand('copy');
          ta.remove();
        }
      } catch (err) { ok = false; }

      const pt = document.documentElement.lang !== 'en';
      if (flash) {
        flash.textContent = ok ? (pt ? 'Copiado' : 'Copied')
                               : (pt ? 'Selecione e copie' : 'Select and copy');
        flash.classList.add('on');
      }
      copyBtn.classList.toggle('done', ok);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        copyBtn.classList.remove('done');
        if (flash) flash.classList.remove('on');
      }, 2100);
    });
  }

  /* ================== UM ÚNICO LAÇO DE SCROLL ==================
     Header, inversão sobre a faixa clara e scrub dividem o mesmo frame.
     Listeners separados brigavam pelo mesmo tick e liam layout três vezes. */
  let scrubWords = [], wordTops = [], litCount = 0;
  let lastY = window.scrollY, queued = false, headHidden = false;

  /* Com a rolagem suave por transform, a posição real (window.scrollY) e a
     posição que está na tela deixam de coincidir enquanto o conteúdo alcança.
     Header e scrub precisam seguir o que se vê, não o número do sistema, senão
     acendem palavra e escondem topo antes da hora. Sem suavização as duas são
     a mesma coisa e nada muda. */
  let posVisual = window.scrollY, suavizando = false;
  const estreito = window.matchMedia('(max-width: 899px)');

  /* mede uma vez e guarda a posição absoluta: ler rect de 120 palavras por
     frame era o caminho curto para perder quadros */
  const measureWords = () => {
    wordTops = scrubWords.map(w => w.getBoundingClientRect().top + posVisual);
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

  /* ===== FUNDOS DE VIDRO LÍQUIDO FORA DA TELA =====
     São três seções com quatro massas animadas cada uma. Doze camadas em
     movimento permanente é exatamente o tipo de custo que este projeto já pagou
     caro uma vez, e nenhuma delas precisa animar enquanto está fora do campo de
     visão: ninguém vê a diferença, e o compositor deixa de recompor a camada.
     A margem de uma tela para cada lado garante que a seção já chegue em
     movimento, sem o salto de uma animação que começa do zero na borda.
     Mede uma vez e reaproveita: getBoundingClientRect por quadro anularia a
     economia. As posições são recalculadas junto com os alvos de entrada. */
  let fundos = [];
  const medirFundos = () => {
    fundos = [...document.querySelectorAll('.liquid-bg')].map(el => {
      const r = el.getBoundingClientRect();
      return { el, topo: r.top + posVisual, base: r.bottom + posVisual, ativo: null };
    });
  };
  const pintarFundos = y => {
    if (!fundos.length) return;
    const folga = window.innerHeight;
    for (const f of fundos) {
      const perto = f.base > y - folga && f.topo < y + window.innerHeight + folga;
      if (perto === f.ativo) continue;
      f.ativo = perto;
      f.el.classList.toggle('parado', !perto);
    }
  };

  /* ===== HEADER SOBRE CAPA CLARA =====
     Alternativa ao drop-shadow fixo: cards marcados --light no CMS (capa
     predominantemente clara, tipo o amarelo do Assertivo) fazem o header
     trocar para texto escuro só enquanto passam por baixo dele, em vez de
     depender de uma sombra permanente. Mesmo mecanismo de posição por
     scroll que os outros blocos desta seção, não IntersectionObserver: a
     rolagem suave desloca o conteúdo por transform no .smooth-holder, e o
     navegador não reavalia interseção quando o deslocamento vem de
     transform de ancestral. */
  let claros = [], headAltura = headEl.offsetHeight, headNaClara = false;
  /* Qualquer coisa que possa passar por baixo do header com fundo claro entra
     aqui: card de capa clara (marcado pelo CMS) e seção clara marcada com
     data-header-light no HTML (hoje o FAQ, que é #F2EEEE). O atributo existe
     para não precisar editar este arquivo quando outra seção virar clara. */
  const medirClaros = () => {
    headAltura = headEl.offsetHeight;
    claros = [...document.querySelectorAll('.card--light,[data-header-light]')].map(el => {
      const r = el.getBoundingClientRect();
      return { topo: r.top + posVisual, base: r.bottom + posVisual };
    });
  };
  /* Com o menu aberto o tema congela: o overlay cobre o topo, e deixar o
     conteúdo que rola por trás continuar trocando o contraste faria os
     controles do header piscarem durante a navegação no menu. */
  let temaCongelado = false;
  const aplicarTemaHeader = () => {
    headEl.setAttribute('data-theme', headNaClara ? 'light' : 'dark');
  };
  const pintarClaros = y => {
    if (temaCongelado) return;
    const onLight = claros.length > 0 && claros.some(c => c.topo < y + headAltura && c.base > y);
    if (onLight === headNaClara) return;
    headNaClara = onLight;
    aplicarTemaHeader();
  };
  /* chamado pelos overlays: congela no tema escuro enquanto o menu está aberto,
     e volta a acompanhar a rolagem ao fechar */
  window.__travarTemaHeader = travar => {
    temaCongelado = travar;
    if (travar) { headEl.setAttribute('data-theme', 'dark'); }
    else { aplicarTemaHeader(); }
  };
  aplicarTemaHeader();

  /* ===== SCROLLSPY =====
     Um observador só, alimentado pelo laço de scroll que já existe — não
     IntersectionObserver, que não reavalia quando o deslocamento vem do
     transform do .smooth-holder (ver CLAUDE.md).
     Marca a seção cujo topo já passou da linha de leitura, e escreve
     aria-current no item correspondente. Só toca o DOM quando a seção MUDA:
     reescrever o atributo a cada quadro seria trabalho puro para o navegador.
     Nas páginas de projeto não há seção nenhuma da Home, então a lista nasce
     vazia e a função sai na primeira linha. */
  let alvosSpy = [], secaoAtiva = null;
  const medirSpy = () => {
    /* Só na Home. Nas páginas de projeto o <main id="top"> existe, então sem
       esta guarda o spy marcaria "Início" como local atual — e ali esse item
       leva para outra página, não para onde o leitor está. */
    if (base) { alvosSpy = []; return; }
    alvosSpy = SECOES
      .map(s => {
        const el = document.getElementById(s.id);
        if (!el) return null;
        return { id: s.id, topo: el.getBoundingClientRect().top + posVisual };
      })
      .filter(Boolean)
      .sort((a, b) => a.topo - b.topo);
  };
  const pintarSpy = y => {
    if (!alvosSpy.length) return;
    /* a linha de leitura fica um pouco abaixo do header: é o ponto em que a
       seção "assumiu" a tela, e não o instante em que encosta na borda */
    const linha = y + headAltura + 40;
    let atual = alvosSpy[0].id;
    for (let i = 0; i < alvosSpy.length; i++) {
      if (alvosSpy[i].topo <= linha) atual = alvosSpy[i].id; else break;
    }
    /* A última seção é curta e o rodapé vem logo depois, então a rolagem chega
       ao fim antes de o topo dela cruzar a linha de leitura: sem esta guarda,
       "Contato" nunca acenderia, por mais que o usuário rolasse. Chegou ao fim
       do documento, a última seção é a que está sendo lida. */
    const fim = document.documentElement.scrollHeight - window.innerHeight;
    if (fim > 0 && y >= fim - 2) atual = alvosSpy[alvosSpy.length - 1].id;
    if (atual === secaoAtiva) return;
    secaoAtiva = atual;
    document.querySelectorAll('.menu-item[data-secao]').forEach(a => {
      if (a.getAttribute('data-secao') === atual) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  };

  const readScroll = () => {
    queued = false;
    const y = posVisual;

    /* Só escreve o transform quando o estado vira. Reescrever a cada quadro
       invalidava o backdrop-filter do .menu-btn, que é filho do header: o
       navegador recalculava o desfoque em todo quadro da rolagem, na página
       inteira. Era a causa do engasgo constante. */
    const esconder = y > lastY && y > 200;
    if (esconder !== headHidden) {
      headHidden = esconder;
      headEl.style.transform = esconder ? 'translateY(-130%)' : 'translateY(0)';
    }
    lastY = y;
    pintarClaros(y);
    pintarSpy(y);

    if (scrubWords.length) paintScrub(y + window.innerHeight * .72);
    /* 0.6 e não 0.88: o conteúdo só começa a se revelar quando a seção já
       entrou fundo na tela, e não assim que encosta na borda de baixo. É o que
       dá a sensação de capítulo. No estreito antecipa para 0.82, senão o
       celular mostra tela vazia por tempo demais.
       Rede de segurança do fim de página: numa página curta o limite acima
       nunca chega a alcançar um elemento colado ao rodapé (o "voltar ao topo",
       por exemplo), porque não sobra scroll suficiente para satisfazer a
       conta. Ao encostar no fim real do documento, revela tudo que restou,
       sem depender do limite proporcional à viewport. */
    const noFimDaPagina = y + window.innerHeight >= document.documentElement.scrollHeight - 2;
    pintarEntradas(noFimDaPagina ? Infinity : y + window.innerHeight * (estreito.matches ? .86 : .74));
    pintarFundos(y);
  };

  /* sem suavização a posição visual é a própria rolagem; com ela, quem manda
     em posVisual é o laço do transform, e este listener não deve interferir */
  const onScroll = () => {
    if (suavizando) return;
    posVisual = window.scrollY;
    if (!queued) { queued = true; requestAnimationFrame(readScroll); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    if (scrubWords.length) measureWords();
    medirAlvos();
    medirFundos();
    medirClaros();
    medirSpy();
    medirDeslocamentoNome();
    onScroll();
  }, { passive: true });
  /* a fonte chega depois do primeiro layout e muda a altura do bloco */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(medirDeslocamentoNome);

  if (!reduced && !flag('noscrub')) {
    buildScrub = () => {
      document.querySelectorAll('.about-lead, .case-section p').forEach(p => {
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
      document.fonts.ready.then(() => {
        if (scrubWords.length) measureWords();
        medirAlvos();
        medirFundos();
        medirClaros();
        medirSpy();
        readScroll();
      });
    }
  }

  /* ---- entrada palavra por palavra ----
     Bloco próprio, e não junto do buildScrub: aquele está atrás de
     !flag('noscrub'), uma chave de depuração de outro efeito, e a entrada de
     destaque não deveria morrer junto com ela. Só depende de movimento
     reduzido — nesse modo nem divide, e o texto entra inteiro pelo .reveal.

     Só quem estiver marcado com data-reveal="words": título curto de destaque,
     nunca parágrafo corrido. A divisão é de apresentação — o texto em
     data-pt/data-en e no JSON continua inteiro, então leitor de tela, SEO e
     troca de idioma não enxergam diferença, e nada é duplicado.
     O split guarda o separador como nó de texto real (grupo de captura no
     regex, diferente do buildScrub, que normaliza espaço com \s+): assim
     espaço duplo, quebra de linha, acento e pontuação sobrevivem, e a linha
     quebra nos mesmos pontos de antes — é o que evita salto de layout, já que
     a soma das larguras não muda. */
  if (!reduced) {
    buildPalavras = () => {
      document.querySelectorAll('[data-reveal="words"]').forEach(el => {
        const texto = el.textContent;
        if (!texto.trim()) return;
        const frag = document.createDocumentFragment();
        texto.split(/(\s+)/).forEach(parte => {
          if (!parte) return;
          if (/^\s+$/.test(parte)) { frag.appendChild(document.createTextNode(parte)); return; }
          const s = document.createElement('span');
          s.className = 'rv-w';
          s.textContent = parte;
          frag.appendChild(s);
        });
        el.textContent = '';
        el.appendChild(frag);
        /* já revelado (troca de idioma depois da entrada): as palavras novas
           nascem no estado final, sem repetir a animação */
        if (el.classList.contains('in')) aplicarAtrasoPalavras(el);
      });
    };
    buildPalavras();
  }
  medirAlvos();
  medirFundos();
  medirClaros();
  medirSpy();
  readScroll();

  /* ================== ROLAGEM SUAVE POR TRANSFORM ==================
     A versão anterior capturava a roda com {passive:false} + preventDefault e
     dirigia a página com window.scrollTo() a cada quadro. Duas coisas erradas:
     o listener não-passivo obriga o Chrome a esperar o JS antes de rolar um
     pixel sequer, e o scrollTo provoca rolagem real, com repintura do conteúdo
     exposto, na thread principal. Em tela de alta taxa de atualização isso
     estoura o orçamento do quadro e engasga. Foi o que Pedro sentiu, e o teste
     confirmou: só ?nosmooth=1 (rolagem nativa) corria liso, e nenhuma camada
     visual era culpada.

     Modelo atual, o mesmo do GSAP ScrollSmoother e do Locomotive: a roda nunca
     é interceptada, então a rolagem nativa acontece no compositor, como sempre.
     O conteúdo vive num container fixo que segue a posição real com atraso
     suave, via translate3d. Transform é composto na GPU e não repinta nada, o
     que reduz o trabalho por quadro a praticamente zero.

     Os elementos fixos (véu, orbes, grão, header e os overlays injetados) ficam
     fora do container de propósito: transform cria bloco de contenção e
     quebraria position:fixed dentro dele. */
  const podeSuavizar = !reduced && fine && !flag('nosmooth')
                       && document.querySelector('main');

  if (podeSuavizar) {
    /* Quanto menor o lerp, mais longa a cauda em que a imagem ainda desliza
       depois que a roda para, que é a continuidade do midu.design. .1 é o
       padrão do Lenis. Ajustável sem editar arquivo: ?lerp=0.08 na URL. */
    const LERP = Math.min(.4, Math.max(.02,
      parseFloat(new URLSearchParams(location.search).get('lerp')) || .04));

    suavizando = true;
    const holder = document.createElement('div');
    holder.className = 'smooth-holder';
    const mainEl = document.querySelector('main');
    const footEl = document.querySelector('footer');
    mainEl.parentNode.insertBefore(holder, mainEl);
    holder.appendChild(mainEl);
    if (footEl) holder.appendChild(footEl);
    document.documentElement.classList.add('smooth');

    let curr = window.scrollY, raf = 0, altura = 0;

    /* o corpo precisa ter a altura do conteúdo para a barra de rolagem nativa
       existir e o scroll do sistema funcionar como sempre */
    const medir = () => {
      altura = holder.getBoundingClientRect().height;
      document.body.style.height = altura + 'px';
      if (scrubWords.length) measureWords();
      medirAlvos();
      medirFundos();
      medirClaros();
      medirSpy();
    };

    const aplicar = () => {
      const alvo = window.scrollY;
      curr += (alvo - curr) * LERP;
      if (Math.abs(alvo - curr) < .08) curr = alvo;
      /* arredonda para pixel inteiro: posição fracionária obriga o navegador a
         rasterizar o texto de novo a cada quadro e produz tremor */
      holder.style.transform = 'translate3d(0,' + (-Math.round(curr * 100) / 100) + 'px,0)';
      posVisual = curr;
      readScroll();
      raf = (curr === alvo) ? 0 : requestAnimationFrame(aplicar);
    };

    const acordar = () => { if (!raf) raf = requestAnimationFrame(aplicar); };
    window.addEventListener('scroll', acordar, { passive: true });

    /* Âncoras e skip link: a posição do alvo na tela vem do transform, que está
       atrasado em relação à rolagem real. Sem traduzir para coordenada de
       conteúdo, o "role para explorar" e o menu param no lugar errado.
       Rola instantâneo de propósito: quem faz o movimento suave é o lerp. */
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href').slice(1);
      if (!id) return;
      const alvo = document.getElementById(id);
      if (!alvo || !holder.contains(alvo)) return;
      e.preventDefault();
      /* Desconta a altura do header. scroll-margin-top sozinho não resolve
         aqui: ele só vale para rolagem NATIVA (hash na URL, scrollIntoView),
         e este caminho usa window.scrollTo, que a ignora.
         O valor vem do scroll-margin-top JÁ RESOLVIDO da própria seção, e não
         da variável --anchor-offset: getComputedStyle devolve custom property
         como foi escrita ("clamp(5rem,11vh,7.5rem)"), sem resolver, e o
         parseFloat disso dá NaN. Lendo a propriedade real, o navegador entrega
         px e os dois caminhos param exatamente no mesmo lugar. */
      const recuo = id === 'top' ? 0 :
        (parseFloat(getComputedStyle(alvo).scrollMarginTop) || 0);
      const pos = alvo.getBoundingClientRect().top + curr - recuo;
      const limite = Math.max(0, altura - window.innerHeight);
      window.scrollTo(0, Math.max(0, Math.min(pos, limite)));
    });

    medir();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir);
    window.addEventListener('resize', medir, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(medir).observe(holder);
    acordar();
  }

  /* ================== CURSOR INTERATIVO ==================
     Substitui dois sistemas que existiam antes e se sobrepunham:
     - .cursor-glow tinha listener próprio de mousemove;
     - .card-cue tinha OUTRO listener de mousemove e movia por left/top
       (propriedades de layout), com mouseenter/mouseleave presos aos .card
       existentes no carregamento — quando content-render.js reconstruía a
       grade, os cards novos ficavam sem nenhum handler e o rótulo parava de
       aparecer em silêncio.
     Agora existe um listener de ponteiro e um laço de rAF só. Os cards são
     reconhecidos por delegação, então grade reconstruída, troca de idioma e
     prévia do CMS continuam funcionando sem religar nada.

     A luz ambiente (.cursor-glow, z-index:-1) continua: ela é o fundo do site,
     não o cursor. O que mudou é que passou a ser movida por este mesmo
     listener, em vez de ter o dela. */
  const glow = document.querySelector('.cursor-glow');
  /* pointer:fine sozinho não basta — um híbrido com caneta reporta fine sem
     ter hover de verdade. hover:hover é o que garante estado de passagem. */
  const podeCursor = window.matchMedia('(pointer: fine) and (hover: hover)').matches;

  if (podeCursor && !reduced) {
    const camada = document.createElement('div');
    camada.className = 'cur-layer';
    camada.setAttribute('aria-hidden', 'true');
    /* três rastros fixos, criados uma vez. Nunca são recriados: durante o
       movimento só o transform deles muda. */
    for (let i = 0; i < 3; i++) camada.appendChild(document.createElement('i')).className = 'cur-trail';
    const ponto = document.createElement('div');
    ponto.className = 'cur-dot';
    const rotulo = document.createElement('span');
    rotulo.className = 'cur-label';
    rotulo.setAttribute('data-pt', 'Ver projeto');
    rotulo.setAttribute('data-en', 'View project');
    /* o texto inicial acompanha o idioma já detectado: o cursor nasce depois
       do primeiro setLang, então nascer sempre em PT deixaria o rótulo errado
       até a próxima troca. Das próximas vezes quem atualiza é o próprio
       setLang, que varre [data-pt] — por isso nada aqui é recriado ao trocar. */
    rotulo.textContent = (document.documentElement.lang || 'pt').indexOf('en') === 0 ? 'View project' : 'Ver projeto';
    camada.appendChild(ponto);
    camada.appendChild(rotulo);
    document.body.appendChild(camada);
    /* só depois de a camada existir de verdade */
    document.documentElement.classList.add('has-custom-cursor');

    const trilhas = [...camada.querySelectorAll('.cur-trail')];
    let alvoX = innerWidth / 2, alvoY = innerHeight / 2;
    let x = alvoX, y = alvoY;
    const tx = [alvoX, alvoX, alvoX], ty = [alvoY, alvoY, alvoY];
    let rodando = false, ligado = false, rapidoAte = 0;
    let magneto = null, magnetoMax = 0;

    const LERP = .22;          /* inércia curta: acompanha sem parecer atrasado */
    const LERP_TRILHA = .3;
    const VEL_RASTRO = 7;      /* px por amostra: abaixo disso o rastro some */

    const escrever = (el, px, py) => { el.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)'; };

    const laco = () => {
      /* alvo com magnetismo: puxa em direção ao centro do elemento sob o
         ponteiro, com teto curto para o cursor nunca parecer descolado do
         ponteiro real. O clique não muda de lugar: só o desenho se desloca. */
      let ax = alvoX, ay = alvoY;
      if (magneto) {
        const dx = (magneto.cx - alvoX), dy = (magneto.cy - alvoY);
        const d = Math.hypot(dx, dy) || 1;
        const puxa = Math.min(magnetoMax, d);
        ax += (dx / d) * puxa; ay += (dy / d) * puxa;
      }
      x += (ax - x) * LERP; y += (ay - y) * LERP;
      escrever(ponto, x, y);
      escrever(rotulo, x, y);
      let px = x, py = y;
      for (let i = 0; i < 3; i++) {
        tx[i] += (px - tx[i]) * LERP_TRILHA;
        ty[i] += (py - ty[i]) * LERP_TRILHA;
        escrever(trilhas[i], tx[i], ty[i]);
        px = tx[i]; py = ty[i];
      }
      if (performance.now() > rapidoAte) camada.classList.remove('fast');
      /* para o laço quando tudo assentou: sem movimento não há o que pintar */
      const parado = Math.abs(ax - x) < .1 && Math.abs(ay - y) < .1 &&
        Math.abs(tx[2] - x) < .1 && Math.abs(ty[2] - y) < .1;
      if (parado && performance.now() > rapidoAte) { rodando = false; return; }
      requestAnimationFrame(laco);
    };
    const acordarCursor = () => { if (!rodando) { rodando = true; requestAnimationFrame(laco); } };

    let ultimoX = alvoX, ultimoY = alvoY, primeiraAmostra = true;
    document.addEventListener('mousemove', e => {
      alvoX = e.clientX; alvoY = e.clientY;
      /* A primeira amostra não vira velocidade: sem isto ela seria medida
         contra o centro da viewport (o chute inicial) e o cursor entraria
         piscando um rastro que nenhum movimento real produziu. Na primeira
         vez o cursor também salta direto para o ponteiro, em vez de deslizar
         do centro da tela até ele. */
      if (primeiraAmostra) {
        primeiraAmostra = false;
        ultimoX = alvoX; ultimoY = alvoY;
        x = alvoX; y = alvoY;
        for (let i = 0; i < 3; i++) { tx[i] = alvoX; ty[i] = alvoY; }
      }
      /* rastro por velocidade, não por intervalo fixo: um movimento mínimo
         não pode gerar rastro. */
      else if (Math.hypot(alvoX - ultimoX, alvoY - ultimoY) > VEL_RASTRO) {
        camada.classList.add('fast');
        rapidoAte = performance.now() + 380;   /* dentro da faixa 250–450ms */
      }
      ultimoX = alvoX; ultimoY = alvoY;
      if (!ligado) { ligado = true; camada.classList.add('on'); }
      if (glow) {
        glow.style.setProperty('--mx', alvoX + 'px');
        glow.style.setProperty('--my', alvoY + 'px');
        glow.classList.add('on');
      }
      acordarCursor();
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      ligado = false;
      camada.classList.remove('on', 'fast', 'is-card', 'is-control');
      if (glow) glow.classList.remove('on');
    });

    /* ---- estados por delegação ----
       mouseover/mouseout sobem na árvore, então cards e controles criados
       depois do carregamento (grade reconstruída pelo CMS, menu injetado)
       são reconhecidos sem religar nada e sem acumular listener. */
    const SEL_CARD = '.card';
    const SEL_CONTROLE = 'a,button,[role="button"],summary,.menu-item,.faq-q,.hi-q,.lp-toggle,.menu-btn,.nav-cta';
    const SEL_TEXTO = 'input,textarea,select,[contenteditable="true"]';

    const medirMagneto = el => {
      const r = el.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };

    document.addEventListener('mouseover', e => {
      const alvo = e.target;
      /* campos de texto e áreas editáveis mantêm o cursor nativo: o efeito
         some ali em vez de disputar com o I-beam. */
      if (alvo.closest && alvo.closest(SEL_TEXTO)) {
        camada.classList.remove('is-card', 'is-control');
        camada.style.opacity = '0';
        magneto = null;
        return;
      }
      camada.style.opacity = '';
      const card = alvo.closest && alvo.closest(SEL_CARD);
      /* com overlay aberto, card atrás do menu não vale */
      if (card && !document.body.classList.contains('locked')) {
        camada.classList.add('is-card');
        camada.classList.remove('is-control');
        magneto = medirMagneto(card); magnetoMax = 5;
        acordarCursor();
        return;
      }
      const ctrl = alvo.closest && alvo.closest(SEL_CONTROLE);
      camada.classList.remove('is-card');
      if (ctrl) {
        camada.classList.add('is-control');
        magneto = medirMagneto(ctrl); magnetoMax = 4;   /* faixa 2–5px */
      } else {
        camada.classList.remove('is-control');
        magneto = null;
      }
      acordarCursor();
    }, { passive: true });

    /* o retângulo guardado envelhece quando a página rola ou muda de tamanho;
       zerar é mais barato e mais seguro que remedir a cada quadro */
    const zerarMagneto = () => { magneto = null; };
    window.addEventListener('scroll', zerarMagneto, { passive: true });
    window.addEventListener('resize', zerarMagneto, { passive: true });
    /* aba em segundo plano não precisa de laço; ao voltar, ele reacende */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') acordarCursor();
    });
  }

  /* ---- ponte para a prévia do painel ----
     Chamado por js/content.js depois de reescrever texto e reconstruir listas
     com dados que ainda não foram publicados. Só reexecuta o que é idempotente:
     idioma (que por sua vez refaz o scrub e a divisão em palavras), ligação dos
     acordeões, e a remedição das entradas.

     medirAlvos + readScroll no fim, e não pintarEntradas(Infinity): assim o que
     está abaixo da dobra continua entrando por rolagem, e a prévia mostra a
     animação de verdade em vez de revelar a página inteira de uma vez.

     Nada aqui é usado pelo site fora do CMS. Ficam em window porque content.js
     é outro arquivo, mas não recebem dado nenhum: quem valida a origem e o
     formato da mensagem é o content.js, antes de chegar aqui. */
  window.__CMS_REINIT__ = () => {
    const atual = (document.documentElement.lang || 'pt').indexOf('pt') === 0 ? 'pt' : 'en';
    setLang(atual);
    ligarPerguntas();
    medirAlvos();
    readScroll();
  };
  window.__CMS_SETLANG__ = lang => setLang(lang === 'en' ? 'en' : 'pt');
})();
