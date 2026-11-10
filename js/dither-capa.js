/* ===== DITHER DAS IMAGENS DA CAPA =====
   Inspirado no Retro Dither do Canvas UI: as imagens que passam atrás do nome
   viram pixels grossos, com o brilho quantizado em poucos níveis por uma
   matriz de Bayer e a cor puxada para a paleta do site. Substitui o ruído que
   a capa usava como textura.

   Diferenças em relação ao original, a pedido:
   - Sem lente de cursor, sem rastro, sem clique. O nome da capa já reage ao
     mouse (hover cinético), e duas interações no mesmo quadro brigariam.
   - Vivo por conta própria: o dither cobre a imagem inteira, e é o zoom
     lento de cada foto e um brilho que deriva devagar pela tela que fazem os
     pixels mudarem de nível sozinhos, em manchas, como uma imagem de tubo.
   - Não captura HTML (o original depende de uma API experimental do Chrome):
     lê direto as <img> que o content-render já montou para a sequência.

   Quem manda na sequência continua sendo montarSlides(), no content-render.
   Ele publica o estado em caixa.__estado (qual imagem está ativa, qual está
   saindo, quando cada uma entrou e para que lado é o zoom) e este arquivo só
   desenha esse estado, quadro a quadro. Se o WebGL2 falhar, as <img> seguem
   aparecendo como antes, só que lisas.

   O canvas tem um pixel por célula de dither e é ampliado com pixelated:
   barato (a 1920 de largura são ~640 colunas) e nítido em qualquer tela. A
   versão do arquivo mora no content-render (DITHER_CAPA_V). */
(function () {
  'use strict';
  if (window.__DITHER_CAPA__) return;

  const VERTICE = `#version 300 es
void main() {
  vec2 canto = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(canto, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uView;
uniform vec2 uTamA;
uniform vec2 uTamB;
uniform float uZoomA;
uniform float uZoomB;
uniform float uMix;
uniform float uVeuA;
uniform float uVeuB;
uniform float uTempo;
uniform float uNiveis;
uniform float uCor;
uniform vec3 uEscuro;
uniform vec3 uClaro;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float bayer(ivec2 p) {
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[(p.y % 4) * 4 + (p.x % 4)]) + 0.5) / 16.0;
}
// object-fit:cover com zoom a partir do centro, como a <img> fazia
vec2 cobrir(vec2 uv, vec2 tam, float zoom) {
  float tela = uView.x / uView.y;
  float img = tam.x / tam.y;
  vec2 s = tela > img ? vec2(1.0, img / tela) : vec2(tela / img, 1.0);
  return (uv - 0.5) * s / zoom + 0.5;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uView;
  // a textura sobe sem inverter (a primeira linha é o topo da imagem), e o
  // gl_FragCoord conta de baixo: inverte aqui, que vale para <img> e bitmap
  vec2 st = vec2(uv.x, 1.0 - uv.y);
  vec3 a = texture(uA, cobrir(st, uTamA, uZoomA)).rgb * uVeuA;
  vec3 b = texture(uB, cobrir(st, uTamB, uZoomB)).rgb * uVeuB;
  vec3 c = mix(a, b, uMix);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  // brilho que deriva devagar: manchas largas que mudam o nível dos pixels
  // (a pedido, mais lento e mais suave que a primeira versão: deriva a um
  // terço da velocidade e com dois terços da força, e contraste menor)
  vec2 q = uv * vec2(uView.x / uView.y, 1.0) * 2.2;
  float deriva = ruido(q + vec2(uTempo * 0.02, uTempo * 0.012)) - 0.5;
  lum = clamp((lum - 0.5) * 1.12 + 0.5 + deriva * 0.09, 0.0, 1.0);
  float x = lum * uNiveis;
  float nivel = floor(x + step(bayer(ivec2(gl_FragCoord.xy)), fract(x))) / uNiveis;
  vec3 paleta = mix(uEscuro, uClaro, nivel);
  vec3 matiz = c * (nivel / max(lum, 0.001));
  outColor = vec4(mix(matiz, paleta, uCor), 1.0);
}`;

  function compilar(gl) {
    const p = gl.createProgram();
    for (const [tipo, fonte] of [[gl.VERTEX_SHADER, VERTICE], [gl.FRAGMENT_SHADER, FRAG]]) {
      const s = gl.createShader(tipo);
      if (!s) return null;
      gl.shaderSource(s, fonte);
      gl.compileShader(s);
      gl.attachShader(p, s);
      gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return null; }
    return p;
  }

  /* Cor de um token do CSS em [r, g, b] de 0 a 1, por um canvas de 1x1. */
  function lerCor(host, nome) {
    const valor = getComputedStyle(host).getPropertyValue(nome).trim();
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx || !valor) return [0, 0, 0];
    ctx.fillStyle = valor;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  }

  /* Zoom de cada imagem: 2000ms lineares a partir do instante em que ela
     entrou, aproximando ou afastando. 5% e não os 8% do CSS da <img>: no
     dither, cada fração de zoom faz células trocarem de nível, e 8% deixava
     a imagem fervendo; a pedido, o movimento ficou mais lento. */
  const ZOOM_MS = 2000, ZOOM = 0.05, FUNDIDO_MS = 450;
  function zoomDe(item, agora) {
    if (!item || !item.inicio) return 1;
    const t = Math.min(1, Math.max(0, (agora - item.inicio) / ZOOM_MS));
    return item.sentido > 0 ? 1 + ZOOM * t : 1 + ZOOM - ZOOM * t;
  }

  function montar(caixa, liquidBg, opcoes) {
    const o = Object.assign({ celula: 4, niveis: 6, cor: 0.7, fps: 24 }, opcoes || {});
    const estado = caixa.__estado;
    if (!estado || !estado.slides.length) return null;

    const canvas = document.createElement('canvas');
    canvas.className = 'hero-dither';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'low-power'
    });
    const prog = gl && compilar(gl);
    if (!gl || !prog) {
      const perder = gl && gl.getExtension('WEBGL_lose_context');
      if (perder) perder.loseContext();
      return null;
    }
    caixa.insertBefore(canvas, caixa.firstChild);

    const u = n => gl.getUniformLocation(prog, n);
    gl.useProgram(prog);
    gl.uniform1i(u('uA'), 0);
    gl.uniform1i(u('uB'), 1);
    gl.uniform1f(u('uNiveis'), o.niveis);
    gl.uniform1f(u('uCor'), o.cor);
    gl.uniform3f(u('uEscuro'), ...lerCor(caixa, '--dither-capa-escuro'));
    gl.uniform3f(u('uClaro'), ...lerCor(caixa, '--dither-capa-claro'));

    /* Textura de cada imagem, reduzida para no máximo 1280px de largura: a
       saída tem ~640 colunas, e seis fotos de 2000px em RGBA com mipmap
       passariam de 80MB de memória de vídeo. Sobe sob demanda, quando a
       imagem vira a ativa pela primeira vez. */
    const texturas = new Map();
    const pendentes = new Set();
    function texturaDe(slide) {
      if (texturas.has(slide.img)) return texturas.get(slide.img);
      const img = slide.img;
      if (pendentes.has(img) || !img.complete || !img.naturalWidth) return null;
      pendentes.add(img);
      const escala = Math.min(1, 1280 / img.naturalWidth);
      const w = Math.max(1, Math.round(img.naturalWidth * escala));
      const h = Math.max(1, Math.round(img.naturalHeight * escala));
      const subir = fonte => {
        pendentes.delete(img);
        if (destruido) return;
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        texturas.set(img, { t, w, h });
        if (fonte.close) fonte.close();
        desenhar(performance.now());
      };
      if (window.createImageBitmap) {
        createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
          .then(subir, () => subir(img));
      } else {
        subir(img);
      }
      return null;
    }

    let largCss = 0, altCss = 0, tempo = 0, anterior = 0, quadro = 0, destruido = false, pronto = false;
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)');

    function medir() {
      const w = caixa.clientWidth, h = caixa.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      const porCelula = Math.max(1, Math.round(o.celula * dpr));
      const cssPorCelula = porCelula / dpr;
      const cx = Math.ceil((w * dpr) / porCelula);
      const cy = Math.ceil((h * dpr) / porCelula);
      canvas.width = cx;
      canvas.height = cy;
      largCss = cx * cssPorCelula;
      altCss = cy * cssPorCelula;
      canvas.style.width = largCss + 'px';
      canvas.style.height = altCss + 'px';
      gl.viewport(0, 0, cx, cy);
      desenhar(performance.now());
    }

    function desenhar(agora) {
      if (destruido || !largCss) return;
      const atual = estado.slides[estado.atual];
      const saindo = estado.anterior != null ? estado.slides[estado.anterior] : null;
      const tb = atual && texturaDe(atual);
      if (!tb) return;
      /* a que sai continua por baixo até a nova cobrir; sem ela, a nova
         aparece sobre a própria cor, sem fundido */
      const ta = (saindo && texturaDe(saindo)) || tb;
      const fundido = saindo && ta !== tb && atual.inicio
        ? Math.min(1, Math.max(0, (agora - atual.inicio) / FUNDIDO_MS)) : 1;
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ta.t);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tb.t);
      gl.uniform2f(u('uView'), canvas.width, canvas.height);
      gl.uniform2f(u('uTamA'), ta.w, ta.h);
      gl.uniform2f(u('uTamB'), tb.w, tb.h);
      gl.uniform1f(u('uZoomA'), reduzido.matches ? 1 : zoomDe(ta === tb ? atual : saindo, agora));
      gl.uniform1f(u('uZoomB'), reduzido.matches ? 1 : zoomDe(atual, agora));
      gl.uniform1f(u('uMix'), fundido);
      /* capa clara (coverLight): o mesmo véu a mais que a <img> recebia */
      gl.uniform1f(u('uVeuA'), (ta === tb ? atual : saindo).clara ? 0.7 : 1);
      gl.uniform1f(u('uVeuB'), atual.clara ? 0.7 : 1);
      gl.uniform1f(u('uTempo'), tempo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!pronto) {
        pronto = true;
        caixa.classList.add('dither-pronto');
      }
      /* as próximas sobem antes de precisarem: a troca não espera upload */
      for (const s of estado.slides) if (!texturas.has(s.img)) texturaDe(s);
    }

    const rodando = () => !destruido && !document.hidden && !reduzido.matches && !liquidBg.classList.contains('parado');
    function tick(agora) {
      quadro = requestAnimationFrame(tick);
      if (anterior && agora - anterior < 1000 / o.fps - 2) return;
      tempo += anterior ? Math.min((agora - anterior) / 1000, 2) : 0;
      anterior = agora;
      desenhar(agora);
    }
    function sync() {
      const deve = rodando();
      if (deve && !quadro) { anterior = 0; quadro = requestAnimationFrame(tick); }
      else if (!deve && quadro) { cancelAnimationFrame(quadro); quadro = 0; }
      if (!deve) desenhar(performance.now());
    }

    const ro = new ResizeObserver(medir);
    const mo = new MutationObserver(sync);   // .parado, posto pelo main.js
    medir();
    sync();
    ro.observe(caixa);
    mo.observe(liquidBg, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', sync);
    reduzido.addEventListener('change', sync);
    /* montarSlides avisa a cada troca, para o primeiro quadro da imagem nova
       sair na hora mesmo com o laço parado (movimento reduzido) */
    caixa.__aoTrocar = () => desenhar(performance.now());

    return {
      destruir() {
        destruido = true;
        cancelAnimationFrame(quadro);
        ro.disconnect();
        mo.disconnect();
        document.removeEventListener('visibilitychange', sync);
        reduzido.removeEventListener('change', sync);
        caixa.__aoTrocar = null;
        texturas.forEach(v => gl.deleteTexture(v.t));
        gl.deleteProgram(prog);
        const perder = gl.getExtension('WEBGL_lose_context');
        if (perder) perder.loseContext();
        canvas.remove();
        caixa.classList.remove('dither-pronto');
      }
    };
  }

  window.__DITHER_CAPA__ = { montar };
})();
