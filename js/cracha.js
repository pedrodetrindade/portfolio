/* ===== CRACHÁ NO SOBRE (lanyard, React Bits) =====
   A foto do Sobre vira um crachá pendurado num cordão que sai da linha fina
   do topo da seção. Dá para arrastar e arremessar: ele balança e volta para o
   lugar dele no grid. Um clique sem arrastar vira o crachá e mostra o verso.

   O original é 3D de verdade (three.js, física rapier, malha do cordão): mais
   de meio megabyte para uma foto. Aqui é 2,5D e sem biblioteca:
   - o cordão é uma corda de verlet (pontos com gravidade e restrição de
     distância, um pouco elástica), desenhada num <path> de SVG;
   - o crachá é a própria foto, presa na ponta da corda, girando por uma mola
     amortecida que o alinha ao último trecho do cordão, com um giro em Y
     proporcional à velocidade lateral, que dá a leitura de volume;
   - uma mola fraca puxa a ponta de volta para a posição de layout, então o
     grid nunca muda: em repouso a foto está exatamente onde sempre esteve.
   Só com mouse (no toque, arrastar brigaria com a rolagem) e sem movimento
   reduzido; nos outros casos a foto fica como sempre foi. O laço de quadros
   dorme quando tudo assenta. Carregado sob demanda pelo content-render
   (CRACHA_V). */
(function () {
  'use strict';
  if (window.__CRACHA__) return;

  const PASSOS = 12;          // trechos do cordão
  const G = 2200;             // gravidade, px/s²
  const DT = 1 / 60;
  const ITER = 8;
  const RIGIDEZ = 0.92;       // < 1: o cordão estica um pouco, como elástico
  const MOLA_CASA = 0.018;    // puxão da ponta de volta ao layout, por passo
  const ABA = 14;             // altura da presilha acima da foto

  function montar(figura) {
    if (!figura || figura.classList.contains('cracha-ativo')) return null;
    const retrato = figura.querySelector('.portrait');
    const secao = figura.closest('.about-break') || figura.parentElement;
    if (!retrato) return null;
    figura.classList.add('cracha-ativo');

    /* estrutura: cartão (presilha + frente + verso) e o cordão em SVG */
    const cartao = document.createElement('div');
    cartao.className = 'cracha';
    const presilha = document.createElement('span');
    presilha.className = 'cracha-presilha';
    presilha.setAttribute('aria-hidden', 'true');
    const frente = document.createElement('div');
    frente.className = 'cracha-face cracha-frente';
    const verso = document.createElement('div');
    verso.className = 'cracha-face cracha-verso';
    verso.setAttribute('aria-hidden', 'true');
    const en = (document.documentElement.lang || 'pt').indexOf('en') === 0;
    const linha = (cls, pt, eng) =>
      '<span class="' + cls + '" data-pt="' + pt + '" data-en="' + eng + '">' + (en ? eng : pt) + '</span>';
    verso.innerHTML =
      '<span class="cv-marca">trind9de</span>' +
      '<span class="cv-grade" aria-hidden="true"></span>' +
      '<span class="cv-pe">' +
        '<span class="cv-nome">Pedro de Trindade</span>' +
        linha('cv-cargo', 'Diretor de Arte &amp; Designer Sênior', 'Art Director &amp; Senior Designer') +
        linha('cv-local', 'Rio de Janeiro, Brasil', 'Rio de Janeiro, Brazil') +
      '</span>';
    retrato.parentNode.insertBefore(cartao, retrato);
    frente.appendChild(retrato);
    cartao.append(presilha, frente, verso);

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cracha-cordao');
    svg.setAttribute('aria-hidden', 'true');
    const fita = document.createElementNS(NS, 'path');
    fita.setAttribute('class', 'cc-fita');
    const costura = document.createElementNS(NS, 'path');
    costura.setAttribute('class', 'cc-costura');
    const idCaminho = 'cracha-caminho';
    costura.setAttribute('id', idCaminho);
    const texto = document.createElementNS(NS, 'text');
    texto.setAttribute('class', 'cc-texto');
    const tp = document.createElementNS(NS, 'textPath');
    tp.setAttribute('href', '#' + idCaminho);
    tp.setAttribute('startOffset', '6');
    tp.textContent = 'trind9de · trind9de · trind9de · trind9de · trind9de · trind9de';
    texto.appendChild(tp);
    svg.append(fita, costura, texto);
    figura.insertBefore(svg, figura.firstChild);

    /* ---- física ---- */
    let pts = [], casa = { x: 0, y: 0 }, ancora = { x: 0, y: 0 }, trecho = 1, limites = null;
    let theta = 0, omega = 0, phi = 0, phiV = 0, phiAlvo = 0, inclina = 0;
    let arrastando = false, pega = { x: 0, y: 0 }, alvo = { x: 0, y: 0 };
    let raf = 0, ultimo = 0, sobra = 0;
    const press = { x: 0, y: 0, t: 0 };

    function medir() {
      const rf = figura.getBoundingClientRect();
      const rs = secao.getBoundingClientRect();
      const ro = retrato.getBoundingClientRect();
      casa = { x: (ro.left - rf.left) + ro.width / 2, y: (ro.top - rf.top) - ABA };
      /* o cordão nasce da linha do topo da seção, logo acima da foto */
      ancora = { x: casa.x, y: (rs.top - rf.top) + 1 };
      const total = Math.max(40, casa.y - ancora.y);
      trecho = total / PASSOS;
      pts = [];
      for (let i = 0; i <= PASSOS; i++) {
        const y = ancora.y + trecho * i;
        pts.push({ x: casa.x, y, px: casa.x, py: y, w: i === 0 ? 0 : i === PASSOS ? 0.35 : 1 });
      }
      limites = {
        x1: rs.left - rf.left + 24, x2: rs.right - rf.left - 24,
        y1: ancora.y + 30, y2: rs.bottom - rf.top - 40
      };
      /* Calibração: a gravidade estica o cordão e a ponta repousava ~7px
         abaixo da casa, com a foto fora do lugar dela no grid. Simula até o
         repouso, mede o quanto esticou e encurta o cordão nessa medida; três
         rodadas bastam para ficar abaixo de um décimo de pixel. */
      for (let rodada = 0; rodada < 3; rodada++) {
        for (let k = 0; k < 360; k++) passo();
        const sobraY = pts[pts.length - 1].y - casa.y;
        if (Math.abs(sobraY) < 0.1) break;
        trecho = Math.max(1, trecho - sobraY / PASSOS);
      }
      for (const p of pts) { p.px = p.x; p.py = p.y; }
      theta = omega = phiV = inclina = 0;
      desenhar();
    }

    function passo() {
      const g = G * DT * DT;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + g;
      }
      const ponta = pts[pts.length - 1];
      if (arrastando) {
        ponta.x = alvo.x; ponta.y = alvo.y;
      } else {
        ponta.x += (casa.x - ponta.x) * MOLA_CASA;
        ponta.y += (casa.y - ponta.y) * MOLA_CASA;
      }
      for (let k = 0; k < ITER; k++) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const wa = a.w, wb = arrastando && i + 1 === pts.length - 1 ? 0 : b.w;
          if (wa + wb === 0) continue;
          const dif = (d - trecho) / d * RIGIDEZ;
          a.x += dx * dif * wa / (wa + wb); a.y += dy * dif * wa / (wa + wb);
          b.x -= dx * dif * wb / (wa + wb); b.y -= dy * dif * wb / (wa + wb);
        }
      }
      /* O cartão se alinha ao fim do cordão, com inércia própria. A direção é
         medida nos últimos quatro trechos, não só no último: com ~9px cada, um
         desvio lateral de 6px no último virava 33 graus de giro, e o crachá
         sacudia muito mais do que o cordão se mexia. */
      const pen = pts[Math.max(0, pts.length - 5)];
      const alvoTheta = Math.atan2(-(ponta.x - pen.x), ponta.y - pen.y);
      omega += (120 * (alvoTheta - theta) - 9 * omega) * DT;
      theta += omega * DT;
      const vx = (ponta.x - ponta.px) / DT;
      inclina += (Math.max(-0.55, Math.min(0.55, vx * 0.0016)) - inclina) * 0.12;
      phiV += (95 * (phiAlvo - phi) - 15 * phiV) * DT;
      phi += phiV * DT;
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
      costura.setAttribute('d', d);
      const ponta = pts[pts.length - 1];
      const tx = ponta.x - casa.x, ty = ponta.y - casa.y;
      cartao.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) rotate(' +
        theta.toFixed(4) + 'rad) rotateY(' + (phi + inclina).toFixed(4) + 'rad)';
      /* qual face está para a frente decide quem recebe o clique e o leitor */
      const deCostas = Math.cos(phi + inclina) < 0;
      cartao.classList.toggle('de-costas', deCostas);
    }

    function assentado() {
      if (arrastando) return false;
      const ponta = pts[pts.length - 1];
      let mov = Math.abs(omega) + Math.abs(phiV) + Math.abs(phiAlvo - phi) + Math.abs(inclina);
      mov += Math.hypot(ponta.x - casa.x, ponta.y - casa.y) * 0.05;
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
      else { omega = phiV = 0; inclina = 0; desenhar(); }
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
      const p = local(e);
      /* clique curto e parado vira o crachá */
      if (e.type === 'pointerup' && performance.now() - press.t < 320 && Math.hypot(p.x - press.x, p.y - press.y) < 6) {
        phiAlvo = phiAlvo ? 0 : Math.PI;
      }
      acordar();
    };
    cartao.addEventListener('pointerup', soltar);
    cartao.addEventListener('pointercancel', soltar);

    /* quando a foto entra (a máscara do .mask-reveal abre), o crachá ganha
       um empurrão lateral e balança até parar: é o que mostra que ele mexe */
    let balancou = false;
    const balancar = () => {
      if (balancou || !pts.length) return;
      balancou = true;
      const ponta = pts[pts.length - 1];
      ponta.px = ponta.x - 7;
      omega = 1.6;
      acordar();
    };
    if (retrato.classList.contains('in')) setTimeout(balancar, 400);
    else {
      const mo = new MutationObserver(() => {
        if (!retrato.classList.contains('in')) return;
        mo.disconnect();
        setTimeout(balancar, 650);
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
