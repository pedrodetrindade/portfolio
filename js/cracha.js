/* ===== CRACHÁ NO SOBRE (lanyard, React Bits) =====
   A foto do Sobre vira um crachá pendurado num cordão que sai da linha fina
   do topo da seção: cartão claro com o furo da presilha, a foto encaixada e
   nome e cargo embaixo, como na referência. Dá para arrastar e soltar: ele
   balança de leve e volta para o lugar dele no grid. Um clique sem arrastar
   vira o crachá e mostra o verso.

   O original é 3D de verdade (three.js, física rapier, malha do cordão): mais
   de meio megabyte para uma foto. Aqui é 2,5D e sem biblioteca:
   - o cordão é uma corda de verlet (pontos com gravidade e restrição de
     distância, um pouco elástica), desenhada num <path> de SVG;
   - o crachá é preso na ponta da corda e gira por uma mola amortecida que o
     alinha aos últimos trechos do cordão, com um giro em Y pela velocidade;
   - uma mola puxa a ponta de volta para a posição de layout, então o grid
     nunca muda: em repouso a foto está exatamente onde sempre esteve.
   Calmo de propósito, a pedido: tudo bem amortecido, a virada sem passar do
   ponto, e nenhum empurrão na entrada. Entra por fundido, não pela máscara de
   baixo para cima das outras imagens, que num objeto pendurado lia como se ele
   carregasse de cabeça para baixo.
   Só com mouse (no toque, arrastar brigaria com a rolagem), sem movimento
   reduzido e a partir de 640px; nos outros casos a foto fica como sempre foi.
   O laço de quadros dorme quando tudo assenta. Carregado sob demanda pelo
   content-render (CRACHA_V). */
(function () {
  'use strict';
  if (window.__CRACHA__) return;

  const PASSOS = 12;          // trechos do cordão
  const G = 2200;             // gravidade, px/s²
  const DT = 1 / 60;
  const ITER = 8;
  const RIGIDEZ = 0.92;       // < 1: o cordão estica um pouco, como elástico
  const ATRITO = 0.94;        // perda de velocidade do meio do cordão, por passo
  const W_CASA = 6;           // mola da presilha (rad/s), amortecida no crítico: ~0,8s sem passar do ponto
  const ABA = 16;             // altura da presilha acima do cartão

  function montar(figura) {
    if (!figura || figura.classList.contains('cracha-ativo')) return null;
    const retrato = figura.querySelector('.portrait');
    const secao = figura.closest('.about-break') || figura.parentElement;
    if (!retrato) return null;
    figura.classList.add('cracha-ativo');

    const en = (document.documentElement.lang || 'pt').indexOf('en') === 0;
    const linha = (cls, pt, eng) =>
      '<span class="' + cls + '" data-pt="' + pt + '" data-en="' + eng + '">' + (en ? eng : pt) + '</span>';

    /* estrutura: presilha, frente (furo, foto, nome) e verso */
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
    pe.innerHTML =
      '<span class="cf-id">' +
        '<span class="cf-nome">Pedro de Trindade</span>' +
        linha('cf-cargo', 'Diretor de Arte &amp; Designer Sênior', 'Art Director &amp; Senior Designer') +
      '</span>' +
      '<span class="cf-marca">trind9de</span>';
    const verso = document.createElement('div');
    verso.className = 'cracha-face cracha-verso';
    verso.setAttribute('aria-hidden', 'true');
    verso.innerHTML =
      '<span class="cf-furo" aria-hidden="true"></span>' +
      '<span class="cv-marca">trind9de</span>' +
      '<span class="cv-grade"></span>' +
      '<span class="cv-pe">' +
        '<span class="cv-nome">Pedro de Trindade</span>' +
        linha('cv-local', 'Rio de Janeiro, Brasil', 'Rio de Janeiro, Brazil') +
      '</span>';
    retrato.parentNode.insertBefore(cartao, retrato);
    frente.append(retrato, pe);
    cartao.append(presilha, frente, verso);

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
    tp.textContent = 'trind9de · trind9de · trind9de · trind9de · trind9de · trind9de';
    texto.appendChild(tp);
    svg.append(fita, trilho, texto);
    figura.insertBefore(svg, figura.firstChild);

    /* ---- física ---- */
    let pts = [], casa = { x: 0, y: 0 }, ancora = { x: 0, y: 0 }, trecho = 1, limites = null;
    let theta = 0, omega = 0, phi = 0, phiV = 0, phiAlvo = 0, inclina = 0;
    let arrastando = false, pega = { x: 0, y: 0 }, alvo = { x: 0, y: 0 };
    const velPonta = { x: 0, y: 0 };
    let raf = 0, ultimo = 0, sobra = 0;
    const press = { x: 0, y: 0, t: 0 };

    function passo() {
      const g = G * DT * DT;
      const ponta = pts[pts.length - 1];
      /* A ponta (onde o crachá prende) não é corda livre: com ela solta, o
         cordão virava pêndulo e devolvia 30 a 70px de sobressalto mesmo com
         muito atrito (simulado). Ela anda por uma mola amortecida no crítico,
         que volta para casa sem passar do ponto; arrastando, segue o mouse. */
      ponta.px = ponta.x; ponta.py = ponta.y;
      if (arrastando) {
        velPonta.x = (alvo.x - ponta.x) / DT * 0.35 + velPonta.x * 0.65;
        velPonta.y = (alvo.y - ponta.y) / DT * 0.35 + velPonta.y * 0.65;
        ponta.x = alvo.x; ponta.y = alvo.y;
      } else {
        velPonta.x += (W_CASA * W_CASA * (casa.x - ponta.x) - 2 * W_CASA * velPonta.x) * DT;
        velPonta.y += (W_CASA * W_CASA * (casa.y - ponta.y) - 2 * W_CASA * velPonta.y) * DT;
        ponta.x += velPonta.x * DT; ponta.y += velPonta.y * DT;
      }
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
      /* O cartão se alinha ao fim do cordão, medido nos últimos quatro
         trechos (com um só, de ~9px, qualquer desvio virava giro demais).
         Mola com amortecimento acima do crítico: ele acompanha sem sacudir. */
      const pen = pts[Math.max(0, pts.length - 5)];
      const alvoTheta = Math.atan2(-(ponta.x - pen.x), ponta.y - pen.y);
      omega += (60 * (alvoTheta - theta) - 18 * omega) * DT;
      theta += omega * DT;
      const vx = (ponta.x - ponta.px) / DT;
      inclina += (Math.max(-0.3, Math.min(0.3, vx * 0.0008)) - inclina) * 0.08;
      /* virada amortecida no crítico (2·√36 = 12): vai e para, sem voltar */
      phiV += (36 * (phiAlvo - phi) - 12 * phiV) * DT;
      phi += phiV * DT;
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
      /* As duas pontas do cordão são fixas na corda (peso 0): a âncora na
         linha da seção e a presilha, que tem a própria mola. Com o
         comprimento igual à distância, em repouso o cordão fica reto e a foto
         exatamente no lugar dela no grid, sem calibração. */
      pts = [];
      for (let i = 0; i <= PASSOS; i++) {
        const y = ancora.y + trecho * i;
        pts.push({ x: casa.x, y, px: casa.x, py: y, w: i === 0 || i === PASSOS ? 0 : 1 });
      }
      limites = {
        x1: rs.left - rf.left + 24, x2: rs.right - rf.left - 24,
        y1: ancora.y + 30, y2: rs.bottom - rf.top - 40
      };
      velPonta.x = velPonta.y = 0;
      theta = omega = phiV = inclina = 0;
      phi = phiAlvo;
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
        theta.toFixed(4) + 'rad) rotateY(' + (phi + inclina).toFixed(4) + 'rad)';
      cartao.classList.toggle('de-costas', Math.cos(phi + inclina) < 0);
    }

    function assentado() {
      if (arrastando) return false;
      const ponta = pts[pts.length - 1];
      let mov = Math.abs(omega) + Math.abs(phiV) + Math.abs(phiAlvo - phi) + Math.abs(inclina);
      mov += Math.hypot(ponta.x - casa.x, ponta.y - casa.y) * 0.05 + Math.hypot(velPonta.x, velPonta.y) * 0.01;
      for (const p of pts) mov += Math.abs(p.x - p.px) + Math.abs(p.y - p.py);
      return mov < 0.02;
    }

    function laco(agora) {
      raf = 0;
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      ultimo = agora;
      sobra += dt;
      while (sobra >= DT) { passo(); sobra -= DT; }
      desenhar();
      if (!assentado()) raf = requestAnimationFrame(laco);
      else { omega = phiV = inclina = 0; phi = phiAlvo; desenhar(); }
    }
    function acordar() {
      if (raf) return;
      ultimo = performance.now();
      sobra = 0;
      raf = requestAnimationFrame(laco);
    }

    /* ---- ponteiro ---- */
    function local(e) {
      const rf = figura.getBoundingClientRect();
      return { x: e.clientX - rf.left, y: e.clientY - rf.top };
    }
    function prender(p) {
      return {
        x: Math.max(limites.x1, Math.min(limites.x2, p.x)),
        y: Math.max(limites.y1, Math.min(limites.y2, p.y))
      };
    }
    cartao.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const p = local(e);
      const ponta = pts[pts.length - 1];
      pega = { x: p.x - ponta.x, y: p.y - ponta.y };
      alvo = prender({ x: p.x - pega.x, y: p.y - pega.y });
      Object.assign(press, { x: p.x, y: p.y, t: performance.now() });
      arrastando = true;
      cartao.classList.add('arrastando');
      try { cartao.setPointerCapture(e.pointerId); } catch (erro) { /* ponteiro sintético */ }
      e.preventDefault();
      acordar();
    });
    cartao.addEventListener('pointermove', e => {
      if (!arrastando) return;
      const p = local(e);
      alvo = prender({ x: p.x - pega.x, y: p.y - pega.y });
      acordar();
    });
    const soltar = e => {
      if (!arrastando) return;
      arrastando = false;
      cartao.classList.remove('arrastando');
      /* o arremesso leva metade da velocidade do arraste: o crachá segue um
         pouco no rumo da mão e volta, sem ir longe */
      velPonta.x *= 0.5; velPonta.y *= 0.5;
      const p = local(e);
      /* clique curto e parado vira o crachá */
      if (e.type === 'pointerup' && performance.now() - press.t < 320 && Math.hypot(p.x - press.x, p.y - press.y) < 6) {
        phiAlvo = phiAlvo ? 0 : Math.PI;
      }
      acordar();
    };
    cartao.addEventListener('pointerup', soltar);
    cartao.addEventListener('pointercancel', soltar);

    /* entrada: quando o sistema de entradas do main.js marca a foto com .in,
       o crachá e o cordão aparecem por fundido (CSS), parados no lugar */
    const aparecer = () => figura.classList.add('cracha-visivel');
    if (retrato.classList.contains('in')) aparecer();
    else {
      const mo = new MutationObserver(() => {
        if (!retrato.classList.contains('in')) return;
        mo.disconnect();
        aparecer();
      });
      mo.observe(retrato, { attributes: true, attributeFilter: ['class'] });
    }

    const ro = new ResizeObserver(() => { if (!arrastando) { medir(); acordar(); } });
    ro.observe(figura);
    medir();
    return { remedir: medir };
  }

  window.__CRACHA__ = { montar };
})();
