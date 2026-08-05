/* ===== PAINEL ADMINISTRATIVO =====
   Vanilla JS, sem framework, sem bundler — o painel é servido como arquivo
   estático pelo próprio Worker (ver worker/wrangler.toml, bloco [assets]).
   Model: cada arquivo de conteúdo (global, home, projects/index, cada
   projeto) é carregado uma vez, guardado em memória junto com o SHA que o
   GitHub devolveu, e só é reescrito quando "Publicar" é clicado — a
   qualquer momento antes disso, "Descartar" volta tudo ao que está
   publicado agora. */
(function () {
  'use strict';

  var state = {
    global: null, globalSha: null,
    home: null, homeSha: null,
    projectsIndex: null, projectsIndexSha: null,
    projects: {}, /* slug -> {data, sha} */
    dirty: {}, /* path -> {data, sha, message} */
    editingSlug: null,
    previewUrl: localStorage.getItem('cms_preview_url') || ''
  };

  var LIMITS = {
    opacity: [0, 100], radius: [0, 200], borderWidth: [0, 20],
    contentWidth: [320, 2560], spacing: [0, 600], fontSize: [8, 300],
    columns: [1, 6], imageScale: [50, 200], gap: [0, 200]
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, range) { return Math.min(range[1], Math.max(range[0], Number(v) || 0)); }

  /* ---------- chamadas à API ---------- */
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) { var e = new Error(body.message || body.error || 'Erro'); e.body = body; e.status = res.status; throw e; }
        return body;
      });
    });
  }

  function toast(message, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 4500);
  }

  function markDirty(path, data, sha, message) {
    state.dirty[path] = { data: data, sha: sha, message: message || ('cms: atualiza ' + path) };
    updateDirtyIndicators();
    renderPublishPanel();
  }

  function updateDirtyIndicators() {
    var groups = {
      'content/global.json': ['appearance', 'layout', 'headerfooter'],
      'content/home.json': ['home', 'layout'],
      'content/projects/index.json': ['projects']
    };
    document.querySelectorAll('#navList button').forEach(function (b) { b.classList.remove('dirty'); });
    Object.keys(state.dirty).forEach(function (path) {
      var panels = groups[path] || (path.indexOf('content/projects/') === 0 ? ['projects'] : []);
      panels.forEach(function (p) {
        var btn = document.querySelector('#navList button[data-panel="' + p + '"]');
        if (btn) btn.classList.add('dirty');
      });
    });
  }

  /* ---------- construtores de campo ---------- */
  function fieldRow(labelText, hint, controlHtml) {
    return '<div class="field"><label>' + esc(labelText) +
      (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') +
      '</label><div class="control">' + controlHtml + '</div></div>';
  }

  function colorControl(id, hex, opacity) {
    return '<input type="color" id="' + id + '_hex" value="' + esc(hex || '#000000') + '">' +
      '<div class="num-with-slider">' +
      '<input type="range" id="' + id + '_op" min="0" max="100" value="' + (opacity != null ? opacity : 100) + '">' +
      '<input type="number" id="' + id + '_opn" min="0" max="100" value="' + (opacity != null ? opacity : 100) + '">' +
      '<span class="unit">% opacidade</span></div>';
  }

  function sliderControl(id, value, min, max, unit, step) {
    return '<div class="num-with-slider">' +
      '<input type="range" id="' + id + '_r" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + value + '">' +
      '<input type="number" id="' + id + '_n" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + value + '">' +
      '<span class="unit">' + unit + '</span></div>';
  }

  function switchControl(id, checked) {
    return '<label class="switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="track"><span class="thumb"></span></span></label>';
  }

  function bindSlider(id, min, max, onChange) {
    var range = document.getElementById(id + '_r'), num = document.getElementById(id + '_n');
    function sync(v, from) {
      v = clamp(v, [min, max]);
      range.value = v; num.value = v;
      onChange(v);
    }
    range.addEventListener('input', function () { sync(range.value); });
    num.addEventListener('change', function () { sync(num.value); });
  }

  function bindColor(id, onChange) {
    var hexEl = document.getElementById(id + '_hex');
    var opRange = document.getElementById(id + '_op'), opNum = document.getElementById(id + '_opn');
    function emit() { onChange(hexEl.value, clamp(opRange.value, [0, 100])); }
    hexEl.addEventListener('input', emit);
    opRange.addEventListener('input', function () { opNum.value = opRange.value; emit(); });
    opNum.addEventListener('change', function () { opRange.value = clamp(opNum.value, [0, 100]); emit(); });
  }

  function bindSwitch(id, onChange) {
    document.getElementById(id).addEventListener('change', function (e) { onChange(e.target.checked); });
  }

  function bindText(id, onChange) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () { onChange(el.value); });
  }

  function inp(id, value, extra) {
    return '<input type="text" id="' + id + '" value="' + esc(value == null ? '' : value) + '"' + (extra || '') + '>';
  }
  function ta(id, value) {
    return '<textarea id="' + id + '">' + esc(value == null ? '' : value) + '</textarea>';
  }
  /* pares [id, setter] em vez de uma chamada bindText por campo: os editores
     de seção passaram de 4 para ~20 campos cada, e a lista de pares deixa
     claro, num lugar só, qual campo escreve em qual chave do JSON. */
  function bindAll(pairs, after) {
    pairs.forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (!el) return;
      el.addEventListener('input', function () { p[1](el.value); after(); });
    });
  }

  /* ---------- listas editáveis (adicionar / remover / reordenar) ----------
     Qualquer array do JSON — frentes de "o que eu faço", perguntas do FAQ,
     capacidades do Sobre, tags de uma frente — usa o mesmo par
     listBlock/wireListBlock. `ns` é o prefixo dos data-attributes e precisa
     ser único dentro do painel: é o que liga o botão clicado ao array certo
     (as tags usam 'hptag0', 'hptag1'... por isso). */
  function listBlock(ns, items, label, renderItem) {
    return items.map(function (item, i) {
      return '<div class="list-item">' +
        '<div class="list-item-head"><b>' + esc(label) + ' ' + (i + 1) + '</b>' +
        '<span class="list-item-acts">' +
        '<button class="btn small" data-' + ns + '-up="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="btn small" data-' + ns + '-down="' + i + '"' + (i === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn small danger" data-' + ns + '-rm="' + i + '">remover</button>' +
        '</span></div>' + renderItem(item, i) + '</div>';
    }).join('') +
      '<button class="btn small" data-' + ns + '-add="1" style="margin-top:.8rem">+ adicionar ' + esc(label.toLowerCase()) + '</button>';
  }

  function wireListBlock(ns, items, makeNew, after) {
    function commit() { markDirty('content/home.json', state.home, state.homeSha); schedulePreview(); after(); }
    function each(attr, fn) {
      document.querySelectorAll('[data-' + ns + '-' + attr + ']').forEach(function (b) {
        b.addEventListener('click', function () { fn(Number(b.getAttribute('data-' + ns + '-' + attr))); });
      });
    }
    each('up', function (i) { if (i > 0) { items.splice(i - 1, 0, items.splice(i, 1)[0]); commit(); } });
    each('down', function (i) { if (i < items.length - 1) { items.splice(i + 1, 0, items.splice(i, 1)[0]); commit(); } });
    each('rm', function (i) { if (confirm('Remover este item?')) { items.splice(i, 1); commit(); } });
    var add = document.querySelector('[data-' + ns + '-add]');
    if (add) add.addEventListener('click', function () { items.push(makeNew()); commit(); });
  }

  /* ---------- prévia ao vivo ---------- */
  var previewDebounce = null;
  function schedulePreview() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(sendPreview, 200);
  }
  /* Os três painéis com prévia (aparência, layout, home) ficam todos no DOM ao
     mesmo tempo — só a classe .active decide qual aparece. Antes isto buscava
     por id e o id se repetia nos três, então só o primeiro iframe do
     documento recebia as mudanças: a prévia da aba Home nunca reagia. */
  function sendPreview() {
    document.querySelectorAll('iframe.preview-frame').forEach(function (frame) {
      if (!frame.contentWindow) return;
      frame.contentWindow.postMessage({ __cmsPreview__: true, global: state.global, home: state.home }, '*');
    });
  }
  function previewBlock() {
    if (!state.previewUrl) {
      return '<div class="group" style="margin-bottom:1.2rem"><div class="group-body">' +
        fieldRow('URL da prévia', 'Endereço do site (local ou publicado) usado só para você ver o efeito das mudanças aqui no painel.',
          '<input type="url" id="previewUrlInput" placeholder="http://localhost:8123/" style="max-width:360px">' +
          '<button class="btn small" id="btnSetPreview">Usar</button>') +
        '</div></div>';
    }
    return '<div class="preview-wrap">' +
      '<div class="preview-head"><span>Prévia ao vivo</span>' +
      '<button class="btn small" data-change-preview="1">trocar URL</button></div>' +
      '<iframe class="preview-frame" src="' + esc(state.previewUrl) + '"></iframe></div>';
  }
  function wirePreviewBlock(slotId) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    /* Não redesenha se a prévia já está montada com a mesma URL: recriar o
       <iframe> recarrega o site inteiro e perde a rolagem, e os painéis
       re-renderizam a cada item adicionado ou removido de uma lista. */
    var current = slot.querySelector('.preview-frame');
    if (current && state.previewUrl && current.getAttribute('src') === state.previewUrl) return;
    slot.innerHTML = previewBlock();
    var setBtn = slot.querySelector('#btnSetPreview');
    if (setBtn) setBtn.addEventListener('click', function () {
      var v = slot.querySelector('#previewUrlInput').value.trim();
      if (!v) return;
      state.previewUrl = v; localStorage.setItem('cms_preview_url', v);
      ['previewSlotAppearance', 'previewSlotLayout', 'previewSlotHome'].forEach(wirePreviewBlock);
    });
    var changeBtn = slot.querySelector('[data-change-preview]');
    if (changeBtn) changeBtn.addEventListener('click', function () {
      state.previewUrl = ''; localStorage.removeItem('cms_preview_url');
      ['previewSlotAppearance', 'previewSlotLayout', 'previewSlotHome'].forEach(function (id) {
        var s = document.getElementById(id);
        if (s) s.innerHTML = '';
        wirePreviewBlock(id);
      });
    });
    var frame = slot.querySelector('.preview-frame');
    if (frame) frame.addEventListener('load', sendPreview);
  }

  /* ---------- Visão geral ---------- */
  function renderOverview() {
    api('/api/status').then(function (s) {
      document.getElementById('overviewBody').innerHTML =
        fieldRow('Repositório', '', esc(s.repo)) +
        fieldRow('Branch', '', esc(s.branch)) +
        fieldRow('Autenticação', '', s.authMode === 'local-bypass' ?
          '<span class="badge custom">bypass local (DEV_AUTH_BYPASS)</span>' : '<span class="badge default">Cloudflare Access</span>') +
        fieldRow('Cloudflare Access', '', s.accessConfigured ?
          '<span class="badge default">configurado</span>' : '<span class="badge custom">variáveis pendentes — ver README</span>');
      setStatus(true);
    }).catch(function (e) { setStatus(false, e.message); });
  }
  function setStatus(ok, msg) {
    document.getElementById('statusDot').className = 'dot ' + (ok ? 'ok' : 'err');
    document.getElementById('statusText').textContent = ok ? 'conectado' : ('erro: ' + msg);
  }

  /* ---------- Aparência global ---------- */
  function renderAppearance() {
    wirePreviewBlock('previewSlotAppearance');
    var c = state.global.colors;
    var colorDefs = [
      ['background', 'Fundo principal'], ['backgroundSecondary', 'Fundo secundário / superfícies'],
      ['surface', 'Superfície elevada'], ['textPrimary', 'Texto principal'],
      ['textSecondary', 'Texto secundário'], ['textMuted', 'Texto desativado'],
      ['accent', 'Cor de destaque'], ['highlight', 'Realce'], ['heroName', 'Cor do nome (capa)'],
      ['borderColor', 'Cor das bordas (fraca)'], ['borderColorStrong', 'Cor das bordas (forte)']
    ];
    document.getElementById('colorsBody').innerHTML = colorDefs.map(function (d) {
      var v = c[d[0]] || { hex: '#000000', opacity: 100 };
      return fieldRow(d[1], d[0], colorControl('col_' + d[0], v.hex, v.opacity));
    }).join('');
    colorDefs.forEach(function (d) {
      bindColor('col_' + d[0], function (hex, op) {
        state.global.colors[d[0]] = { hex: hex, opacity: op };
        markDirty('content/global.json', state.global, state.globalSha);
        schedulePreview();
      });
    });

    var b = state.global.borders;
    document.getElementById('bordersBody').innerHTML =
      fieldRow('Arredondamento dos cards', 'radiusCard · px', sliderControl('rad_card', b.radiusCard, LIMITS.radius[0], LIMITS.radius[1], 'px')) +
      fieldRow('Arredondamento das imagens', 'radiusImage · px', sliderControl('rad_image', b.radiusImage, LIMITS.radius[0], LIMITS.radius[1], 'px')) +
      fieldRow('Arredondamento dos botões', 'radiusButton · px (100 = cápsula)', sliderControl('rad_button', b.radiusButton, LIMITS.radius[0], LIMITS.radius[1], 'px')) +
      fieldRow('Arredondamento dos campos', 'radiusField · px', sliderControl('rad_field', b.radiusField, LIMITS.radius[0], LIMITS.radius[1], 'px'));
    [['rad_card', 'radiusCard'], ['rad_image', 'radiusImage'], ['rad_button', 'radiusButton'], ['rad_field', 'radiusField']].forEach(function (m) {
      bindSlider(m[0], LIMITS.radius[0], LIMITS.radius[1], function (v) {
        state.global.borders[m[1]] = v;
        markDirty('content/global.json', state.global, state.globalSha);
        schedulePreview();
      });
    });
  }

  /* ---------- Layout e espaçamentos ---------- */
  /* dispositivo selecionado no momento para os campos de espaçamento —
     compartilhado pela seção global e por seção da Home, para não misturar
     três números na tela ao mesmo tempo (item explícito do pedido) */
  var layoutDevice = 'desktop';
  var DEVICE_LABEL = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Celular' };
  var DEVICE_PARENT = { tablet: 'desktop', mobile: 'tablet' }; /* de quem cada nível herda por padrão */

  function deviceTabsHtml(groupId) {
    return '<div class="tabs-device" data-group="' + groupId + '">' +
      ['desktop', 'tablet', 'mobile'].map(function (d) {
        return '<button data-device="' + d + '" class="' + (d === layoutDevice ? 'active' : '') + '">' + DEVICE_LABEL[d] + '</button>';
      }).join('') + '</div>';
  }

  /* Campo de espaçamento com três níveis. `obj` é {desktop,tablet,mobile}
     (cada um number|null). Mostra o valor do dispositivo atual: se for
     null, mostra o número herdado do nível anterior (calculado aqui, do
     mesmo jeito que js/content.js calcula no site) e avisa com o selo
     "herdando". Um valor próprio troca o selo para "próprio" e libera o
     botão de voltar a herdar. */
  function tieredSpacingField(label, hint, obj, min, max, onChange, onInheritReset, fallbackDesktop, fallbackNote) {
    obj = obj || { desktop: null, tablet: null, mobile: null };
    /* fallbackDesktop cobre o caso de uma seção sem nenhum valor próprio: o
       número mostrado como "herdando" precisa ser o que o site realmente
       usa (o padrão global, ou — para projetos e sobre — o valor fixo que
       já existia no CSS antes do CMS, que este painel não substitui até
       alguém realmente configurar algo aqui). */
    var baseDesktop = obj.desktop != null ? obj.desktop : (typeof fallbackDesktop === 'number' ? fallbackDesktop : min);
    var resolved = { desktop: baseDesktop, tablet: null, mobile: null };
    resolved.tablet = obj.tablet != null ? obj.tablet : resolved.desktop;
    resolved.mobile = obj.mobile != null ? obj.mobile : resolved.tablet;

    var d = layoutDevice;
    var isCustom = obj[d] != null;
    var value = resolved[d];
    var inheritsFrom = DEVICE_PARENT[d] ? DEVICE_LABEL[DEVICE_PARENT[d]] : null;

    var fieldId = 'tf_' + Math.random().toString(36).slice(2, 9);
    var html = fieldRow(label, hint, sliderControl(fieldId, value, min, max, 'px') +
      '<span class="tiered-meta" id="' + fieldId + '_meta">' + tieredMetaHtml(fieldId, isCustom, inheritsFrom, fallbackNote) + '</span>');

    /* registra os handlers depois de o HTML entrar no DOM (feito pelo chamador).
       `obj` entra na lista de propósito: é a referência viva do objeto de
       espaçamento, e é o que permite recalcular o selo "próprio/herdando" sem
       redesenhar o painel inteiro (ver refreshTieredMeta). */
    tieredSpacingField._pending = tieredSpacingField._pending || [];
    tieredSpacingField._pending.push({ fieldId: fieldId, min: min, max: max, obj: obj, fallbackNote: fallbackNote, onChange: onChange, onInheritReset: onInheritReset });
    return html;
  }

  function tieredMetaHtml(fieldId, isCustom, inheritsFrom, fallbackNote) {
    var badge = isCustom
      ? '<span class="badge custom">próprio</span>'
      : (inheritsFrom ? '<span class="badge default">herdando de ' + inheritsFrom + '</span>'
        : '<span class="badge default">' + esc(fallbackNote || 'padrão') + '</span>');
    return badge + ((isCustom && inheritsFrom) ? '<button class="btn small" data-reset-field="' + fieldId + '">Voltar a herdar</button>' : '');
  }

  /* Redesenha só o selo e o botão "Voltar a herdar" daquele campo. Existe
     porque a versão anterior chamava o render do painel inteiro a cada evento
     `input` do slider: isso substituía o próprio <input type="range"> que
     estava sendo arrastado, o ponteiro perdia o alvo do arraste e o controle
     parava de responder depois do primeiro pixel. O sintoma era "o
     espaçamento não deixa mexer" — nada a ver com o valor não ser salvo, que
     sempre foi salvo. */
  function refreshTieredMeta(p) {
    var el = document.getElementById(p.fieldId + '_meta');
    if (!el) return;
    var isCustom = p.obj && p.obj[layoutDevice] != null;
    var inheritsFrom = DEVICE_PARENT[layoutDevice] ? DEVICE_LABEL[DEVICE_PARENT[layoutDevice]] : null;
    el.innerHTML = tieredMetaHtml(p.fieldId, isCustom, inheritsFrom, p.fallbackNote);
    var btn = el.querySelector('[data-reset-field]');
    if (btn) btn.addEventListener('click', function () { p.onInheritReset(layoutDevice); });
  }

  function wireTieredFields() {
    (tieredSpacingField._pending || []).forEach(function (p) {
      bindSlider(p.fieldId, p.min, p.max, function (v) {
        p.onChange(layoutDevice, v);
        refreshTieredMeta(p);
      });
      refreshTieredMeta(p);
    });
    tieredSpacingField._pending = [];
  }
  function wireDeviceTabs(container, onSwitch) {
    container.querySelectorAll('.tabs-device button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        layoutDevice = btn.getAttribute('data-device');
        onSwitch();
      });
    });
  }

  /* Espaço antes/depois (e, quando includeGap, espaço entre elementos) de um
     bloco de uma página de projeto. target[key] é o objeto de espaçamento do
     bloco: {marginTop:{desktop,tablet,mobile}, marginBottom:{...}, gap:{...}}.
     Ausente = bloco sem nenhuma personalização, e o site usa o espaçamento
     que já existia (ver js/content-render.js, blockStyleCss). */
  function blockSpacingFields(target, key, onSave, includeGap) {
    var spacing = target[key] || (target[key] = {});
    if (!spacing.marginTop) spacing.marginTop = { desktop: null, tablet: null, mobile: null };
    if (!spacing.marginBottom) spacing.marginBottom = { desktop: null, tablet: null, mobile: null };
    if (includeGap && !spacing.gap) spacing.gap = { desktop: null, tablet: null, mobile: null };
    var html =
      tieredSpacingField('Espaço antes', 'margin-top', spacing.marginTop, LIMITS.spacing[0], LIMITS.spacing[1],
        function (dev, v) { spacing.marginTop[dev] = v; onSave(); },
        function (dev) { spacing.marginTop[dev] = null; onSave(); renderProjectEditor(); }, 0, 'padrão do site') +
      tieredSpacingField('Espaço depois', 'margin-bottom', spacing.marginBottom, LIMITS.spacing[0], LIMITS.spacing[1],
        function (dev, v) { spacing.marginBottom[dev] = v; onSave(); },
        function (dev) { spacing.marginBottom[dev] = null; onSave(); renderProjectEditor(); }, 0, 'padrão do site');
    if (includeGap) {
      html += tieredSpacingField('Espaço entre elementos', 'gap', spacing.gap, LIMITS.gap[0], LIMITS.gap[1],
        function (dev, v) { spacing.gap[dev] = v; onSave(); },
        function (dev) { spacing.gap[dev] = null; onSave(); renderProjectEditor(); }, 0, 'padrão do site');
    }
    return html;
  }

  function renderLayout() {
    wirePreviewBlock('previewSlotLayout');
    var l = state.global.layout;

    document.getElementById('layoutGlobalBody').innerHTML =
      fieldRow('Largura máxima do conteúdo', 'contentMaxWidth · px', sliderControl('lay_maxw', l.contentMaxWidth, LIMITS.contentWidth[0], LIMITS.contentWidth[1], 'px')) +
      fieldRow('Margem lateral (telas grandes)', 'pageGutterDesktop · px', sliderControl('lay_gutd', l.pageGutterDesktop, 0, 200, 'px')) +
      fieldRow('Margem lateral (celular)', 'pageGutterMobile · px', sliderControl('lay_gutm', l.pageGutterMobile, 0, 100, 'px')) +
      deviceTabsHtml('global') +
      tieredSpacingField('Espaço antes da seção', 'sectionSpacingTop · padrão para as seções que não têm valor próprio', l.sectionSpacingTop, LIMITS.spacing[0], LIMITS.spacing[1],
        function (dev, v) { l.sectionSpacingTop[dev] = v; markDirty('content/global.json', state.global, state.globalSha); schedulePreview(); },
        function (dev) { l.sectionSpacingTop[dev] = null; markDirty('content/global.json', state.global, state.globalSha); renderLayout(); schedulePreview(); }) +
      tieredSpacingField('Espaço depois da seção', 'sectionSpacingBottom', l.sectionSpacingBottom, LIMITS.spacing[0], LIMITS.spacing[1],
        function (dev, v) { l.sectionSpacingBottom[dev] = v; markDirty('content/global.json', state.global, state.globalSha); schedulePreview(); },
        function (dev) { l.sectionSpacingBottom[dev] = null; markDirty('content/global.json', state.global, state.globalSha); renderLayout(); schedulePreview(); }) +
      tieredSpacingField('Espaço entre colunas (gap da grade de projetos)', 'gridGap', l.gridGap, LIMITS.gap[0], LIMITS.gap[1],
        function (dev, v) { l.gridGap[dev] = v; markDirty('content/global.json', state.global, state.globalSha); schedulePreview(); },
        function (dev) { l.gridGap[dev] = null; markDirty('content/global.json', state.global, state.globalSha); renderLayout(); schedulePreview(); });
    wireTieredFields();
    [['lay_maxw', 'contentMaxWidth', LIMITS.contentWidth], ['lay_gutd', 'pageGutterDesktop', [0, 200]],
     ['lay_gutm', 'pageGutterMobile', [0, 100]]].forEach(function (m) {
      bindSlider(m[0], m[2][0], m[2][1], function (v) {
        state.global.layout[m[1]] = v;
        markDirty('content/global.json', state.global, state.globalSha);
        schedulePreview();
      });
    });
    wireDeviceTabs(document.getElementById('layoutGlobalBody'), renderLayout);

    var sections = state.home.sections;
    var labels = { work: 'Projetos', about: 'Sobre', help: 'O que eu faço', faq: 'FAQ', contact: 'Contato' };
    /* work e about já tinham respiro próprio, fixo no CSS, antes do CMS
       existir — sem valor gravado aqui, o site usa esse número fixo, não o
       padrão global. help/faq/contact sempre usaram o padrão global. */
    var USA_PADRAO_GLOBAL = { help: true, faq: true, contact: true, work: false, about: false };
    document.getElementById('layoutSectionsBody').innerHTML = deviceTabsHtml('sections') +
      Object.keys(labels).map(function (key) {
        var s = sections[key] || {};
        s.spacingTop = s.spacingTop || { desktop: null, tablet: null, mobile: null };
        s.spacingBottom = s.spacingBottom || { desktop: null, tablet: null, mobile: null };
        var usesGlobal = USA_PADRAO_GLOBAL[key];
        var fbTop = usesGlobal ? state.global.layout.sectionSpacingTop.desktop : null;
        var fbBottom = usesGlobal ? state.global.layout.sectionSpacingBottom.desktop : null;
        var note = usesGlobal ? null : 'valor fixo do site (ainda não editável nesta seção)';
        return '<div style="border-top:1px solid var(--line);padding-top:.8rem;margin-top:.8rem">' +
          '<b>' + esc(labels[key]) + '</b>' +
          tieredSpacingField('Espaço antes da seção', '', s.spacingTop, LIMITS.spacing[0], LIMITS.spacing[1],
            function (dev, v) { s.spacingTop[dev] = v; markDirty('content/home.json', state.home, state.homeSha); schedulePreview(); },
            function (dev) { s.spacingTop[dev] = null; markDirty('content/home.json', state.home, state.homeSha); renderLayout(); schedulePreview(); },
            fbTop, note) +
          tieredSpacingField('Espaço depois da seção', '', s.spacingBottom, LIMITS.spacing[0], LIMITS.spacing[1],
            function (dev, v) { s.spacingBottom[dev] = v; markDirty('content/home.json', state.home, state.homeSha); schedulePreview(); },
            function (dev) { s.spacingBottom[dev] = null; markDirty('content/home.json', state.home, state.homeSha); renderLayout(); schedulePreview(); },
            fbBottom, note) +
          '</div>';
      }).join('');
    wireTieredFields();
    wireDeviceTabs(document.getElementById('layoutSectionsBody'), renderLayout);
  }

  /* ---------- Header e footer ---------- */
  function renderHeaderFooter() {
    var h = state.global.header;
    document.getElementById('headerBody').innerHTML =
      fieldRow('Mostrar seletor de idioma', '', switchControl('hdr_lang', h.showLanguageSwitch)) +
      fieldRow('Mostrar botão de contato', '', switchControl('hdr_contact', h.showContactButton)) +
      h.menu.map(function (item, i) {
        return fieldRow('Item de menu ' + (i + 1) + ' (PT / EN)', '',
          '<input type="text" id="menu_' + i + '_pt" value="' + esc(item.pt) + '" style="max-width:160px">' +
          '<input type="text" id="menu_' + i + '_en" value="' + esc(item.en) + '" style="max-width:160px">');
      }).join('');
    bindSwitch('hdr_lang', function (v) { state.global.header.showLanguageSwitch = v; markDirty('content/global.json', state.global, state.globalSha); });
    bindSwitch('hdr_contact', function (v) { state.global.header.showContactButton = v; markDirty('content/global.json', state.global, state.globalSha); });
    h.menu.forEach(function (item, i) {
      bindText('menu_' + i + '_pt', function (v) { state.global.header.menu[i].pt = v; markDirty('content/global.json', state.global, state.globalSha); });
      bindText('menu_' + i + '_en', function (v) { state.global.header.menu[i].en = v; markDirty('content/global.json', state.global, state.globalSha); });
    });

    var f = state.global.footer, s = state.global.social;
    /* Arquivo antigo (só disclaimerPt/En) abre normalmente: os campos de
       copyright nascem com o texto que o site já monta nesse caso, e passam a
       mandar assim que forem salvos. Nada do footer é apagado no caminho. */
    var anoAtual = new Date().getFullYear();
    if (f.copyrightPt == null) f.copyrightPt = '© {year} · ' + (f.disclaimerPt || '');
    if (f.copyrightEn == null) f.copyrightEn = '© {year} · ' + (f.disclaimerEn || '');
    document.getElementById('footerBody').innerHTML =
      fieldRow('Copyright (PT)', 'Escreva {year} onde o ano deve aparecer — vira ' + anoAtual + ' sozinho, e continua certo no ano que vem.', '<textarea id="foot_cpt">' + esc(f.copyrightPt) + '</textarea>') +
      fieldRow('Copyright (EN)', 'Mesma coisa: {year} vira o ano atual.', '<textarea id="foot_cen">' + esc(f.copyrightEn) + '</textarea>') +
      fieldRow('Disclaimer (PT)', 'Texto antigo, mantido só como reserva. O site usa o campo de copyright acima.', '<textarea id="foot_pt">' + esc(f.disclaimerPt) + '</textarea>') +
      fieldRow('Disclaimer (EN)', '', '<textarea id="foot_en">' + esc(f.disclaimerEn) + '</textarea>') +
      fieldRow('LinkedIn', '', '<input type="url" id="soc_li" value="' + esc(s.linkedin) + '">') +
      fieldRow('Behance', '', '<input type="url" id="soc_be" value="' + esc(s.behance) + '">') +
      fieldRow('E-mail de contato', '', '<input type="email" id="soc_em" value="' + esc(s.email) + '">');
    bindText('foot_cpt', function (v) { state.global.footer.copyrightPt = v; markDirty('content/global.json', state.global, state.globalSha); });
    bindText('foot_cen', function (v) { state.global.footer.copyrightEn = v; markDirty('content/global.json', state.global, state.globalSha); });
    bindText('foot_pt', function (v) { state.global.footer.disclaimerPt = v; markDirty('content/global.json', state.global, state.globalSha); });
    bindText('foot_en', function (v) { state.global.footer.disclaimerEn = v; markDirty('content/global.json', state.global, state.globalSha); });
    bindText('soc_li', function (v) { state.global.social.linkedin = v; markDirty('content/global.json', state.global, state.globalSha); });
    bindText('soc_be', function (v) { state.global.social.behance = v; markDirty('content/global.json', state.global, state.globalSha); });
    bindText('soc_em', function (v) { state.global.social.email = v; markDirty('content/global.json', state.global, state.globalSha); });
  }

  /* ---------- Home ---------- */
  function renderHome() {
    wirePreviewBlock('previewSlotHome');
    var H = state.home;
    function touch() { markDirty('content/home.json', state.home, state.homeSha); schedulePreview(); }
    var half = ' style="max-width:200px"';

    var hero = H.hero;
    document.getElementById('heroBody').innerHTML =
      fieldRow('Cargo (PT / EN)', '', inp('hero_tagpt', hero.tagPt, half) + inp('hero_tagen', hero.tagEn, half)) +
      fieldRow('Localização (PT / EN)', '', inp('hero_locpt', hero.locationPt, half) + inp('hero_locen', hero.locationEn, half)) +
      fieldRow('Frase de efeito (PT)', '', ta('hero_claimpt', hero.claimPt)) +
      fieldRow('Frase de efeito (EN)', '', ta('hero_claimen', hero.claimEn)) +
      fieldRow('Mostrar "disponível para projetos"', '', switchControl('hero_avail', hero.showAvailability)) +
      fieldRow('Texto de disponibilidade (PT / EN)', 'aparece na pílula do header', inp('hero_availpt', hero.availabilityPt, half) + inp('hero_availen', hero.availabilityEn, half)) +
      fieldRow('Versão curta (PT / EN)', 'usada quando o header encolhe', inp('hero_availspt', hero.availabilityShortPt, half) + inp('hero_availsen', hero.availabilityShortEn, half)) +
      fieldRow('Indicador de rolagem — rótulo (PT / EN)', '"Continue para ver os projetos"', inp('hero_nhlpt', hero.nextHintLabelPt, half) + inp('hero_nhlen', hero.nextHintLabelEn, half)) +
      fieldRow('Indicador de rolagem — destino (PT / EN)', '"Projetos"', inp('hero_nhnpt', hero.nextHintNamePt, half) + inp('hero_nhnen', hero.nextHintNameEn, half)) +
      fieldRow('Vídeo de fundo da capa (URL)', 'Em branco mantém o fundo animado atual. Aceita um caminho do repositório (assets/...) ou uma URL completa de um vídeo hospedado.', inp('hero_bgvideo', hero.backgroundVideo, ' placeholder="assets/capa.mp4"')) +
      fieldRow('Poster do vídeo (URL, opcional)', 'Imagem mostrada antes do vídeo carregar.', inp('hero_bgposter', hero.backgroundVideoPoster, ' placeholder="assets/capa-poster.jpg"'));
    bindAll([
      ['hero_tagpt', function (v) { hero.tagPt = v; }], ['hero_tagen', function (v) { hero.tagEn = v; }],
      ['hero_locpt', function (v) { hero.locationPt = v; }], ['hero_locen', function (v) { hero.locationEn = v; }],
      ['hero_claimpt', function (v) { hero.claimPt = v; }], ['hero_claimen', function (v) { hero.claimEn = v; }],
      ['hero_availpt', function (v) { hero.availabilityPt = v; }], ['hero_availen', function (v) { hero.availabilityEn = v; }],
      ['hero_availspt', function (v) { hero.availabilityShortPt = v; }], ['hero_availsen', function (v) { hero.availabilityShortEn = v; }],
      ['hero_nhlpt', function (v) { hero.nextHintLabelPt = v; }], ['hero_nhlen', function (v) { hero.nextHintLabelEn = v; }],
      ['hero_nhnpt', function (v) { hero.nextHintNamePt = v; }], ['hero_nhnen', function (v) { hero.nextHintNameEn = v; }],
      ['hero_bgvideo', function (v) { hero.backgroundVideo = v; }], ['hero_bgposter', function (v) { hero.backgroundVideoPoster = v; }]
    ], touch);
    bindSwitch('hero_avail', function (v) { hero.showAvailability = v; touch(); });

    var w = H.work;
    document.getElementById('workIntroBody').innerHTML =
      fieldRow('Título (PT)', '', ta('wi_titlept', w.titlePt)) +
      fieldRow('Título (EN)', '', ta('wi_titleen', w.titleEn)) +
      fieldRow('Contexto (PT)', '', ta('wi_ctxpt', w.contextPt)) +
      fieldRow('Contexto (EN)', '', ta('wi_ctxen', w.contextEn)) +
      fieldRow('Texto lateral (PT)', 'a linha menor ao lado do título', ta('wi_asidept', w.asidePt)) +
      fieldRow('Texto lateral (EN)', '', ta('wi_asideen', w.asideEn));
    bindAll([
      ['wi_titlept', function (v) { w.titlePt = v; }], ['wi_titleen', function (v) { w.titleEn = v; }],
      ['wi_ctxpt', function (v) { w.contextPt = v; }], ['wi_ctxen', function (v) { w.contextEn = v; }],
      ['wi_asidept', function (v) { w.asidePt = v; }], ['wi_asideen', function (v) { w.asideEn = v; }]
    ], touch);

    var a = H.about;
    if (!Array.isArray(a.capabilities)) a.capabilities = [];
    document.getElementById('aboutBody').innerHTML =
      fieldRow('Rótulo da seção (PT / EN)', '"Sobre"', inp('ab_kpt', a.kickerPt, half) + inp('ab_ken', a.kickerEn, half)) +
      fieldRow('Texto principal (PT)', '', ta('ab_leadpt', a.leadPt)) +
      fieldRow('Texto principal (EN)', '', ta('ab_leaden', a.leadEn)) +
      fieldRow('Texto complementar (PT)', '', ta('ab_subpt', a.subPt)) +
      fieldRow('Texto complementar (EN)', '', ta('ab_suben', a.subEn)) +
      fieldRow('Retrato', 'caminho do arquivo, ou envie um novo aqui', inp('ab_photo', a.photo) + '<input type="file" id="ab_photo_upload" accept="image/*">') +
      fieldRow('Botão de contato (PT / EN)', '"Vamos conversar"', inp('ab_ctapt', a.ctaTalkPt, half) + inp('ab_ctaen', a.ctaTalkEn, half)) +
      fieldRow('Mostrar botão de currículo', 'Desligar esconde o botão no site sem apagar o arquivo.', switchControl('ab_showcv', a.showResume !== false)) +
      fieldRow('Arquivo do currículo (PDF)', a.resumeFile ? 'atual: ' + a.resumeFile : 'nenhum arquivo enviado ainda — o botão fica escondido até você enviar um',
        inp('ab_cvfile', a.resumeFile, ' placeholder="assets/uploads/curriculo/..."') + '<input type="file" id="ab_cv_upload" accept="application/pdf,.pdf">') +
      fieldRow('Rótulo do currículo (PT / EN)', '"Baixar currículo"', inp('ab_cvlpt', a.resumeLabelPt, half) + inp('ab_cvlen', a.resumeLabelEn, half)) +
      fieldRow('Rótulo das capacidades (PT / EN)', '"Capacidades"', inp('ab_caplpt', a.capabilitiesLabelPt, half) + inp('ab_caplen', a.capabilitiesLabelEn, half)) +
      listBlock('abcap', a.capabilities, 'Capacidade', function (c, i) {
        return fieldRow('Texto (PT / EN)', '', inp('ab_cap' + i + '_pt', c.pt, half) + inp('ab_cap' + i + '_en', c.en, half));
      });
    var aboutPairs = [
      ['ab_kpt', function (v) { a.kickerPt = v; }], ['ab_ken', function (v) { a.kickerEn = v; }],
      ['ab_leadpt', function (v) { a.leadPt = v; }], ['ab_leaden', function (v) { a.leadEn = v; }],
      ['ab_subpt', function (v) { a.subPt = v; }], ['ab_suben', function (v) { a.subEn = v; }],
      ['ab_photo', function (v) { a.photo = v; }],
      ['ab_ctapt', function (v) { a.ctaTalkPt = v; }], ['ab_ctaen', function (v) { a.ctaTalkEn = v; }],
      ['ab_cvfile', function (v) { a.resumeFile = v; }],
      ['ab_cvlpt', function (v) { a.resumeLabelPt = v; }], ['ab_cvlen', function (v) { a.resumeLabelEn = v; }],
      ['ab_caplpt', function (v) { a.capabilitiesLabelPt = v; }], ['ab_caplen', function (v) { a.capabilitiesLabelEn = v; }]
    ];
    a.capabilities.forEach(function (c, i) {
      aboutPairs.push(['ab_cap' + i + '_pt', function (v) { c.pt = v; }]);
      aboutPairs.push(['ab_cap' + i + '_en', function (v) { c.en = v; }]);
    });
    bindAll(aboutPairs, touch);
    wireListBlock('abcap', a.capabilities, function () { return { pt: '', en: '' }; }, renderHome);
    var abPhoto = document.getElementById('ab_photo_upload');
    if (abPhoto) abPhoto.addEventListener('change', function () {
      uploadFile(abPhoto.files[0], 'sobre', function (path) { a.photo = path; touch(); renderHome(); });
    });
    bindSwitch('ab_showcv', function (v) { a.showResume = v; touch(); });
    var abCv = document.getElementById('ab_cv_upload');
    if (abCv) abCv.addEventListener('change', function () {
      uploadFile(abCv.files[0], 'curriculo', function (path) { a.resumeFile = path; touch(); renderHome(); });
    });

    var hp = H.help;
    if (!Array.isArray(hp.items)) hp.items = [];
    document.getElementById('helpBody').innerHTML =
      fieldRow('Rótulo da seção (PT / EN)', '"atuação"', inp('hp_kpt', hp.kickerPt, half) + inp('hp_ken', hp.kickerEn, half)) +
      fieldRow('Título (PT / EN)', '"O que eu faço"', inp('hp_tpt', hp.titlePt, half) + inp('hp_ten', hp.titleEn, half)) +
      fieldRow('Introdução (PT)', '', ta('hp_lpt', hp.leadPt)) +
      fieldRow('Introdução (EN)', '', ta('hp_len', hp.leadEn)) +
      listBlock('hpitem', hp.items, 'Frente', function (item, i) {
        if (!Array.isArray(item.tags)) item.tags = [];
        return fieldRow('Título (PT / EN)', '', inp('hp_' + i + '_tpt', item.titlePt, half) + inp('hp_' + i + '_ten', item.titleEn, half)) +
          fieldRow('Texto (PT)', '', ta('hp_' + i + '_xpt', item.textPt)) +
          fieldRow('Texto (EN)', '', ta('hp_' + i + '_xen', item.textEn)) +
          '<div class="sub-list">' + listBlock('hptag' + i, item.tags, 'Tag', function (t, j) {
            return fieldRow('Texto (PT / EN)', '', inp('hp_' + i + '_tag' + j + '_pt', t.pt, half) + inp('hp_' + i + '_tag' + j + '_en', t.en, half));
          }) + '</div>';
      });
    var helpPairs = [
      ['hp_kpt', function (v) { hp.kickerPt = v; }], ['hp_ken', function (v) { hp.kickerEn = v; }],
      ['hp_tpt', function (v) { hp.titlePt = v; }], ['hp_ten', function (v) { hp.titleEn = v; }],
      ['hp_lpt', function (v) { hp.leadPt = v; }], ['hp_len', function (v) { hp.leadEn = v; }]
    ];
    hp.items.forEach(function (item, i) {
      helpPairs.push(['hp_' + i + '_tpt', function (v) { item.titlePt = v; }]);
      helpPairs.push(['hp_' + i + '_ten', function (v) { item.titleEn = v; }]);
      helpPairs.push(['hp_' + i + '_xpt', function (v) { item.textPt = v; }]);
      helpPairs.push(['hp_' + i + '_xen', function (v) { item.textEn = v; }]);
      item.tags.forEach(function (t, j) {
        helpPairs.push(['hp_' + i + '_tag' + j + '_pt', function (v) { t.pt = v; }]);
        helpPairs.push(['hp_' + i + '_tag' + j + '_en', function (v) { t.en = v; }]);
      });
    });
    bindAll(helpPairs, touch);
    wireListBlock('hpitem', hp.items, function () {
      return { titlePt: 'Nova frente', titleEn: 'New area', textPt: '', textEn: '', tags: [] };
    }, renderHome);
    hp.items.forEach(function (item, i) {
      wireListBlock('hptag' + i, item.tags, function () { return { pt: '', en: '' }; }, renderHome);
    });

    var fq = H.faq;
    if (!Array.isArray(fq.items)) fq.items = [];
    document.getElementById('faqBody').innerHTML =
      fieldRow('Título da seção (PT / EN)', '', inp('fq_tpt', fq.titlePt, half) + inp('fq_ten', fq.titleEn, half)) +
      listBlock('fqitem', fq.items, 'Pergunta', function (item, i) {
        return fieldRow('Pergunta (PT)', '', inp('fq_' + i + '_qpt', item.qPt)) +
          fieldRow('Pergunta (EN)', '', inp('fq_' + i + '_qen', item.qEn)) +
          fieldRow('Resposta (PT)', '', ta('fq_' + i + '_apt', item.aPt)) +
          fieldRow('Resposta (EN)', '', ta('fq_' + i + '_aen', item.aEn));
      });
    var faqPairs = [['fq_tpt', function (v) { fq.titlePt = v; }], ['fq_ten', function (v) { fq.titleEn = v; }]];
    fq.items.forEach(function (item, i) {
      faqPairs.push(['fq_' + i + '_qpt', function (v) { item.qPt = v; }]);
      faqPairs.push(['fq_' + i + '_qen', function (v) { item.qEn = v; }]);
      faqPairs.push(['fq_' + i + '_apt', function (v) { item.aPt = v; }]);
      faqPairs.push(['fq_' + i + '_aen', function (v) { item.aEn = v; }]);
    });
    bindAll(faqPairs, touch);
    wireListBlock('fqitem', fq.items, function () {
      return { qPt: 'Nova pergunta', qEn: 'New question', aPt: '', aEn: '' };
    }, renderHome);

    var ct = H.contact;
    document.getElementById('contactBody').innerHTML =
      fieldRow('Título linha 1 (PT / EN)', '', inp('ct_l1pt', ct.titleLine1Pt, half) + inp('ct_l1en', ct.titleLine1En, half)) +
      fieldRow('Título linha 2 (PT / EN)', '', inp('ct_l2pt', ct.titleLine2Pt, half) + inp('ct_l2en', ct.titleLine2En, half)) +
      fieldRow('Rótulo do e-mail (PT / EN)', '"Escreva para"', inp('ct_mkpt', ct.mailLabelPt, half) + inp('ct_mken', ct.mailLabelEn, half));
    bindAll([
      ['ct_l1pt', function (v) { ct.titleLine1Pt = v; }], ['ct_l1en', function (v) { ct.titleLine1En = v; }],
      ['ct_l2pt', function (v) { ct.titleLine2Pt = v; }], ['ct_l2en', function (v) { ct.titleLine2En = v; }],
      ['ct_mkpt', function (v) { ct.mailLabelPt = v; }], ['ct_mken', function (v) { ct.mailLabelEn = v; }]
    ], touch);
  }

  /* ---------- Projetos ---------- */
  function renderProjectsList() {
    var list = state.projectsIndex.projects.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    document.getElementById('projectsList').innerHTML = list.map(function (p, i) {
      return '<div class="list-row' + (p.visible === false ? ' hidden-project' : '') + '" data-slug="' + esc(p.slug) + '">' +
        '<div class="thumb" style="background-image:url(\'../' + esc(p.cover) + '\')"></div>' +
        '<div class="info"><b>' + esc(p.titlePt) + '</b><span>' + esc(p.slug) + ' · ' + esc(p.year) + (p.visible === false ? ' · oculto' : '') + '</span></div>' +
        '<div class="actions">' +
        '<button class="btn small" data-act="up">↑</button>' +
        '<button class="btn small" data-act="down">↓</button>' +
        '<button class="btn small" data-act="edit">Editar</button>' +
        '<button class="btn small" data-act="toggle">' + (p.visible === false ? 'Mostrar' : 'Ocultar') + '</button>' +
        '<button class="btn small" data-act="duplicate">Duplicar</button>' +
        '<button class="btn small danger" data-act="delete">Excluir</button>' +
        '</div></div>';
    }).join('');
    document.querySelectorAll('#projectsList .list-row').forEach(function (row) {
      var slug = row.getAttribute('data-slug');
      row.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () { handleProjectAction(slug, btn.getAttribute('data-act')); });
      });
    });
  }

  function handleProjectAction(slug, action) {
    var list = state.projectsIndex.projects;
    var p = list.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return;

    if (action === 'duplicate') {
      var suggestion = slug + '-copia';
      var newSlug = prompt('Slug do projeto duplicado:', suggestion);
      if (!newSlug) return;
      toast('Duplicando "' + slug + '"…');
      api('/api/projects/' + slug + '/duplicate', { method: 'POST', body: { slug: newSlug } }).then(function () {
        toast('Duplicado como "' + newSlug + '" (rascunho oculto).', 'ok');
        return api('/api/projects');
      }).then(function (res) {
        state.projectsIndex = res.data; state.projectsIndexSha = res.sha;
        renderProjectsList();
      }).catch(function (e) { toast(e.message, 'err'); });
      return;
    }

    if (action === 'delete') {
      var sure = confirm('Excluir "' + (p.titlePt || slug) + '" definitivamente?\n\nIsso remove a página e o conteúdo do projeto do GitHub (as imagens em assets/ não são apagadas). Esta ação não pode ser desfeita pelo painel.');
      if (!sure) return;
      toast('Excluindo "' + slug + '"…');
      api('/api/projects/' + slug, { method: 'DELETE' }).then(function () {
        toast('Projeto excluído.', 'ok');
        if (state.editingSlug === slug) { state.editingSlug = null; document.getElementById('projectEditor').innerHTML = ''; }
        delete state.projects[slug];
        return api('/api/projects');
      }).then(function (res) {
        state.projectsIndex = res.data; state.projectsIndexSha = res.sha;
        renderProjectsList();
      }).catch(function (e) { toast(e.message, 'err'); });
      return;
    }

    if (action === 'toggle') { p.visible = p.visible === false ? true : false; }
    if (action === 'up' || action === 'down') {
      var sorted = list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var idx = sorted.indexOf(p);
      var swapWith = action === 'up' ? sorted[idx - 1] : sorted[idx + 1];
      if (swapWith) { var tmp = p.order; p.order = swapWith.order; swapWith.order = tmp; }
    }
    if (action === 'edit') { state.editingSlug = slug; renderProjectEditor(); }
    markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha);
    renderProjectsList();
  }

  /* Estado aberto/fechado de cada <details> do editor de projeto, preservado
     entre re-renderizações. Trocar a aba de dispositivo re-renderiza o editor
     inteiro; sem isto, toda seção aberta fechava junto e a impressão era de
     que o campo de espaçamento tinha parado de responder — era o segundo
     motivo de "não consigo mexer no espaçamento individual", junto com o
     re-render que interrompia o arraste do slider. */
  var projectSectionOpen = { info: true };
  function projectSection(key) {
    return ' data-sec="' + key + '"' + (projectSectionOpen[key] ? ' open' : '');
  }

  function renderProjectEditor() {
    var slug = state.editingSlug;
    var editorEl = document.getElementById('projectEditor');
    if (!slug) { editorEl.innerHTML = ''; return; }
    var cached = state.projects[slug];
    if (!cached) {
      editorEl.innerHTML = '<p>Carregando…</p>';
      api('/api/projects/' + slug).then(function (res) {
        state.projects[slug] = { data: res.data, sha: res.sha };
        renderProjectEditor();
      }).catch(function (e) { editorEl.innerHTML = '<p style="color:var(--err)">' + esc(e.message) + '</p>'; });
      return;
    }
    var P = cached.data;
    var indexEntry = state.projectsIndex.projects.filter(function (x) { return x.slug === slug; })[0];
    var textBlocks = P.blocks.filter(function (b) { return b.type === 'text'; });
    var galleryBlock = P.blocks.filter(function (b) { return b.type === 'gallery'; })[0] || { images: [] };

    editorEl.innerHTML =
      '<details class="group"' + projectSection('info') + '><summary>Editando: ' + esc(P.hero.titlePt || slug) + '</summary><div class="group-body">' +
      fieldRow('Slug', 'não muda depois de criado', '<input type="text" value="' + esc(slug) + '" disabled>') +
      fieldRow('Status', '', '<select id="pe_status"><option value="draft"' + (P.status === 'draft' ? ' selected' : '') + '>Rascunho</option><option value="published"' + (P.status === 'published' ? ' selected' : '') + '>Publicado</option></select>') +
      fieldRow('Ano', '', '<input type="number" id="pe_year" value="' + esc(P.year) + '" min="1990" max="2100">') +
      fieldRow('Título (PT)', '', '<input type="text" id="pe_titlept" value="' + esc(P.hero.titlePt) + '">') +
      fieldRow('Título (EN)', '', '<input type="text" id="pe_titleen" value="' + esc(P.hero.titleEn) + '">') +
      fieldRow('Subtítulo (PT)', '', '<textarea id="pe_subpt">' + esc(P.hero.subtitlePt) + '</textarea>') +
      fieldRow('Subtítulo (EN)', '', '<textarea id="pe_suben">' + esc(P.hero.subtitleEn) + '</textarea>') +
      fieldRow('Papel (PT / EN)', '', '<input type="text" id="pe_rolept" value="' + esc(P.hero.rolePt) + '" style="max-width:160px"><input type="text" id="pe_roleen" value="' + esc(P.hero.roleEn) + '" style="max-width:160px">') +
      fieldRow('Escopo (PT / EN)', '', '<input type="text" id="pe_scopept" value="' + esc(P.hero.scopePt) + '" style="max-width:160px"><input type="text" id="pe_scopeen" value="' + esc(P.hero.scopeEn) + '" style="max-width:160px">') +
      fieldRow('Capa', 'caminho do arquivo — envie por Mídia e cole aqui', '<input type="text" id="pe_cover" value="' + esc(P.cover) + '"><input type="file" id="pe_cover_upload" accept="image/*">') +
      fieldRow('Capa clara?', 'Ative para capas predominantemente claras (fundo amarelo, branco, etc). O header, fixo por cima da grade, troca a cor do texto para escura só enquanto passa por cima deste card.', switchControl('pe_coverlight', indexEntry.coverLight)) +
      '</div></details>' +
      '<details class="group"' + projectSection('cover') + '><summary>Espaçamento da capa</summary><div class="group-body">' +
      deviceTabsHtml('cover-spacing') +
      blockSpacingFields(P, 'coverSpacing', function () { save(); }, false) +
      '</div></details>' +
      '<details class="group"' + projectSection('blocks') + '><summary>Contexto / processo / resultado</summary><div class="group-body">' +
      textBlocks.map(function (b, i) {
        return '<div style="border-top:1px solid var(--line);padding-top:.8rem;margin-top:.8rem">' +
          '<b>' + esc(b.labelPt) + '</b>' +
          fieldRow('Texto (PT)', '', '<textarea id="pe_block_' + i + '_pt">' + esc(b.textPt) + '</textarea>') +
          fieldRow('Texto (EN)', '', '<textarea id="pe_block_' + i + '_en">' + esc(b.textEn) + '</textarea>') +
          deviceTabsHtml('block-spacing-' + i) +
          blockSpacingFields(b, 'spacing', function () { save(); }, false) +
          '</div>';
      }).join('') + '</div></details>' +
      '<details class="group"' + projectSection('gallery') + '><summary>Galeria (' + galleryBlock.images.length + ' imagens)</summary><div class="group-body">' +
      galleryBlock.images.map(function (img, i) {
        return fieldRow('Imagem ' + (i + 1), '', '<input type="text" id="pe_gal_' + i + '" value="' + esc(img.src) + '">' +
          '<button class="btn small danger" data-gal-remove="' + i + '">remover</button>');
      }).join('') + '<button class="btn small" id="pe_gal_add">+ adicionar imagem</button>' +
      '<div style="border-top:1px solid var(--line);padding-top:.8rem;margin-top:.8rem">' +
      '<b data-pt="Espaçamento da galeria">Espaçamento da galeria</b>' +
      deviceTabsHtml('gallery-spacing') +
      blockSpacingFields(galleryBlock, 'spacing', function () { save(); }, true) +
      '</div></details>';

    function save() { markDirty('content/projects/' + slug + '.json', P, cached.sha); }
    bindText('pe_titlept', function (v) { P.hero.titlePt = v; indexEntry.titlePt = v; save(); markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha); });
    bindText('pe_titleen', function (v) { P.hero.titleEn = v; indexEntry.titleEn = v; save(); markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha); });
    bindText('pe_subpt', function (v) { P.hero.subtitlePt = v; save(); });
    bindText('pe_suben', function (v) { P.hero.subtitleEn = v; save(); });
    bindText('pe_rolept', function (v) { P.hero.rolePt = v; save(); });
    bindText('pe_roleen', function (v) { P.hero.roleEn = v; save(); });
    bindText('pe_scopept', function (v) { P.hero.scopePt = v; save(); });
    bindText('pe_scopeen', function (v) { P.hero.scopeEn = v; save(); });
    bindSwitch('pe_coverlight', function (v) { indexEntry.coverLight = v; markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha); });
    bindText('pe_cover', function (v) { P.cover = v; indexEntry.cover = v; save(); });
    document.getElementById('pe_status').addEventListener('change', function (e) { P.status = e.target.value; save(); });
    document.getElementById('pe_year').addEventListener('change', function (e) { P.year = Number(e.target.value); indexEntry.year = P.year; save(); });
    textBlocks.forEach(function (b, i) {
      bindText('pe_block_' + i + '_pt', function (v) { b.textPt = v; save(); });
      bindText('pe_block_' + i + '_en', function (v) { b.textEn = v; save(); });
    });
    galleryBlock.images.forEach(function (img, i) {
      bindText('pe_gal_' + i, function (v) { img.src = v; save(); });
      var rm = document.querySelector('[data-gal-remove="' + i + '"]');
      if (rm) rm.addEventListener('click', function () { galleryBlock.images.splice(i, 1); save(); renderProjectEditor(); });
    });
    var addBtn = document.getElementById('pe_gal_add');
    if (addBtn) addBtn.addEventListener('click', function () { galleryBlock.images.push({ src: '', alt: '' }); save(); renderProjectEditor(); });
    var coverUpload = document.getElementById('pe_cover_upload');
    if (coverUpload) coverUpload.addEventListener('change', function () { uploadFile(coverUpload.files[0], slug, function (path) {
      P.cover = path; indexEntry.cover = path; save(); markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha); renderProjectEditor();
    }); });

    wireTieredFields();
    wireDeviceTabs(editorEl, renderProjectEditor);
    editorEl.querySelectorAll('details[data-sec]').forEach(function (d) {
      d.addEventListener('toggle', function () { projectSectionOpen[d.getAttribute('data-sec')] = d.open; });
    });
  }

  function uploadFile(file, slug, onDone) {
    if (!file) return;
    var form = new FormData();
    form.append('file', file);
    form.append('slug', slug);
    toast('Enviando arquivo…');
    fetch('/api/uploads', { method: 'POST', body: form }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.error) { toast(res.message || res.error, 'err'); return; }
      toast('Arquivo enviado.', 'ok');
      onDone(res.path);
    }).catch(function () { toast('Falha no upload.', 'err'); });
  }

  function renderProjects() {
    renderProjectsList();
    renderProjectEditor();
    document.getElementById('btnNewProject').addEventListener('click', function () {
      var titlePt = prompt('Título do novo projeto (português):');
      if (!titlePt) return;
      var slug = prompt('Slug (ex: campanha-2027):', titlePt.toLowerCase().normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-'));
      if (!slug) return;
      api('/api/projects', { method: 'POST', body: { slug: slug, titlePt: titlePt, titleEn: '' } }).then(function (res) {
        toast('Projeto "' + slug + '" criado como rascunho.', 'ok');
        return api('/api/projects');
      }).then(function (res) {
        state.projectsIndex = res.data; state.projectsIndexSha = res.sha;
        state.editingSlug = slug;
        renderProjectsList(); renderProjectEditor();
      }).catch(function (e) { toast(e.message, 'err'); });
    });
  }

  /* ---------- Publicação ---------- */
  function renderPublishPanel() {
    var paths = Object.keys(state.dirty);
    var el = document.getElementById('publishSummary');
    var btn = document.getElementById('btnPublish');
    if (!paths.length) {
      el.innerHTML = 'Nenhuma alteração pendente.';
      btn.disabled = true;
      return;
    }
    el.innerHTML = '<ul class="summary-list">' + paths.map(function (p) {
      return '<li><span>' + esc(p) + '</span><span class="badge custom">alterado</span></li>';
    }).join('') + '</ul>';
    btn.disabled = false;
  }

  function doPublish() {
    var paths = Object.keys(state.dirty);
    if (!paths.length) return;
    var files = paths.map(function (p) { return { path: p, data: state.dirty[p].data, sha: state.dirty[p].sha, message: state.dirty[p].message }; });
    document.getElementById('btnPublish').disabled = true;
    document.getElementById('publishResult').innerHTML = 'Publicando…';
    api('/api/publish', { method: 'POST', body: { files: files } }).then(function (res) {
      var okAll = res.ok;
      document.getElementById('publishResult').innerHTML =
        '<div class="badge ' + (okAll ? 'default' : 'custom') + '">' + (okAll ? 'Publicado com sucesso' : 'Publicação parcial — veja abaixo') + '</div>' +
        '<ul class="summary-list" style="margin-top:.6rem">' + res.results.map(function (r) {
          return '<li><span>' + esc(r.path) + '</span><span>' + (r.ok ? 'ok · ' + r.commit.slice(0, 7) : 'falhou: ' + esc(r.message || r.error)) + '</span></li>';
        }).join('') + '</ul>';
      if (okAll) {
        res.results.forEach(function (r) {
          delete state.dirty[r.path];
          if (r.path === 'content/global.json') state.globalSha = r.sha;
          if (r.path === 'content/home.json') state.homeSha = r.sha;
          if (r.path === 'content/projects/index.json') state.projectsIndexSha = r.sha;
          var m = r.path.match(/^content\/projects\/([a-z0-9-]+)\.json$/);
          if (m && state.projects[m[1]]) state.projects[m[1]].sha = r.sha;
        });
        localStorage.setItem('cms_last_publish', JSON.stringify({ at: res.publishedAt, files: res.results.length }));
        renderLastPublish();
      }
      updateDirtyIndicators();
      renderPublishPanel();
      toast(okAll ? 'Publicado.' : 'Publicação parcial — revise os erros.', okAll ? 'ok' : 'err');
    }).catch(function (e) {
      document.getElementById('publishResult').innerHTML = '<span style="color:var(--err)">' + esc(e.message) + '</span>';
      toast(e.message, 'err');
    }).finally(function () { document.getElementById('btnPublish').disabled = Object.keys(state.dirty).length === 0; });
  }

  function renderLastPublish() {
    var raw = localStorage.getItem('cms_last_publish');
    var el = document.getElementById('lastPublishInfo');
    if (!raw) { el.textContent = 'Nenhuma publicação registrada nesta máquina ainda.'; return; }
    var info = JSON.parse(raw);
    el.textContent = new Date(info.at).toLocaleString('pt-BR') + ' · ' + info.files + ' arquivo(s)';
  }

  /* ---------- navegação entre painéis ---------- */
  function showPanel(name) {
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-panel') === name); });
    document.querySelectorAll('#navList button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-panel') === name); });
  }

  /* ---------- boot ---------- */
  function boot() {
    Promise.all([api('/api/global'), api('/api/home'), api('/api/projects')]).then(function (results) {
      state.global = results[0].data; state.globalSha = results[0].sha;
      state.home = results[1].data; state.homeSha = results[1].sha;
      state.projectsIndex = results[2].data; state.projectsIndexSha = results[2].sha;

      document.getElementById('app').hidden = false;
      renderOverview(); renderAppearance(); renderLayout(); renderHeaderFooter(); renderHome(); renderProjects(); renderLastPublish(); renderPublishPanel();

      document.getElementById('navList').addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-panel]');
        if (btn) showPanel(btn.getAttribute('data-panel'));
      });
      document.getElementById('btnPublish').addEventListener('click', doPublish);
      document.getElementById('btnDiscard').addEventListener('click', function () {
        if (!confirm('Descartar todas as alterações não publicadas?')) return;
        location.reload();
      });
      window.addEventListener('beforeunload', function (e) {
        if (Object.keys(state.dirty).length) { e.preventDefault(); e.returnValue = ''; }
      });
    }).catch(function (e) {
      document.getElementById('gate').hidden = false;
      document.getElementById('gateMsg').textContent = 'Erro ao carregar o painel: ' + e.message;
    });
  }

  boot();
})();
