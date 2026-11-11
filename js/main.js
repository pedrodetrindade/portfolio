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

  /* O encerramento da Home deve ocupar uma viewport exata: contato completa o
     espaço que sobra depois do footer. Medir o footer é mais robusto que
     estimar sua altura, porque disclaimer, idioma, fonte e largura podem mudar.
     ResizeObserver cobre todas essas mudanças sem criar listener de scroll. */
  const footerMedido = document.querySelector('footer');
  const contatoMedido = document.getElementById('contact');
  let ultimaAlturaFooter = -1;
  const medirEncerramento = () => {
    if (!footerMedido || !contatoMedido) return;
    const altura = footerMedido.getBoundingClientRect().height;
    if (Math.abs(altura - ultimaAlturaFooter) < .25) return;
    ultimaAlturaFooter = altura;
    document.documentElement.style.setProperty('--footer-block-height', altura + 'px');
  };
  medirEncerramento();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(medirEncerramento);
  if (window.ResizeObserver && footerMedido) new ResizeObserver(medirEncerramento).observe(footerMedido);

  const base = location.pathname.includes('/work/') ? '/' : '';
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
  const grainDiagnosticOff = flag('nograin');
  if (grainDiagnosticOff) {
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

     Todas as seções podem ser desativadas pelo CMS. O registro canônico liga
     cada destino de navegação à chave correspondente em home.sections, para
     que menu e conteúdo tomem a mesma decisão.

     A hero não tem id próprio no HTML: o topo navegável é o <main id="top">.
     Por isso o id canônico dela é 'top' — é o elemento que existe de verdade,
     não um id paralelo inventado. */
  const SECOES = [
    { id: 'top',     config: 'hero',    pt: 'Início',        en: 'Home',      icone: 'inicio'    },
    { id: 'work',    config: 'work',    pt: 'Trabalhos',     en: 'Work',      icone: 'trabalhos' },
    { id: 'about',   config: 'about',   pt: 'Sobre',         en: 'About',     icone: 'sobre'     },
    { id: 'help',    config: 'help',    pt: 'O que eu faço', en: 'What I do', icone: 'servicos'  },
    { id: 'faq',     config: 'faq',     pt: 'FAQ',           en: 'FAQ',       icone: 'faq'       },
    { id: 'contact', config: 'contact', pt: 'Contato',       en: 'Contact',   icone: 'contato'   }
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
  /* Menu central desativado, não apagado (pedido de Pedro):
     global.json > header.showMenu:false, interruptor "Mostrar menu central"
     no painel. A marcação do painel do menu continua sendo injetada; o que
     some é o botão do meio do header, e com ele o clique, o hover e o foco
     que abriam o painel. Ausência do campo é ligado. */
  const menuLigado = !(window.__CMS_GLOBAL__ && window.__CMS_GLOBAL__.header &&
    window.__CMS_GLOBAL__.header.showMenu === false);
  document.documentElement.classList.toggle('menu-desligado', !menuLigado);
  document.querySelectorAll('header .ctrl-group').forEach(g => { g.inert = !menuLigado; });

  /* O painel de contato lê o e-mail AQUI, e não por js/content-render.js como
     o resto do site: aquele arquivo roda antes deste, e o painel só existe
     depois que este injeta a marcação — um seletor .mail-link ali dentro nunca
     seria encontrado. O literal é a reserva para o caso de o global.json não
     ter carregado, e é o mesmo endereço que já estava fixo no HTML antes. */
  const emailDeContato =
    (window.__CMS_GLOBAL__ && window.__CMS_GLOBAL__.social && window.__CMS_GLOBAL__.social.email) ||
    'contact@pedrodetrindade.com';
  const redesCms = (window.__CMS_GLOBAL__ && window.__CMS_GLOBAL__.social) || {};
  const redesGlobais = {
    linkedin: redesCms.linkedin || 'https://www.linkedin.com/in/pedrodetrindade',
    /* Behance só com endereço no painel e o interruptor ligado: o menu era o
       único lugar que ignorava o "Mostrar Behance" e caía num endereço fixo */
    behance: redesCms.behanceActive === false ? '' : (redesCms.behance || '')
  };

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

  /* Seção escondida pelo CMS sai do menu: um item apontando para uma âncora
     desativada seria um link quebrado. Ausência de visible mantém a seção. */
  function secaoDisponivel(id) {
    const s = secaoPorId(id);
    if (!s) return false;
    const secoes = window.__CMS_HOME__ && window.__CMS_HOME__.sections;
    if (secoes && secoes[s.config] && secoes[s.config].visible === false) return false;
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
      if (i.visible === false) return;
      const canon = secaoPorId(id);
      itens.push({ id, pt: i.pt || canon.pt, en: i.en || canon.en });
    });
    SECOES.forEach(s => { if (!vistos[s.id]) itens.push({ id: s.id, pt: s.pt, en: s.en }); });
    return itens
      .map(i => ({ id: i.id, pt: i.pt, en: i.en, href: hrefDaSecao(i.id), visivel: secaoDisponivel(i.id) }));
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

  /* O texto do indicador vem do CMS, com os valores acima como reserva.
     Isto não é conveniência: este arquivo roda DEPOIS de content-render.js, e
     era ele quem injetava o elemento. Quando o render tentava escrever o texto
     publicado, o .next-hint ainda não existia, o querySelector devolvia null e
     o valor fixo daqui ficava valendo — apagar o rótulo no painel salvava no
     JSON e não mudava nada no site. Quem monta o elemento tem que ler o dado.
     content-render.js continua reaplicando, e aí sim o elemento existe: é esse
     caminho que a prévia ao vivo usa a cada tecla digitada. */
  const heroCms = (window.__CMS_HOME__ && window.__CMS_HOME__.hero) || {};
  /* Ausência do campo mantém o padrão, só false desliga: mesma convenção de
     showLabel e showEyebrow. Cadeia de || não serve aqui, porque texto vazio
     é uma escolha legítima ("não quero rótulo") e cairia na reserva. */
  const ouEntao = (v, reserva) => (typeof v === 'string' ? v : reserva);
  /* Escapa porque estes valores deixaram de ser literais deste arquivo e
     passaram a vir do painel: uma aspa no texto fecharia o atributo no meio e
     o resto da frase viraria marcação. */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  PROXIMA.forEach(p => {
    const secao = document.querySelector(p.de);
    if (!secao || !document.querySelector(p.alvo)) return;
    if (p.alvo === '#work' && !secaoDisponivel('work')) return;
    if (p.de === '.hero' && heroCms.showNextHint === false) return;

    const rotuloPt = p.de === '.hero' ? ouEntao(heroCms.nextHintLabelPt, p.rotuloPt) : p.rotuloPt;
    const rotuloEn = p.de === '.hero' ? ouEntao(heroCms.nextHintLabelEn, p.rotuloEn) : p.rotuloEn;
    const nomePt   = p.de === '.hero' ? ouEntao(heroCms.nextHintNamePt,  p.nomePt)   : p.nomePt;
    const nomeEn   = p.de === '.hero' ? ouEntao(heroCms.nextHintNameEn,  p.nomeEn)   : p.nomeEn;
    /* Cada linha some sozinha quando fica sem texto nos dois idiomas: um span
       vazio ainda ocuparia o gap da coluna e abriria um degrau no lugar dele. */
    const vazio = (pt, en) => !String(pt || '').trim() && !String(en || '').trim();

    secao.insertAdjacentHTML('beforeend', `
      <a class="next-hint reveal" href="${p.alvo}">
        <span class="nh-label"${vazio(rotuloPt, rotuloEn) ? ' hidden' : ''} data-pt="${esc(rotuloPt)}" data-en="${esc(rotuloEn)}">${esc(rotuloPt)}</span>
        <span class="nh-name"${vazio(nomePt, nomeEn) ? ' hidden' : ''} data-pt="${esc(nomePt)}" data-en="${esc(nomeEn)}">${esc(nomePt)}</span>
        <span class="nh-arrow" aria-hidden="true">↓</span>
      </a>`);
  });

  const linksSociaisMenu = [
    redesGlobais.linkedin ? '<a href="' + esc(redesGlobais.linkedin) + '" target="_blank" rel="noopener noreferrer"><span class="cta-blur-label">LinkedIn</span><span aria-hidden="true">↗</span></a>' : '',
    redesGlobais.behance ? '<a href="' + esc(redesGlobais.behance) + '" target="_blank" rel="noopener noreferrer"><span class="cta-blur-label">Behance</span><span aria-hidden="true">↗</span></a>' : ''
  ].filter(Boolean).join('');

  /* A disponibilidade saiu do header por decisão editorial. O CSS já impede
     qualquer flash antes do JS; remover os nós também evita que leitores de
     tela e futuras medições ainda tratem o status como parte do menu. */
  document.querySelectorAll('.ctrl-div,.avail').forEach(el => el.remove());

  document.body.insertAdjacentHTML('beforeend', `
    <div class="veil" aria-hidden="true"></div>

    <!-- O topo repete a linguagem da pílula fechada: o painel aberto precisa
         parecer a expansão do mesmo controle, não um segundo componente. Não
         existe X: no desktop ele fecha ao sair com o cursor; em toque, pelo
         próprio botão Menu, clique fora ou Escape. -->
    <div class="overlay" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="overlay-sheet">
        <div class="menu-panel-head">
          <span class="menu-panel-title"><i aria-hidden="true"></i><span class="menu-panel-label-swap"><span data-pt="Menu" data-en="Menu">Menu</span><span>Pedro de Trindade</span></span></span>
        </div>
        <nav class="menu-list">
          ${MENU.map(i => `
            <a class="menu-item" href="${esc(i.href)}" data-secao="${esc(i.id)}"${i.visivel ? '' : ' hidden'}>
              <span class="menu-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${iconeDaSecao(i.id)}</svg></span>
              <span data-pt="${esc(i.pt)}" data-en="${esc(i.en)}">${esc(i.pt)}</span>
            </a>`).join('')}
        </nav>
        ${linksSociaisMenu ? `<div class="menu-social"><span data-pt="Redes" data-en="Social">Redes</span><div>${linksSociaisMenu}</div></div>` : ''}
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
            <!-- Armadilha para robô: invisível e fora da ordem de tabulação,
                 então pessoa nenhuma o encontra, nem com leitor de tela
                 (aria-hidden). Robô que preenche todo campo do formulário se
                 denuncia aqui. tabindex="-1" e autocomplete="off" existem para
                 o preenchimento automático do navegador também não cair nela. -->
            <div class="cform-trap" aria-hidden="true">
              <label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
            </div>
            <button type="submit" class="cform-submit" data-pt="Enviar" data-en="Send">Enviar</button>
            <p class="cform-status" role="status" aria-live="polite" hidden></p>
            <!-- O e-mail direto deixou de ser nota de rodapé: é a segunda via
                 real de contato, e quem prefere o próprio cliente de e-mail
                 precisa achá-la sem procurar. O rótulo continua discreto; o
                 endereço é que ganhou corpo, cor de texto e a mesma moldura
                 dos CTAs do site.
                 Duas peças e não uma string com <a> dentro de data-pt: o texto
                 e o endereço mudam por motivos diferentes (idioma x conteúdo do
                 CMS), e misturar os dois obrigaria a repetir o endereço nas
                 duas traduções. -->
            <div class="cform-direct">
              <span class="cform-direct-k" data-pt="ou escreva direto para" data-en="or write directly to">ou escreva direto para</span>
              <div class="cform-direct-row">
                <a class="cform-direct-mail" href="mailto:${esc(emailDeContato)}">${esc(emailDeContato)}</a>
                <button type="button" class="cform-direct-copy" data-copy="${esc(emailDeContato)}"
                        data-pt-label="Copiar endereço de e-mail" data-en-label="Copy email address"
                        aria-label="Copiar endereço de e-mail">
                  <svg class="ico-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.6"/><path d="M15.5 5.2A2.7 2.7 0 0 0 12.9 4H6.6A2.6 2.6 0 0 0 4 6.6v6.3c0 1.2.8 2.2 1.9 2.5"/></svg>
                  <svg class="ico-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.8 12.6l4.6 4.6L19.2 7.4"/></svg>
                </button>
              </div>
              <span class="cform-direct-copy-status" role="status" aria-live="polite"></span>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  /* ===== DISPONIBILIDADE: UM ESTADO PARA HEADER E MENU =====
     A configuração vive em home.json, mas é aplicada a toda página, inclusive
     aos cases. `showAvailability` continua aceito para conteúdo antigo;
     availabilityStatus acrescenta o terceiro estado "indisponível". */
  function dadosDeDisponibilidade() {
    const hero = (window.__CMS_HOME__ && window.__CMS_HOME__.hero) || {};
    const permitidos = ['available', 'unavailable', 'hidden'];
    const status = permitidos.includes(hero.availabilityStatus)
      ? hero.availabilityStatus
      : (hero.showAvailability === false ? 'hidden' : 'available');
    const indisponivel = status === 'unavailable';
    return {
      status,
      pt: indisponivel ? (hero.unavailabilityPt || 'Indisponível para projetos') : (hero.availabilityPt || 'Disponível para projetos'),
      en: indisponivel ? (hero.unavailabilityEn || 'Unavailable for projects') : (hero.availabilityEn || 'Available for projects'),
      ptShort: indisponivel ? (hero.unavailabilityShortPt || 'Indisponível') : (hero.availabilityShortPt || 'Disponível'),
      enShort: indisponivel ? (hero.unavailabilityShortEn || 'Unavailable') : (hero.availabilityShortEn || 'Available')
    };
  }

  function aplicarDisponibilidade() {
    const cfg = dadosDeDisponibilidade();
    const escondido = cfg.status === 'hidden';
    document.body.setAttribute('data-availability', cfg.status);
    document.querySelectorAll('.avail,.menu-panel-avail').forEach(el => {
      el.hidden = escondido;
      const texto = el.querySelector('span:not(.avail-dot)');
      if (!texto) return;
      texto.dataset.pt = cfg.pt;
      texto.dataset.en = cfg.en;
      texto.dataset.ptShort = cfg.ptShort;
      texto.dataset.enShort = cfg.enShort;
    });
    document.querySelectorAll('.ctrl-div,.menu-panel-div').forEach(el => { el.hidden = escondido; });
  }

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
    const armarStamp = () => {
      stampTimer = setTimeout(() => {
        paintStamp();
        stampTimer = setInterval(paintStamp, 60000);
      }, (60 - new Date().getSeconds()) * 1000);
    };
    armarStamp();
    window.addEventListener('pagehide', () => { clearTimeout(stampTimer); clearInterval(stampTimer); });
    /* voltando pelo histórico (bfcache) a página é restaurada com os timers
       já limpos pelo pagehide: sem isto o relógio ficava parado na hora antiga */
    window.addEventListener('pageshow', e => {
      if (!e.persisted) return;
      clearTimeout(stampTimer); clearInterval(stampTimer);
      paintStamp();
      armarStamp();
    });
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
    /* com dados do site bloqueados, o navegador lança SecurityError aqui: sem
       o try, o script inteiro parava e a página ficava em branco (.reveal) */
    let saved = null;
    try { saved = localStorage.getItem('lang'); } catch (erro) { /* sem preferência gravada */ }
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
    if (explicit) { try { localStorage.setItem('lang', lang); } catch (erro) { /* armazenamento bloqueado */ } }
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
    /* A medida do nome também sai daqui, pelo mesmo motivo e com a mesma
       ressalva: offsetWidth é largura de layout, então não muda com a escala da
       intro. No celular a frase da capa usa esta largura para não ficar mais
       larga que o nome — sem isso ela ultrapassava o nome em 40px a 375, e a
       capa lia como dois blocos de medidas diferentes em vez de uma coluna. */
    document.documentElement.style.setProperty('--nome-larg', wrap.offsetWidth + 'px');
    if (window.__nomeVetorialRemedir) window.__nomeVetorialRemedir();
  }

  /* ===== NOME VETORIAL (tech-text, React Bits) =====
     Quebra o nome da capa em letras para o hover do tech-text. Só onde existe
     cursor de verdade e sem movimento reduzido: no toque não há hover, e o
     nome continua texto corrido, com a mesma métrica de sempre.
     As letras são spans inline, não inline-block: assim o navegador continua
     aplicando o kerning entre elas (medido, a largura do nome não muda).
     Ficam aria-hidden e uma cópia em texto corrido (.hn-sr) é o que o leitor
     de tela lê, senão o VoiceOver soletraria o nome.
     Function e não const: roda antes de setLang, que remede o nome. */
  function montarNomeCinetico(){
    const n = document.querySelector('.hero-name');
    const linha = n && n.querySelector('.hn-line');
    if (!linha || n.classList.contains('vetorial')) return;
    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const letras = document.createElement('span');
    letras.className = 'hn-letras';
    letras.setAttribute('aria-hidden', 'true');
    Array.from(linha.childNodes).forEach(no => {
      if (no.nodeType === 3) {
        Array.from(no.textContent.replace(/\s+/g, ' ')).forEach(ch => {
          const s = document.createElement('span');
          s.className = 'hn-letra';
          s.textContent = ch;
          letras.appendChild(s);
        });
      } else if (no.nodeType === 1) {
        no.classList.add('hn-letra');      // o ponto final (<i>) também reage
        letras.appendChild(no);
      }
    });
    const sr = document.createElement('span');
    sr.className = 'hn-sr';
    sr.textContent = letras.textContent.trim();
    linha.textContent = '';
    linha.append(letras, sr);
    n.classList.add('vetorial');
    iniciarNomeVetorial(n);
  }

  /* O efeito em si. O nome continua sendo texto no DOM (a intro, o morph e a
     calibração de 8,0x dependem disso); um canvas por cima desenha só o que é
     de "editor vetorial": a letra sob o cursor some do DOM e reaparece como
     contorno tracejado, com moldura de seleção, alças nos cantos, a medida da
     letra, pontinhos piscando em volta e um par de pontos correndo pela borda.
     Dá para arrastar a letra (ela volta por mola). O clique curto, que fazia o
     nome saltar em onda a partir da letra, saiu a pedido. Do original também
     ficou de fora a varredura automática: a capa já tem movimento demais para
     o nome se mexer sozinho.
     O laço de quadros só roda enquanto há cursor, mola ou fundido em curso. */
  function iniciarNomeVetorial(n){
    const wrap = n.closest('.hero-name-wrap');
    if (!wrap) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'hn-vetor';
    canvas.setAttribute('aria-hidden', 'true');
    wrap.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const MOLA = 320, AMORTECE = 2 * Math.sqrt(MOLA) * (1 - 0.4 * 0.96);
    const aproxima = (a, b, dt, s) => a + (b - a) * (1 - Math.exp(-dt / s));
    const ruido = (...v) => {
      let h = 2166136261;
      for (const x of v) { h = Math.imul(h ^ (x | 0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
      return (h >>> 0) / 4294967296;
    };
    const sinal = v => (v > 0 ? '+' + v : v < 0 ? '−' + (-v) : '0');
    const letras = [...n.querySelectorAll('.hn-letra')].map((el, i) => ({
      el, i, ch: el.textContent, ox: 0, base: 0, caixa: null, sprite: null,
      off: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, contorno: 0
    })).filter(l => l.ch.trim());
    let larg = 0, alt = 0, dpr = 1, fonte = '', tinta = '', acento = '', rotulo = '';
    let raf = 0, ultimo = 0, pulso = 0, arrastando = -1, cursor = '';
    const ponteiro = { x: 0, y: 0, dentro: false };
    const pega = { x: 0, y: 0 };
    const moldura = { x1: 0, y1: 0, x2: 0, y2: 0, a: 0, i: -1 };

    /* Posição de cada letra relativa ao canvas, a partir do próprio span:
       origem na borda esquerda dele e linha de base no topo da caixa mais a
       subida da fonte. A caixa de tinta vem do measureText da letra. */
    function medir(){
      const cs = getComputedStyle(n);
      const tam = parseFloat(cs.fontSize);
      fonte = cs.fontWeight + ' ' + tam + 'px ' + cs.fontFamily;
      tinta = cs.color;
      acento = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || tinta;
      const tag = document.querySelector('.hero-tag');
      rotulo = '10px ' + (tag ? getComputedStyle(tag).fontFamily : 'monospace');
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const caixaC = canvas.getBoundingClientRect();
      larg = caixaC.width; alt = caixaC.height;
      canvas.width = Math.max(1, Math.round(larg * dpr));
      canvas.height = Math.max(1, Math.round(alt * dpr));
      ctx.font = fonte;
      const sobe = ctx.measureText('H').fontBoundingBoxAscent;
      for (const l of letras) {
        const r = l.el.getBoundingClientRect();
        const m = ctx.measureText(l.ch);
        l.ox = r.left - caixaC.left - l.off.x;
        l.base = r.top - caixaC.top + sobe - l.off.y;
        l.caixa = {
          x1: l.ox - m.actualBoundingBoxLeft, y1: l.base - m.actualBoundingBoxAscent,
          x2: l.ox + m.actualBoundingBoxRight, y2: l.base + m.actualBoundingBoxDescent
        };
        l.sprite = null;
      }
    }
    /* Contorno tracejado da letra, desenhado uma vez num canvas próprio: traço
       duplo com tracejado e o miolo apagado por destination-out, então só a
       metade de fora do traço sobra, como no original. */
    function sprite(l){
      if (l.sprite) return l.sprite;
      const pad = 8;
      const x = l.caixa.x1 - pad, y = l.caixa.y1 - pad;
      const w = l.caixa.x2 - l.caixa.x1 + pad * 2, h = l.caixa.y2 - l.caixa.y1 + pad * 2;
      const img = document.createElement('canvas');
      img.width = Math.max(1, Math.ceil(w * dpr));
      img.height = Math.max(1, Math.ceil(h * dpr));
      const c = img.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
      c.font = fonte;
      c.textBaseline = 'alphabetic';
      c.lineJoin = 'round';
      c.lineWidth = 3;
      c.strokeStyle = tinta;
      c.setLineDash([4, 2]);
      c.strokeText(l.ch, l.ox, l.base);
      c.setLineDash([]);
      c.globalCompositeOperation = 'destination-out';
      c.fillText(l.ch, l.ox, l.base);
      return (l.sprite = { img, x, y });
    }
    function colar(s, dx, dy){
      ctx.drawImage(s.img, Math.round((s.x + dx) * dpr), Math.round((s.y + dy) * dpr));
    }
    function letraEm(x, y){
      let melhor = -1, dist = Infinity;
      letras.forEach((l, k) => {
        const c = l.caixa;
        if (y < c.y1 - 24 || y > c.y2 + 24) return;
        const x1 = c.x1 + l.off.x, x2 = c.x2 + l.off.x;
        const d = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
        if (d < dist) { dist = d; melhor = k; }
      });
      return dist < 20 ? melhor : -1;
    }
    const nitido = v => (Math.round(v * dpr) + 0.5) / dpr;
    function perimetro(d, w, h){
      d = ((d % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
      if (d < w) return [moldura.x1 + d, moldura.y1, 0, -1];
      d -= w;
      if (d < h) return [moldura.x2, moldura.y1 + d, 1, 0];
      d -= h;
      if (d < w) return [moldura.x2 - d, moldura.y2, 0, 1];
      d -= w;
      return [moldura.x1, moldura.y2 - d, -1, 0];
    }
    function desenharMoldura(){
      const l = letras[moldura.i];
      if (!l || moldura.a < 0.01) return;
      const a = moldura.a;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = acento;
      ctx.strokeStyle = acento;
      ctx.lineWidth = 1;
      const movida = Math.hypot(l.off.x, l.off.y);
      if (movida > 1) {
        const hx = (l.caixa.x1 + l.caixa.x2) / 2, hy = (l.caixa.y1 + l.caixa.y2) / 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + l.off.x, hy + l.off.y);
        ctx.setLineDash([3, 4]);
        ctx.globalAlpha = 0.45 * a;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.7 * a;
        ctx.fillRect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
      }
      const x1 = nitido(moldura.x1), y1 = nitido(moldura.y1), x2 = nitido(moldura.x2), y2 = nitido(moldura.y2);
      ctx.globalAlpha = 0.5 * a;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha = 0.95 * a;
      for (const [cx, cy] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]) ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 5, 5);
      /* pontinhos que piscam em volta da moldura, em grade de 3px */
      const w = moldura.x2 - moldura.x1, h = moldura.y2 - moldura.y1;
      if (w > 2 && h > 2) {
        const per = 2 * (w + h), semente = moldura.i + 1;
        for (let k = 0; k < 12; k++) {
          const periodo = 0.5 + ruido(semente, k, 11) * 1.2;
          const t = pulso / periodo + ruido(semente, k, 17);
          const ciclo = Math.floor(t), vida = t - ciclo;
          if (vida > 0.7) continue;
          const [px, py, nx, ny] = perimetro(ruido(semente, k, ciclo) * per, w, h);
          const sorte = ruido(semente, k, ciclo, 2);
          const lado = sorte < 0.5 ? 2 : sorte < 0.75 ? 3 : sorte < 0.9 ? 5 : 8;
          const fora = (lado >= 8 ? 9 : 4) + Math.floor(ruido(semente, k, ciclo, 1) * 5) * 3;
          const x = moldura.x1 + Math.round((px + nx * fora - moldura.x1) / 3) * 3;
          const y = moldura.y1 + Math.round((py + ny * fora - moldura.y1) / 3) * 3;
          const tom = ruido(semente, k, ciclo, 3);
          const pisca = vida < 0.06 || (vida > 0.32 && vida < 0.36) ? 0.35 : 1;
          ctx.globalAlpha = a * (0.3 + 0.5 * tom) * pisca;
          const esq = Math.round(x - lado / 2), topo = Math.round(y - lado / 2);
          if (tom < 0.3 || lado >= 8) ctx.strokeRect(esq + 0.5, topo + 0.5, lado, lado);
          else ctx.fillRect(esq, topo, lado, lado);
        }
        /* dois pontos correndo pela borda, com rastro curto */
        for (let j = 0; j < 2; j++) {
          const cabeca = (pulso * 0.42 + j * 0.5) * per;
          for (let i = 0; i < 4; i++) {
            const [x, y] = perimetro(cabeca - i * 6, w, h);
            const lado = i === 0 ? 3 : 2;
            ctx.globalAlpha = a * [0.95, 0.55, 0.32, 0.16][i];
            ctx.fillRect(Math.round(x - lado / 2), Math.round(y - lado / 2), lado, lado);
          }
        }
      }
      ctx.font = rotulo;
      ctx.textBaseline = 'bottom';
      ctx.globalAlpha = 0.7 * a;
      const texto = movida > 1
        ? sinal(Math.round(l.off.x)) + ', ' + sinal(Math.round(-l.off.y))
        : l.ch + '  ' + Math.round(l.caixa.x2 - l.caixa.x1) + ' × ' + Math.round(l.caixa.y2 - l.caixa.y1);
      ctx.fillText(texto, Math.round(moldura.x1), Math.round(moldura.y1) - 7);
      ctx.globalAlpha = 1;
    }
    function tick(agora){
      raf = 0;
      const dt = Math.min(0.05, Math.max(0.001, (agora - ultimo) / 1000));
      ultimo = agora;
      pulso += dt;
      let mexendo = false;
      letras.forEach((l, k) => {
        if (k === arrastando) {
          l.off.x = aproxima(l.off.x, ponteiro.x - pega.x, dt, 0.03);
          l.off.y = aproxima(l.off.y, ponteiro.y - pega.y, dt, 0.03);
          l.vel.x = l.vel.y = 0;
          mexendo = true;
        } else if (Math.abs(l.off.x) > 0.05 || Math.abs(l.off.y) > 0.05 || Math.hypot(l.vel.x, l.vel.y) > 0.5) {
          l.vel.x += (-MOLA * l.off.x - AMORTECE * l.vel.x) * dt;
          l.vel.y += (-MOLA * l.off.y - AMORTECE * l.vel.y) * dt;
          l.off.x += l.vel.x * dt;
          l.off.y += l.vel.y * dt;
          mexendo = true;
        } else {
          l.off.x = l.off.y = l.vel.x = l.vel.y = 0;
        }
        /* o deslocamento vai para o próprio span, por left/top relativos:
           inline continua inline e o kerning do resto do nome não muda */
        const lx = Math.round(l.off.x * 10) / 10, ly = Math.round(l.off.y * 10) / 10;
        l.el.style.left = lx ? lx + 'px' : '';
        l.el.style.top = ly ? ly + 'px' : '';
      });
      const foco = arrastando >= 0 ? arrastando : ponteiro.dentro ? letraEm(ponteiro.x, ponteiro.y) : -1;
      if (foco >= 0) {
        const l = letras[foco];
        const bx1 = l.caixa.x1 + l.off.x - 6, by1 = l.caixa.y1 + l.off.y - 6;
        const bx2 = l.caixa.x2 + l.off.x + 6, by2 = l.caixa.y2 + l.off.y + 6;
        if (moldura.i < 0 || moldura.a < 0.02) Object.assign(moldura, { x1: bx1, y1: by1, x2: bx2, y2: by2 });
        const deslize = foco === arrastando ? 0.02 : 0.08;
        moldura.x1 = aproxima(moldura.x1, bx1, dt, deslize);
        moldura.y1 = aproxima(moldura.y1, by1, dt, deslize);
        moldura.x2 = aproxima(moldura.x2, bx2, dt, deslize);
        moldura.y2 = aproxima(moldura.y2, by2, dt, deslize);
        moldura.i = foco;
      }
      moldura.a = aproxima(moldura.a, foco >= 0 ? 1 : 0, dt, 0.1);
      letras.forEach((l, k) => {
        const alvo = k === foco && k !== arrastando ? 1 : 0;
        l.contorno = aproxima(l.contorno, alvo, dt, 0.09);
        if (Math.abs(l.contorno - alvo) > 0.002) mexendo = true;
        else l.contorno = alvo;
        /* a letra do DOM cede o lugar ao contorno do canvas */
        const op = 1 - l.contorno;
        l.el.style.opacity = op < 0.999 ? op.toFixed(3) : '';
      });
      const novoCursor = arrastando >= 0 ? 'grabbing' : foco >= 0 && ponteiro.dentro ? 'grab' : '';
      if (novoCursor !== cursor) { cursor = novoCursor; n.style.cursor = novoCursor; }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      for (const l of letras) {
        const movida = Math.hypot(l.off.x, l.off.y);
        /* fantasma tracejado no lugar de origem da letra arrastada */
        if (movida > 1) { ctx.globalAlpha = Math.min(1, movida / 24) * 0.55; colar(sprite(l), 0, 0); }
        if (l.contorno > 0.001) { ctx.globalAlpha = l.contorno; colar(sprite(l), l.off.x, l.off.y); }
      }
      ctx.globalAlpha = 1;
      desenharMoldura();
      const assentando = mexendo || (moldura.a > 0.01 && moldura.a < 0.99);
      if (ponteiro.dentro || arrastando >= 0 || assentando || moldura.a > 0.01) raf = requestAnimationFrame(tick);
    }
    function acordar(){
      if (raf) return;
      ultimo = performance.now();
      raf = requestAnimationFrame(tick);
    }
    const ativo = () => document.body.classList.contains('hero-in') && !reduced;
    function local(e){
      const r = canvas.getBoundingClientRect();
      ponteiro.x = e.clientX - r.left;
      ponteiro.y = e.clientY - r.top;
    }
    let medido = false;
    n.addEventListener('pointerenter', e => {
      if (!ativo()) return;
      if (!medido) { medir(); medido = true; }
      local(e); ponteiro.dentro = true; acordar();
    }, { passive: true });
    n.addEventListener('pointermove', e => {
      if (!ativo()) return;
      if (!medido) { medir(); medido = true; }
      local(e); ponteiro.dentro = true; acordar();
    }, { passive: true });
    n.addEventListener('pointerleave', () => {
      if (arrastando >= 0) return;
      ponteiro.dentro = false; acordar();
    }, { passive: true });
    n.addEventListener('pointerdown', e => {
      if (!ativo() || e.button !== 0) return;
      if (!medido) { medir(); medido = true; }
      local(e);
      const i = letraEm(ponteiro.x, ponteiro.y);
      if (i >= 0) {
        arrastando = i;
        pega.x = ponteiro.x - letras[i].off.x;
        pega.y = ponteiro.y - letras[i].off.y;
        try { n.setPointerCapture(e.pointerId); } catch (erro) { /* ponteiro sintético */ }
      }
      acordar();
    });
    const soltar = e => {
      if (arrastando >= 0) {
        arrastando = -1;
        if (n.hasPointerCapture(e.pointerId)) n.releasePointerCapture(e.pointerId);
        const r = n.getBoundingClientRect();
        ponteiro.dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }
      acordar();
    };
    n.addEventListener('pointerup', soltar);
    n.addEventListener('pointercancel', soltar);
    /* remedição pública: fonte que chega, resize e troca de idioma passam por
       medirDeslocamentoNome, que chama isto */
    window.__nomeVetorialRemedir = () => { if (medido) { medir(); acordar(); } };
  }
  montarNomeCinetico();

  const headEl = document.querySelector('header');
  const mainEl = document.querySelector('main');
  const footEl = document.querySelector('footer');
  /* o link de pular para o conteúdo é filho direto do body: fora da lista, o
     Tab escapava do painel de contato para ele */
  const skipEl = document.querySelector('.skip-link');
  function lockBackground(state){
    [headEl, mainEl, footEl, skipEl].forEach(el => { if (el) el.inert = state; });
  }

  aplicarDisponibilidade();
  setLang(detectLang());
  const sincronizarLarguraFechadaDoMenu = () => {
    const pill = document.querySelector('header .ctrl-group');
    const painel = document.getElementById('menu');
    if (pill && painel) {
      const pillRect = pill.getBoundingClientRect();
      painel.style.setProperty('--menu-closed-width', pillRect.width + 'px');
      painel.style.setProperty('--menu-closed-height', pillRect.height + 'px');
    }
  };
  sincronizarLarguraFechadaDoMenu();

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
     Duas etapas somando exatamente 3600ms. Os números saem daqui para o CSS
     via variáveis, então não existe duração escrita duas vezes nem timeout
     solto que possa divergir da animação.
       0 a 1440ms   revelação: máscara da esquerda para a direita, opacidade e
                    blur. O nome fica parado, centrado, em escala maior.
       1440 a 3600  transformação: escala e posição até o lugar da capa.
       ~2790ms      secundários começam a entrar, sobre a cauda do movimento.
     A duração atual é 20% maior que a versão de 3s. Tudo foi escalado junto,
     de modo que a proporção entre revelação (40%) e movimento (60%) e o ponto de
     entrada dos secundários (77,5% da linha) continuam idênticos. Escalar só o
     total mudaria o ritmo interno, não a duração.
     Com o morph ligado (abaixo) só a etapa 1 muda: 0 a 1800ms é o morph,
     1800 a 3960 o mesmo movimento, secundários em 3150. Esses são os números
     da escala 1; hoje tudo passa por RITMO (1,126), e a intro com morph dura
     4460ms: morph até 2027, movimento até 4460, secundários em 3547. */
  /* ===== MORPH NA ETAPA 1 =====
     Com hero.morphFrom preenchido no painel (hoje "trind9de", a marca), a
     revelação deixa de ser máscara e blur e vira o morphing-text do Magic UI:
     a palavra se condensa no centro, segura e se derrete no nome. A etapa 1
     passa a durar o morph inteiro; a etapa 2 continua com os mesmos 2160ms, e
     os secundários entram no mesmo ponto DELA (1350ms depois do começo do
     movimento), então a costura entre nome e secundários não muda.
     Campo vazio ou ausente devolve a intro clássica, sem nenhuma diferença.
     Quem monta o nome é quem lê o dado: o content-render já deixou a home em
     window.__CMS_HOME__ antes deste arquivo rodar. */
  const heroName = document.querySelector('.hero-name');
  const cmsHero = (window.__CMS_HOME__ && window.__CMS_HOME__.hero) || {};
  /* Bilíngue: morphFrom é o português e morphFromEn o inglês; o idioma já
     foi decidido por setLang, que roda antes deste ponto. Inglês ausente cai
     no português, para a intro nunca ficar sem palavra só por um campo. */
  const emIngles = (document.documentElement.lang || 'pt').indexOf('en') === 0;
  const palavraBruta = emIngles && typeof cmsHero.morphFromEn === 'string' && cmsHero.morphFromEn.trim()
    ? cmsHero.morphFromEn : cmsHero.morphFrom;
  const palavraMorph = typeof palavraBruta === 'string'
    ? palavraBruta.replace(/\s+/g, ' ').trim().slice(0, 24) : '';
  const comMorph = !!(heroName && palavraMorph && !reduced);
  /* RITMO escala a intro inteira de uma vez: morph, movimento, entrada dos
     secundários, saída do véu e, pelo --intro-ritmo, as durações dos
     secundários e do indicador escritas no CSS. É o "escale tudo pelo mesmo
     fator" do CLAUDE.md virado número: mudar a duração é mudar só isto, e o
     ritmo interno não se mexe. Hoje 4460/3960, meio segundo a mais que a
     versão de 3,96s com morph, a pedido. Os números abaixo são os da escala 1. */
  const RITMO = 4460 / 3960;
  const ms = v => Math.round(v * RITMO);
  const MORPH = { entrada: ms(420), pausa: ms(300), fusao: ms(1080) };   // 2027ms
  const INTRO = {
    revelacao: comMorph ? MORPH.entrada + MORPH.pausa + MORPH.fusao : ms(1440),
    movimento: ms(2160)
  };
  const INTRO_MS = INTRO.revelacao + INTRO.movimento;   // 4460ms com morph, 4055 na clássica
  const SECUNDARIOS_MS = INTRO.revelacao + ms(1350);    // mesmo ponto do movimento
  const VEU_MS = ms(3240);                              // saída do véu, mesma escala
  const raiz = document.documentElement.style;
  raiz.setProperty('--intro-ritmo', String(RITMO));
  raiz.setProperty('--intro-dur', INTRO_MS + 'ms');
  raiz.setProperty('--intro-reveal', INTRO.revelacao + 'ms');
  raiz.setProperty('--intro-move', INTRO.movimento + 'ms');
  raiz.setProperty('--intro-veil', VEU_MS + 'ms');
  const heroOn = () => document.body.classList.add('hero-in');

  /* O limiar do morph é um filtro SVG: alfa multiplicado por 255 e deslocado
     em -140, o que corta tudo abaixo de ~55% de opacidade num contorno duro.
     Região folgada na vertical porque o blur das camadas passa da caixa do h1,
     que tem line-height .9. */
  function garantirFiltroLimiar(){
    if (document.getElementById('nome-limiar')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'fixed';
    const filtro = document.createElementNS(ns, 'filter');
    filtro.setAttribute('id', 'nome-limiar');
    filtro.setAttribute('x', '-10%');
    filtro.setAttribute('y', '-50%');
    filtro.setAttribute('width', '120%');
    filtro.setAttribute('height', '200%');
    const matriz = document.createElementNS(ns, 'feColorMatrix');
    matriz.setAttribute('in', 'SourceGraphic');
    matriz.setAttribute('type', 'matrix');
    matriz.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 255 -140');
    filtro.appendChild(matriz);
    svg.appendChild(filtro);
    document.body.appendChild(svg);
  }

  /* Prepara o quadro zero do morph. Precisa rodar junto com .intro-mode, antes
     do primeiro quadro: .morfando deixa o h1 em opacidade 1, então o nome e a
     palavra já têm de nascer apagados por estilo próprio. */
  function prepararMorph(){
    garantirFiltroLimiar();
    const linha = heroName.querySelector('.hn-line');
    const mascara = heroName.querySelector('.hn-mask');
    const origem = document.createElement('span');
    origem.className = 'hn-morph';
    origem.setAttribute('aria-hidden', 'true');
    origem.textContent = palavraMorph;
    origem.style.opacity = '0';
    linha.style.opacity = '0';
    mascara.appendChild(origem);
    heroName.classList.add('morfando', 'limiar');
    return { linha, origem };
  }

  /* Curva do morphing-text: a camada que chega tem blur 8/f - 8 (infinito no
     começo, zero no fim) e opacidade f^0,4. Com o limiar, ela só aparece da
     metade em diante, quando o alfa desfocado passa de 55%: é isso que faz a
     letra brotar em vez de acender. */
  function pintarCamada(el, f){
    if (f >= 1) { el.style.filter = ''; el.style.opacity = ''; return; }
    if (f <= 0) { el.style.filter = ''; el.style.opacity = '0'; return; }
    el.style.filter = 'blur(' + Math.min(8 / f - 8, 100).toFixed(2) + 'px)';
    el.style.opacity = Math.pow(f, 0.4).toFixed(3);
  }

  /* Relógio por tempo, não por quadro: se a aba sumir no meio, a volta cai no
     ponto certo. O setTimeout de segurança fecha o morph mesmo que nenhum rAF
     dispare de novo (aba oculta até o fim da intro), para a palavra de origem
     nunca ficar presa por cima do nome. */
  function rodarMorph(camadas){
    const { linha, origem } = camadas;
    const total = INTRO.revelacao;
    let inicio = performance.now(), fim = false;
    const terminar = () => {
      if (fim) return;
      fim = true;
      origem.remove();
      pintarCamada(linha, 1);
      heroName.classList.remove('limiar');
    };
    const quadro = agora => {
      if (fim) return;
      const t = Math.max(0, agora - inicio);
      if (t >= total) { terminar(); return; }
      if (t < MORPH.entrada) {
        pintarCamada(origem, t / MORPH.entrada);
        pintarCamada(linha, 0);
      } else if (t < MORPH.entrada + MORPH.pausa) {
        pintarCamada(origem, 1);
        pintarCamada(linha, 0);
      } else {
        const g = (t - MORPH.entrada - MORPH.pausa) / MORPH.fusao;
        pintarCamada(origem, 1 - g);
        pintarCamada(linha, g);
      }
      requestAnimationFrame(quadro);
    };
    /* primeiro quadro pintado já neste callback, o mesmo que liga .name-in:
       morph e etapa 2 (pelo delay de --intro-reveal) partem do mesmo instante */
    quadro(inicio);
    setTimeout(terminar, total + 120);
  }

  if (!heroName) {
    heroOn();                                   // páginas de case
  } else if (reduced) {
    heroOn();                                   // movimento reduzido: direto ao conteúdo
  } else {
    document.body.classList.add('intro-mode');
    const camadasMorph = comMorph ? prepararMorph() : null;

    const rodarIntro = () => {
      /* Última medição antes de a animação existir. O deslocamento vertical do
         nome depende da altura real do bloco, e a fonte própria tem métrica
         diferente da de sistema: medir antes dela chegar deixava o nome uns
         10px fora do centro no primeiro quadro da intro. */
      medirDeslocamentoNome();
      requestAnimationFrame(() => {
        document.body.classList.add('name-in');
        if (camadasMorph) rodarMorph(camadasMorph);
      });
      /* secundários só na parte final da etapa 2: nada aparece durante a
         revelação, e eles entram sobre a cauda do movimento do nome */
      setTimeout(() => document.body.classList.add('hero-sec'), SECUNDARIOS_MS);
      /* o nome usa a intro inteira; ao chegar aqui já está em escala 1 e
         opacidade 1, e o véu começa a sair sobre um quadro idêntico ao da capa */
      setTimeout(heroOn, INTRO_MS);
      /* e o nome volta ao empilhamento normal depois que o véu terminou de sair.
         A folga acompanha a saída mais longa do véu, senão o empilhamento muda
         no meio do fundido e a troca aparece como um corte */
      setTimeout(() => {
        document.body.classList.remove('intro-mode');
        heroName.classList.remove('morfando');
      }, INTRO_MS + VEU_MS + 100);
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
  /* ---- currículo do Sobre: botão que abre o menu de idioma ----
     Clique abre e fecha; Esc, clique fora ou a escolha de um idioma fecham.
     aria-expanded acompanha o estado. Ao abrir pelo teclado, o foco vai para
     a primeira opção com arquivo; pelo mouse, o foco fica onde o navegador
     deixar, sem anel. */
  document.querySelectorAll('.cta-resume').forEach(grupo => {
    const botao = grupo.querySelector('.cta-resume-btn');
    const menu = grupo.querySelector('.cta-resume-menu');
    if (!botao || !menu) return;
    const abrir = sim => {
      grupo.classList.toggle('aberto', sim);
      botao.setAttribute('aria-expanded', String(sim));
    };
    botao.addEventListener('click', e => {
      e.stopPropagation();
      const sim = !grupo.classList.contains('aberto');
      abrir(sim);
      if (sim && e.detail === 0) {
        const primeira = menu.querySelector('.cta-resume-opt[href]');
        if (primeira) primeira.focus();
      }
    });
    document.addEventListener('click', e => { if (!grupo.contains(e.target)) abrir(false); });
    grupo.addEventListener('keydown', e => {
      if (e.key === 'Escape' && grupo.classList.contains('aberto')) { abrir(false); botao.focus(); }
    });
    menu.addEventListener('click', e => { if (e.target.closest('.cta-resume-opt[href]')) abrir(false); });
  });

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
  let lastFocused = null, modalOpen = false, menuCloseTimer = 0, menuVisualVersion = 0;
  /* Leitor de tela precisa saber que o botão Menu controla o painel e se ele
     está aberto. Function declaration de propósito: é içada, então vale mesmo
     se algo chamar openOverlay antes desta linha ser avaliada. */
  function sincronizarMenuExpandido(aberto){
    document.querySelectorAll('[data-menu]').forEach(b => {
      b.setAttribute('aria-controls', 'menu');
      b.setAttribute('aria-expanded', String(aberto));
    });
  }
  sincronizarMenuExpandido(false);
  function openOverlay(el, modal = true){
    clearTimeout(menuCloseTimer);
    menuVisualVersion++;
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    /* O painel nasce com o tema que o header estava usando sobre a seção
       atual. Só depois o header é congelado no escuro. Sem guardar este estado,
       abrir o menu sobre o FAQ claro produzia vidro claro com texto branco. */
    if (el === menu) {
      el.setAttribute('data-theme', headEl.getAttribute('data-theme') || 'dark');
      /* A expansão começa na largura REAL da pílula. Ela muda conforme a
         disponibilidade está visível ou oculta e conforme o idioma; número
         fixo faria o painel saltar lateralmente antes de começar a crescer. */
      const pill = document.querySelector('header .ctrl-group');
      if (pill) {
        const pillRect = pill.getBoundingClientRect();
        el.style.setProperty('--menu-closed-width', pillRect.width + 'px');
        el.style.setProperty('--menu-closed-height', pillRect.height + 'px');
      }
    }
    el.classList.add('open');
    sincronizarMenuExpandido(el === menu);
    document.body.classList.toggle('menu-open', el === menu);
    modalOpen = modal;
    if (window.__travarTemaHeader) window.__travarTemaHeader(true);
    if (!modal) return;
    lastFocused = document.activeElement;
    document.body.classList.add('locked');
    lockBackground(true);
    const focusTarget = el.querySelector('.overlay-x, .menu-item:not([hidden]), input, button, a');
    if (focusTarget) focusTarget.focus();
  }
  function closeOverlays(){
    const wasOpen = document.querySelector('.overlay.open');
    const menuClosing = !!(menu && menu.classList.contains('open') && menu.classList.contains('dropdown'));
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    sincronizarMenuExpandido(false);
    document.body.classList.remove('locked');
    /* No dropdown, a pílula fechada só volta depois que o painel terminou de
       desaparecer. Não usamos transitionend aqui: o sheet anima três
       propriedades e o primeiro evento podia liberar a pílula cedo demais,
       deixando por um quadro a impressão de uma cópia sob o painel. */
    if (menuClosing) {
      clearTimeout(menuCloseTimer);
      const closeVersion = ++menuVisualVersion;
      const liberarPill = () => {
        if (closeVersion === menuVisualVersion && !menu.classList.contains('open')) {
          document.body.classList.remove('menu-open');
        }
      };
      /* --dur-slow = 1000ms. A margem mínima deixa visibility:hidden ser
         aplicada primeiro sem criar uma pausa perceptível entre as peças. */
      menuCloseTimer = setTimeout(liberarPill, 1010);
    } else {
      document.body.classList.remove('menu-open');
    }
    lockBackground(false);
    if (window.__travarTemaHeader) window.__travarTemaHeader(false);
    /* devolver o foco só faz sentido se ele tiver sido movido na abertura */
    if (wasOpen && modalOpen && lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    modalOpen = false;
  }

  const menu = document.getElementById('menu');
  const contactPanel = document.getElementById('contact-panel');
  /* Âncoras conhecidas continuam com a cadência longa que já faz parte do
     site. O motor adaptativo usa este destino para não confundir uma navegação
     intencional com um salto direto da barra ou do teclado. Sem smooth scroll,
     continua sendo apenas window.scrollTo normal. */
  let destinoScrollProgramatico = null;
  const rolarProgramaticamente = y => {
    destinoScrollProgramatico = y;
    window.scrollTo(0, y);
  };
  const cancelarScrollProgramatico = () => { destinoScrollProgramatico = null; };
  const teclasScrollNativo = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
  window.addEventListener('wheel', cancelarScrollProgramatico, { passive: true });
  window.addEventListener('touchstart', cancelarScrollProgramatico, { passive: true });
  window.addEventListener('pointerdown', cancelarScrollProgramatico, { passive: true });
  document.addEventListener('keydown', e => {
    if (teclasScrollNativo.includes(e.key)) cancelarScrollProgramatico();
  });

  /* Bloqueio da foto do Sobre: nada de menu de contexto (abrir em nova aba,
     salvar, pesquisar imagem) nem arraste sobre ela. Delegado no documento
     porque o crachá move o retrato para dentro do cartão depois de montar;
     a .about-photo continua sendo a ancestral nos dois casos. O CSS já tira
     o ponteiro da <img>; isto cobre o resto da área. */
  ['contextmenu', 'dragstart'].forEach(tipo => {
    document.addEventListener(tipo, e => {
      if (e.target.closest && e.target.closest('.about-photo')) e.preventDefault();
    });
  });

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
      rolarProgramaticamente(0);
      return;
    }
    if (openMenu && menuLigado) {
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
     atravessar o vão sem piscar. Com o menu desligado (menuLigado), nada
     disso é armado. */
  if (fine && menuLigado) {
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

  /* ===== ENVIO DO FORMULÁRIO DE CONTATO =====
     Antes isto montava um `mailto:` e trocava location.href. Funcionava, mas
     não era o que a interface prometia: o botão dizia "Enviar" e o que
     acontecia era o cliente de e-mail do visitante abrir com um rascunho —
     que ele ainda precisava enviar. Quem não tem cliente configurado (a maior
     parte de quem usa webmail no celular) via uma tela em branco ou nada, e
     ia embora achando que tinha enviado.
     Agora o envio é de verdade, por POST para o Worker público em
     worker-contact/, que entrega no contact@ pelo Resend.

     O caminho é relativo de propósito: a rota mora no mesmo domínio do site
     (ver worker-contact/wrangler.toml), então a chamada é same-origin e não
     existe CORS nem preflight para manter. */
  /* Em produção o caminho é relativo e a rota mora no mesmo domínio. Em
     desenvolvimento o site roda na 5500 (servidor estático) e o Worker na
     8788, então sem esta ponte o formulário falharia sempre na máquina local e
     não haveria como testar o caminho de sucesso. A troca vale só em
     localhost; qualquer outro domínio usa o caminho relativo. */
  const emDesenvolvimento = ['localhost', '127.0.0.1'].indexOf(location.hostname) !== -1;
  const CONTATO_ENDPOINT = emDesenvolvimento
    ? 'http://localhost:8788/api/contact'
    : '/api/contact';

  /* O idioma corrente é lido do <html lang>, que setLang mantém atualizado, e
     não de uma variável própria: uma segunda fonte de verdade sairia de sincronia
     no primeiro lugar que esquecesse de atualizá-la. */
  const idiomaAtual = () => document.documentElement.lang.startsWith('en') ? 'en' : 'pt';

  const cform = document.getElementById('cform');
  const cformStatus = document.querySelector('.cform-status');
  const cformBtn = cform.querySelector('.cform-submit');
  /* Quando o painel foi montado. Vira "segundos de preenchimento" no envio, e
     o Worker usa isso para descartar submissão instantânea, que é robô. */
  const cformNasceuEm = Date.now();

  function dizerStatus(pt, en, tom) {
    if (!cformStatus) return;
    cformStatus.hidden = false;
    cformStatus.setAttribute('data-pt', pt);
    cformStatus.setAttribute('data-en', en);
    cformStatus.textContent = idiomaAtual() === 'en' ? en : pt;
    if (tom) cformStatus.setAttribute('data-tom', tom);
    else cformStatus.removeAttribute('data-tom');
  }

  cform.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (cformBtn.disabled) return;             /* clique duplo não manda duas vezes */

    const dados = {
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      message: f.message.value.trim(),
      website: f.website ? f.website.value : '',
      elapsed: (Date.now() - cformNasceuEm) / 1000
    };

    cformBtn.disabled = true;
    const rotuloPt = cformBtn.getAttribute('data-pt');
    const rotuloEn = cformBtn.getAttribute('data-en');
    cformBtn.setAttribute('data-pt', 'Enviando…');
    cformBtn.setAttribute('data-en', 'Sending…');
    cformBtn.textContent = idiomaAtual() === 'en' ? 'Sending…' : 'Enviando…';
    dizerStatus('', '', null);
    cformStatus.hidden = true;

    /* Devolve o botão ao estado normal. Precisa restaurar os data-pt/data-en
       junto do texto, senão trocar de idioma depois de um envio traria de
       volta o "Enviando…" que ficou gravado no atributo. */
    const restaurarBotao = () => {
      cformBtn.disabled = false;
      cformBtn.setAttribute('data-pt', rotuloPt);
      cformBtn.setAttribute('data-en', rotuloEn);
      cformBtn.textContent = idiomaAtual() === 'en' ? rotuloEn : rotuloPt;
    };

    try {
      const resposta = await fetch(CONTATO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });
      const corpo = await resposta.json().catch(() => ({}));

      if (resposta.ok && corpo.ok) {
        /* O formulário some e fica só a confirmação: deixar os campos
           preenchidos na tela convida a mandar de novo achando que não foi. */
        f.reset();
        dizerStatus('Mensagem enviada. Respondo em breve.',
                    'Message sent. I will reply soon.', null);
        restaurarBotao();
        return;
      }

      /* 422 é erro de preenchimento e vem com uma frase útil do Worker; o
         resto é falha nossa, e nesse caso o que a pessoa precisa é do caminho
         alternativo, não de um código de erro. */
      /* O Worker só escreve em português: quem navega em inglês recebia
         "Confira o e-mail digitado." Pelo código do erro, cada idioma tem a
         sua frase; um código desconhecido usa a do Worker, como antes. */
      const ERROS_422 = {
        invalid_name: ['Preencha o nome.', 'Please enter your name.'],
        invalid_email: ['Confira o e-mail digitado.', 'Please check your email address.'],
        invalid_message: ['Escreva a mensagem.', 'Please write your message.']
      };
      if (resposta.status === 422 && (ERROS_422[corpo.error] || corpo.message)) {
        const frase = ERROS_422[corpo.error] || [corpo.message, corpo.message];
        dizerStatus(frase[0], frase[1], 'erro');
      } else {
        dizerStatus('Não consegui enviar agora. Escreva direto no e-mail abaixo.',
                    'Could not send right now. Please use the email below.', 'erro');
      }
      restaurarBotao();
    } catch (err) {
      /* Sem rede, ou o endpoint fora do ar. Mesmo tratamento: a saída é o
         e-mail direto, que está logo abaixo e agora tem destaque. */
      dizerStatus('Não consegui enviar agora. Escreva direto no e-mail abaixo.',
                  'Could not send right now. Please use the email below.', 'erro');
      restaurarBotao();
    }
  });

  /* ---- page transitions ---- */
  const veil = document.querySelector('.veil');
  requestAnimationFrame(() => document.body.classList.add('ready'));

  if (!reduced) {
    document.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      /* Ctrl/Cmd/Shift-clique e botão do meio abrem em outra aba ou janela:
         com o véu no meio, a aba atual navegava no lugar da nova */
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.hasAttribute('download')) return;
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
    /* O tÃ­tulo do case precisa liberar a leitura quase imediatamente. MantÃ©m
       a entrada por palavras que jÃ¡ existe, mas com uma cauda curta e limitada;
       os destaques da Home preservam a coreografia original. */
    const tituloDeCase = !!el.closest('.case-hero');
    const passo = tituloDeCase ? 36 : PALAVRA_PASSO;
    const teto = tituloDeCase ? 4 : PALAVRA_TETO;
    el.querySelectorAll('.rv-w').forEach((w, i) => {
      w.style.transitionDelay = Math.min(i, teto) * passo + 'ms';
    });
  };

  const entrar = el => {
    if (el.matches('.case-gallery .thumb')) {
      const indice = [...el.parentElement.children].indexOf(el);
      /* 0/50/100ms e depois estabiliza: galerias longas nÃ£o criam uma cauda
         crescente que atrasa imagens no mesmo campo visual. */
      el.style.setProperty('--d', Math.min(indice, 2) * 50 + 'ms');
      el.classList.add('in');
      return;
    }
    if (el.dataset.reveal === 'words') {
      aplicarAtrasoPalavras(el);
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
    alvos = [...document.querySelectorAll('.reveal,.mask-reveal,.help-item,.stat')]
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

  /* ---- copiar e-mail (painel de contato) ----
     Mesmo comportamento do botão do rodapé (initFooterCopy, em
     content-render.js): Clipboard API com fallback de textarea+execCommand
     para file:// e contextos sem a API, ícone trocado por opacidade e aviso
     posicionado em absoluto para não empurrar o link ao aparecer. Duplicado
     em vez de importado porque o painel de contato é montado aqui mesmo, e
     content-render.js não expõe a função para outro módulo chamar. */
  const copyBtn = document.querySelector('.cform-direct-copy');
  if (copyBtn) {
    const flash = document.querySelector('.cform-direct-copy-status');
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
      if (flash) flash.textContent = ok ? (pt ? 'Copiado' : 'Copied')
                                        : (pt ? 'Selecione e copie' : 'Select and copy');
      copyBtn.classList.toggle('done', ok);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        copyBtn.classList.remove('done');
        if (flash) flash.textContent = '';
      }, 2100);
    });
  }

  /* ================== UM ÚNICO LAÇO DE SCROLL ==================
     Header, inversão sobre a faixa clara e scrub dividem o mesmo frame.
     Listeners separados brigavam pelo mesmo tick e liam layout três vezes. */
  let scrubWords = [], wordTops = [], litCount = 0;
  let lastY = window.scrollY, queued = false, headHidden = false;
  let headDirecao = 0, headPercurso = 0;

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
  /* O dither do rodapé ([data-footer-dither]) e o do Sobre
     ([data-sobre-dither]) entram na mesma conta: o dither-field.js observa o
     .parado do host e para o laço de WebGL fora do alcance, sem precisar de
     IntersectionObserver nem de um segundo listener.

     E o .edge-blur se apaga no fim da página quando o rodapé é dither. O
     desfoque existe para o conteúdo se dissolver na borda enquanto rola; no
     fim não há mais nada para rolar, e ele só borrava os pontos do horizonte,
     que moram justamente na faixa de baixo e precisam de borda nítida. A
     opacidade acompanha a última altura do desfoque de rolagem, sem salto. */
  let fundos = [];
  const bordaEl = document.querySelector('.edge-blur');
  let fimDither = null, alturaBorda = 0, opacBorda = -1, chaveSobre = '';
  /* Tom e névoa do Sobre sobem para o respiro vazio de Trabalhos (a entrada
     longa que apaga a linha onde o dither começava) e descem por "O que eu
     faço" inteiro, que tem o mesmo fundo. As distâncias mudam com a largura
     e a altura da tela (#help é 100svh com o conteúdo centrado), então são
     medidas aqui, antes dos fundos, para o host do dither já entrar na conta
     com a altura nova. Diferenças entre retângulos do mesmo conteúdo: o
     transform do .smooth-holder não as altera. O CSS (.about-fundo,
     .about-pontos e filhos) explica cada variável. */
  const medirExtensaoDoSobre = () => {
    const sobre = document.querySelector('.about-break');
    if (!sobre) return;
    const caixa = el => el ? el.getBoundingClientRect() : null;
    const recuoBase = el => parseFloat(getComputedStyle(el).paddingBottom) || 0;
    const rs = sobre.getBoundingClientRect();
    const trabalhos = document.querySelector('#work:not([hidden])');
    const rt = caixa(trabalhos);
    const subida = rt && rt.height ? Math.max(0, Math.round(rs.top - (rt.bottom - recuoBase(trabalhos) + 24))) : 0;
    const ajuda = document.querySelector('#help:not([hidden])');
    const cab = ajuda && ajuda.querySelector('.help-head');
    const lista = ajuda && ajuda.querySelector('.help-list');
    const grade = sobre.querySelector('.about-grid');
    let descida = 0, trocaIni = 99999, trocaFim = 99999, baseAjuda = 0;
    if (ajuda && cab) {
      const ra = ajuda.getBoundingClientRect();
      descida = Math.max(0, Math.round(ra.bottom - rs.bottom));
      const fimSobre = grade ? grade.getBoundingClientRect().bottom : rs.bottom - recuoBase(sobre);
      trocaFim = Math.round(subida + cab.getBoundingClientRect().top - 24 - rs.top);
      trocaIni = Math.min(Math.round(subida + fimSobre - rs.top), trocaFim - 40);
      baseAjuda = lista ? Math.max(0, Math.round(ra.bottom - lista.getBoundingClientRect().bottom)) : 0;
    }
    const chave = [subida, descida, trocaIni, trocaFim, baseAjuda].join();
    if (chave === chaveSobre) return;
    chaveSobre = chave;
    sobre.style.setProperty('--sobre-subida', subida + 'px');
    sobre.style.setProperty('--sobre-descida', descida + 'px');
    sobre.style.setProperty('--sobre-troca-ini', trocaIni + 'px');
    sobre.style.setProperty('--sobre-troca-fim', trocaFim + 'px');
    sobre.style.setProperty('--sobre-help-base', baseAjuda + 'px');
  };
  const medirFundos = () => {
    medirExtensaoDoSobre();
    fundos = [...document.querySelectorAll('.liquid-bg,[data-footer-dither],[data-sobre-dither],.about-photo')].map(el => {
      const r = el.getBoundingClientRect();
      return { el, topo: r.top + posVisual, base: r.bottom + posVisual, ativo: null };
    });
    const rodapeDither = document.querySelector('.site-footer.is-dither');
    fimDither = rodapeDither ? rodapeDither.getBoundingClientRect().bottom + posVisual : null;
    alturaBorda = bordaEl ? bordaEl.offsetHeight : 0;
    if (fimDither === null && bordaEl && opacBorda !== -1) {
      bordaEl.style.removeProperty('opacity');
      opacBorda = -1;
    }
  };
  const pintarFundos = y => {
    if (fimDither !== null && bordaEl && alturaBorda) {
      /* conta pelo fim real da rolagem, não pela base medida do rodapé: as
         duas diferem em alguns pixels e o desfoque parava em 11% sem sumir */
      const falta = document.documentElement.scrollHeight - window.innerHeight - y;
      const op = Math.round(Math.max(0, Math.min(1, falta / alturaBorda)) * 100) / 100;
      if (op !== opacBorda) { opacBorda = op; bordaEl.style.opacity = String(op); }
    }
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
  const grainEl = document.querySelector('.grain');
  let grainAssinatura = '';
  const pintarGrain = id => {
    if (!grainEl) return;
    let origem = document.documentElement;
    if (!base && id) {
      if (id === 'top') origem = document.querySelector('.hero');
      else if (id === 'about') origem = document.querySelector('#about .about-break');
      else origem = document.getElementById(id);
    }
    const ligado = !grainDiagnosticOff && (base
      ? document.documentElement.getAttribute('data-grain-page') !== 'false'
      : !!origem && origem.getAttribute('data-grain-enabled') !== 'false');
    const opacidade = base
      ? (document.documentElement.getAttribute('data-grain-page-opacity') || getComputedStyle(document.documentElement).getPropertyValue('--grain-opacity').trim())
      : ((origem && origem.getAttribute('data-grain-opacity')) || getComputedStyle(document.documentElement).getPropertyValue('--grain-opacity').trim());
    const assinatura = String(ligado) + '|' + opacidade;
    if (assinatura === grainAssinatura) return;
    grainAssinatura = assinatura;
    grainEl.classList.toggle('is-off', !ligado);
    if (opacidade) grainEl.style.setProperty('--grain-current-opacity', opacidade);
  };

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
    if (!alvosSpy.length) { pintarGrain(null); return; }
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
    pintarGrain(atual);
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
    const noFimDaPagina = y + window.innerHeight >= document.documentElement.scrollHeight - 2;

    /* A posição visual avança em passos fracionários enquanto alcança o scroll
       real. Usar somente `y > lastY` fazia qualquer inversão mínima da cauda
       alternar visible/hidden em quadros consecutivos. Agora a direção precisa
       permanecer e percorrer uma fração da própria altura do header antes de
       trocar o estado. O limiar de .1px só descarta a cauda subvisual, logo
       acima do EPSILON (.08px) usado pelo smooth scroll; não muda sua curva. */
    const deltaHead = y - lastY;
    lastY = y;
    const menuEstavel = document.body.classList.contains('menu-open');
    if (menuEstavel) {
      headDirecao = 0;
      headPercurso = 0;
    } else if (y <= 200) {
      headDirecao = 0;
      headPercurso = 0;
      if (headHidden) {
        headHidden = false;
        headEl.classList.remove('is-hidden');
      }
    } else if (Math.abs(deltaHead) >= .1) {
      const direcao = deltaHead > 0 ? 1 : -1;
      if (direcao !== headDirecao) {
        headDirecao = direcao;
        headPercurso = 0;
      }
      const esconder = direcao > 0;
      if (esconder !== headHidden) {
        headPercurso += Math.abs(deltaHead);
        const limiar = Math.max(8, headAltura * (esconder ? .16 : .1));
        if (headPercurso >= limiar) {
          headHidden = esconder;
          headPercurso = 0;
          headEl.classList.toggle('is-hidden', esconder);
        }
      } else {
        headPercurso = 0;
      }
    }
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
    /* com rolagem suave, o resize do próprio laço (medir) já faz estas cinco
       medidas: repetidas aqui, cada resize remedia a página duas vezes */
    if (!suavizando) {
      if (scrubWords.length) measureWords();
      medirAlvos();
      medirFundos();
      medirClaros();
      medirSpy();
    }
    medirDeslocamentoNome();
    onScroll();
  }, { passive: true });
  /* a fonte chega depois do primeiro layout e muda a altura do bloco */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(medirDeslocamentoNome);

  if (!reduced && !flag('noscrub')) {
    buildScrub = () => {
      document.querySelectorAll('.about-lead, .case-section p').forEach(p => {
        p.classList.add('scrub');
        /* Preserva inclusive quebras editoriais digitadas no CMS. O scrub
           anterior juntava tudo com espaço e apagava cada Enter do texto. */
        const texto = p.textContent.trim();
        const frag = document.createDocumentFragment();
        texto.split(/(\s+)/).forEach(parte => {
          if (!parte) return;
          if (/^\s+$/.test(parte)) { frag.appendChild(document.createTextNode(parte)); return; }
          const span = document.createElement('span');
          span.className = 'w';
          span.textContent = parte;
          frag.appendChild(span);
        });
        p.textContent = '';
        p.appendChild(frag);
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
    /* LERP_60 é a resposta equivalente por quadro a 60Hz. O alpha aplicado
       abaixo deriva do tempo real entre frames, então 90/120/144Hz percorrem
       a mesma proporção no mesmo intervalo. O valor segue ajustável sem editar
       arquivo pela chave de diagnóstico existente: ?lerp=0.08.
       .047 e não .04: Pedro achou a rolagem pesada e pediu 15% menos efeito.
       A constante de tempo do atraso é -1/(60·ln(1-lerp)): com .04 dava ~0,41s,
       com .047 dá ~0,35s, exatamente 15% mais curta. Mesmo caráter, menos peso. */
    const LERP_60 = Math.min(.4, Math.max(.02,
      parseFloat(new URLSearchParams(location.search).get('lerp')) || .047));
    const LERP_CATCHUP_60 = Math.max(LERP_60, .32);
    const DT_MAX = 1 / 30;
    const EPSILON = .08;

    suavizando = true;
    const holder = document.createElement('div');
    holder.className = 'smooth-holder';
    const mainEl = document.querySelector('main');
    const footEl = document.querySelector('footer');
    mainEl.parentNode.insertBefore(holder, mainEl);
    holder.appendChild(mainEl);
    if (footEl) holder.appendChild(footEl);
    document.documentElement.classList.add('smooth');

    let curr = window.scrollY, raf = 0, altura = 0, ultimoFrame = 0;
    let lerpCatchupAtual = LERP_60;

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
      /* measureWords apaga as palavras acesas e só a rolagem as reacendia: uma
         imagem carregando mais abaixo (o holder muda de altura) deixava o
         parágrafo lido apagado até o próximo movimento */
      if (scrubWords.length) readScroll();
    };

    const aplicar = agora => {
      const alvo = window.scrollY;
      const diferenca = alvo - curr;
      const distancia = Math.abs(diferenca);
      const intencional = destinoScrollProgramatico !== null;

      /* Um frame inicial equivale a 60Hz. Depois disso, o dt é limitado a 33ms:
         voltar de uma aba em background ou de uma pausa do DevTools não injeta
         um passo matemático enorme no primeiro quadro. */
      const dt = ultimoFrame
        ? Math.min(DT_MAX, Math.max(0, (agora - ultimoFrame) / 1000))
        : 1 / 60;
      ultimoFrame = agora;

      /* Até meia viewport, preserva o caráter do lerp antigo a 60Hz. Entre meia
         e duas viewports, acelera continuamente por smoothstep e conserva o
         catch-up conquistado até alinhar, evitando uma cauda lenta no fim de
         Page Up/Down ou clique na track. A partir de 2,5 viewports, saltos
         diretos como scrollbar e Home/End alinham no mesmo quadro. Âncoras
         intencionais ficam fora dessa adaptação. */
      const vh = Math.max(1, window.innerHeight);
      const inicioCatchup = vh * .5;
      const fimCatchup = vh * 2;
      const sincronizar = !intencional && distancia >= vh * 2.5;

      if (sincronizar) {
        curr = alvo;
        lerpCatchupAtual = LERP_60;
      } else {
        let lerp60 = LERP_60;
        if (!intencional && distancia > inicioCatchup) {
          const t = Math.min(1, (distancia - inicioCatchup) / (fimCatchup - inicioCatchup));
          const suave = t * t * (3 - 2 * t);
          lerpCatchupAtual = Math.max(lerpCatchupAtual,
            LERP_60 + (LERP_CATCHUP_60 - LERP_60) * suave);
        }
        if (!intencional) lerp60 = lerpCatchupAtual;
        const alpha = 1 - Math.pow(1 - lerp60, dt * 60);
        curr += diferenca * alpha;
      }

      if (Math.abs(alvo - curr) < EPSILON) curr = alvo;
      /* arredonda para pixel inteiro: posição fracionária obriga o navegador a
         rasterizar o texto de novo a cada quadro e produz tremor */
      holder.style.transform = 'translate3d(0,' + (-Math.round(curr * 100) / 100) + 'px,0)';
      posVisual = curr;
      readScroll();
      if (curr === alvo) {
        raf = 0;
        ultimoFrame = 0;
        lerpCatchupAtual = LERP_60;
        if (intencional && Math.abs(alvo - destinoScrollProgramatico) < 1) {
          destinoScrollProgramatico = null;
        }
      } else {
        raf = requestAnimationFrame(aplicar);
      }
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
      rolarProgramaticamente(Math.max(0, Math.min(pos, limite)));
      /* o salto nativo levaria o foco junto (o main tem tabindex="-1"); com o
         preventDefault, o "pular para o conteúdo" deixava o foco no próprio link */
      if (alvo.hasAttribute('tabindex')) alvo.focus({ preventScroll: true });
    });

    medir();
    /* Chegando com âncora na URL (/#work, vindo do breadcrumb ou do rodapé de
       um case): o conteúdo foi para dentro do holder fixo antes de o navegador
       tratar o fragmento, e ele não rola até um alvo dentro de um container
       fixo. Sem isto a página abria no topo. Mesma conta do clique em âncora,
       mas instantânea, como o salto nativo do toque e do ?nosmooth=1. Refeita
       quando a fonte chega e muda as alturas, se a pessoa ainda não rolou. */
    let posDaAncora = null;
    const irParaAncora = () => {
      let alvo = null;
      try { alvo = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; } catch (erro) { alvo = null; }
      if (!alvo || !holder.contains(alvo)) return;
      if (posDaAncora !== null && Math.abs(window.scrollY - posDaAncora) > 1) return;
      const recuo = alvo.id === 'top' ? 0 : (parseFloat(getComputedStyle(alvo).scrollMarginTop) || 0);
      const pos = Math.max(0, Math.min(alvo.getBoundingClientRect().top + curr - recuo, altura - window.innerHeight));
      window.scrollTo(0, pos);
      posDaAncora = window.scrollY;
      curr = posDaAncora;
      posVisual = curr;
      holder.style.transform = 'translate3d(0,' + (-Math.round(curr * 100) / 100) + 'px,0)';
      readScroll();
    };
    irParaAncora();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { medir(); irParaAncora(); });
    window.addEventListener('load', irParaAncora, { once: true });
    window.addEventListener('resize', () => {
      medir();
      /* Resize pode limitar window.scrollY ao novo fim do documento. Sincroniza
         a representação visual nesse evento raro para não carregar uma grande
         divergência para o primeiro scroll após a mudança de viewport. */
      curr = window.scrollY;
      posVisual = curr;
      destinoScrollProgramatico = null;
      ultimoFrame = 0;
      lerpCatchupAtual = LERP_60;
      holder.style.transform = 'translate3d(0,' + (-Math.round(curr * 100) / 100) + 'px,0)';
      readScroll();
    }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(medir).observe(holder);
    acordar();
  } else if (window.ResizeObserver && document.querySelector('main')) {
    /* Sem o .smooth-holder (toque, ?nosmooth=1) ninguém remedia as posições
       quando uma imagem carrega e uma galeria adaptativa muda de altura. Os
       blocos de baixo guardavam o topo antigo e só entravam centenas de pixels
       depois de já estarem na tela, deixando o espaço em branco. O ramo suave
       resolve isso com o observador do holder; aqui o papel é do <main>. */
    new ResizeObserver(() => {
      if (scrubWords.length) measureWords();
      medirAlvos();
      medirFundos();
      medirClaros();
      medirSpy();
      readScroll();
    }).observe(document.querySelector('main'));
  }

  /* ================== CURSOR ORB OPCIONAL ==================
     A implementação visual recupera o núcleo e o glow de 7be0c81, mas sem os
     rastros, rótulo de card ou canvas adicionados naquela evolução. O modo
     ausente é nativo; nesse estado não existem elementos, listeners ou rAF. */
  let modoCursorSelecionado = null;
  let destruirCursorOrb = null;

  const modoCursorGlobal = () => {
    const effects = window.__CMS_GLOBAL__ && window.__CMS_GLOBAL__.effects;
    return effects && effects.cursor && effects.cursor.mode === 'orb' ? 'orb' : 'native';
  };

  const criarCursorOrb = () => {
    const podeCursor = window.matchMedia('(pointer: fine) and (hover: hover)').matches;
    if (!podeCursor || reduced) return null;

    const camada = document.createElement('div');
    camada.className = 'cursor-orb-layer';
    camada.setAttribute('aria-hidden', 'true');
    const ponto = document.createElement('div');
    ponto.className = 'cursor-orb-dot';
    camada.appendChild(ponto);

    const glow = document.createElement('div');
    glow.className = 'cursor-orb-glow';
    glow.setAttribute('aria-hidden', 'true');

    document.body.appendChild(glow);
    document.body.appendChild(camada);
    document.documentElement.classList.add('has-custom-cursor');

    const eventos = new AbortController();
    let alvoX = innerWidth / 2;
    let alvoY = innerHeight / 2;
    let x = alvoX;
    let y = alvoY;
    let rafId = 0;
    let primeiraAmostra = true;
    const LERP = .22;

    const escrever = () => {
      ponto.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    };
    const acordar = () => {
      if (!rafId) rafId = requestAnimationFrame(laco);
    };
    const laco = () => {
      rafId = 0;
      x += (alvoX - x) * LERP;
      y += (alvoY - y) * LERP;
      escrever();
      if (Math.abs(alvoX - x) >= .1 || Math.abs(alvoY - y) >= .1) acordar();
    };

    document.addEventListener('mousemove', e => {
      alvoX = e.clientX;
      alvoY = e.clientY;
      glow.style.setProperty('--mx', alvoX + 'px');
      glow.style.setProperty('--my', alvoY + 'px');
      glow.classList.add('on');
      camada.classList.add('on');
      if (primeiraAmostra) {
        primeiraAmostra = false;
        x = alvoX;
        y = alvoY;
        escrever();
      } else {
        acordar();
      }
    }, { passive: true, signal: eventos.signal });

    document.addEventListener('mouseleave', () => {
      primeiraAmostra = true;
      camada.classList.remove('on');
      glow.classList.remove('on');
    }, { signal: eventos.signal });

    return () => {
      eventos.abort();
      if (rafId) cancelAnimationFrame(rafId);
      camada.remove();
      glow.remove();
      document.documentElement.classList.remove('has-custom-cursor');
    };
  };

  const aplicarModoCursor = modo => {
    const proximo = modo === 'orb' ? 'orb' : 'native';
    if (proximo === modoCursorSelecionado) return;
    if (destruirCursorOrb) destruirCursorOrb();
    destruirCursorOrb = null;
    modoCursorSelecionado = proximo;
    if (proximo === 'orb') destruirCursorOrb = criarCursorOrb();
  };

  window.__CMS_APPLY_CURSOR__ = aplicarModoCursor;
  aplicarModoCursor(modoCursorGlobal());

  /* "Ver projeto" volta como um selo independente do modo de cursor. O
     mousemove só existe enquanto um card está realmente sob o ponteiro; a
     delegação mantém o comportamento depois que o CMS reconstrói a grade. */
  const podeSeloDeProjeto = window.matchMedia('(pointer: fine) and (hover: hover)').matches;
  if (podeSeloDeProjeto && !reduced && document.querySelector('.cards .card')) {
    const selo = document.createElement('span');
    selo.className = 'project-cue';
    selo.setAttribute('aria-hidden', 'true');
    selo.setAttribute('data-pt', 'Ver projeto');
    selo.setAttribute('data-en', 'View project');
    selo.textContent = (document.documentElement.lang || 'pt').indexOf('en') === 0 ? 'View project' : 'Ver projeto';
    document.body.appendChild(selo);

    let cardAtivo = null;
    let movimentoDoSelo = null;
    const moverSelo = e => {
      selo.style.setProperty('--cue-x', e.clientX + 'px');
      selo.style.setProperty('--cue-y', e.clientY + 'px');
    };
    const fecharSelo = () => {
      cardAtivo = null;
      selo.classList.remove('show');
      if (movimentoDoSelo) movimentoDoSelo.abort();
      movimentoDoSelo = null;
    };

    document.addEventListener('mouseover', e => {
      const card = e.target.closest && e.target.closest('.cards .card');
      if (!card || card === cardAtivo) return;
      fecharSelo();
      cardAtivo = card;
      moverSelo(e);
      selo.classList.add('show');
      movimentoDoSelo = new AbortController();
      document.addEventListener('mousemove', moverSelo, { passive: true, signal: movimentoDoSelo.signal });
    }, { passive: true });

    document.addEventListener('mouseout', e => {
      const card = e.target.closest && e.target.closest('.cards .card');
      if (!card || card !== cardAtivo || card.contains(e.relatedTarget)) return;
      fecharSelo();
    }, { passive: true });

    document.addEventListener('mouseleave', fecharSelo);
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
    aplicarModoCursor(modoCursorGlobal());
    aplicarDisponibilidade();
    setLang(atual);
    sincronizarLarguraFechadaDoMenu();
    ligarPerguntas();
    medirAlvos();
    readScroll();
  };
  window.__CMS_SETLANG__ = lang => setLang(lang === 'en' ? 'en' : 'pt');
})();
