/* ===== CURSOR ALVO (React Bits, Target Cursor) =====
   Quatro cantos girando em volta de um ponto; sobre um link, botão ou card,
   os cantos param de girar e abraçam o elemento, com uma folga. Porte do
   código público do React Bits (TargetCursor.jsx, que não usa biblioteca:
   só molas), com a configuração que Pedro mandou do painel de lá, preset
   "Calm": giro de 5s, hover de 0,3s, 25px, cantos de 8px, traço de 2px,
   folga de 6px, ponto de 4px, raio acompanhando o do alvo, paralaxe,
   rótulo, efeito de clique e cursor do sistema escondido.

   O que mudou em relação ao original, e por quê:
   - Cor: o #ffffff do painel virou --paper (o branco quente do site), lido
     pelo CSS em --cursor-alvo-cor. Igual dentro e fora do alvo, como lá.
   - Mistura por diferença em cada peça, não numa camada de tela cheia. No
     original o blend fica no contêiner fixo que cobre a janela, e o CLAUDE.md
     proíbe blend em tela cheia (custa como um filter:blur). Aqui os quatro
     cantos, o ponto e o rótulo são elementos fixos soltos no <body>, cada um
     com o próprio blend: a área misturada é só a deles.
   - Nenhum listener de scroll próprio. O original reavalia o alvo num scroll
     de captura; aqui quem chama aoRolar() é o laço de rolagem do main.js, o
     único do site, a cada quadro em que o conteúdo anda (com a rolagem por
     transform, o conteúdo continua andando depois do último evento).
   - Rótulo: nos cards da Home ele diz "Ver projeto" / "View project" e
     substitui o selo que seguia o ponteiro (escondido neste modo pelo CSS).
     Fora deles, só aparece se o elemento tiver data-cursor-label.
   - Campos de texto não são alvo: sobre eles o cursor alvo some e volta o
     I-beam do sistema, que diz onde o texto vai entrar.
   Só com mouse de verdade e sem movimento reduzido; quem decide é o main.js
   (effects.cursor.mode 'target' no global.json), que baixa este arquivo sob
   demanda (CURSOR_ALVO_V). */
(function () {
  'use strict';
  if (window.__CURSOR_ALVO__) return;

  const CONFIG = {
    giro: 5,          // s por volta, solto
    hover: 0.3,       // s para abraçar o alvo
    tamanho: 25,      // px, lado do quadrado solto
    canto: 8,         // px, cada canto
    espessura: 2,     // px, traço
    folga: 6,         // px em volta do alvo
    ponto: 4,         // px, ponto central
    raio: true,       // canto acompanha o border-radius do alvo
    paralaxe: true,   // o abraço se inclina um pouco para o ponteiro
    rotulo: true,
    clique: true
  };
  const ALVOS = 'a[href], button:not([disabled]), [role="button"], summary, label[for], .cards .card';
  const CAMPO = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';
  const ANGULOS = [0, 90, 180, 270];
  const QUARTO = Math.PI / 2;

  /* mola integrada em dois meios-passos, como no original */
  const mola = (s, alvo, k, c, dt) => {
    const h = dt / 2;
    for (let i = 0; i < 2; i++) {
      s.v += (k * (alvo - s.x) - c * s.v) * h;
      s.x += s.v * h;
    }
  };

  function rotuloDe(alvo) {
    if (!alvo || !CONFIG.rotulo) return '';
    const en = (document.documentElement.lang || 'pt').indexOf('en') === 0;
    if (alvo.matches('.cards .card')) return en ? 'View project' : 'Ver projeto';
    return alvo.getAttribute(en ? 'data-cursor-label-en' : 'data-cursor-label-pt') ||
      alvo.getAttribute('data-cursor-label') || '';
  }

  function montar() {
    const criar = cls => {
      const el = document.createElement('span');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      return el;
    };
    const cantos = ANGULOS.map(() => {
      const c = criar('cursor-alvo-canto');
      c.style.width = c.style.height = CONFIG.canto + 'px';
      c.style.borderWidth = CONFIG.espessura + 'px 0 0 ' + CONFIG.espessura + 'px';
      return c;
    });
    const ponto = criar('cursor-alvo-ponto');
    ponto.style.width = ponto.style.height = CONFIG.ponto + 'px';
    const rotulo = criar('cursor-alvo-rotulo');
    const pecas = cantos.concat([ponto, rotulo]);
    document.documentElement.classList.add('cursor-alvo');

    const ponteiro = { x: 0, y: 0, dentro: false, visto: false, apertado: false };
    const cx = { x: 0, v: 0 }, cy = { x: 0, v: 0 };
    const meiaL = { x: 0, v: 0 }, meiaA = { x: 0, v: 0 };
    const raio = { x: 0, v: 0 }, volta = { x: 0, v: 0 };
    const trava = { x: 0, v: 0 }, aperto = { x: 0, v: 0 }, presenca = { x: 0, v: 0 };
    let alvo = null, raioDoAlvo = 0, quarto = 0, velGiro = 0;
    let raf = 0, ultimo = 0, ultimoRotulo = '', opacAnterior = -1;

    const acharAlvo = el => {
      const no = el || document.elementFromPoint(ponteiro.x, ponteiro.y);
      return (no && no.closest && no.closest(ALVOS)) || null;
    };
    const travar = proximo => {
      if (proximo === alvo) return;
      alvo = proximo;
      if (alvo) {
        quarto = Math.round(volta.x / QUARTO);
        raioDoAlvo = parseFloat(getComputedStyle(alvo).borderTopLeftRadius) || 0;
        velGiro = 0;
      }
    };

    const quadro = agora => {
      raf = 0;
      const dt = ultimo ? Math.min(0.05, (agora - ultimo) / 1000) : 1 / 60;
      ultimo = agora;

      if (alvo && !alvo.isConnected) travar(null);
      const caixa = alvo ? alvo.getBoundingClientRect() : null;
      const travado = !!caixa && ponteiro.dentro;
      const w0 = 4.6 / CONFIG.hover;
      const k = w0 * w0;
      const c = 2 * 0.62 * w0;

      mola(presenca, ponteiro.dentro ? 1 : 0, 260, 32, dt);
      mola(trava, travado ? 1 : 0, k, 2 * w0, dt);
      mola(aperto, ponteiro.apertado && CONFIG.clique ? 1 : 0, 900, 40, dt);

      let gx = ponteiro.x, gy = ponteiro.y;
      let gl = CONFIG.tamanho / 2, ga = CONFIG.tamanho / 2;
      let gr = Math.min(2, CONFIG.canto / 4);
      if (travado) {
        const mx = caixa.left + caixa.width / 2;
        const my = caixa.top + caixa.height / 2;
        const inclina = CONFIG.paralaxe ? 0.08 : 0;
        gx = mx + (ponteiro.x - mx) * inclina;
        gy = my + (ponteiro.y - my) * inclina;
        const impar = Math.abs(quarto) % 2 === 1;
        const l = caixa.width / 2 + CONFIG.folga;
        const a = caixa.height / 2 + CONFIG.folga;
        gl = impar ? a : l;
        ga = impar ? l : a;
        gr = CONFIG.raio ? Math.min(raioDoAlvo + Math.max(0, CONFIG.folga), CONFIG.canto) : 0;
      }

      if (!ponteiro.dentro && presenca.x < 0.01) ponteiro.visto = false;
      if (!ponteiro.visto) {
        cx.x = gx; cy.x = gy; meiaL.x = gl; meiaA.x = ga;
        ponteiro.visto = ponteiro.dentro;
      }

      const segue = travado ? k : 2200;
      const segueC = travado ? c : 2 * Math.sqrt(2200);
      mola(cx, gx, segue, segueC, dt);
      mola(cy, gy, segue, segueC, dt);
      mola(meiaL, gl, k, c, dt);
      mola(meiaA, ga, k, c, dt);
      mola(raio, gr, k, 2 * w0, dt);

      if (travado) {
        mola(volta, quarto * QUARTO, k, c, dt);
      } else {
        const alvoVel = CONFIG.giro > 0 ? (Math.PI * 2) / CONFIG.giro : 0;
        velGiro += (alvoVel - velGiro) * (1 - Math.exp(-dt * 3));
        volta.v = velGiro;
        volta.x += velGiro * dt;
      }

      const aperta = 1 - aperto.x * 0.14;
      const cos = Math.cos(volta.x), sin = Math.sin(volta.x);
      const w = Math.max(0, meiaL.x) * aperta;
      const h = Math.max(0, meiaA.x) * aperta;
      const locais = [[-w, -h], [w, -h], [w, h], [-w, h]];
      const r = Math.max(0, Math.min(raio.x, CONFIG.canto));
      const graus = volta.x * 180 / Math.PI;
      let esq = Infinity, topo = Infinity;
      cantos.forEach((canto, i) => {
        const lx = locais[i][0], ly = locais[i][1];
        const x = cx.x + lx * cos - ly * sin;
        const y = cy.x + lx * sin + ly * cos;
        esq = Math.min(esq, x);
        topo = Math.min(topo, y);
        canto.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' + (ANGULOS[i] + graus).toFixed(2) + 'deg)';
        canto.style.borderTopLeftRadius = r.toFixed(2) + 'px';
      });

      const escalaPonto = 1 - aperto.x * 0.35;
      ponto.style.transform = 'translate3d(' + ponteiro.x + 'px,' + ponteiro.y + 'px,0) translate(-50%,-50%) scale(' + escalaPonto.toFixed(3) + ')';

      const texto = travado ? rotuloDe(alvo) : '';
      if (texto && texto !== ultimoRotulo) { rotulo.textContent = texto; ultimoRotulo = texto; }
      const mostra = texto ? Math.max(0, Math.min(1, trava.x)) : 0;
      rotulo.style.transform = 'translate3d(' + esq.toFixed(2) + 'px,' + (topo - 8).toFixed(2) + 'px,0) translateY(-100%) translateY(' + ((1 - mostra) * 4).toFixed(2) + 'px)';

      const opac = Math.max(0, Math.min(1, presenca.x));
      if (Math.abs(opac - opacAnterior) > 0.001) {
        opacAnterior = opac;
        cantos.forEach(cn => { cn.style.opacity = opac.toFixed(3); });
        ponto.style.opacity = opac.toFixed(3);
      }
      rotulo.style.opacity = (mostra * opac).toFixed(3);

      const parado = !ponteiro.dentro && presenca.x < 0.002 && Math.abs(presenca.v) < 0.002 &&
        Math.abs(trava.x) < 0.002 && Math.abs(aperto.x) < 0.002;
      const girando = ponteiro.dentro && !travado && velGiro > 0.0001;
      const andando =
        Math.abs(cx.v) + Math.abs(cy.v) + Math.abs(meiaL.v) + Math.abs(meiaA.v) + Math.abs(volta.v) > 0.01 ||
        Math.abs(gx - cx.x) + Math.abs(gy - cy.x) > 0.05 ||
        Math.abs(trava.v) + Math.abs(aperto.v) + Math.abs(presenca.v) > 0.001;
      if (!parado && (girando || andando || travado)) raf = requestAnimationFrame(quadro);
      else ultimo = 0;
    };
    const acordar = () => { if (!raf) raf = requestAnimationFrame(quadro); };

    const eventos = new AbortController();
    const op = { passive: true, signal: eventos.signal };
    const mover = e => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      ponteiro.x = e.clientX;
      ponteiro.y = e.clientY;
      /* sobre campo de texto o alvo some e volta o I-beam do sistema */
      const emCampo = !!(e.target && e.target.closest && e.target.closest(CAMPO));
      ponteiro.dentro = !emCampo;
      travar(emCampo ? null : acharAlvo(e.target));
      acordar();
    };
    window.addEventListener('pointermove', mover, op);
    window.addEventListener('pointerdown', e => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      ponteiro.apertado = true;
      acordar();
    }, op);
    window.addEventListener('pointerup', () => { ponteiro.apertado = false; acordar(); }, op);
    const sair = () => {
      ponteiro.dentro = false;
      ponteiro.apertado = false;
      travar(null);
      acordar();
    };
    document.documentElement.addEventListener('pointerleave', sair, { signal: eventos.signal });
    window.addEventListener('blur', sair, { signal: eventos.signal });

    return {
      /* chamado pelo laço de rolagem do main.js: o conteúdo andou embaixo de
         um ponteiro parado, então o alvo pode ter mudado */
      aoRolar() {
        if (!ponteiro.dentro) return;
        travar(acharAlvo());
        acordar();
      },
      destruir() {
        eventos.abort();
        if (raf) cancelAnimationFrame(raf);
        pecas.forEach(p => p.remove());
        document.documentElement.classList.remove('cursor-alvo');
      }
    };
  }

  window.__CURSOR_ALVO__ = { montar };
})();
