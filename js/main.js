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
    behance: redesCms.behance || 'https://www.behance.net/trind9de'
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
    redesGlobais.linkedin ? '<a href="' + esc(redesGlobais.linkedin) + '" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>' : '',
    redesGlobais.behance ? '<a href="' + esc(redesGlobais.behance) + '" target="_blank" rel="noopener noreferrer">Behance <span aria-hidden="true">↗</span></a>' : ''
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
            <a class="menu-item" href="${i.href}" data-secao="${i.id}"${i.visivel ? '' : ' hidden'}>
              <span class="menu-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${iconeDaSecao(i.id)}</svg></span>
              <span data-pt="${i.pt}" data-en="${i.en}">${i.pt}</span>
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
                <a class="cform-direct-mail" href="mailto:${emailDeContato}">${emailDeContato}</a>
                <button type="button" class="cform-direct-copy" data-copy="${emailDeContato}"
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
    /* A medida do nome também sai daqui, pelo mesmo motivo e com a mesma
       ressalva: offsetWidth é largura de layout, então não muda com a escala da
       intro. No celular a frase da capa usa esta largura para não ficar mais
       larga que o nome — sem isso ela ultrapassava o nome em 40px a 375, e a
       capa lia como dois blocos de medidas diferentes em vez de uma coluna. */
    document.documentElement.style.setProperty('--nome-larg', wrap.offsetWidth + 'px');
  }

  const headEl = document.querySelector('header');
  const mainEl = document.querySelector('main');
  const footEl = document.querySelector('footer');
  function lockBackground(state){
    [headEl, mainEl, footEl].forEach(el => { if (el) el.inert = state; });
  }

  aplicarDisponibilidade();
  setLang(detectLang());
  const sincronizarLarguraFechadaDoMenu = () => {
    const pill = document.querySelector('header .ctrl-group');
    const painel = document.getElementById('menu');
    if (pill && painel) painel.style.setProperty('--menu-closed-width', pill.getBoundingClientRect().width + 'px');
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
     total mudaria o ritmo interno, não a duração. */
  const INTRO = { revelacao: 1440, movimento: 2160 };
  const INTRO_MS = INTRO.revelacao + INTRO.movimento;   // 3600ms
  const SECUNDARIOS_MS = 2790;
  const VEU_MS = 3240;                                  // saída do véu, mesma escala
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
  let lastFocused = null, modalOpen = false, menuCloseTimer = 0, menuVisualVersion = 0;
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
      if (pill) el.style.setProperty('--menu-closed-width', pill.getBoundingClientRect().width + 'px');
    }
    el.classList.add('open');
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
      /* --dur-default = 700ms. A margem mínima deixa visibility:hidden ser
         aplicada primeiro sem criar uma pausa perceptível entre as peças. */
      menuCloseTimer = setTimeout(liberarPill, 710);
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
      if (resposta.status === 422 && corpo.message) {
        dizerStatus(corpo.message, corpo.message, 'erro');
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
       arquivo pela chave de diagnóstico existente: ?lerp=0.08. */
    const LERP_60 = Math.min(.4, Math.max(.02,
      parseFloat(new URLSearchParams(location.search).get('lerp')) || .04));
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
    });

    medir();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir);
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
    const portrait = document.querySelector('.portrait');
    const portraitTrails = [];
    if (portrait && portrait.querySelector('.portrait-img')) {
      const opacidades = [.42, .3, .2, .12];
      const escalas = [1, .92, .82, .7];
      const desfoques = [11, 9, 7, 5];
      for (let i = 0; i < 4; i++) {
        const trail = document.createElement('span');
        trail.className = 'portrait-blur-trail';
        trail.setAttribute('aria-hidden', 'true');
        trail.style.setProperty('--trail-opacity', opacidades[i]);
        trail.style.setProperty('--trail-scale', escalas[i]);
        trail.style.setProperty('--trail-blur', desfoques[i] + 'px');
        portrait.appendChild(trail);
        portraitTrails.push(trail);
      }
    }
    let alvoX = innerWidth / 2, alvoY = innerHeight / 2;
    let x = alvoX, y = alvoY;
    const tx = [alvoX, alvoX, alvoX], ty = [alvoY, alvoY, alvoY];
    let rodando = false, ligado = false, rapidoAte = 0;
    let magneto = null, magnetoMax = 0;
    let portraitAtivo = false, portraitAlvoX = 0, portraitAlvoY = 0;
    const portraitX = [0, 0, 0, 0], portraitY = [0, 0, 0, 0];

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
      let portraitParado = true;
      if (portraitAtivo && portraitTrails.length) {
        const lerps = [.3, .2, .13, .085];
        let anteriorX = portraitAlvoX, anteriorY = portraitAlvoY;
        for (let i = 0; i < portraitTrails.length; i++) {
          portraitX[i] += (anteriorX - portraitX[i]) * lerps[i];
          portraitY[i] += (anteriorY - portraitY[i]) * lerps[i];
          portraitTrails[i].style.setProperty('--trail-x', portraitX[i] + 'px');
          portraitTrails[i].style.setProperty('--trail-y', portraitY[i] + 'px');
          if (Math.abs(anteriorX - portraitX[i]) > .1 || Math.abs(anteriorY - portraitY[i]) > .1) portraitParado = false;
          anteriorX = portraitX[i]; anteriorY = portraitY[i];
        }
      }
      if (performance.now() > rapidoAte) camada.classList.remove('fast');
      /* para o laço quando tudo assentou: sem movimento não há o que pintar */
      const parado = Math.abs(ax - x) < .1 && Math.abs(ay - y) < .1 &&
        Math.abs(tx[2] - x) < .1 && Math.abs(ty[2] - y) < .1 && portraitParado;
      if (parado && performance.now() > rapidoAte) { rodando = false; return; }
      requestAnimationFrame(laco);
    };
    const acordarCursor = () => { if (!rodando) { rodando = true; requestAnimationFrame(laco); } };

    let ultimoX = alvoX, ultimoY = alvoY, primeiraAmostra = true;
    document.addEventListener('mousemove', e => {
      alvoX = e.clientX; alvoY = e.clientY;
      if (portraitAtivo) {
        const r = portrait.getBoundingClientRect();
        portraitAlvoX = alvoX - r.left;
        portraitAlvoY = alvoY - r.top;
      }
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
      camada.classList.remove('on', 'fast', 'is-card', 'is-control', 'is-on-light');
      if (glow) glow.classList.remove('on');
      portraitAtivo = false;
      if (portrait) portrait.classList.remove('lens-active');
    });

    if (portraitTrails.length) {
      portrait.addEventListener('mouseenter', e => {
        const r = portrait.getBoundingClientRect();
        portraitAlvoX = e.clientX - r.left;
        portraitAlvoY = e.clientY - r.top;
        for (let i = 0; i < portraitTrails.length; i++) {
          portraitX[i] = portraitAlvoX; portraitY[i] = portraitAlvoY;
          portraitTrails[i].style.setProperty('--trail-x', portraitAlvoX + 'px');
          portraitTrails[i].style.setProperty('--trail-y', portraitAlvoY + 'px');
        }
        portraitAtivo = true;
        portrait.classList.add('lens-active');
        acordarCursor();
      }, { passive: true });
      portrait.addEventListener('mouseleave', () => {
        portraitAtivo = false;
        portrait.classList.remove('lens-active');
      }, { passive: true });
    }

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
      /* O FAQ é a única superfície clara. A camada continua acima de tudo e
         sem capturar eventos; só troca de contraste quando o alvo real está
         dentro dela, inclusive em resposta aberta ou link inserido depois. */
      camada.classList.toggle('is-on-light', !!(alvo.closest && alvo.closest('.faq')));
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
    aplicarDisponibilidade();
    setLang(atual);
    sincronizarLarguraFechadaDoMenu();
    ligarPerguntas();
    medirAlvos();
    readScroll();
  };
  window.__CMS_SETLANG__ = lang => setLang(lang === 'en' ? 'en' : 'pt');
})();
