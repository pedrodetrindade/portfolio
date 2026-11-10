/* ===== DITHER NO FUNDO DO RODAPÉ =====
   Porte sem framework do dither-field do Magic UI (footer.background.type
   'dither'). Duas passagens em WebGL2: um campo de luz é desenhado pequeno
   numa textura com mipmap, e a segunda passagem lê esse campo com um brilho
   tirado dos mipmaps desfocados e o corta contra uma matriz de Bayer 8x8 em
   pontos quadrados. Um pixel do canvas é um ponto, ampliado com
   image-rendering:pixelated, então o ponto fica nítido em qualquer tela.

   O que mudou em relação ao original, e por quê:
   - Só o padrão "ondas" (escolha do Pedro, depois de ver o horizonte no ar).
     O original enche a tela por igual e fica mais forte em cima, onde mora a
     headline; aqui o peso vertical foi redesenhado para a faixa vazia do
     rodapé, e as ondas quase somem atrás do texto pequeno.
   - As cores não vêm de prop: saem de --dither-low/-mid/-high no CSS, que
     apontam para os tokens da paleta. Mudar a cor é mexer no CSS.
   - Nada de IntersectionObserver: dentro do .smooth-holder ele não dispara
     (ver CLAUDE.md). Quem diz se o rodapé está perto é o laço de rolagem do
     main.js, que põe .parado no host pelo mesmo mecanismo do .liquid-bg; este
     arquivo só observa a classe.
   - Sem imagem nem vídeo como fonte.

   Carregado sob demanda pelo content-render.js, quando o gatilho do rodapé
   entra em cena. A versão do arquivo mora lá (DITHER_V): ao editar este
   arquivo, suba aquela constante e o ?v= do content-render nas páginas. */
(function () {
  'use strict';
  if (window.__DITHER__) return;

  const VERTICE = `#version 300 es
void main() {
  vec2 canto = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(canto, 0.0, 1.0);
}`;

  /* Campo de luz: p é a posição em px de CSS a partir do canto inferior
     esquerdo, size o tamanho do campo, t o tempo em segundos. */
  const CAMPO = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform vec2 uView;
uniform float uTime;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = turn * p * 2.0 + 11.7;
    amp *= 0.5;
  }
  return sum;
}
float pattern(vec2 p, vec2 size, float t) {
  // Ondas do original: cristas diagonais largas que descem da esquerda para
  // a direita e deslizam, com a fase empurrada por um ruído lento.
  vec2 q = p / 32.0;
  float warp = fbm(q * 0.09 + vec2(t * 0.035, t * 0.02));
  float s = 0.5 + 0.5 * sin(q.x * 0.9 + q.y * 0.6 + warp * 5.0 - t * 0.4);
  // crista mais larga que a do original (s^4): a onda entra e sai em
  // gradiente longo, e os pontos acendem aos poucos em vez de em faixa dura
  float crest = pow(s, 2.5);
  // O original fica mais forte em cima, justamente onde mora a headline. Aqui
  // o peso vai para a faixa vazia entre o conteúdo e a linha de baixo, e cai
  // nas duas pontas: some rente ao crédito e ao "voltar ao topo" (texto
  // pequeno sobre pontos perde leitura) e fica fraco atrás da headline, do
  // e-mail e da navegação, só o bastante para a onda continuar inteira.
  // Em tela vertical o crédito ocupa uma faixa mais alta, então a base sobe.
  float y = p.y / size.y;
  float retrato = step(size.x, size.y);
  float base = smoothstep(mix(0.1, 0.19, retrato), mix(0.24, 0.3, retrato), y);
  // no celular a navegação desce para o meio da tela: as ondas apagam antes
  float topo = mix(1.0, 0.16, smoothstep(mix(0.34, 0.27, retrato), mix(0.56, 0.4, retrato), y));
  float peso = base * topo;
  return (crest + 0.12 * warp) * peso;
}
void main() {
  vec2 p = gl_FragCoord.xy / uView * uSize;
  float v = pattern(p, uSize, uTime);
  outColor = vec4(clamp(v, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

  const DITHER = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uView;
uniform vec4 uLow;
uniform vec4 uMid;
uniform vec4 uHigh;
uniform float uIntensity;
uniform vec3 uRastro[24];
uniform float uRaio;
uniform float uDot;
out vec4 outColor;

// Limiar ordenado 8x8, montado a partir da matriz 2x2 [0 2; 3 1].
float threshold(vec2 cell) {
  vec2 c = floor(cell);
  float sum = 0.0;
  float weight = 16.0;
  for (int i = 0; i < 3; i++) {
    vec2 b = mod(c, 2.0);
    sum += weight * mod(2.0 * b.x + 3.0 * b.y, 4.0);
    c = floor(c * 0.5);
    weight *= 0.25;
  }
  return (sum + 0.5) / 64.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uView;
  float base = texture(uField, uv).r;
  float halo = textureLod(uField, uv, 1.0).r * 0.45
             + textureLod(uField, uv, 2.2).r * 0.35
             + textureLod(uField, uv, 3.4).r * 0.2;
  float v = base + 0.55 * halo;
  float over = max(v - 0.85, 0.0);
  v = min(v, 0.85) + over / (1.0 + 4.0 * over);
  v = clamp(v * uIntensity, 0.0, 1.0);
  // Borracha: o cursor e o rastro dele apagam os pontos, e o rastro volta a
  // se encher devagar (a força de cada ponto cai com a idade, no JS).
  vec2 aqui = gl_FragCoord.xy * uDot;
  float apaga = 0.0;
  for (int i = 0; i < 24; i++) {
    vec3 r = uRastro[i];
    if (r.z <= 0.001) continue;
    vec2 d = aqui - r.xy;
    apaga = max(apaga, r.z * exp(-dot(d, d) / uRaio));
  }
  v *= 1.0 - apaga;
  v = max(v - 0.02, 0.0) / 0.98;
  float on = step(threshold(gl_FragCoord.xy), v);
  vec4 c = v < 0.5 ? mix(uLow, uMid, v * 2.0) : mix(uMid, uHigh, v * 2.0 - 1.0);
  outColor = vec4(c.rgb * c.a, c.a) * on;
}`;

  /* o campo é desenhado a 60% do tamanho e depois "floresce" pelos mipmaps */
  const ESCALA_CAMPO = 0.6;
  /* Borracha do cursor: até 24 pontos de rastro, raio de ~46px (2σ² no
     shader) e 1,6s para o rastro se encher de novo. No original o cursor
     acendia os pontos; aqui, a pedido, ele apaga. */
  const PONTOS_RASTRO = 24;
  const RAIO_BORRACHA = 2 * 46 * 46;
  const CURA_S = 1.6;

  function compilar(gl, fragmento) {
    const programa = gl.createProgram();
    for (const [tipo, fonte] of [[gl.VERTEX_SHADER, VERTICE], [gl.FRAGMENT_SHADER, fragmento]]) {
      const s = gl.createShader(tipo);
      if (!s) return null;
      gl.shaderSource(s, fonte);
      gl.compileShader(s);
      gl.attachShader(programa, s);
      gl.deleteShader(s);
    }
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
      gl.deleteProgram(programa);
      return null;
    }
    return programa;
  }

  function textura(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function criarRenderer(gl) {
    const campo = compilar(gl, CAMPO);
    const dither = compilar(gl, DITHER);
    if (!campo || !dither) {
      if (campo) gl.deleteProgram(campo);
      if (dither) gl.deleteProgram(dither);
      return null;
    }
    const em = (p, nome) => gl.getUniformLocation(p, nome);
    const texCampo = textura(gl);
    const fb = gl.createFramebuffer();
    let vista = [1, 1], vistaCampo = [1, 1], css = [1, 1];
    gl.useProgram(dither);
    gl.uniform1i(em(dither, 'uField'), 0);

    return {
      redimensionar(pontosX, pontosY, cssX, cssY) {
        vista = [pontosX, pontosY];
        css = [cssX, cssY];
        vistaCampo = [Math.max(1, Math.round(cssX * ESCALA_CAMPO)), Math.max(1, Math.round(cssY * ESCALA_CAMPO))];
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texCampo);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vistaCampo[0], vistaCampo[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texCampo, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      rampa([baixo, meio, alto]) {
        gl.useProgram(dither);
        gl.uniform4f(em(dither, 'uLow'), ...baixo);
        gl.uniform4f(em(dither, 'uMid'), ...meio);
        gl.uniform4f(em(dither, 'uHigh'), ...alto);
      },
      intensidade(v) {
        gl.useProgram(dither);
        gl.uniform1f(em(dither, 'uIntensity'), v);
      },
      desenhar(tempo, rastro) {
        gl.useProgram(campo);
        gl.uniform2f(em(campo, 'uSize'), css[0], css[1]);
        gl.uniform2f(em(campo, 'uView'), vistaCampo[0], vistaCampo[1]);
        gl.uniform1f(em(campo, 'uTime'), tempo);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.viewport(0, 0, vistaCampo[0], vistaCampo[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texCampo);
        gl.generateMipmap(gl.TEXTURE_2D);

        gl.useProgram(dither);
        gl.uniform2f(em(dither, 'uView'), vista[0], vista[1]);
        gl.uniform1f(em(dither, 'uDot'), css[0] / vista[0]);
        gl.uniform3fv(em(dither, 'uRastro[0]'), rastro);
        gl.uniform1f(em(dither, 'uRaio'), RAIO_BORRACHA);
        gl.viewport(0, 0, vista[0], vista[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      descartar() {
        gl.deleteProgram(campo);
        gl.deleteProgram(dither);
        gl.deleteTexture(texCampo);
        gl.deleteFramebuffer(fb);
      }
    };
  }

  /* Lê as três cores dos tokens do CSS e as converte em RGBA por um canvas de
     1x1, que entende qualquer sintaxe de cor que o navegador entenda. */
  function lerRampa(host) {
    const cs = getComputedStyle(host);
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    return ['--dither-low', '--dither-mid', '--dither-high'].map(nome => {
      const valor = cs.getPropertyValue(nome).trim();
      if (!ctx || !valor) return [0.5, 0.5, 0.5, 1];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = 'transparent';
      ctx.fillStyle = valor;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
    });
  }

  function montar(host, opcoes) {
    /* intensidade e velocidade mais baixas que a primeira versão: a pedido,
       as ondas ficaram mais suaves e mais lentas */
    /* A pedido, mais suave e mais fluido a cada volta: 60 quadros (a 30 a
       onda andava em degraus visíveis), velocidade .5 e intensidade .26 (as
       cristas mais largas ocupam mais área, então a intensidade desce junto) */
    const o = Object.assign({ ponto: 2, intensidade: 0.26, velocidade: 0.5, fps: 60 }, opcoes || {});
    const canvas = document.createElement('canvas');
    canvas.className = 'dither-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false,
      depth: false, stencil: false, powerPreference: 'low-power'
    });
    const r = gl ? criarRenderer(gl) : null;
    if (!gl || !r) {
      /* sem WebGL2: o CSS desenha uma grade de pontos parada no lugar */
      const perder = gl && gl.getExtension('WEBGL_lose_context');
      if (perder) perder.loseContext();
      host.classList.add('sem-webgl');
      return { destruir() { host.classList.remove('sem-webgl'); } };
    }
    host.appendChild(canvas);

    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ponteiro = { cx: 0, cy: 0, on: false };
    /* Rastro da borracha, gravado no próprio evento do ponteiro (em
       coordenadas da janela e relógio real), não a cada quadro do laço: assim
       o caminho sai inteiro mesmo numa máquina que desenha poucos quadros.
       Cada ponto nasce com força 1 e some em CURA_S segundos; o laço só
       converte para o campo e deixa curar. */
    const rastro = [];
    const uniforme = new Float32Array(PONTOS_RASTRO * 3);
    const agoraS = () => performance.now() / 1000;
    let tempo = 10, anterior = 0, quadro = 0, alturaCss = 0, perdido = false;

    function encherUniforme() {
      uniforme.fill(0);
      if (!rastro.length) return;
      const caixa = host.getBoundingClientRect();
      const agora = agoraS();
      for (let i = 0; i < rastro.length && i < PONTOS_RASTRO; i++) {
        const p = rastro[rastro.length - 1 - i];
        const idade = Math.min(1, (agora - p.t) / CURA_S);
        uniforme[i * 3] = p.cx - caixa.left;
        uniforme[i * 3 + 1] = caixa.top + alturaCss - p.cy;
        uniforme[i * 3 + 2] = 1 - idade * idade * (3 - 2 * idade);
      }
    }
    const desenhar = () => {
      if (!alturaCss || perdido) return;
      encherUniforme();
      r.desenhar(tempo, uniforme);
      canvas.classList.add('is-pronto');
    };
    const pintar = () => {
      r.rampa(lerRampa(host));
      r.intensidade(o.intensidade);
      desenhar();
    };

    /* Um ponto é um número inteiro de pixels do aparelho, então os pontos
       ficam quadrados e nítidos em qualquer densidade. O canvas pode passar
       da caixa por menos de um ponto; o host recorta. Medida de layout, não
       de transform, para a entrada animada do rodapé não encolher a grade. */
    const medir = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      const porPonto = Math.max(1, Math.round(o.ponto * dpr));
      const cssPorPonto = porPonto / dpr;
      const px = Math.ceil((w * dpr) / porPonto);
      const py = Math.ceil((h * dpr) / porPonto);
      alturaCss = py * cssPorPonto;
      canvas.width = px;
      canvas.height = py;
      canvas.style.width = (px * cssPorPonto) + 'px';
      canvas.style.height = alturaCss + 'px';
      r.redimensionar(px, py, px * cssPorPonto, alturaCss);
      desenhar();
    };

    const rodando = () => !perdido && !document.hidden && !reduzido.matches && !host.classList.contains('parado');
    const tick = agora => {
      quadro = requestAnimationFrame(tick);
      if (anterior && agora - anterior < 1000 / o.fps - 2) return;
      /* tempo real desde o último quadro desenhado, com teto de 2s para uma
         thread travada não dar um salto no campo */
      const dt = anterior ? Math.min((agora - anterior) / 1000, 2) : 0;
      anterior = agora;
      tempo += dt * o.velocidade;
      /* cursor parado sobre o rodapé continua apagando onde está */
      const seg = agoraS();
      const ultimo = rastro[rastro.length - 1];
      if (ponteiro.on && ultimo && ultimo.cx === ponteiro.cx && ultimo.cy === ponteiro.cy) ultimo.t = seg;
      while (rastro.length && seg - rastro[0].t >= CURA_S) rastro.shift();
      desenhar();
    };
    const sync = () => {
      const deve = rodando();
      if (deve && !quadro) { anterior = 0; quadro = requestAnimationFrame(tick); }
      else if (!deve && quadro) { cancelAnimationFrame(quadro); quadro = 0; }
    };

    /* dedo só conta enquanto encosta, senão a borracha fica presa onde tocou */
    const aoPonteiro = e => {
      if (e.pointerType === 'touch' && e.buttons === 0) return;
      ponteiro.cx = e.clientX;
      ponteiro.cy = e.clientY;
      ponteiro.on = true;
      /* um ponto novo a cada 12px de caminho; perto disso, renova o último */
      const u = rastro[rastro.length - 1];
      if (!u || Math.hypot(e.clientX - u.cx, e.clientY - u.cy) >= 12) {
        rastro.push({ cx: e.clientX, cy: e.clientY, t: agoraS() });
        if (rastro.length > PONTOS_RASTRO) rastro.shift();
      } else {
        u.cx = e.clientX; u.cy = e.clientY; u.t = agoraS();
      }
    };
    const aoSair = () => { ponteiro.on = false; };
    const aoSoltar = e => { if (e.pointerType === 'touch') ponteiro.on = false; };
    const aoPerder = e => {
      e.preventDefault();
      perdido = true;
      sync();
      canvas.classList.remove('is-pronto');
      host.classList.add('sem-webgl');
    };
    const aoMovimento = () => { sync(); if (reduzido.matches) desenhar(); };

    const ro = new ResizeObserver(medir);
    const mo = new MutationObserver(sync);   // .parado, posto pelo main.js
    medir();
    pintar();
    sync();
    ro.observe(host);
    mo.observe(host, { attributes: true, attributeFilter: ['class'] });
    reduzido.addEventListener('change', aoMovimento);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pointerdown', aoPonteiro, { passive: true });
    window.addEventListener('pointermove', aoPonteiro, { passive: true });
    window.addEventListener('pointerup', aoSoltar, { passive: true });
    window.addEventListener('pointercancel', aoSoltar, { passive: true });
    document.documentElement.addEventListener('pointerleave', aoSair);
    canvas.addEventListener('webglcontextlost', aoPerder);

    return {
      repintar: pintar,
      destruir() {
        cancelAnimationFrame(quadro);
        quadro = 0;
        ro.disconnect();
        mo.disconnect();
        reduzido.removeEventListener('change', aoMovimento);
        document.removeEventListener('visibilitychange', sync);
        window.removeEventListener('pointerdown', aoPonteiro);
        window.removeEventListener('pointermove', aoPonteiro);
        window.removeEventListener('pointerup', aoSoltar);
        window.removeEventListener('pointercancel', aoSoltar);
        document.documentElement.removeEventListener('pointerleave', aoSair);
        canvas.removeEventListener('webglcontextlost', aoPerder);
        r.descartar();
        const perder = gl.getExtension('WEBGL_lose_context');
        if (perder) perder.loseContext();
        canvas.remove();
        host.classList.remove('sem-webgl');
      }
    };
  }

  window.__DITHER__ = { montar };
})();
