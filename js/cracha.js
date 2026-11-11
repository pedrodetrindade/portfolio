/* ===== CRACHÁ NO SOBRE (lanyard, React Bits) =====
   A foto do Sobre vira um crachá pendurado num cordão que sai do topo da
   seção: cartão claro com o furo da presilha, a foto encaixada e nome e cargo
   embaixo, como na referência.

   Sem interação nenhuma, a pedido: nada de arrastar, nada de virar com o
   clique (e por isso o verso saiu). Ele só respira. A presilha segue uma
   posição de repouso que oscila muito pouco, uns 2,4px para os lados em 7s e
   1,2px para cima e para baixo em 4,6s (o ritmo de uma respiração calma), e o
   cartão gira em Y menos de 2 graus num terceiro período. Os três períodos
   não se dividem uns pelos outros, então o desenho não se repete de um jeito
   que o olho perceba. Uma mola amortecida no crítico leva a presilha até esse
   alvo, e o cartão gira pela direção do cordão.

   O cordão vem de trás do card de Trabalhos logo acima do crachá (pedido de
   Pedro). #work pinta acima do Sobre (z-index:1 no CSS), então a âncora fica
   ESCONDIDA atrás do card, 16px acima da borda de baixo dele, e o cordão
   aparece saindo de trás. A borda é a da caixa de layout (offsetTop), que
   ignora o transform de entrada do card: medida pelo retângulo da tela, ela
   vinha ~20px abaixo enquanto o card ainda entrava, e o topo do cordão pulava
   quando a entrada terminava. Começando rente à borda, sem estar atrás, o
   cordão também ficava solto embaixo do card durante a entrada. Sem card
   acima na mesma vertical, a âncora volta ao topo da seção.

   O cordão é uma linha reta da âncora até a presilha, e não
   mais uma corda de verlet. A corda física fazia sentido com arraste; com um
   respiro de 2px, os pontos do meio, presos entre gravidade, atrito e a
   restrição de distância, faziam pequenas ondas em S que a curva suave
   transformava numa dobra da fita logo acima da presilha (Pedro viu o
   cordão "bugado"). Um crachá pendurado deixa o cordão esticado pelo peso:
   reto é o certo, e não tem como dobrar.

   O original é 3D de verdade (three.js, física rapier, malha do cordão): mais
   de meio megabyte para uma foto. Aqui é 2,5D e sem biblioteca:
   - o cordão é um <path> de SVG reto, com o nome correndo dentro dele;
   - o crachá é preso na ponta e gira por uma mola amortecida que o alinha ao
     cordão;
   - o alvo da mola é a posição de layout mais o respiro, então o grid nunca
     muda: a foto oscila em volta de onde sempre esteve.
   Entra por fundido logo na montagem (detalhes em aparecer, mais abaixo), não
   pela máscara de baixo para cima das outras imagens, que num objeto
   pendurado lia como se ele carregasse de cabeça para baixo.
   O respiro também entra aos poucos (2,5s), para não começar no meio de um
   balanço.
   O laço dorme com a aba oculta e fora de alcance: usa o mesmo .parado que o
   main.js põe na névoa de pontos do Sobre ([data-sobre-dither]), sem
   IntersectionObserver (ver CLAUDE.md). O tempo do respiro só anda com o laço
   acordado, então ele retoma de onde parou.
   Sem movimento reduzido e a partir de 640px; nos outros casos a foto fica
   como sempre foi. Carregado sob demanda pelo content-render (CRACHA_V). */
(function () {
  'use strict';
  if (window.__CRACHA__) return;

  const DT = 1 / 60;
  const W_CASA = 6;           // mola da presilha (rad/s), amortecida no crítico
  const ABA = 16;             // altura da presilha acima do cartão
  /* respiro: amplitude e período de cada eixo */
  const RESPIRO = {
    x: { amp: 2.4, periodo: 7.0 },          // px, s
    y: { amp: 1.2, periodo: 4.6 },          // px, s
    giro: { amp: 0.03, periodo: 9.4 },      // rad em Y (~1,7 grau), s
    entrada: 2.5                            // s até a amplitude cheia
  };

  function montar(figura) {
    if (!figura || figura.classList.contains('cracha-ativo')) return null;
    const retrato = figura.querySelector('.portrait');
    const secao = figura.closest('.about-break') || figura.parentElement;
    if (!retrato) return null;
    figura.classList.add('cracha-ativo');

    const en = (document.documentElement.lang || 'pt').indexOf('en') === 0;
    const linha = (cls, pt, eng) =>
      '<span class="' + cls + '" data-pt="' + pt + '" data-en="' + eng + '">' + (en ? eng : pt) + '</span>';

    /* estrutura: presilha e frente (furo, foto, nome) */
    const cartao = document.createElement('div');
    cartao.className = 'cracha';
    const presilha = document.createElement('span');
    presilha.className = 'cracha-presilha';
    presilha.setAttribute('aria-hidden', 'true');
    const frente = document.createElement('div');
    frente.className = 'cracha-face cracha-frente';
    frente.innerHTML = '<span class="cf-furo" aria-hidden="true"></span>';
    const pe = document.createElement('div');
    pe.className = 'cf-pe';
    pe.setAttribute('aria-hidden', 'true');
    /* sem a marca trind9de em lugar nenhum do crachá, a pedido: o nome é a
       identidade aqui, na frente e no cordão */
    pe.innerHTML =
      '<span class="cf-id">' +
        '<span class="cf-nome">Pedro de Trindade</span>' +
        linha('cf-cargo', 'Diretor de Arte &amp; Designer Sênior', 'Art Director &amp; Senior Designer') +
      '</span>';
    retrato.parentNode.insertBefore(cartao, retrato);
    frente.append(retrato, pe);
    cartao.append(presilha, frente);

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cracha-cordao');
    svg.setAttribute('aria-hidden', 'true');
    const fita = document.createElementNS(NS, 'path');
    fita.setAttribute('class', 'cc-fita');
    const trilho = document.createElementNS(NS, 'path');
    trilho.setAttribute('class', 'cc-trilho');
    trilho.setAttribute('id', 'cracha-trilho');
    const texto = document.createElementNS(NS, 'text');
    texto.setAttribute('class', 'cc-texto');
    const tp = document.createElementNS(NS, 'textPath');
    tp.setAttribute('href', '#cracha-trilho');
    tp.setAttribute('startOffset', '6');
    tp.textContent = 'Pedro de Trindade · Pedro de Trindade · Pedro de Trindade · Pedro de Trindade';
    texto.appendChild(tp);
    svg.append(fita, trilho, texto);
    figura.insertBefore(svg, figura.firstChild);

    /* ---- física ---- */
    let casa = { x: 0, y: 0 }, ancora = { x: 0, y: 0 };
    const ponta = { x: 0, y: 0 };
    let theta = 0, omega = 0, giro = 0, tempo = 0;
    const velPonta = { x: 0, y: 0 };
    let raf = 0, ultimo = 0, sobra = 0;

    const onda = (eixo, t) => eixo.amp * Math.sin(2 * Math.PI * t / eixo.periodo);

    function passo() {
      tempo += DT;
      /* a amplitude cresce de 0 a 1 na entrada, numa curva sem arranco */
      const e = Math.min(1, tempo / RESPIRO.entrada);
      const forca = e * e * (3 - 2 * e);
      const alvoX = casa.x + onda(RESPIRO.x, tempo) * forca;
      const alvoY = casa.y + onda(RESPIRO.y, tempo + 1.3) * forca;
      giro = onda(RESPIRO.giro, tempo + 2.1) * forca;

      /* A presilha anda por uma mola amortecida no crítico até o alvo do
         respiro, sem passar do ponto. */
      velPonta.x += (W_CASA * W_CASA * (alvoX - ponta.x) - 2 * W_CASA * velPonta.x) * DT;
      velPonta.y += (W_CASA * W_CASA * (alvoY - ponta.y) - 2 * W_CASA * velPonta.y) * DT;
      ponta.x += velPonta.x * DT; ponta.y += velPonta.y * DT;
      /* O cartão gira pela direção do cordão. O comprimento de referência tem
         piso de 180px: com o cordão curto do Sobre (60 a 100px), 2px de
         respiro virariam giro demais; assim ele fica abaixo de 1 grau em
         qualquer altura de seção. Mola com amortecimento acima do crítico:
         ele acompanha sem sacudir. */
      const alvoTheta = Math.atan2(-(ponta.x - ancora.x), Math.max(180, ponta.y - ancora.y));
      omega += (60 * (alvoTheta - theta) - 18 * omega) * DT;
      theta += omega * DT;
    }

    /* Topo da caixa de layout somando offsetTop até o fim da cadeia (o
       .smooth-holder, ou o body sem rolagem suave): ignora transform, tanto o
       de entrada do card quanto o da rolagem. Os dois lados da conta usam a
       mesma cadeia, então a diferença vale em qualquer modo. */
    const topoDeLayout = el => {
      let y = 0;
      for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
      return y;
    };
    const ESCONDIDO = 16;     // quanto o topo do cordão fica atrás do card
    /* O card de Trabalhos cuja largura cobre a linha do cordão e que termina
       acima do Sobre, o mais baixo deles. */
    function cardAcima(xTela, topoSecao) {
      let melhor = null, base = -Infinity;
      document.querySelectorAll('#work .card, #work .home-teaser').forEach(c => {
        const r = c.getBoundingClientRect();
        const b = topoDeLayout(c) + c.offsetHeight;
        if (!c.offsetHeight || xTela < r.left + 30 || xTela > r.right - 30 || b > topoSecao + 1) return;
        if (b > base) { base = b; melhor = c; }
      });
      return melhor ? base : null;
    }
    function medirAncora() {
      const rf = figura.getBoundingClientRect();
      const topoFigura = topoDeLayout(figura);
      const topoSecao = topoDeLayout(secao);
      const base = cardAcima(rf.left + casa.x, topoSecao);
      const topo = base !== null ? base - ESCONDIDO : topoSecao + 1;
      ancora = { x: casa.x, y: topo - topoFigura };
    }

    function medir() {
      /* A casa é o topo da presilha, centralizada no cartão. Medida pela caixa
         de layout (offset*), que ignora o transform: com o crachá girado, o
         getBoundingClientRect devolveria a caixa do cartão inclinado. */
      casa = { x: cartao.offsetLeft + cartao.offsetWidth / 2, y: cartao.offsetTop - ABA };
      medirAncora();
      /* em repouso o cordão é vertical e a foto fica exatamente no lugar
         dela no grid, sem calibração */
      ponta.x = casa.x; ponta.y = casa.y;
      velPonta.x = velPonta.y = 0;
      theta = omega = 0;
      desenhar();
    }

    function desenhar() {
      /* cordão reto da âncora à presilha: esticado pelo peso, sem dobra */
      const d = 'M' + ancora.x.toFixed(2) + ' ' + ancora.y.toFixed(2) + 'L' + ponta.x.toFixed(2) + ' ' + ponta.y.toFixed(2);
      fita.setAttribute('d', d);
      trilho.setAttribute('d', d);
      const tx = ponta.x - casa.x, ty = ponta.y - casa.y;
      cartao.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) rotate(' +
        theta.toFixed(4) + 'rad) rotateY(' + giro.toFixed(4) + 'rad)';
    }

    /* ---- laço: só roda com a aba visível e a seção por perto ---- */
    const marcador = secao.querySelector('[data-sobre-dither]');
    const deveRodar = () => !document.hidden && !(marcador && marcador.classList.contains('parado'));
    function laco(agora) {
      raf = requestAnimationFrame(laco);
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      ultimo = agora;
      sobra += dt;
      while (sobra >= DT) { passo(); sobra -= DT; }
      desenhar();
    }
    function sincronizar() {
      const deve = deveRodar();
      if (deve && !raf) { ultimo = performance.now(); sobra = 0; raf = requestAnimationFrame(laco); }
      else if (!deve && raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    /* entrada: o fundido (CSS) começa assim que o crachá é montado, e não mais
       quando o sistema de entradas marca a foto com .in. O cordão sai de trás
       do card de Trabalhos e atravessa o respiro entre as seções: esperando a
       entrada da foto, ele surgia do nada no meio da descida (Pedro achou
       estranho). Como a montagem acontece no carregamento, quase sempre com a
       pessoa ainda no alto da página, o fundido corre fora da tela, e cordão e
       crachá já estão ali quando a rolagem chega neles. Se a página abrir com
       o Sobre à vista, o fundido cobre a troca da foto pelo crachá. */
    let visivel = false;
    const aparecer = () => {
      figura.classList.add('cracha-visivel');
      visivel = true;
      sincronizar();
    };
    aparecer();
    const aoMudar = () => { if (visivel) sincronizar(); };
    document.addEventListener('visibilitychange', aoMudar);
    if (marcador) new MutationObserver(aoMudar).observe(marcador, { attributes: true, attributeFilter: ['class'] });

    const ro = new ResizeObserver(() => medir());
    ro.observe(figura);
    /* A distância do card até o crachá muda sem o crachá mudar de tamanho: o
       respiro de cima do Sobre é em vh, então basta a janela mudar de altura
       (a barra de um aviso do navegador, por exemplo) para a âncora sair do
       lugar. Sobre e Trabalhos observados: só a âncora é refeita, sem zerar o
       respiro. */
    const trabalhos = document.getElementById('work');
    const roAncora = new ResizeObserver(() => { medirAncora(); desenhar(); });
    roAncora.observe(secao);
    if (trabalhos) roAncora.observe(trabalhos);
    medir();
    return { remedir: medir };
  }

  window.__CRACHA__ = { montar };
})();
