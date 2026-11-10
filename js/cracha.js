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
   que o olho perceba. A física é a de antes: a mola amortecida no crítico leva
   a presilha até esse alvo, o meio do cordão é verlet e o cartão se alinha
   aos últimos trechos dele, então a corda e o giro acompanham sozinhos, sem
   animação desenhada à parte.

   O original é 3D de verdade (three.js, física rapier, malha do cordão): mais
   de meio megabyte para uma foto. Aqui é 2,5D e sem biblioteca:
   - o cordão é uma corda de verlet (pontos com gravidade e restrição de
     distância, um pouco elástica), desenhada num <path> de SVG;
   - o crachá é preso na ponta da corda e gira por uma mola amortecida que o
     alinha aos últimos trechos do cordão;
   - o alvo da mola é a posição de layout mais o respiro, então o grid nunca
     muda: a foto oscila em volta de onde sempre esteve.
   Entra por fundido, não pela máscara de baixo para cima das outras imagens,
   que num objeto pendurado lia como se ele carregasse de cabeça para baixo.
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

  const PASSOS = 12;          // trechos do cordão
  const G = 2200;             // gravidade, px/s²
  const DT = 1 / 60;
  const ITER = 8;
  const RIGIDEZ = 0.92;       // < 1: o cordão estica um pouco, como elástico
  const ATRITO = 0.94;        // perda de velocidade do meio do cordão, por passo
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
    let pts = [], casa = { x: 0, y: 0 }, ancora = { x: 0, y: 0 }, trecho = 1;
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

      const g = G * DT * DT;
      const ponta = pts[pts.length - 1];
      /* A ponta (onde o crachá prende) não é corda livre: com ela solta, o
         cordão virava pêndulo e devolvia 30 a 70px de sobressalto mesmo com
         muito atrito (simulado). Ela anda por uma mola amortecida no crítico
         até o alvo do respiro, sem passar do ponto. */
      ponta.px = ponta.x; ponta.py = ponta.y;
      velPonta.x += (W_CASA * W_CASA * (alvoX - ponta.x) - 2 * W_CASA * velPonta.x) * DT;
      velPonta.y += (W_CASA * W_CASA * (alvoY - ponta.y) - 2 * W_CASA * velPonta.y) * DT;
      ponta.x += velPonta.x * DT; ponta.y += velPonta.y * DT;
      /* o meio do cordão é verlet com gravidade, só para ter a curva viva */
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * ATRITO, vy = (p.y - p.py) * ATRITO;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + g;
      }
      for (let k = 0; k < ITER; k++) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const wa = a.w, wb = b.w;
          if (wa + wb === 0) continue;
          const dif = (d - trecho) / d * RIGIDEZ;
          a.x += dx * dif * wa / (wa + wb); a.y += dy * dif * wa / (wa + wb);
          b.x -= dx * dif * wb / (wa + wb); b.y -= dy * dif * wb / (wa + wb);
        }
      }
      /* O cartão se alinha ao cordão inteiro, da âncora à presilha, e não aos
         últimos trechos dele: com o cordão curto do Sobre (60 a 100px), 2px
         de respiro no fim viravam 8 a 10 graus de giro (medido). O comprimento
         de referência tem piso de 180px, então o giro do respiro fica abaixo
         de 1 grau em qualquer altura de seção. Mola com amortecimento acima
         do crítico: ele acompanha sem sacudir. */
      const alvoTheta = Math.atan2(-(ponta.x - ancora.x), Math.max(180, ponta.y - ancora.y));
      omega += (60 * (alvoTheta - theta) - 18 * omega) * DT;
      theta += omega * DT;
    }

    function medir() {
      const rf = figura.getBoundingClientRect();
      const rs = secao.getBoundingClientRect();
      /* A casa é o topo da presilha, centralizada no cartão. Medida pela caixa
         de layout (offset*), que ignora o transform: com o crachá girado, o
         getBoundingClientRect devolveria a caixa do cartão inclinado. */
      casa = { x: cartao.offsetLeft + cartao.offsetWidth / 2, y: cartao.offsetTop - ABA };
      ancora = { x: casa.x, y: (rs.top - rf.top) + 1 };
      const total = Math.max(40, casa.y - ancora.y);
      trecho = total / PASSOS;
      /* As duas pontas do cordão são fixas na corda (peso 0): a âncora no
         topo da seção e a presilha, que tem a própria mola. Com o comprimento
         igual à distância, em repouso o cordão fica reto e a foto exatamente
         no lugar dela no grid, sem calibração. */
      pts = [];
      for (let i = 0; i <= PASSOS; i++) {
        const y = ancora.y + trecho * i;
        pts.push({ x: casa.x, y, px: casa.x, py: y, w: i === 0 || i === PASSOS ? 0 : 1 });
      }
      velPonta.x = velPonta.y = 0;
      theta = omega = 0;
      desenhar();
    }

    function caminho(pontos) {
      /* curva suave pelos pontos (Catmull-Rom convertido em Bézier) */
      let d = 'M' + pontos[0].x.toFixed(1) + ' ' + pontos[0].y.toFixed(1);
      for (let i = 0; i < pontos.length - 1; i++) {
        const p0 = pontos[i - 1] || pontos[i], p1 = pontos[i], p2 = pontos[i + 1], p3 = pontos[i + 2] || p2;
        const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      return d;
    }

    function desenhar() {
      if (!pts.length) return;
      const d = caminho(pts);
      fita.setAttribute('d', d);
      trilho.setAttribute('d', d);
      const ponta = pts[pts.length - 1];
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

    /* entrada: quando o sistema de entradas do main.js marca a foto com .in,
       o crachá e o cordão aparecem por fundido (CSS), parados no lugar; o
       respiro começa a partir daí */
    let visivel = false;
    const aparecer = () => {
      figura.classList.add('cracha-visivel');
      visivel = true;
      sincronizar();
    };
    if (retrato.classList.contains('in')) aparecer();
    else {
      const mo = new MutationObserver(() => {
        if (!retrato.classList.contains('in')) return;
        mo.disconnect();
        aparecer();
      });
      mo.observe(retrato, { attributes: true, attributeFilter: ['class'] });
    }
    const aoMudar = () => { if (visivel) sincronizar(); };
    document.addEventListener('visibilitychange', aoMudar);
    if (marcador) new MutationObserver(aoMudar).observe(marcador, { attributes: true, attributeFilter: ['class'] });

    const ro = new ResizeObserver(() => medir());
    ro.observe(figura);
    medir();
    return { remedir: medir };
  }

  window.__CRACHA__ = { montar };
})();
