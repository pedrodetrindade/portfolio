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
    previewUrl: localStorage.getItem('cms_preview_url') || '',
    /* identidade do destino, lida de /api/status no boot. Serve para separar
       rascunhos: o mesmo navegador pode editar repositórios ou branches
       diferentes, e um rascunho nunca deve vazar de um para o outro. */
    repo: null, branch: null,
    draftSavedAt: null,
    /* linha de base para a revisão (Fase 3): path -> conteúdo publicado no
       momento em que foi carregado, antes de qualquer edição */
    published: {},
    /* ---- operações pendentes (Fase 4) ----
       Nada aqui vira commit antes do Publicar. Os bytes das mídias NÃO moram
       neste objeto: ficam no IndexedDB (ver bancoMidia), porque localStorage
       é texto e um JPEG viraria base64 inchado dentro do rascunho. Aqui fica
       só o registro do que existe. */
    pendingUploads: {},   /* path -> {mime, size, nome} */
    pendingPages: {},     /* path da página -> {slug, fromSlug} */
    pendingDeletes: {}    /* path -> motivo, para a revisão explicar */
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
    var publicado = state.published[path];
    /* Voltar exatamente ao dado publicado desfaz a pendência. Isso cobre
       slider restaurado, switch desligado/reativado e digitar o mesmo texto;
       arquivo idêntico não deve chegar à revisão nem à API de publicação. */
    if (publicado !== undefined && publicado !== null && JSON.stringify(data) === JSON.stringify(publicado)) {
      delete state.dirty[path];
    } else {
      state.dirty[path] = { data: data, sha: sha, message: message || ('cms: atualiza ' + path) };
    }
    updateDirtyIndicators();
    renderPublishPanel();
    atualizarSeloPrevia();
    scheduleDraftSave();
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

  /* ================== RASCUNHO LOCAL ==================
     Guarda o que ainda não foi publicado, para fechar a aba deixar de ser
     perda de trabalho. Regras que valem para tudo aqui:

     - NUNCA sai daqui para o GitHub sozinho. Isto é só localStorage; quem
       escreve no repositório continua sendo o botão Publicar.
     - NUNCA guarda token, JWT, cookie ou qualquer dado de autenticação. O que
       é gravado é exatamente o conteúdo dos arquivos que o Publicar enviaria,
       mais o SHA de cada um. O SHA é o hash do blob que o Git já expõe
       publicamente, não credencial — e é ele que faz a detecção de conflito
       continuar valendo depois de restaurar.
     - A chave separa por repositório E branch, porque o mesmo navegador pode
       editar destinos diferentes e um rascunho não pode vazar entre eles.
     - Só é apagado depois de uma publicação inteira dar certo. */
  var DRAFT_PREFIX = 'cms_draft:';
  var DRAFT_VERSION = 1;
  var draftDebounce = null;

  /* ================== MÍDIA PENDENTE (IndexedDB) ==================
     Os bytes de uma imagem ou PDF não cabem no localStorage: ele guarda texto,
     e um JPEG de 2MB viraria ~2,7MB de base64 dentro do rascunho, estourando
     a cota e deixando o autosave lento. IndexedDB guarda o Blob como binário
     de verdade, sem conversão.
     A chave é o caminho final do arquivo no repositório, então reenviar o
     mesmo caminho substitui em vez de acumular. Nada aqui é enviado ao GitHub
     antes do Publicar, e nada é apagado se a publicação falhar. */
  var IDB_NOME = 'cms-midia', IDB_STORE = 'pendentes', idbPromise = null;

  function abrirBanco() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB indisponível')); return; }
      var req = indexedDB.open(IDB_NOME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return idbPromise;
  }

  /* chave composta por destino: mídia pendente de um repositório/branch nunca
     aparece em outro, mesma regra do rascunho de texto */
  function chaveMidia(path) { return (state.repo || '?') + '@' + (state.branch || '?') + '::' + path; }

  function guardarMidia(path, blob) {
    return abrirBanco().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blob, chaveMidia(path));
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function lerMidia(path) {
    return abrirBanco().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var r = tx.objectStore(IDB_STORE).get(chaveMidia(path));
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  function apagarMidia(path) {
    return abrirBanco().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(chaveMidia(path));
        tx.oncomplete = resolve; tx.onerror = resolve;
      });
    }).catch(function () { });
  }

  /* base64 sem prefixo data:, que é o formato que o Worker espera em `binary`.
     FileReader em vez de laço sobre bytes: um arquivo de MBs travaria a aba
     por segundos num String.fromCharCode caractere a caractere. */
  function midiaParaBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        var virg = s.indexOf(',');
        resolve(virg === -1 ? s : s.slice(virg + 1));
      };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function limparTodaMidiaPendente() {
    var caminhos = Object.keys(state.pendingUploads);
    state.pendingUploads = {};
    return Promise.all(caminhos.map(apagarMidia));
  }

  /* mesma régua do Worker, reaplicada aqui só para avisar cedo — quem decide
     continua sendo o Worker */
  /* Espelha ALLOWED_UPLOAD_EXT de worker/src/validate.js. Quem decide é o
     Worker; isto existe para o erro aparecer na hora de escolher o arquivo. */
  var EXT_MIDIA = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg', '.gif', '.mp4', '.webm', '.pdf'];
  var MAX_MIDIA_BYTES = 25 * 1024 * 1024;
  var MAX_MIDIA_POR_PUBLICACAO = 32 * 1024 * 1024;
  function sanitizarNome(nome) {
    var baixo = String(nome || '').toLowerCase().trim();
    var ponto = baixo.lastIndexOf('.');
    if (ponto === -1) return null;
    var ext = baixo.slice(ponto);
    if (EXT_MIDIA.indexOf(ext) === -1) return null;
    var base = baixo.slice(0, ponto).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9._-]/g, '-').replace(/^\.+/, '').replace(/-+/g, '-');
    return base ? base + ext : null;
  }

  function draftKey() {
    if (!state.repo || !state.branch) return null;
    return DRAFT_PREFIX + state.repo + '@' + state.branch;
  }

  function saveDraftNow() {
    var k = draftKey();
    if (!k) return;
    if (!haPendencias()) { clearDraft(); return; }
    try {
      var agora = new Date().toISOString();
      localStorage.setItem(k, JSON.stringify({
        v: DRAFT_VERSION, repo: state.repo, branch: state.branch,
        savedAt: agora, files: state.dirty,
        /* só o registro das mídias: os bytes já estão no IndexedDB, que
           sobrevive ao fechamento da aba por conta própria */
        uploads: state.pendingUploads,
        pages: state.pendingPages,
        deletes: state.pendingDeletes
      }));
      state.draftSavedAt = agora;
      setDraftState('rascunho');
    } catch (e) {
      /* cota estourada ou modo privado: o painel continua funcionando, só sem
         rede de segurança — e diz isso em vez de fingir que salvou */
      setDraftState('semRascunho');
      toast('Não foi possível salvar o rascunho neste navegador.', 'err');
    }
  }

  function scheduleDraftSave() {
    clearTimeout(draftDebounce);
    draftDebounce = setTimeout(saveDraftNow, 400);
  }

  function readDraft() {
    var k = draftKey();
    if (!k) return null;
    try {
      var raw = localStorage.getItem(k);
      if (!raw) return null;
      var d = JSON.parse(raw);
      /* confere identidade e versão: um rascunho de outro destino ou de um
         formato antigo é ignorado, nunca aplicado por engano */
      if (!d || d.v !== DRAFT_VERSION) return null;
      if (d.repo !== state.repo || d.branch !== state.branch) return null;
      var temAlgo = (d.files && Object.keys(d.files).length) ||
        (d.uploads && Object.keys(d.uploads).length) ||
        (d.pages && Object.keys(d.pages).length) ||
        (d.deletes && Object.keys(d.deletes).length);
      if (!temAlgo) return null;
      return d;
    } catch (e) { return null; }
  }

  /* Descartar apaga o registro E os bytes: deixar as mídias no IndexedDB
     depois de descartar encheria o navegador com arquivos que nenhuma
     publicação vai usar. */
  function clearDraft() {
    var k = draftKey();
    if (k) { try { localStorage.removeItem(k); } catch (e) { } }
    state.draftSavedAt = null;
  }
  function descartarTudoPendente() {
    return limparTodaMidiaPendente().then(function () {
      state.pendingPages = {}; state.pendingDeletes = {}; state.dirty = {};
      clearDraft();
    });
  }

  /* Reencaixa o rascunho no estado carregado do GitHub. Os SHAs vêm do
     rascunho, e não da leitura de agora: assim, se o arquivo mudou no
     repositório enquanto a aba estava fechada, a publicação bate de frente
     com o conflito em vez de sobrescrever em silêncio. */
  function applyDraft(d) {
    Object.keys(d.files).forEach(function (path) {
      var entry = d.files[path];
      if (!entry || !entry.data) return;
      state.dirty[path] = entry;
      if (path === 'content/global.json') { state.global = entry.data; state.globalSha = entry.sha; }
      else if (path === 'content/home.json') { state.home = entry.data; state.homeSha = entry.sha; }
      else if (path === 'content/projects/index.json') { state.projectsIndex = entry.data; state.projectsIndexSha = entry.sha; }
      else {
        var m = path.match(/^content\/projects\/([a-z0-9-]+)\.json$/);
        if (m) state.projects[m[1]] = { data: entry.data, sha: entry.sha };
      }
    });
    /* pendências não-JSON: os bytes das mídias continuam no IndexedDB, então
       basta reencaixar o registro. Uma mídia cujo blob sumiu (navegador
       limpou o IndexedDB) é descartada aqui em vez de quebrar na publicação. */
    state.pendingPages = d.pages || {};
    state.pendingDeletes = d.deletes || {};
    var uploads = d.uploads || {};
    state.pendingUploads = {};
    Object.keys(uploads).forEach(function (p) { state.pendingUploads[p] = uploads[p]; });
    Object.keys(uploads).forEach(function (p) {
      lerMidia(p).then(function (blob) {
        if (blob) return;
        delete state.pendingUploads[p];
        marcarPendenteMudou();
        toast('A mídia ' + p + ' não está mais neste navegador e saiu da lista.', 'err');
      }).catch(function () { });
    });
    state.draftSavedAt = d.savedAt;
  }

  function quando(iso) {
    if (!iso) return '';
    try {
      var dt = new Date(iso);
      var hoje = new Date().toDateString() === dt.toDateString();
      return (hoje ? 'hoje às ' : dt.toLocaleDateString('pt-BR') + ' às ') +
        dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  /* Estados visíveis do trabalho. Texto por extenso, nunca só a cor. */
  var DRAFT_LABELS = {
    publicado: 'Tudo publicado',
    pendente: 'Alterações não publicadas',
    rascunho: 'Rascunho salvo localmente',
    publicando: 'Publicando…',
    concluido: 'Publicação concluída',
    falha: 'Falha na publicação',
    semRascunho: 'Alterações não publicadas (sem rascunho local)'
  };
  function setDraftState(estado) {
    var el = document.getElementById('draftState');
    if (!el) return;
    el.hidden = false;
    el.className = 'draft-state is-' + estado;
    var txt = DRAFT_LABELS[estado] || '';
    if (estado === 'rascunho' && state.draftSavedAt) txt += ' · ' + quando(state.draftSavedAt);
    el.textContent = txt;
  }
  /* Volta para o estado que corresponde ao que existe agora, sem inventar:
     é chamado depois de publicar, descartar ou restaurar. */
  function refreshDraftState() {
    if (!haPendencias()) { setDraftState('publicado'); return; }
    setDraftState(state.draftSavedAt ? 'rascunho' : 'pendente');
  }

  /* ================== REVISÃO ANTES DE PUBLICAR (Fase 3) ==================
     state.published guarda uma cópia congelada de cada arquivo no momento em
     que foi carregado do GitHub — antes de qualquer edição. É indispensável
     porque os campos do painel escrevem direto em state.global/home/projects
     (bindColor, bindText etc. fazem `state.global.colors[x] = ...`); não
     sobra nenhuma cópia "limpa" depois do primeiro clique. Sem esta cópia
     separada, não haveria contra o que comparar. */
  function snapshotPublished(path, data) {
    state.published[path] = JSON.parse(JSON.stringify(data));
  }

  function apiPathFor(path) {
    if (path === 'content/global.json') return '/api/global';
    if (path === 'content/home.json') return '/api/home';
    if (path === 'content/projects/index.json') return '/api/projects';
    var m = path.match(/^content\/projects\/([a-z0-9-]+)\.json$/);
    if (m) return '/api/projects/' + m[1];
    return null;
  }

  /* Busca a linha de base de qualquer caminho pendente que ainda não tenha
     uma (caso de um projeto restaurado do rascunho sem nunca ter sido aberto
     no editor nesta sessão — o rascunho carrega a versão editada direto em
     state.projects, sem passar pelo fetch que normalmente tira o retrato
     "antes"). Nunca sobrescreve uma linha de base que já existe. */
  function ensurePublishedBaseline(paths) {
    /* `p in state.published` e não `!state.published[p]`: um projeto criado
       agora tem a linha de base gravada como null de propósito ("nunca existiu
       publicado"), e o teste por valor a trataria como ausente, disparando um
       fetch que só pode dar 404. */
    var faltando = paths.filter(function (p) { return !(p in state.published); });
    if (!faltando.length) return Promise.resolve();
    return Promise.all(faltando.map(function (p) {
      var apiPath = apiPathFor(p);
      if (!apiPath) return Promise.resolve();
      return api(apiPath).then(function (res) { snapshotPublished(p, res.data); })
        .catch(function () { snapshotPublished(p, null); }); // arquivo novo: nunca existiu publicado
    }));
  }

  /* ---- motor de diff ----
     Genérico o bastante para cobrir os quatro JSONs sem precisar de um mapa
     de campo por campo, mas com rótulos legíveis para as chaves conhecidas.
     Não é um algoritmo de diff de texto: opera em cima da árvore JSON. */
  var ROTULOS_CAMPO = {
    hero: 'Capa', work: 'Projetos (introdução)', about: 'Sobre', help: 'O que eu faço',
    faq: 'Perguntas frequentes', contact: 'Contato', sections: 'Espaçamento por seção',
    background: 'Fundo principal', backgroundSecondary: 'Fundo secundário', surface: 'Superfície elevada',
    textPrimary: 'Texto principal', textSecondary: 'Texto secundário', textMuted: 'Texto desativado',
    accent: 'Cor de destaque', highlight: 'Realce', heroName: 'Cor do nome (capa)',
    borderColor: 'Cor das bordas (fraca)', borderColorStrong: 'Cor das bordas (forte)',
    radiusCard: 'Arredondamento dos cards', radiusImage: 'Arredondamento das imagens',
    radiusButton: 'Arredondamento dos botões', radiusField: 'Arredondamento dos campos',
    contentMaxWidth: 'Largura máxima do conteúdo', pageGutterDesktop: 'Margem lateral (desktop)',
    pageGutterMobile: 'Margem lateral (celular)', sectionSpacingTop: 'Espaço antes da seção (padrão)',
    sectionSpacingBottom: 'Espaço depois da seção (padrão)', gridGap: 'Espaço entre colunas da grade',
    showLanguageSwitch: 'Mostrar seletor de idioma', showContactButton: 'Mostrar botão de contato',
    menu: 'Itens de menu', copyrightPt: 'Copyright (PT)', copyrightEn: 'Copyright (EN)',
    disclaimerPt: 'Disclaimer (PT, reserva)', disclaimerEn: 'Disclaimer (EN, reserva)',
    marqueeText: 'Texto do marquee', linkedin: 'LinkedIn', behance: 'Behance', email: 'E-mail de contato',
    tagPt: 'Cargo (PT)', tagEn: 'Cargo (EN)', locationPt: 'Localização (PT)', locationEn: 'Localização (EN)',
    claimPt: 'Frase de efeito (PT)', claimEn: 'Frase de efeito (EN)', showAvailability: 'Mostrar disponibilidade',
    backgroundVideo: 'Vídeo de fundo da capa', backgroundVideoPoster: 'Poster do vídeo',
    titlePt: 'Título (PT)', titleEn: 'Título (EN)', contextPt: 'Contexto (PT)', contextEn: 'Contexto (EN)',
    asidePt: 'Texto lateral (PT)', asideEn: 'Texto lateral (EN)',
    kickerPt: 'Rótulo (PT)', kickerEn: 'Rótulo (EN)', leadPt: 'Texto principal (PT)', leadEn: 'Texto principal (EN)',
    subPt: 'Texto complementar (PT)', subEn: 'Texto complementar (EN)', photo: 'Retrato',
    ctaTalkPt: 'Botão de contato (PT)', ctaTalkEn: 'Botão de contato (EN)',
    showResume: 'Mostrar botão de currículo', resumeFile: 'Arquivo do currículo',
    resumeLabelPt: 'Rótulo do currículo (PT)', resumeLabelEn: 'Rótulo do currículo (EN)',
    capabilities: 'Capacidades', capabilitiesLabelPt: 'Rótulo das capacidades (PT)', capabilitiesLabelEn: 'Rótulo das capacidades (EN)',
    items: 'Itens', tags: 'Tags', textPt: 'Texto (PT)', textEn: 'Texto (EN)',
    qPt: 'Pergunta (PT)', qEn: 'Pergunta (EN)', aPt: 'Resposta (PT)', aEn: 'Resposta (EN)',
    titleLine1Pt: 'Título linha 1 (PT)', titleLine1En: 'Título linha 1 (EN)',
    titleLine2Pt: 'Título linha 2 (PT)', titleLine2En: 'Título linha 2 (EN)',
    mailLabelPt: 'Rótulo do e-mail (PT)', mailLabelEn: 'Rótulo do e-mail (EN)',
    visible: 'Visibilidade', order: 'Ordem', cover: 'Capa', coverLight: 'Capa clara',
    year: 'Ano', slug: 'Slug', status: 'Status', rolePt: 'Papel (PT)', roleEn: 'Papel (EN)',
    scopePt: 'Escopo (PT)', scopeEn: 'Escopo (EN)', subtitlePt: 'Subtítulo (PT)', subtitleEn: 'Subtítulo (EN)',
    src: 'Imagem', alt: 'Texto alternativo', pt: 'Texto (PT)', en: 'Texto (EN)'
  };
  function rotuloCampo(chave) { return ROTULOS_CAMPO[chave] || chave; }

  /* Campos cujo valor é um caminho de arquivo de imagem — tratados como
     "Imagem alterada" em vez de "Campo alterado", porque o valor bruto (um
     caminho) não é informativo para quem está revisando. */
  var CAMPOS_DE_IMAGEM = { cover: 1, photo: 1, src: 1 };
  var CHAVES_GENERICAS = { hex: 1, opacity: 1 };

  function ehObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /* Chave de identidade de um item de lista, para casar "o mesmo item" entre
     a versão publicada e a atual mesmo que o conteúdo tenha mudado. Sem uma
     chave estável (a maioria das listas do CMS não tem id), usa o primeiro
     campo de texto que normalmente não muda com a edição (slug > título >
     pergunta > texto em PT); se nada bater, cai no índice — dois itens sem
     nenhum campo de texto reconhecível são tratados como a mesma posição. */
  function chaveDoItem(item, idx) {
    if (!ehObjeto(item)) return String(item);
    return item.slug || item.titlePt || item.qPt || item.pt || item.src || ('#' + idx);
  }

  /* Compara duas listas e devolve adicionados, removidos, os que mudaram de
     conteúdo (mesma chave, dado diferente) e se a ordem dos itens em comum
     mudou. */
  function diffLista(antiga, nova) {
    antiga = antiga || []; nova = nova || [];
    var chavesAntigas = antiga.map(chaveDoItem), chavesNovas = nova.map(chaveDoItem);
    var adicionados = nova.filter(function (it, i) { return chavesAntigas.indexOf(chavesNovas[i]) === -1; });
    var removidos = antiga.filter(function (it, i) { return chavesNovas.indexOf(chavesAntigas[i]) === -1; });
    var comuns = chavesAntigas.filter(function (k) { return chavesNovas.indexOf(k) !== -1; });
    var ordemAntiga = chavesAntigas.filter(function (k) { return comuns.indexOf(k) !== -1; });
    var ordemNova = chavesNovas.filter(function (k) { return comuns.indexOf(k) !== -1; });
    var reordenado = ordemAntiga.join('|') !== ordemNova.join('|');
    var alterados = [];
    comuns.forEach(function (k) {
      var itAntigo = antiga[chavesAntigas.indexOf(k)], itNovo = nova[chavesNovas.indexOf(k)];
      if (JSON.stringify(itAntigo) !== JSON.stringify(itNovo)) alterados.push({ antigo: itAntigo, novo: itNovo, chave: k });
    });
    return { adicionados: adicionados, removidos: removidos, alterados: alterados, reordenado: reordenado };
  }

  function rotuloDoItem(item) {
    if (!ehObjeto(item)) return String(item);
    /* Bloco de projeto antes do resto: sem isto, a revisão dizia "item
       adicionado" para um bloco de texto, porque nenhuma das chaves abaixo
       existe nele. Agora diz qual bloco é, do mesmo jeito que o editor. */
    if (item.type && resumoDoBloco) return resumoDoBloco(item);
    return item.titlePt || item.qPt || item.pt || item.slug || item.src || 'item';
  }

  /* Percorre recursivamente dois objetos e empilha frases legíveis em `saida`.
     `caminhoTecnico` acumula o caminho JSON (para a visão técnica opcional).
     Não desce dentro de listas conhecidas por nome (help.items, faq.items,
     about.capabilities, tags, blocks, images, projects) — essas são tratadas
     à parte por diffLista, que entende adicionar/remover/reordenar; um diff
     campo-a-campo genérico dentro de uma lista produziria "item 3 mudou" sem
     dizer qual pergunta ou frente é essa. */
  var CHAVES_DE_LISTA_HUMANA = { items: 1, capabilities: 1, tags: 1, blocks: 1, images: 1, projects: 1 };

  function diffObjeto(antigo, novo, saida, caminhoTecnico, rotuloPai) {
    antigo = antigo || {}; novo = novo || {};
    var chaves = Object.keys(Object.assign({}, antigo, novo));
    chaves.forEach(function (k) {
      if (k === '$schema' || k === '$note') return;
      var vAntigo = antigo[k], vNovo = novo[k];
      var caminho = caminhoTecnico.concat(k);
      if (JSON.stringify(vAntigo) === JSON.stringify(vNovo)) return;

      if (Array.isArray(vNovo) || Array.isArray(vAntigo)) {
        if (CHAVES_DE_LISTA_HUMANA[k]) {
          var d = diffLista(vAntigo, vNovo);
          d.adicionados.forEach(function (it) { saida.push({ tipo: 'adicionado', texto: 'Item adicionado: "' + esc(rotuloDoItem(it)) + '"', caminho: caminho.join('.') }); });
          d.removidos.forEach(function (it) { saida.push({ tipo: 'removido', texto: 'Item removido: "' + esc(rotuloDoItem(it)) + '"', caminho: caminho.join('.') }); });
          if (d.reordenado) saida.push({ tipo: 'reordenado', texto: (rotuloPai ? rotuloPai + ': i' : 'I') + 'tens reordenados', caminho: caminho.join('.') });
          d.alterados.forEach(function (it) {
            saida.push({ tipo: 'alterado', texto: 'Item alterado: "' + esc(rotuloDoItem(it.novo)) + '"', caminho: caminho.join('.') });
          });
        } else {
          /* lista sem tratamento nomeado (não deveria haver hoje, mas cai
             aqui em vez de silenciar caso um campo novo apareça no JSON) */
          saida.push({ tipo: 'alterado', texto: rotuloCampo(k) + ' alterado(a)', caminho: caminho.join('.') });
        }
        return;
      }
      if (ehObjeto(vNovo) || ehObjeto(vAntigo)) {
        diffObjeto(vAntigo, vNovo, saida, caminho, rotuloCampo(k));
        return;
      }
      if (CAMPOS_DE_IMAGEM[k]) {
        var acao = !vAntigo ? 'adicionada' : !vNovo ? 'removida' : 'substituída';
        saida.push({ tipo: 'imagem', texto: 'Imagem ' + acao + (rotuloPai ? ' (' + rotuloPai + ')' : ''), caminho: caminho.join('.') });
        return;
      }
      /* "hex"/"opacity" não têm rótulo próprio — sozinhos não dizem qual cor
         mudou. Quando a chave é genérica assim e existe um rótulo do campo
         pai (ex.: "Cor de destaque", vindo do objeto colors.accent que a
         envolve), usa o pai: "hex alterado" vira "Cor de destaque alterado". */
      var baseRotulo = (CHAVES_GENERICAS[k] && rotuloPai) ? rotuloPai : rotuloCampo(k);
      saida.push({
        tipo: 'alterado',
        texto: baseRotulo + ' alterado' + (typeof vNovo === 'boolean' ? (vNovo ? ' (ligado)' : ' (desligado)') : ''),
        caminho: caminho.join('.'),
        de: vAntigo, para: vNovo
      });
    });
  }

  /* Agrupa por área de acordo com a origem do arquivo — é a categorização
     pedida (Aparência, Layout, Header e Footer, Home, Projetos), não uma
     lista plana de caminhos JSON. */
  function diffArquivo(path, antigo, novo) {
    var entradas = [];
    if (path === 'content/global.json') {
      var aparencia = [], layout = [], headerFooter = [];
      diffObjeto((antigo || {}).colors, (novo || {}).colors, aparencia, ['colors'], null);
      diffObjeto((antigo || {}).borders, (novo || {}).borders, aparencia, ['borders'], null);
      diffObjeto((antigo || {}).layout, (novo || {}).layout, layout, ['layout'], null);
      diffObjeto((antigo || {}).header, (novo || {}).header, headerFooter, ['header'], null);
      diffObjeto((antigo || {}).footer, (novo || {}).footer, headerFooter, ['footer'], null);
      diffObjeto((antigo || {}).social, (novo || {}).social, headerFooter, ['social'], null);
      return [
        { area: 'Aparência', entradas: aparencia },
        { area: 'Layout e espaçamentos', entradas: layout },
        { area: 'Header e footer', entradas: headerFooter }
      ].filter(function (g) { return g.entradas.length; });
    }
    if (path === 'content/home.json') {
      diffObjeto(antigo, novo, entradas, [], null);
      return entradas.length ? [{ area: 'Home', entradas: entradas }] : [];
    }
    if (path === 'content/projects/index.json') {
      diffObjeto(antigo, novo, entradas, [], null);
      return entradas.length ? [{ area: 'Projetos', entradas: entradas }] : [];
    }
    var m = path.match(/^content\/projects\/([a-z0-9-]+)\.json$/);
    if (m) {
      diffObjeto(antigo, novo, entradas, [], null);
      var titulo = (novo && novo.hero && novo.hero.titlePt) || (antigo && antigo.hero && antigo.hero.titlePt) || m[1];
      entradas.forEach(function (e) { e.texto = 'Projeto "' + esc(titulo) + '": ' + e.texto.charAt(0).toLowerCase() + e.texto.slice(1); });
      return entradas.length ? [{ area: 'Projetos', entradas: entradas }] : [];
    }
    return [];
  }

  /* Junta o diff de todos os arquivos pendentes num único agrupamento por
     área — é isto que vira a tela de revisão. */
  function calcularRevisao() {
    var porArea = {};
    function empilhar(area, entrada) {
      if (!porArea[area]) porArea[area] = [];
      porArea[area].push(entrada);
    }
    Object.keys(state.dirty).forEach(function (path) {
      var novo = state.dirty[path].data;
      var antigo = state.published[path] === undefined ? null : state.published[path];
      /* arquivo que nunca existiu publicado é criação, não um diff campo a
         campo — listar 40 campos "alterados" de um projeto novo não ajudaria */
      if (antigo === null) {
        var mNovo = path.match(/^content\/projects\/([a-z0-9-]+)\.json$/);
        var titulo = (novo && novo.hero && novo.hero.titlePt) || (mNovo ? mNovo[1] : path);
        empilhar('Projetos', { tipo: 'adicionado', texto: 'Projeto criado: "' + esc(titulo) + '"', caminho: path });
        return;
      }
      diffArquivo(path, antigo, novo).forEach(function (g) {
        if (!porArea[g.area]) porArea[g.area] = [];
        porArea[g.area] = porArea[g.area].concat(g.entradas);
      });
    });
    Object.keys(state.pendingPages).forEach(function (p) {
      empilhar('Projetos', { tipo: 'adicionado', texto: 'Página criada a partir do modelo: ' + esc(p), caminho: p });
    });
    Object.keys(state.pendingUploads).forEach(function (p) {
      var kb = Math.round((state.pendingUploads[p].size || 0) / 1024);
      empilhar('Mídia', { tipo: 'imagem', texto: 'Arquivo enviado: ' + esc(p) + ' (' + kb + ' KB)', caminho: p });
    });
    Object.keys(state.pendingDeletes).forEach(function (p) {
      empilhar('Projetos', { tipo: 'removido', texto: 'Removido: ' + esc(state.pendingDeletes[p]), caminho: p });
    });
    return Object.keys(porArea).map(function (area) { return { area: area, entradas: porArea[area] }; });
  }

  var ICONE_TIPO = { adicionado: '+', removido: '−', reordenado: '↕', alterado: '~', imagem: '🖼' };

  function renderRevisaoHtml(grupos) {
    var totalEntradas = grupos.reduce(function (n, g) { return n + g.entradas.length; }, 0);
    if (!totalEntradas) {
      return '<p class="lead">Nada para comparar — os arquivos marcados como alterados são idênticos ao publicado.</p>';
    }
    var html = grupos.map(function (g) {
      return '<div class="review-group"><h3>' + esc(g.area) + '</h3><ul class="review-list">' +
        g.entradas.map(function (e) {
          return '<li class="review-item is-' + e.tipo + '"><span class="review-icon" aria-hidden="true">' + ICONE_TIPO[e.tipo] + '</span>' +
            '<span>' + e.texto + (e.de !== undefined ? ' <span class="review-fromto">(de "' + esc(String(e.de)) + '" para "' + esc(String(e.para)) + '")</span>' : '') + '</span></li>';
        }).join('') + '</ul></div>';
    }).join('');
    return html;
  }

  /* Sem esc() aqui: o chamador grava isto em .textContent, não em innerHTML,
     e o textContent já escapa sozinho — passar por esc() antes faria as
     entidades (&quot; etc.) aparecerem literalmente na tela em vez de aspas. */
  function renderRevisaoTecnica(grupos) {
    var linhas = [];
    grupos.forEach(function (g) {
      g.entradas.forEach(function (e) { linhas.push(g.area + ' · ' + e.caminho + (e.de !== undefined ? ' : ' + JSON.stringify(e.de) + ' → ' + JSON.stringify(e.para) : '')); });
    });
    return linhas.length ? linhas.join('\n') : 'Nada.';
  }

  var revisaoResolver = null;

  /* Abre a tela de revisão e devolve uma Promise: resolve com a mensagem de
     commit (string, pode ser vazia) se a pessoa confirmar, ou com null se
     cancelar. doPublish só é chamado dentro dessa resolução — nada é
     publicado enquanto a confirmação final não acontece. */
  function abrirRevisao() {
    var paths = Object.keys(state.dirty);
    var modal = document.getElementById('reviewModal');
    document.getElementById('reviewBody').innerHTML = '<p class="lead">Carregando comparação…</p>';
    document.getElementById('reviewTecnico').textContent = '';
    modal.hidden = false;
    return ensurePublishedBaseline(paths).then(function () {
      var grupos = calcularRevisao();
      document.getElementById('reviewBody').innerHTML = renderRevisaoHtml(grupos);
      document.getElementById('reviewTecnico').textContent = renderRevisaoTecnica(grupos);
      document.getElementById('reviewMessage').value = '';
    });
  }

  /* {confirmado, mensagem} em vez de só a mensagem: "confirmar sem escrever
     nada" e "cancelar" são coisas diferentes, e as duas produziriam mensagem
     vazia se não fossem distinguidas por um campo próprio. */
  function fecharRevisao(confirmado) {
    document.getElementById('reviewModal').hidden = true;
    if (revisaoResolver) {
      revisaoResolver({ confirmado: confirmado, mensagem: document.getElementById('reviewMessage').value.trim() });
      revisaoResolver = null;
    }
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
  /* Estado da barra da prévia, compartilhado pelos três painéis que a exibem
     (aparência, layout, home) para não divergirem entre si. */
  /* Larguras reais de viewport, escolhidas para cair de forma inequívoca em
     cada faixa do site (os pontos de corte são 900px e 640px):
     1280 acima de 900, 820 entre 640 e 899, 390 abaixo de 640. */
  var PREVIEW_LARGURAS = { desktop: 1280, tablet: 820, mobile: 390 };
  var PREVIEW_ALTURA = 520;
  var previewDevice = 'desktop', previewWidth = String(PREVIEW_LARGURAS.desktop), previewLang = 'pt';
  /* Abas abertas pelo botão "Nova aba". Guardadas para receberem as mesmas
     mensagens do iframe; as que o usuário fechou são descartadas no envio. */
  var previewTabs = [];

  function schedulePreview() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(sendPreview, 200);
  }
  /* Os três painéis com prévia (aparência, layout, home) ficam todos no DOM ao
     mesmo tempo — só a classe .active decide qual aparece. Antes isto buscava
     por id e o id se repetia nos três, então só o primeiro iframe do
     documento recebia as mudanças: a prévia da aba Home nunca reagia. */
  var PREVIEW_PROTOCOL = 1;

  /* Origem exata do destino, nunca '*'. Com '*' o navegador entregaria o
     conteúdo não publicado para qualquer origem que estivesse no iframe
     naquele momento — inclusive uma para onde ele tivesse navegado sozinho.
     Devolve null quando a URL da prévia não é utilizável, e nesse caso nada
     é enviado. */
  function origemDaPrevia() {
    try {
      var u = new URL(state.previewUrl, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.origin;
    } catch (e) { return null; }
  }

  /* Monta a URL do iframe declarando a origem do painel, para o site poder
     validar event.origin sem ter nenhum endereço fixo no código. */
  /* `caminho` aponta a prévia para outra página do mesmo site — hoje só a de
     um projeto (work/<slug>.html). Sem ele, editar um case mostrava a Home:
     o painel mandava os dados do projeto para uma página que não os usa, e
     quem editava não via nada mudar. O slug é conferido antes de virar
     caminho, porque ele acaba dentro de uma URL. */
  function urlDaPrevia(extra, caminho) {
    var u = new URL(state.previewUrl, location.href);
    if (caminho) u.pathname = u.pathname.replace(/\/?$/, '/') + caminho;
    u.searchParams.set('cmsOrigin', location.origin);
    /* O servidor local canonicaliza .html para a URL sem extensão e pode
       descartar a query. O fragmento é preservado pelo navegador no redirect
       e carrega a mesma origem declarada, não uma origem inferida. */
    u.hash = 'cmsOrigin=' + encodeURIComponent(location.origin);
    if (extra) Object.keys(extra).forEach(function (k) { u.searchParams.set(k, extra[k]); });
    return u.toString();
  }

  function caminhoDaPreviaDoProjeto() {
    var s = state.editingSlug;
    if (typeof s !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return '';
    /* Uma URL criada ou renomeada ainda não existe no servidor de prévia.
       Usa a página-modelo até a publicação; o postMessage injeta o projeto
       em edição, então o conteúdo continua sendo o novo. */
    var pendente = state.pendingPages['work/' + s + '.html'];
    return 'work/' + (pendente && pendente.fromSlug ? pendente.fromSlug : s) + '.html';
  }

  function postToPreviews(msg) {
    var alvo = origemDaPrevia();
    if (!alvo) return;
    document.querySelectorAll('iframe.preview-frame').forEach(function (frame) {
      if (!frame.contentWindow) return;
      frame.contentWindow.postMessage(msg, alvo);
    });
    previewTabs = previewTabs.filter(function (w) { return w && !w.closed; });
    previewTabs.forEach(function (w) {
      try { w.postMessage(msg, alvo); } catch (e) { /* aba trocou de origem */ }
    });
  }

  /* Envia só dado estruturado — nenhuma função, nenhum HTML, nenhum seletor.
     O site lê campo a campo e escapa tudo antes de escrever na tela. */
  function sendPreview() {
    postToPreviews({
      __cms__: 'preview', v: PREVIEW_PROTOCOL, type: 'content',
      data: {
        global: state.global,
        home: state.home,
        projectsIndex: state.projectsIndex,
        project: state.editingSlug && state.projects[state.editingSlug]
          ? state.projects[state.editingSlug].data : null
      }
    });
  }

  function sendPreviewLang(lang) {
    postToPreviews({ __cms__: 'preview', v: PREVIEW_PROTOCOL, type: 'lang', lang: lang === 'en' ? 'en' : 'pt' });
  }

  /* Selo de "isto ainda não está no ar". Fica na barra da prévia porque é
     exatamente ali que a confusão acontece: o que está na tela é rascunho, e
     nada distinguia isso do site publicado. Conta arquivos, não campos — é o
     que o botão Publicar realmente vai enviar. Não depende só de cor: traz o
     número e o texto por extenso. */
  function atualizarSeloPrevia() {
    var n = Object.keys(state.dirty).length + Object.keys(state.pendingUploads).length +
      Object.keys(state.pendingPages).length + Object.keys(state.pendingDeletes).length;
    document.querySelectorAll('[data-pv-badge]').forEach(function (el) {
      el.hidden = n === 0;
      el.textContent = n === 0 ? '' :
        (n === 1 ? '1 alteração não publicada' : n + ' alterações não publicadas');
    });
  }
  function previewBlock(caminho) {
    if (!state.previewUrl) {
      return '<div class="group" style="margin-bottom:1.2rem"><div class="group-body">' +
        fieldRow('URL da prévia', 'Endereço do site (local ou publicado) usado só para você ver o efeito das mudanças aqui no painel.',
          '<input type="url" id="previewUrlInput" placeholder="http://localhost:8123/" style="max-width:360px">' +
          '<button class="btn small" id="btnSetPreview">Usar</button>') +
        '</div></div>';
    }
    /* As larguras caem dentro das faixas reais do site (900px e 640px são os
       dois únicos pontos de corte do CSS): 820px fica na faixa do tablet
       (640–899) e 390px na do celular (abaixo de 640). Desktop é fluido, para
       usar a largura que o painel tiver. */
    var dispositivos = [
      ['desktop', 'Desktop', String(PREVIEW_LARGURAS.desktop)],
      ['tablet', 'Tablet', String(PREVIEW_LARGURAS.tablet)],
      ['mobile', 'Celular', String(PREVIEW_LARGURAS.mobile)]
    ];
    var botoesDisp = dispositivos.map(function (d) {
      return '<button class="btn small' + (previewDevice === d[0] ? ' on' : '') +
        '" data-pv-device="' + d[0] + '" data-pv-width="' + d[2] + '">' + d[1] + '</button>';
    }).join('');
    var botoesLang = ['pt', 'en'].map(function (l) {
      return '<button class="btn small' + (previewLang === l ? ' on' : '') +
        '" data-pv-lang="' + l + '">' + l.toUpperCase() + '</button>';
    }).join('');

    return '<div class="preview-wrap">' +
      '<div class="preview-head">' +
        '<span class="pv-title">Prévia ao vivo</span>' +
        '<span class="pv-badge" data-pv-badge hidden></span>' +
        '<span class="pv-tools">' +
          '<span class="pv-group" role="group" aria-label="Tamanho da tela">' + botoesDisp + '</span>' +
          '<span class="pv-group" role="group" aria-label="Idioma da prévia">' + botoesLang + '</span>' +
          '<button class="btn small" data-pv-reload="1" title="Recarrega o site e reaplica suas alterações">Atualizar</button>' +
          '<button class="btn small" data-pv-open="1" title="Abre numa aba nova, já com suas alterações não publicadas">Nova aba</button>' +
          '<button class="btn small" data-change-preview="1">trocar URL</button>' +
        '</span>' +
      '</div>' +
      '<div class="preview-stage">' +
        '<iframe class="preview-frame" src="' + esc(urlDaPrevia(null, caminho)) + '"></iframe>' +
      '</div></div>';
  }

  /* Reduz o iframe até caber no palco, sem nunca ampliar: se houver espaço
     sobrando, fica em 1:1. A altura é compensada pela escala para o conteúdo
     visível continuar sendo os mesmos 520px de altura em qualquer modo. */
  function aplicarEscalaPrevia() {
    var alvo = Number(previewWidth) || PREVIEW_LARGURAS.desktop;
    document.querySelectorAll('.preview-stage').forEach(function (stage) {
      var frame = stage.querySelector('.preview-frame');
      if (!frame) return;
      var disponivel = stage.clientWidth;
      if (!disponivel) return;
      var escala = Math.min(1, disponivel / alvo);
      frame.style.width = alvo + 'px';
      frame.style.height = Math.round(PREVIEW_ALTURA / escala) + 'px';
      frame.style.transform = 'scale(' + escala + ')';
    });
  }
  window.addEventListener('resize', aplicarEscalaPrevia);
  /* Refaz todas as prévias de uma vez, cada uma com o caminho que é o dela.
     Era `[...].forEach(wirePreviewBlock)`, que funcionava enquanto a função
     tinha um parâmetro só; com o segundo, o forEach passaria o ÍNDICE como
     caminho e a segunda e a terceira prévias tentariam abrir /1 e /2. */
  var SLOTS_DE_PREVIA = ['previewSlotAppearance', 'previewSlotLayout', 'previewSlotHome', 'previewSlotProject'];

  function remontarPrevias(limpar) {
    SLOTS_DE_PREVIA.forEach(function (id) {
      var s = document.getElementById(id);
      if (limpar && s) s.innerHTML = '';
      wirePreviewBlock(id, id === 'previewSlotProject' ? caminhoDaPreviaDoProjeto() : '');
    });
  }

  function wirePreviewBlock(slotId, caminho) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    /* Não redesenha se a prévia já está montada com a mesma URL: recriar o
       <iframe> recarrega o site inteiro e perde a rolagem, e os painéis
       re-renderizam a cada item adicionado ou removido de uma lista.
       A comparação inclui o caminho, senão trocar de projeto deixaria a
       prévia do anterior na tela. */
    var current = slot.querySelector('.preview-frame');
    if (current && state.previewUrl && current.getAttribute('src') === urlDaPrevia(null, caminho)) return;
    slot.innerHTML = previewBlock(caminho);
    var setBtn = slot.querySelector('#btnSetPreview');
    if (setBtn) setBtn.addEventListener('click', function () {
      var v = slot.querySelector('#previewUrlInput').value.trim();
      if (!v) return;
      state.previewUrl = v; localStorage.setItem('cms_preview_url', v);
      remontarPrevias(false);
    });
    var changeBtn = slot.querySelector('[data-change-preview]');
    if (changeBtn) changeBtn.addEventListener('click', function () {
      state.previewUrl = ''; localStorage.removeItem('cms_preview_url');
      remontarPrevias(true);
    });
    var frame = slot.querySelector('.preview-frame');
    /* Reenvia o rascunho a cada carga do iframe. É o que faz "Atualizar"
       funcionar: o site recarrega com o conteúdo publicado e, logo em
       seguida, recebe de volta as alterações que ainda não foram enviadas. */
    if (frame) frame.addEventListener('load', sendPreview);
    aplicarEscalaPrevia();

    /* Um render só da barra para os três slots: o estado é compartilhado, então
       trocar de dispositivo num painel mantém a escolha nos outros. */
    function reRenderBarras() {
      aplicarEscalaPrevia();
      ['previewSlotAppearance', 'previewSlotLayout', 'previewSlotHome'].forEach(function (id) {
        var s = document.getElementById(id);
        if (!s || !s.querySelector('.preview-stage')) return;
        s.querySelectorAll('[data-pv-device]').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-pv-device') === previewDevice);
        });
        s.querySelectorAll('[data-pv-lang]').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-pv-lang') === previewLang);
        });
      });
    }

    slot.querySelectorAll('[data-pv-device]').forEach(function (b) {
      b.addEventListener('click', function () {
        previewDevice = b.getAttribute('data-pv-device');
        previewWidth = b.getAttribute('data-pv-width') || '';
        reRenderBarras();
      });
    });
    slot.querySelectorAll('[data-pv-lang]').forEach(function (b) {
      b.addEventListener('click', function () {
        previewLang = b.getAttribute('data-pv-lang');
        sendPreviewLang(previewLang);
        reRenderBarras();
      });
    });
    var reloadBtn = slot.querySelector('[data-pv-reload]');
    if (reloadBtn) reloadBtn.addEventListener('click', function () {
      var f = slot.querySelector('.preview-frame');
      if (f) f.setAttribute('src', urlDaPrevia());   // o load reenvia o rascunho
    });
    var openBtn = slot.querySelector('[data-pv-open]');
    if (openBtn) openBtn.addEventListener('click', function () {
      var w = window.open(urlDaPrevia(), '_blank', 'noopener=no');
      if (!w) { toast('O navegador bloqueou a nova aba.', 'err'); return; }
      previewTabs.push(w);
      /* a aba precisa terminar de carregar antes de receber o rascunho */
      setTimeout(sendPreview, 1200);
    });
    atualizarSeloPrevia();
  }

  /* ---------- Visão geral ---------- */
  /* Lê o status já carregado no boot em vez de pedir de novo: ele passou a ser
     buscado junto com o conteúdo, porque repositório e branch são o que
     separa um rascunho local do outro. */
  function renderOverview() {
    var s = state.status;
    if (!s) { setStatus(false, 'status indisponível'); return; }
    document.getElementById('overviewBody').innerHTML =
      fieldRow('Repositório', '', esc(s.repo)) +
      fieldRow('Branch', '', esc(s.branch)) +
      fieldRow('Autenticação', '', s.authMode === 'local-bypass' ?
        '<span class="badge custom">bypass local (DEV_AUTH_BYPASS)</span>' : '<span class="badge default">Cloudflare Access</span>') +
      fieldRow('Cloudflare Access', '', s.accessConfigured ?
        '<span class="badge default">configurado</span>' : '<span class="badge custom">variáveis pendentes — ver README</span>');
    setStatus(true);
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
    return badge + (isCustom
      ? '<button class="btn small" data-reset-field="' + fieldId + '">' + (inheritsFrom ? 'Voltar a herdar' : 'Voltar ao padrão') + '</button>'
      : '');
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
  /* NÃO materializa o objeto de espaçamento só por desenhar a tela. A versão
     anterior fazia `target[key] || (target[key] = {})` e preenchia os três
     níveis com null: abrir um projeto para editar já sujava o arquivo e
     gravava um bloco de nulls em CADA bloco, sem ninguém ter mexido em nada.
     Na revisão isso aparecia como "desktop alterado / tablet alterado /
     mobile alterado" em blocos intocados, e ia junto no commit.
     Agora o objeto nasce local, só para a tela, e só vai para o dado quando
     existe um valor de verdade; limpar o último valor remove o objeto. */
  function nivelVazio() { return { desktop: null, tablet: null, mobile: null }; }

  function espacamentoVazio(s) {
    if (!s) return true;
    return Object.keys(s).every(function (campo) {
      var n = s[campo];
      return !n || ['desktop', 'tablet', 'mobile'].every(function (d) { return n[d] == null; });
    });
  }

  function blockSpacingFields(target, key, onSave, includeGap, defaults) {
    defaults = defaults || {};
    var atual = target[key] || {};
    /* Cada nível ganha um objeto PRÓPRIO, nunca um compartilhado: é a
       referência viva que tieredSpacingField usa depois para decidir se o
       campo mostra "próprio" ou "herdando de Desktop". Com um objeto único
       para todos os campos, o selo de um bloco falaria pelo outro. Quando o
       dado já existe, a visão é o próprio dado, e escrever atualiza os dois
       de uma vez. */
    var visao = {
      marginTop: atual.marginTop || nivelVazio(),
      marginBottom: atual.marginBottom || nivelVazio(),
      gap: atual.gap || nivelVazio()
    };
    function escrever(campo, dev, v) {
      visao[campo][dev] = v;
      var s = target[key];
      if (v == null) {
        /* limpar não pode criar o objeto que a limpeza deveria remover */
        if (s && s[campo]) {
          delete s[campo][dev];
          if (!Object.keys(s[campo]).length) delete s[campo];
          if (espacamentoVazio(s)) delete target[key];
        }
      } else {
        s = target[key] || (target[key] = {});
        /* O dado publicado é esparso: níveis herdados ficam ausentes, não
           gravados como null. `nivelVazio` existe só na visão local do painel. */
        if (!s[campo]) s[campo] = {};
        s[campo][dev] = v;
      }
      onSave();
    }
    var html =
      tieredSpacingField('Espaço antes', 'margin-top', visao.marginTop, LIMITS.spacing[0], LIMITS.spacing[1],
        function (dev, v) { escrever('marginTop', dev, v); },
        function (dev) { escrever('marginTop', dev, null); renderProjectEditor(); }, defaults.marginTop != null ? defaults.marginTop : 0, 'padrão do site') +
      tieredSpacingField('Espaço depois', 'margin-bottom', visao.marginBottom, LIMITS.spacing[0], LIMITS.spacing[1],
        function (dev, v) { escrever('marginBottom', dev, v); },
        function (dev) { escrever('marginBottom', dev, null); renderProjectEditor(); }, defaults.marginBottom != null ? defaults.marginBottom : 0, 'padrão do site');
    if (includeGap) {
      html += tieredSpacingField('Espaço entre elementos', 'gap', visao.gap, LIMITS.gap[0], LIMITS.gap[1],
        function (dev, v) { escrever('gap', dev, v); },
        function (dev) { escrever('gap', dev, null); renderProjectEditor(); }, defaults.gap != null ? defaults.gap : 0, 'padrão do site');
    }
    return html;
  }

  function renderLayout() {
    wirePreviewBlock('previewSlotLayout');
    var l = state.global.layout;
    var effects = state.global.effects || {};
    var grain = effects.grain || {};
    function grainTarget() {
      if (!state.global.effects) state.global.effects = {};
      if (!state.global.effects.grain) state.global.effects.grain = {};
      return state.global.effects.grain;
    }

    document.getElementById('layoutGlobalBody').innerHTML =
      fieldRow('Largura máxima do conteúdo', 'contentMaxWidth · px', sliderControl('lay_maxw', l.contentMaxWidth, LIMITS.contentWidth[0], LIMITS.contentWidth[1], 'px')) +
      fieldRow('Margem lateral (telas grandes)', 'pageGutterDesktop · px', sliderControl('lay_gutd', l.pageGutterDesktop, 0, 200, 'px')) +
      fieldRow('Margem lateral (celular)', 'pageGutterMobile · px', sliderControl('lay_gutm', l.pageGutterMobile, 0, 100, 'px')) +
      fieldRow('Grain vivo global', 'Textura leve animada por composição. Cada seção pode herdar, ligar ou desligar.', switchControl('lay_grain', grain.enabled !== false)) +
      fieldRow('Intensidade do grain', 'Percentual de opacidade. O FAQ reduz automaticamente essa intensidade para preservar o branco.', sliderControl('lay_grain_op', grain.opacity == null ? 4.5 : grain.opacity, 0, 12, '%', .5)) +
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
    bindSwitch('lay_grain', function (v) {
      grainTarget().enabled = v;
      markDirty('content/global.json', state.global, state.globalSha);
      schedulePreview();
    });
    bindSlider('lay_grain_op', 0, 12, function (v) {
      grainTarget().opacity = v;
      markDirty('content/global.json', state.global, state.globalSha);
      schedulePreview();
    });
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
    var labels = { hero: 'Capa', work: 'Projetos', about: 'Sobre', help: 'O que eu faço', faq: 'FAQ', contact: 'Contato' };
    /* work e about já tinham respiro próprio, fixo no CSS, antes do CMS
       existir — sem valor gravado aqui, o site usa esse número fixo, não o
       padrão global. help/faq/contact sempre usaram o padrão global. */
    var USA_PADRAO_GLOBAL = { help: true, faq: true, contact: true, work: false, about: false };
    function sectionTarget(key) {
      if (!sections[key]) sections[key] = {};
      return sections[key];
    }
    function cleanEmptySection(key) {
      var target = sections[key];
      if (target && Object.keys(target).length === 0) delete sections[key];
    }
    function clearSectionSpacing(key, prop, dev, preserveShape) {
      var target = sections[key];
      if (!target || !target[prop]) return;
      if (preserveShape) target[prop][dev] = null;
      else {
        delete target[prop][dev];
        if (Object.keys(target[prop]).every(function (tier) { return target[prop][tier] == null; })) delete target[prop];
      }
      cleanEmptySection(key);
    }
    function saveSection() {
      markDirty('content/home.json', state.home, state.homeSha);
      schedulePreview();
    }
    document.getElementById('layoutSectionsBody').innerHTML =
      '<p class="hint">Cada seção pode usar cor e imagem próprias ou herdar o fundo original. O grain pode seguir o padrão global, ser ligado ou desligado só naquela seção. "Divisórias" controla somente as linhas estruturais.</p>' +
      deviceTabsHtml('sections') +
      Object.keys(labels).map(function (key) {
        var s = sections[key] || {};
        var hadSpacingTop = !!s.spacingTop;
        var hadSpacingBottom = !!s.spacingBottom;
        var spacingTop = s.spacingTop || { desktop: null, tablet: null, mobile: null };
        var spacingBottom = s.spacingBottom || { desktop: null, tablet: null, mobile: null };
        var fallbackBg = key === 'faq' ? { hex: '#f2eeee', opacity: 100 } :
          ((state.global.colors && state.global.colors.background) || { hex: '#0d0a0a', opacity: 100 });
        var ownBg = s.background;
        var usesGlobal = USA_PADRAO_GLOBAL[key];
        var fbTop = usesGlobal ? state.global.layout.sectionSpacingTop.desktop : null;
        var fbBottom = usesGlobal ? state.global.layout.sectionSpacingBottom.desktop : null;
        var note = usesGlobal ? null : 'valor fixo do site (ainda não editável nesta seção)';
        return '<div style="border-top:1px solid var(--line);padding-top:.8rem;margin-top:.8rem">' +
          '<b>' + esc(labels[key]) + '</b>' +
          fieldRow('Usar cor de fundo própria', 'Desligado mantém o fundo original.', switchControl('sec_' + key + '_ownbg', !!ownBg)) +
          fieldRow('Cor de fundo', key === 'faq' ? 'A tipografia do FAQ foi desenhada para fundos claros.' : '',
            colorControl('sec_' + key + '_bg', (ownBg || fallbackBg).hex, (ownBg || fallbackBg).opacity)) +
          fieldRow('Imagem de fundo', 'Opcional. Envie um arquivo, cole um caminho assets/ ou uma URL HTTPS direta.',
            '<input type="text" id="sec_' + key + '_image" value="' + esc(s.backgroundImage || '') + '"><input type="file" id="sec_' + key + '_image_upload" accept="image/*">') +
          fieldRow('Intensidade da imagem', 'Reduza para misturar a imagem com a cor de fundo e preservar a leitura.',
            sliderControl('sec_' + key + '_image_opacity', s.backgroundImageOpacity == null ? 100 : s.backgroundImageOpacity, 0, 100, '%')) +
          fieldRow('Posição da imagem', '', selectDe('sec_' + key + '_image_position', s.backgroundPosition || 'center', [
            ['center', 'Centro'], ['top', 'Topo'], ['bottom', 'Base']
          ])) +
          fieldRow('Grain nesta seção', 'Herdar acompanha o controle global.', selectDe('sec_' + key + '_grain',
            typeof s.grainEnabled === 'boolean' ? (s.grainEnabled ? 'on' : 'off') : 'inherit', [
              ['inherit', 'Herdar do global'], ['on', 'Ligado'], ['off', 'Desligado']
            ])) +
          (key === 'hero' || key === 'work' ? '' : fieldRow('Mostrar divisórias', 'Remove ou restaura as linhas estruturais desta seção.',
            switchControl('sec_' + key + '_dividers', s.showDividers !== false))) +
          (key === 'hero' ? '' : tieredSpacingField('Espaço antes da seção', '', spacingTop, LIMITS.spacing[0], LIMITS.spacing[1],
            function (dev, v) { spacingTop[dev] = v; var target = sectionTarget(key); if (!target.spacingTop) target.spacingTop = {}; target.spacingTop[dev] = v; saveSection(); },
            function (dev) { spacingTop[dev] = hadSpacingTop ? null : undefined; clearSectionSpacing(key, 'spacingTop', dev, hadSpacingTop); saveSection(); renderLayout(); },
            fbTop, note)) +
          (key === 'hero' ? '' : tieredSpacingField('Espaço depois da seção', '', spacingBottom, LIMITS.spacing[0], LIMITS.spacing[1],
            function (dev, v) { spacingBottom[dev] = v; var target = sectionTarget(key); if (!target.spacingBottom) target.spacingBottom = {}; target.spacingBottom[dev] = v; saveSection(); },
            function (dev) { spacingBottom[dev] = hadSpacingBottom ? null : undefined; clearSectionSpacing(key, 'spacingBottom', dev, hadSpacingBottom); saveSection(); renderLayout(); },
            fbBottom, note)) +
          '</div>';
      }).join('');
    Object.keys(labels).forEach(function (key) {
      var own = !!(sections[key] && sections[key].background);
      ['_hex', '_op', '_opn'].forEach(function (suffix) {
        var el = document.getElementById('sec_' + key + '_bg' + suffix);
        if (el) el.disabled = !own;
      });
      bindSwitch('sec_' + key + '_ownbg', function (enabled) {
        var target = sectionTarget(key);
        if (enabled) {
          var baseColor = key === 'faq' ? { hex: '#f2eeee', opacity: 100 } :
            ((state.global.colors && state.global.colors.background) || { hex: '#0d0a0a', opacity: 100 });
          target.background = { hex: baseColor.hex, opacity: baseColor.opacity };
        } else {
          delete target.background;
          cleanEmptySection(key);
        }
        saveSection(); renderLayout();
      });
      bindColor('sec_' + key + '_bg', function (hex, op) {
        sectionTarget(key).background = { hex: hex, opacity: op };
        saveSection();
      });
      bindText('sec_' + key + '_image', function (v) {
        var target = sectionTarget(key);
        if (v.trim()) target.backgroundImage = v.trim();
        else delete target.backgroundImage;
        cleanEmptySection(key);
        saveSection();
      });
      bindSlider('sec_' + key + '_image_opacity', 0, 100, function (v) {
        sectionTarget(key).backgroundImageOpacity = v;
        saveSection();
      });
      document.getElementById('sec_' + key + '_image_position').addEventListener('change', function (e) {
        var target = sectionTarget(key);
        if (e.target.value === 'center') delete target.backgroundPosition;
        else target.backgroundPosition = e.target.value;
        cleanEmptySection(key);
        saveSection();
      });
      document.getElementById('sec_' + key + '_grain').addEventListener('change', function (e) {
        var target = sectionTarget(key);
        if (e.target.value === 'inherit') delete target.grainEnabled;
        else target.grainEnabled = e.target.value === 'on';
        cleanEmptySection(key);
        saveSection();
      });
      var bgUpload = document.getElementById('sec_' + key + '_image_upload');
      if (bgUpload) bgUpload.addEventListener('change', function () {
        uploadFile(bgUpload.files[0], 'fundos-' + key, function (path) {
          sectionTarget(key).backgroundImage = path;
          saveSection();
          renderLayout();
        });
      });
      if (key !== 'hero' && key !== 'work') bindSwitch('sec_' + key + '_dividers', function (enabled) {
        var target = sectionTarget(key);
        if (enabled) delete target.showDividers; else target.showDividers = false;
        cleanEmptySection(key);
        saveSection();
      });
    });
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
        return fieldRow('Item de menu ' + (i + 1) + ' (PT)', 'Enter força uma nova linha.', ta('menu_' + i + '_pt', item.pt)) +
          fieldRow('Item de menu ' + (i + 1) + ' (EN)', 'Enter força uma nova linha.', ta('menu_' + i + '_en', item.en)) +
          fieldRow('Leva para', 'seções da Home',
            '<select id="menu_' + i + '_sec">' + SECOES_PAINEL.map(function (s) {
              return '<option value="' + s[0] + '"' + (secaoDoItemPainel(item) === s[0] ? ' selected' : '') +
                '>' + esc(s[1]) + '</option>';
            }).join('') + '</select>');
      }).join('');
    bindSwitch('hdr_lang', function (v) { state.global.header.showLanguageSwitch = v; markDirty('content/global.json', state.global, state.globalSha); });
    bindSwitch('hdr_contact', function (v) { state.global.header.showContactButton = v; markDirty('content/global.json', state.global, state.globalSha); });
    h.menu.forEach(function (item, i) {
      bindText('menu_' + i + '_pt', function (v) { state.global.header.menu[i].pt = v; markDirty('content/global.json', state.global, state.globalSha); });
      bindText('menu_' + i + '_en', function (v) { state.global.header.menu[i].en = v; markDirty('content/global.json', state.global, state.globalSha); });
      document.getElementById('menu_' + i + '_sec').addEventListener('change', function (e) {
        var alvo = state.global.header.menu[i];
        alvo.section = e.target.value;
        /* Os hrefHome/hrefWork antigos continuam gravados porque o site ainda
           os aceita como reserva, mas quem manda passa a ser section: deixar os
           dois apontando para lugares diferentes seria a origem óbvia de um bug
           silencioso mais adiante. */
        alvo.hrefHome = alvo.hrefWork = hrefDaSecaoPainel(e.target.value);
        markDirty('content/global.json', state.global, state.globalSha);
      });
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
    var availabilityStatus = ['available', 'unavailable', 'hidden'].indexOf(hero.availabilityStatus) !== -1
      ? hero.availabilityStatus : (hero.showAvailability === false ? 'hidden' : 'available');
    document.getElementById('heroBody').innerHTML =
      fieldRow('Cargo (PT)', 'Enter força uma nova linha.', ta('hero_tagpt', hero.tagPt)) +
      fieldRow('Cargo (EN)', 'Enter força uma nova linha.', ta('hero_tagen', hero.tagEn)) +
      fieldRow('Localização (PT)', 'Enter força uma nova linha.', ta('hero_locpt', hero.locationPt)) +
      fieldRow('Localização (EN)', 'Enter força uma nova linha.', ta('hero_locen', hero.locationEn)) +
      fieldRow('Frase de efeito (PT)', '', ta('hero_claimpt', hero.claimPt)) +
      fieldRow('Frase de efeito (EN)', '', ta('hero_claimen', hero.claimEn)) +
      fieldRow('Status de disponibilidade', 'O estado aparece igual no header e dentro do menu, inclusive nos cases.', selectDe('hero_availstatus', availabilityStatus, [
        ['available', 'Disponível · luz verde'], ['unavailable', 'Indisponível · luz vermelha'], ['hidden', 'Não mostrar status']
      ])) +
      fieldRow('Texto de disponibilidade (PT)', 'Aparece na pílula do header. Enter força uma nova linha.', ta('hero_availpt', hero.availabilityPt)) +
      fieldRow('Texto de disponibilidade (EN)', 'Enter força uma nova linha.', ta('hero_availen', hero.availabilityEn)) +
      fieldRow('Versão curta (PT)', 'Usada quando o header encolhe.', ta('hero_availspt', hero.availabilityShortPt)) +
      fieldRow('Versão curta (EN)', '', ta('hero_availsen', hero.availabilityShortEn)) +
      fieldRow('Texto de indisponibilidade (PT)', 'Usado com a luz vermelha.', ta('hero_unavailpt', hero.unavailabilityPt || 'Indisponível para projetos')) +
      fieldRow('Texto de indisponibilidade (EN)', '', ta('hero_unavailen', hero.unavailabilityEn || 'Unavailable for projects')) +
      fieldRow('Versão curta indisponível (PT)', 'Usada quando o header encolhe.', ta('hero_unavailspt', hero.unavailabilityShortPt || 'Indisponível')) +
      fieldRow('Versão curta indisponível (EN)', '', ta('hero_unavailsen', hero.unavailabilityShortEn || 'Unavailable')) +
      fieldRow('Indicador de rolagem — rótulo (PT)', '"Continue para ver os projetos"', ta('hero_nhlpt', hero.nextHintLabelPt)) +
      fieldRow('Indicador de rolagem — rótulo (EN)', '', ta('hero_nhlen', hero.nextHintLabelEn)) +
      fieldRow('Indicador de rolagem — destino (PT)', '"Projetos"', ta('hero_nhnpt', hero.nextHintNamePt)) +
      fieldRow('Indicador de rolagem — destino (EN)', '', ta('hero_nhnen', hero.nextHintNameEn)) +
      fieldRow('Fundo da capa', 'O que aparece atrás do seu nome.',
        '<select id="hero_videomode">' + MODOS_CAPA.map(function (m) {
          return '<option value="' + m[0] + '"' + (modoDaCapa(hero) === m[0] ? ' selected' : '') + '>' + esc(m[1]) + '</option>';
        }).join('') + '</select>') +
      /* os dois campos abaixo aparecem conforme o modo: mostrar caminho de
         arquivo e URL do Vimeo ao mesmo tempo convida a preencher o errado */
      '<div data-modo-capa="file">' +
      fieldRow('Arquivo de vídeo', 'Caminho no repositório. MP4 ou WebM.', inp('hero_bgvideo', hero.backgroundVideo, ' placeholder="assets/capa.mp4"')) +
      '</div>' +
      '<div data-modo-capa="vimeo">' +
      fieldRow('URL do Vimeo', 'Cole o link do vídeo. Aceita vimeo.com/123456789, player.vimeo.com/video/123456789 e vídeo não listado com hash. Não cole código de incorporação.',
        inp('hero_vimeourl', (hero.vimeo && hero.vimeo.url) || '', ' placeholder="https://vimeo.com/1215686904"') +
        '<span class="vimeo-status" id="hero_vimeostatus"></span>') +
      /* Ajuda curta e permanente, não só a validação de erro: um vídeo com
         privacidade "Domínios específicos" mal configurada passa em toda
         validação daqui (é um endereço válido, o id existe) e só falha
         visivelmente no site, dentro do player. Sem isto, esse tipo de falha
         pareceria um bug do CMS. */
      '<p class="hint vimeo-help">' +
        '<b>Antes de colar o link:</b> o vídeo precisa permitir incorporação. ' +
        'Em vimeo.com → seu vídeo → Configurações de privacidade → "Onde ele pode ser incorporado", ' +
        'escolha "Em qualquer lugar" ou, em "Domínios específicos", inclua o domínio deste portfólio. ' +
        'Vídeo "não listado" precisa do link completo, com o hash (a parte depois do id) — sem ele o vídeo não carrega. ' +
        'Se o vídeo aparecer com uma mensagem de erro do próprio Vimeo dentro do player (não uma mensagem deste painel), ' +
        'o link e o id estão corretos — o ajuste é na configuração de privacidade do vídeo, no site do Vimeo, não aqui.' +
      '</p>' +
      '</div>' +
      fieldRow('Poster (imagem, opcional)', 'Aparece antes do vídeo carregar, se o vídeo for bloqueado e quando o visitante pede menos animação. Precisa ser uma imagem, não o link do vídeo.', inp('hero_bgposter', hero.backgroundVideoPoster, ' placeholder="assets/capa-poster.jpg"'));
    bindAll([
      ['hero_tagpt', function (v) { hero.tagPt = v; }], ['hero_tagen', function (v) { hero.tagEn = v; }],
      ['hero_locpt', function (v) { hero.locationPt = v; }], ['hero_locen', function (v) { hero.locationEn = v; }],
      ['hero_claimpt', function (v) { hero.claimPt = v; }], ['hero_claimen', function (v) { hero.claimEn = v; }],
      ['hero_availpt', function (v) { hero.availabilityPt = v; }], ['hero_availen', function (v) { hero.availabilityEn = v; }],
      ['hero_availspt', function (v) { hero.availabilityShortPt = v; }], ['hero_availsen', function (v) { hero.availabilityShortEn = v; }],
      ['hero_unavailpt', function (v) { hero.unavailabilityPt = v; }], ['hero_unavailen', function (v) { hero.unavailabilityEn = v; }],
      ['hero_unavailspt', function (v) { hero.unavailabilityShortPt = v; }], ['hero_unavailsen', function (v) { hero.unavailabilityShortEn = v; }],
      ['hero_nhlpt', function (v) { hero.nextHintLabelPt = v; }], ['hero_nhlen', function (v) { hero.nextHintLabelEn = v; }],
      ['hero_nhnpt', function (v) { hero.nextHintNamePt = v; }], ['hero_nhnen', function (v) { hero.nextHintNameEn = v; }],
      ['hero_bgvideo', function (v) { hero.backgroundVideo = v; }], ['hero_bgposter', function (v) { hero.backgroundVideoPoster = v; }]
    ], touch);
    document.getElementById('hero_availstatus').addEventListener('change', function (e) {
      hero.availabilityStatus = e.target.value;
      /* Compatibilidade com versões anteriores do site/CMS. O campo legado
         continua coerente, mas o estado de três opções é quem manda. */
      hero.showAvailability = e.target.value !== 'hidden';
      touch();
    });

    /* ---- fundo da capa ---- */
    function mostrarCamposDoModo() {
      var modo = document.getElementById('hero_videomode').value;
      document.querySelectorAll('[data-modo-capa]').forEach(function (bloco) {
        bloco.hidden = bloco.getAttribute('data-modo-capa') !== modo;
      });
    }
    document.getElementById('hero_videomode').addEventListener('change', function (e) {
      hero.videoMode = e.target.value;
      /* modo none/liquid limpa a configuração do Vimeo, para não deixar um
         objeto meio preenchido que o Worker recusaria depois */
      if (hero.videoMode !== 'vimeo') delete hero.vimeo;
      mostrarCamposDoModo();
      validarVimeoNoPainel();
      touch();
    });
    /* Validação imediata, com a MESMA régua do Worker (ver parseVimeoUrl em
       worker/src/validate.js). É conveniência: quem decide continua sendo o
       Worker, que revalida tudo na publicação. */
    function validarVimeoNoPainel() {
      var campo = document.getElementById('hero_vimeourl');
      var selo = document.getElementById('hero_vimeostatus');
      if (!campo || !selo) return;
      var bruto = campo.value.trim();
      if (!bruto) {
        selo.className = 'vimeo-status';
        selo.textContent = '';
        delete hero.vimeo;
        return;
      }
      var p = parseVimeoNoPainel(bruto);
      if (!p) {
        selo.className = 'vimeo-status is-erro';
        /* "<" ou "<iframe" é código de incorporação colado. Não procurar a
           palavra "script" solta: ela aparece dentro de "javascript:", que é
           outro problema e merece outra frase. */
        selo.textContent = /<\s*\/?\s*[a-z]/i.test(bruto)
          ? 'Cole apenas o link, não o código de incorporação.'
          : 'Link do Vimeo inválido.';
        delete hero.vimeo;
        return;
      }
      selo.className = 'vimeo-status is-ok';
      selo.textContent = 'id ' + p.videoId + (p.hash ? ' · não listado' : '');
      /* guarda a URL normalizada, não a que foi colada: parâmetro arbitrário
         não entra no JSON */
      hero.vimeo = {
        url: p.hash ? 'https://vimeo.com/' + p.videoId + '/' + p.hash : 'https://vimeo.com/' + p.videoId,
        videoId: p.videoId,
        hash: p.hash
      };
    }
    var campoVimeo = document.getElementById('hero_vimeourl');
    if (campoVimeo) campoVimeo.addEventListener('input', function () { validarVimeoNoPainel(); touch(); });
    mostrarCamposDoModo();
    validarVimeoNoPainel();

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
      fieldRow('Rótulo da seção (PT)', '"Sobre"', ta('ab_kpt', a.kickerPt)) +
      fieldRow('Rótulo da seção (EN)', '', ta('ab_ken', a.kickerEn)) +
      fieldRow('Mostrar rótulo da seção', 'Desligar preserva o texto e remove o espaço acima do título.', switchControl('ab_showk', a.showKicker !== false)) +
      fieldRow('Título (PT)', 'Enter força uma nova linha.', ta('ab_tpt', a.titlePt)) +
      fieldRow('Título (EN)', 'Enter força uma nova linha.', ta('ab_ten', a.titleEn)) +
      fieldRow('Texto principal (PT)', '', ta('ab_leadpt', a.leadPt)) +
      fieldRow('Texto principal (EN)', '', ta('ab_leaden', a.leadEn)) +
      fieldRow('Texto complementar (PT)', '', ta('ab_subpt', a.subPt)) +
      fieldRow('Texto complementar (EN)', '', ta('ab_suben', a.subEn)) +
      fieldRow('Retrato', 'caminho do arquivo, ou envie um novo aqui', inp('ab_photo', a.photo) + '<input type="file" id="ab_photo_upload" accept="image/*">') +
      fieldRow('Botão de contato (PT)', '"Vamos conversar"', ta('ab_ctapt', a.ctaTalkPt)) +
      fieldRow('Botão de contato (EN)', '', ta('ab_ctaen', a.ctaTalkEn)) +
      fieldRow('Mostrar botão de currículo', 'Desligar esconde o botão no site sem apagar o arquivo.', switchControl('ab_showcv', a.showResume !== false)) +
      fieldRow('Arquivo do currículo (PDF)', a.resumeFile ? 'atual: ' + a.resumeFile : 'nenhum arquivo enviado ainda — o botão fica escondido até você enviar um',
        inp('ab_cvfile', a.resumeFile, ' placeholder="assets/uploads/curriculo/..."') + '<input type="file" id="ab_cv_upload" accept="application/pdf,.pdf">') +
      fieldRow('Rótulo do currículo (PT)', '"Baixar currículo"', ta('ab_cvlpt', a.resumeLabelPt)) +
      fieldRow('Rótulo do currículo (EN)', '', ta('ab_cvlen', a.resumeLabelEn)) +
      fieldRow('Rótulo das capacidades (PT)', '"Capacidades"', ta('ab_caplpt', a.capabilitiesLabelPt)) +
      fieldRow('Rótulo das capacidades (EN)', '', ta('ab_caplen', a.capabilitiesLabelEn)) +
      fieldRow('Mostrar rótulo das capacidades', 'Desligar preserva o texto.', switchControl('ab_showcapk', a.showCapabilitiesLabel !== false)) +
      listBlock('abcap', a.capabilities, 'Capacidade', function (c, i) {
        return fieldRow('Texto (PT)', 'Enter força uma nova linha.', ta('ab_cap' + i + '_pt', c.pt)) +
          fieldRow('Texto (EN)', 'Enter força uma nova linha.', ta('ab_cap' + i + '_en', c.en));
      });
    var aboutPairs = [
      ['ab_kpt', function (v) { a.kickerPt = v; }], ['ab_ken', function (v) { a.kickerEn = v; }],
      ['ab_tpt', function (v) { a.titlePt = v; }], ['ab_ten', function (v) { a.titleEn = v; }],
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
    bindSwitch('ab_showk', function (v) { if (v) delete a.showKicker; else a.showKicker = false; touch(); });
    bindSwitch('ab_showcapk', function (v) { if (v) delete a.showCapabilitiesLabel; else a.showCapabilitiesLabel = false; touch(); });
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
      fieldRow('Rótulo da seção (PT)', '"atuação"', ta('hp_kpt', hp.kickerPt)) +
      fieldRow('Rótulo da seção (EN)', '', ta('hp_ken', hp.kickerEn)) +
      fieldRow('Mostrar rótulo da seção', 'Desligar preserva o texto e remove o espaço acima do título.', switchControl('hp_showk', hp.showKicker !== false)) +
      fieldRow('Título (PT)', 'Enter força uma nova linha.', ta('hp_tpt', hp.titlePt)) +
      fieldRow('Título (EN)', 'Enter força uma nova linha.', ta('hp_ten', hp.titleEn)) +
      fieldRow('Introdução (PT)', '', ta('hp_lpt', hp.leadPt)) +
      fieldRow('Introdução (EN)', '', ta('hp_len', hp.leadEn)) +
      listBlock('hpitem', hp.items, 'Frente', function (item, i) {
        if (!Array.isArray(item.tags)) item.tags = [];
        return fieldRow('Título (PT)', 'Enter força uma nova linha.', ta('hp_' + i + '_tpt', item.titlePt)) +
          fieldRow('Título (EN)', 'Enter força uma nova linha.', ta('hp_' + i + '_ten', item.titleEn)) +
          fieldRow('Texto (PT)', '', ta('hp_' + i + '_xpt', item.textPt)) +
          fieldRow('Texto (EN)', '', ta('hp_' + i + '_xen', item.textEn)) +
          '<div class="sub-list">' + listBlock('hptag' + i, item.tags, 'Tag', function (t, j) {
            return fieldRow('Texto (PT)', 'Enter força uma nova linha.', ta('hp_' + i + '_tag' + j + '_pt', t.pt)) +
              fieldRow('Texto (EN)', 'Enter força uma nova linha.', ta('hp_' + i + '_tag' + j + '_en', t.en));
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
    bindSwitch('hp_showk', function (v) { if (v) delete hp.showKicker; else hp.showKicker = false; touch(); });
    wireListBlock('hpitem', hp.items, function () {
      return { titlePt: 'Nova frente', titleEn: 'New area', textPt: '', textEn: '', tags: [] };
    }, renderHome);
    hp.items.forEach(function (item, i) {
      wireListBlock('hptag' + i, item.tags, function () { return { pt: '', en: '' }; }, renderHome);
    });

    var fq = H.faq;
    if (!Array.isArray(fq.items)) fq.items = [];
    document.getElementById('faqBody').innerHTML =
      fieldRow('Título da seção (PT)', 'Enter força uma nova linha.', ta('fq_tpt', fq.titlePt)) +
      fieldRow('Título da seção (EN)', 'Enter força uma nova linha.', ta('fq_ten', fq.titleEn)) +
      listBlock('fqitem', fq.items, 'Pergunta', function (item, i) {
        return fieldRow('Pergunta (PT)', 'Enter força uma nova linha.', ta('fq_' + i + '_qpt', item.qPt)) +
          fieldRow('Pergunta (EN)', 'Enter força uma nova linha.', ta('fq_' + i + '_qen', item.qEn)) +
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
      fieldRow('Título linha 1 (PT)', 'Enter força uma nova linha.', ta('ct_l1pt', ct.titleLine1Pt)) +
      fieldRow('Título linha 1 (EN)', 'Enter força uma nova linha.', ta('ct_l1en', ct.titleLine1En)) +
      fieldRow('Título linha 2 (PT)', 'Enter força uma nova linha.', ta('ct_l2pt', ct.titleLine2Pt)) +
      fieldRow('Título linha 2 (EN)', 'Enter força uma nova linha.', ta('ct_l2en', ct.titleLine2En)) +
      fieldRow('Rótulo do e-mail (PT)', '"Escreva para"', ta('ct_mkpt', ct.mailLabelPt)) +
      fieldRow('Rótulo do e-mail (EN)', '', ta('ct_mken', ct.mailLabelEn));
    document.getElementById('contactBody').insertAdjacentHTML('beforeend',
      fieldRow('Mostrar rótulo do e-mail', 'Desligar preserva o texto e aproxima o e-mail naturalmente.', switchControl('ct_showmk', ct.showMailLabel !== false)));
    bindAll([
      ['ct_l1pt', function (v) { ct.titleLine1Pt = v; }], ['ct_l1en', function (v) { ct.titleLine1En = v; }],
      ['ct_l2pt', function (v) { ct.titleLine2Pt = v; }], ['ct_l2en', function (v) { ct.titleLine2En = v; }],
      ['ct_mkpt', function (v) { ct.mailLabelPt = v; }], ['ct_mken', function (v) { ct.mailLabelEn = v; }]
    ], touch);
    bindSwitch('ct_showmk', function (v) { if (v) delete ct.showMailLabel; else ct.showMailLabel = false; touch(); });
  }

  /* ---------- Projetos ---------- */
  function renderProjectsList() {
    var list = state.projectsIndex.projects.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    document.getElementById('projectsList').innerHTML = list.map(function (p, i) {
      var capa = String(p.cover || '').trim();
      var capaPainel = /^https:\/\//i.test(capa) ? capa : '../' + capa;
      return '<div class="list-row' + (p.visible === false ? ' hidden-project' : '') + '" data-slug="' + esc(p.slug) + '">' +
        '<div class="thumb" style="background-image:url(\'' + esc(capaPainel) + '\')"></div>' +
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

  /* Devolve os dados de um projeto: da memória se já estiverem lá (inclusive
     um projeto ainda pendente, que não existe no GitHub), senão busca. */
  function carregarProjeto(slug) {
    if (state.projects[slug]) return Promise.resolve(state.projects[slug].data);
    return api('/api/projects/' + slug).then(function (res) {
      state.projects[slug] = { data: res.data, sha: res.sha };
      snapshotPublished('content/projects/' + slug + '.json', res.data);
      return res.data;
    });
  }

  function handleProjectAction(slug, action) {
    var list = state.projectsIndex.projects;
    var p = list.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return;

    /* Duplicar deixou de chamar o Worker. Antes eram três commits imediatos
       (JSON do projeto, índice e página) antes de qualquer revisão. Agora o
       clone é montado aqui, entra como pendente e sobe no commit do Publicar. */
    if (action === 'duplicate') {
      var newSlug = prompt('Slug do projeto duplicado:', slug + '-copia');
      if (!newSlug) return;
      newSlug = String(newSlug).trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(newSlug)) { toast('Slug inválido. Use letras minúsculas, números e hífen.', 'err'); return; }
      if (list.some(function (x) { return x.slug === newSlug; })) { toast('Já existe um projeto com esse slug.', 'err'); return; }

      carregarProjeto(slug).then(function (origem) {
        var copia = JSON.parse(JSON.stringify(origem));
        copia.slug = newSlug;
        copia.status = 'draft';
        if (copia.hero) {
          copia.hero.titlePt = (copia.hero.titlePt || slug) + ' (cópia)';
          copia.hero.titleEn = (copia.hero.titleEn || slug) + ' (copy)';
        }
        var caminho = 'content/projects/' + newSlug + '.json';
        state.projects[newSlug] = { data: copia, sha: null };
        state.published[caminho] = null;              /* arquivo novo: nunca existiu publicado */
        markDirty(caminho, copia, null, 'cms: duplica ' + slug + ' em ' + newSlug);

        var entrada = JSON.parse(JSON.stringify(p));
        entrada.slug = newSlug; entrada.visible = false;
        entrada.titlePt = copia.hero ? copia.hero.titlePt : newSlug;
        entrada.titleEn = copia.hero ? copia.hero.titleEn : newSlug;
        entrada.order = list.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1;
        list.push(entrada);
        markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha);

        /* a página HTML é clonada pelo Worker a partir do modelo já
           versionado; o painel só diz qual slug e de onde copiar */
        state.pendingPages['work/' + newSlug + '.html'] = { slug: newSlug, fromSlug: slug };
        marcarPendenteMudou();
        renderProjectsList();
        toast('Duplicado como "' + newSlug + '". Sobe no próximo Publicar.', 'ok');
      }).catch(function (e) { toast(e.message, 'err'); });
      return;
    }

    /* Excluir também virou pendente: dá para cancelar antes de publicar, e a
       remoção do índice, do JSON e da página entra num commit só. Imagens
       continuam sem ser apagadas de propósito. */
    if (action === 'delete') {
      var sure = confirm('Excluir "' + (p.titlePt || slug) + '"?\n\nA entrada do índice, o conteúdo e a página serão removidos no próximo Publicar. As imagens em assets/ não são apagadas. Nada acontece no GitHub até você publicar.');
      if (!sure) return;
      if (state.editingSlug === slug) { state.editingSlug = null; document.getElementById('projectEditor').innerHTML = ''; }

      var i = list.indexOf(p);
      if (i !== -1) list.splice(i, 1);
      markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha);

      var pathJson = 'content/projects/' + slug + '.json';
      var pathPagina = 'work/' + slug + '.html';
      /* projeto que só existia como pendente some sem virar exclusão remota */
      if (state.pendingPages[pathPagina]) {
        delete state.pendingPages[pathPagina];
        delete state.dirty[pathJson];
      } else {
        state.pendingDeletes[pathJson] = 'conteúdo do projeto ' + slug;
        state.pendingDeletes[pathPagina] = 'página do projeto ' + slug;
      }
      delete state.projects[slug];
      marcarPendenteMudou();
      renderProjectsList();
      toast('Exclusão pendente. Confirme em Publicação.', 'ok');
      return;
    }

    if (action === 'toggle') { p.visible = p.visible === false ? true : false; }
    if (action === 'up' || action === 'down') {
      var sorted = list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var idx = sorted.indexOf(p);
      var swapWith = action === 'up' ? sorted[idx - 1] : sorted[idx + 1];
      if (swapWith) { var tmp = p.order; p.order = swapWith.order; swapWith.order = tmp; }
    }
    /* Abrir o editor é leitura. Antes ele seguia até o markDirty abaixo e
       marcava index.json como alterado sem mudar um único campo. */
    if (action === 'edit') { state.editingSlug = slug; renderProjectEditor(); return; }
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

  /* ===== EDITOR DE BLOCOS =====
     Antes existiam dois grupos fixos no editor: "contexto/processo/resultado"
     e "galeria". Eles não editavam blocos, editavam POSIÇÕES: o primeiro
     mostrava todo bloco de texto que existisse, o segundo só o primeiro bloco
     de galeria. Não dava para reordenar, nem acrescentar, nem sequer ver um
     segundo bloco de galeria.
     Agora cada bloco é um grupo próprio, na ordem do arquivo, com subir,
     descer, duplicar e remover. A lista de tipos espelha TIPOS_DE_BLOCO de
     js/content-render.js e CHAVES_DE_BLOCO de worker/src/validate.js — quem
     decide continua sendo o Worker, que revalida na publicação. */
  var TIPOS_DE_BLOCO_PAINEL = [
    ['text', 'Texto'], ['image', 'Imagem'], ['gallery', 'Galeria'],
    ['quote', 'Citação'], ['video', 'Vídeo']
  ];

  function resumoDoBloco(b) {
    if (b.type === 'text') return 'Texto — ' + (b.labelPt || 'sem rótulo');
    if (b.type === 'gallery') return 'Galeria — ' + ((b.images || []).length) + ' imagens';
    if (b.type === 'image') return 'Imagem — ' + (b.src ? b.src.split('/').pop() : 'sem arquivo');
    if (b.type === 'quote') return 'Citação — ' + String(b.quotePt || '').slice(0, 40);
    if (b.type === 'video') return 'Vídeo — ' + (b.mode === 'vimeo' ? 'Vimeo' : 'arquivo');
    return String(b.type);
  }

  /* Bloco recém-criado nasce com todos os campos do tipo já presentes, mesmo
     vazios. É o mesmo princípio do projetoNovo: um objeto meio montado é o que
     produz campo aparecendo e sumindo conforme a pessoa digita. */
  function blocoNovo(tipo) {
    if (tipo === 'text') return { type: 'text', labelPt: '', labelEn: '', textPt: '', textEn: '' };
    if (tipo === 'gallery') return { type: 'gallery', images: [] };
    if (tipo === 'image') return { type: 'image', src: '', alt: '', fit: 'cover', width: 'content', captionPt: '', captionEn: '' };
    if (tipo === 'quote') return { type: 'quote', quotePt: '', quoteEn: '', authorPt: '', authorEn: '' };
    if (tipo === 'video') return { type: 'video', mode: 'file', src: '', poster: '', captionPt: '', captionEn: '' };
    return null;
  }

  function selectDe(id, valor, opcoes) {
    return '<select id="' + id + '">' + opcoes.map(function (o) {
      return '<option value="' + o[0] + '"' + (valor === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }

  function camposDoBloco(b, i) {
    var p = 'pe_bl_' + i + '_';
    var meio = 'style="max-width:160px"';
    if (b.type === 'text') {
      return fieldRow('Rótulo (PT / EN)', '"contexto", "processo"', inp(p + 'lpt', b.labelPt, ' ' + meio) + inp(p + 'len', b.labelEn, ' ' + meio)) +
        fieldRow('Mostrar rótulo', 'Desligar preserva o texto e remove a linha e o espaço internos do rótulo.', switchControl(p + 'showlabel', b.showLabel !== false)) +
        fieldRow('Texto (PT)', '', ta(p + 'tpt', b.textPt)) +
        fieldRow('Texto (EN)', '', ta(p + 'ten', b.textEn));
    }
    if (b.type === 'quote') {
      return fieldRow('Citação (PT)', '', ta(p + 'qpt', b.quotePt)) +
        fieldRow('Citação (EN)', '', ta(p + 'qen', b.quoteEn)) +
        fieldRow('Autor (PT / EN)', 'opcional', inp(p + 'apt', b.authorPt, ' ' + meio) + inp(p + 'aen', b.authorEn, ' ' + meio));
    }
    if (b.type === 'image') {
      return fieldRow('Imagem', 'Envie um arquivo de até 25MB ou cole um caminho assets/ ou URL HTTPS direta.', inp(p + 'src', b.src, ' placeholder="assets/... ou https://..."') + '<input type="file" id="' + p + 'up" accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.svg,image/*">') +
        fieldRow('Texto alternativo', 'descreve a imagem para quem não a vê', inp(p + 'alt', b.alt)) +
        fieldRow('Enquadramento', 'Recortada mantém 16/9; proporção livre deixa a imagem mandar na altura (peça vertical, captura de tela, GIF).',
          selectDe(p + 'fit', b.fit || 'cover', [['cover', 'Recortada em 16/9'], ['auto', 'Proporção livre']])) +
        fieldRow('Largura', '', selectDe(p + 'wid', b.width || 'content', [['content', 'Coluna de conteúdo'], ['full', 'De ponta a ponta']])) +
        fieldRow('Legenda (PT / EN)', 'opcional', inp(p + 'cpt', b.captionPt, ' ' + meio) + inp(p + 'cen', b.captionEn, ' ' + meio));
    }
    if (b.type === 'gallery') {
      var imgs = b.images || [];
      return fieldRow('Adicionar várias imagens', 'Selecione várias de uma vez. JPG, PNG, WebP, AVIF, GIF ou SVG; até 25MB por arquivo e 32MB por publicação.',
        '<input type="file" id="' + p + 'multi" multiple accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.svg,image/*">') + imgs.map(function (im, j) {
        return fieldRow('Imagem ' + (j + 1), 'Upload, caminho assets/ ou URL HTTPS direta.',
          inp(p + 'img' + j, im.src) +
          '<input type="file" id="' + p + 'imgup' + j + '" accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.svg,image/*">' +
          '<button class="btn small danger" data-bl-imgrm="' + i + ':' + j + '">remover</button>') +
          fieldRow('Texto alternativo ' + (j + 1), '', inp(p + 'alt' + j, im.alt));
      }).join('') + '<button class="btn small" data-bl-imgadd="' + i + '">+ adicionar imagem</button>';
    }
    if (b.type === 'video') {
      var ehVimeo = b.mode === 'vimeo';
      return fieldRow('Origem', 'Upload local até 25MB, URL HTTPS direta para MP4/WebM ou Vimeo para vídeos maiores.',
          selectDe(p + 'mode', b.mode || 'file', [['file', 'Arquivo ou URL direta'], ['vimeo', 'Vimeo']])) +
        (ehVimeo
          ? fieldRow('Endereço do Vimeo', 'cole o link do vídeo', inp(p + 'vurl', (b.vimeo && b.vimeo.url) || '')) +
            '<div class="hint" id="' + p + 'vmsg"></div>'
          : fieldRow('Arquivo ou URL', 'Envie MP4/WebM ou cole uma URL HTTPS direta terminada em .mp4 ou .webm.', inp(p + 'src', b.src, ' placeholder="assets/... ou https://..."') + '<input type="file" id="' + p + 'up" accept="video/mp4,video/webm,.mp4,.webm">')) +
        fieldRow('Imagem de espera', 'opcional, aparece antes de o vídeo tocar', inp(p + 'poster', b.poster)) +
        fieldRow('Legenda (PT / EN)', 'opcional', inp(p + 'cpt', b.captionPt, ' ' + meio) + inp(p + 'cen', b.captionEn, ' ' + meio));
    }
    return '';
  }

  function ligarBlocos(P, slug, save, rerender) {
    var blocos = Array.isArray(P.blocks) ? P.blocks : [];
    function assegurarBlocos() { if (!Array.isArray(P.blocks)) P.blocks = blocos; }
    /* Reordenar, duplicar e remover mexem em índice, e todo id da tela carrega
       o índice antigo. Por isso essas três sempre redesenham o editor inteiro
       em vez de tentar remendar o DOM. */
    function mover(i, delta) {
      var j = i + delta;
      if (j < 0 || j >= blocos.length) return;
      var t = blocos[i]; blocos[i] = blocos[j]; blocos[j] = t;
      save(); rerender();
    }
    blocos.forEach(function (b, i) {
      var p = 'pe_bl_' + i + '_';
      var campo = function (id, fn) { bindText(p + id, function (v) { fn(v); save(); }); };
      var sel = function (id, fn) {
        var el = document.getElementById(p + id);
        if (el) el.addEventListener('change', function (e) { fn(e.target.value); save(); rerender(); });
      };
      if (b.type === 'text') {
        campo('lpt', function (v) { b.labelPt = v; }); campo('len', function (v) { b.labelEn = v; });
        campo('tpt', function (v) { b.textPt = v; }); campo('ten', function (v) { b.textEn = v; });
        bindSwitch(p + 'showlabel', function (v) { if (v) delete b.showLabel; else b.showLabel = false; save(); });
      }
      if (b.type === 'quote') {
        campo('qpt', function (v) { b.quotePt = v; }); campo('qen', function (v) { b.quoteEn = v; });
        campo('apt', function (v) { b.authorPt = v; }); campo('aen', function (v) { b.authorEn = v; });
      }
      if (b.type === 'image') {
        campo('src', function (v) { b.src = v; }); campo('alt', function (v) { b.alt = v; });
        campo('cpt', function (v) { b.captionPt = v; }); campo('cen', function (v) { b.captionEn = v; });
        sel('fit', function (v) { b.fit = v; }); sel('wid', function (v) { b.width = v; });
        var up = document.getElementById(p + 'up');
        if (up) up.addEventListener('change', function () {
          uploadFile(up.files[0], slug, function (path) { b.src = path; save(); rerender(); });
        });
      }
      if (b.type === 'gallery') {
        var multi = document.getElementById(p + 'multi');
        if (multi) multi.addEventListener('change', function () {
          var arquivos = Array.prototype.slice.call(multi.files || []);
          /* Sequencial de propósito: cada arquivo já entra em pendingUploads
             antes de medir o próximo, então o teto total de 32MB não sofre
             corrida quando várias imagens são escolhidas de uma vez. */
          arquivos.reduce(function (fila, file) {
            return fila.then(function (paths) {
              return uploadFile(file, slug).then(function (path) { paths.push(path); return paths; });
            });
          }, Promise.resolve([])).then(function (paths) {
            paths.filter(Boolean).forEach(function (path) {
              if (!Array.isArray(b.images)) b.images = [];
              b.images.push({ src: path, alt: '' });
            });
            if (paths.some(Boolean)) { save(); rerender(); }
          });
        });
        (b.images || []).forEach(function (im, j) {
          campo('img' + j, function (v) { im.src = v; });
          campo('alt' + j, function (v) { im.alt = v; });
          var iu = document.getElementById(p + 'imgup' + j);
          if (iu) iu.addEventListener('change', function () {
            uploadFile(iu.files[0], slug, function (path) { im.src = path; save(); rerender(); });
          });
        });
      }
      if (b.type === 'video') {
        campo('poster', function (v) { b.poster = v; });
        campo('cpt', function (v) { b.captionPt = v; }); campo('cen', function (v) { b.captionEn = v; });
        sel('mode', function (v) {
          b.mode = v;
          /* trocar de origem limpa a outra, para não deixar um objeto meio
             preenchido que o Worker recusaria depois */
          if (v === 'vimeo') { delete b.src; } else { delete b.vimeo; b.src = b.src || ''; }
        });
        if (b.mode === 'file') {
          campo('src', function (v) { b.src = v; });
          var vu = document.getElementById(p + 'up');
          if (vu) vu.addEventListener('change', function () {
            uploadFile(vu.files[0], slug, function (path) { b.src = path; save(); rerender(); });
          });
        } else {
          var msg = document.getElementById(p + 'vmsg');
          bindText(p + 'vurl', function (v) {
            var cfg = parseVimeoNoPainel(v);
            if (cfg) { b.vimeo = { url: v.trim(), videoId: cfg.videoId, hash: cfg.hash }; if (msg) msg.textContent = 'Vídeo ' + cfg.videoId + '.'; }
            else { if (msg) msg.textContent = v.trim() ? 'Endereço do Vimeo não reconhecido.' : ''; }
            save();
          });
        }
      }
    });

    var q = function (sel) { return document.querySelectorAll(sel); };
    q('[data-bl-sobe]').forEach(function (el) {
      el.addEventListener('click', function () { mover(Number(el.getAttribute('data-bl-sobe')), -1); });
    });
    q('[data-bl-desce]').forEach(function (el) {
      el.addEventListener('click', function () { mover(Number(el.getAttribute('data-bl-desce')), 1); });
    });
    q('[data-bl-dup]').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = Number(el.getAttribute('data-bl-dup'));
        blocos.splice(i + 1, 0, JSON.parse(JSON.stringify(blocos[i])));
        save(); rerender();
      });
    });
    q('[data-bl-remove]').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = Number(el.getAttribute('data-bl-remove'));
        if (!confirm('Remover o bloco "' + resumoDoBloco(blocos[i]) + '"?')) return;
        blocos.splice(i, 1); save(); rerender();
      });
    });
    q('[data-bl-imgadd]').forEach(function (el) {
      el.addEventListener('click', function () {
        var b = blocos[Number(el.getAttribute('data-bl-imgadd'))];
        if (!Array.isArray(b.images)) b.images = [];
        b.images.push({ src: '', alt: '' }); save(); rerender();
      });
    });
    q('[data-bl-imgrm]').forEach(function (el) {
      el.addEventListener('click', function () {
        var par = el.getAttribute('data-bl-imgrm').split(':');
        blocos[Number(par[0])].images.splice(Number(par[1]), 1); save(); rerender();
      });
    });
    var add = document.getElementById('pe_bl_add');
    if (add) add.addEventListener('click', function () {
      var novo = blocoNovo(document.getElementById('pe_bl_tipo').value);
      if (!novo) return;
      assegurarBlocos();
      blocos.push(novo);
      projectSectionOpen['bloco-' + (blocos.length - 1)] = true;
      save(); rerender();
    });
  }

  /* Renomear a URL é uma operação de arquivo, não apenas um campo de texto.
     Índice, JSON e página HTML ficam pendentes e sobem no mesmo commit. A
     página nova usa a antiga como molde; os assets não são movidos, porque
     continuar referenciando a pasta anterior é válido e evita duplicação. */
  function renomearSlugProjeto(slug, novoSlug) {
    novoSlug = String(novoSlug || '').trim().toLowerCase();
    if (novoSlug === slug) return;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(novoSlug) || novoSlug.length > 60) {
      toast('URL inválida. Use até 60 caracteres: letras minúsculas, números e hífen.', 'err');
      return;
    }

    var cached = state.projects[slug];
    var entrada = state.projectsIndex.projects.filter(function (x) { return x.slug === slug; })[0];
    if (!cached || !entrada) { toast('Não foi possível localizar o projeto em edição.', 'err'); return; }

    var oldJson = 'content/projects/' + slug + '.json';
    var oldPage = 'work/' + slug + '.html';
    var newJson = 'content/projects/' + novoSlug + '.json';
    var newPage = 'work/' + novoSlug + '.html';
    var paginaPendente = state.pendingPages[oldPage] || null;
    var slugDeOrigem = paginaPendente && paginaPendente.fromSlug ? paginaPendente.fromSlug : slug;
    var shaDeOrigem = paginaPendente && Object.prototype.hasOwnProperty.call(paginaPendente, 'fromSha')
      ? paginaPendente.fromSha : cached.sha;
    var voltandoAoOriginal = !!(paginaPendente && slugDeOrigem === novoSlug &&
      state.pendingDeletes[newJson] && state.pendingDeletes[newPage]);

    var duplicadoNoIndice = state.projectsIndex.projects.some(function (x) {
      return x !== entrada && x.slug === novoSlug;
    });
    var destinoPublicado = state.published[newJson] !== undefined && state.published[newJson] !== null;
    if (duplicadoNoIndice || state.projects[novoSlug] || state.pendingPages[newPage] ||
        (destinoPublicado && !voltandoAoOriginal) ||
        ((state.pendingDeletes[newJson] || state.pendingDeletes[newPage]) && !voltandoAoOriginal)) {
      toast('Já existe um projeto ou uma operação pendente usando essa URL.', 'err');
      return;
    }

    if (!confirm('Alterar a URL de /work/' + slug + '.html para /work/' + novoSlug + '.html?\n\nA troca ficará pendente e só acontecerá ao Publicar.')) return;

    /* Ao voltar para a URL publicada depois de restaurar um rascunho, a linha
       de base pode ainda não estar em memória. Carrega antes para que um
       retorno sem outras edições seja reconhecido como realmente limpo. */
    (voltandoAoOriginal ? ensurePublishedBaseline([newJson]) : Promise.resolve()).then(function () {
      if (paginaPendente) {
        delete state.pendingPages[oldPage];
        delete state.dirty[oldJson];
        if (state.published[oldJson] === null) delete state.published[oldJson];
      } else {
        delete state.dirty[oldJson];
        state.pendingDeletes[oldJson] = 'URL antiga do projeto ' + slug;
        state.pendingDeletes[oldPage] = 'página antiga do projeto ' + slug;
      }

      delete state.projects[slug];
      cached.data.slug = novoSlug;
      entrada.slug = novoSlug;
      state.editingSlug = novoSlug;

      if (voltandoAoOriginal) {
        delete state.pendingDeletes[newJson];
        delete state.pendingDeletes[newPage];
        cached.sha = shaDeOrigem;
        state.projects[novoSlug] = cached;
        markDirty(newJson, cached.data, shaDeOrigem, 'cms: atualiza ' + newJson);
      } else {
        cached.sha = null;
        state.projects[novoSlug] = cached;
        state.published[newJson] = null;
        markDirty(newJson, cached.data, null, 'cms: renomeia ' + slug + ' para ' + novoSlug);
        state.pendingPages[newPage] = {
          slug: novoSlug,
          fromSlug: slugDeOrigem,
          fromSha: shaDeOrigem == null ? null : shaDeOrigem
        };
      }

      markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha);
      marcarPendenteMudou();
      schedulePreview();
      renderProjectsList();
      renderProjectEditor();
      toast('Nova URL preparada: /work/' + novoSlug + '.html', 'ok');
    }).catch(function (e) { toast(e.message || 'Não foi possível preparar a nova URL.', 'err'); });
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
        snapshotPublished('content/projects/' + slug + '.json', res.data);
        renderProjectEditor();
      }).catch(function (e) { editorEl.innerHTML = '<p style="color:var(--err)">' + esc(e.message) + '</p>'; });
      return;
    }
    var P = cached.data;
    var indexEntry = state.projectsIndex.projects.filter(function (x) { return x.slug === slug; })[0];
    var projectBlocks = Array.isArray(P.blocks) ? P.blocks : [];
    var tagsPt = Array.isArray(indexEntry.tagsPt) ? indexEntry.tagsPt : [];
    var tagsEn = Array.isArray(indexEntry.tagsEn) ? indexEntry.tagsEn : [];
    var cardSizes = Array.isArray(state.projectsIndex.cardSizes) && state.projectsIndex.cardSizes.length
      ? state.projectsIndex.cardSizes : ['normal'];
    /* A prévia do editor de projeto abre a página DO projeto, não a Home:
       schedulePreview já mandava os dados do projeto, mas não havia nenhuma
       prévia nesta aba, então quem montava um case fazia isso às cegas. */
    wirePreviewBlock('previewSlotProject', caminhoDaPreviaDoProjeto());

    editorEl.innerHTML =
      '<details class="group"' + projectSection('info') + '><summary>Editando: ' + esc(P.hero.titlePt || slug) + '</summary><div class="group-body">' +
      fieldRow('URL do case', 'Use letras minúsculas, números e hífen. A troca só acontece ao Publicar.', '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap"><span>/work/</span><input type="text" id="pe_slug" value="' + esc(slug) + '" maxlength="60" style="max-width:260px"><span>.html</span><button class="btn small" id="pe_slug_apply" type="button">alterar URL</button></div>') +
      fieldRow('Status', '', '<select id="pe_status"><option value="draft"' + (P.status === 'draft' ? ' selected' : '') + '>Rascunho</option><option value="published"' + (P.status === 'published' ? ' selected' : '') + '>Publicado</option></select>') +
      fieldRow('Grain neste case', 'Herdar acompanha o controle global do site.', selectDe('pe_grain',
        typeof P.grainEnabled === 'boolean' ? (P.grainEnabled ? 'on' : 'off') : 'inherit', [
          ['inherit', 'Herdar do global'], ['on', 'Ligado'], ['off', 'Desligado']
        ])) +
      fieldRow('Ano', '', '<input type="number" id="pe_year" value="' + esc(P.year) + '" min="1990" max="2100">') +
      fieldRow('Categoria', 'Metadado do projeto e do índice.', '<input type="text" id="pe_category" value="' + esc(P.category || indexEntry.category) + '">') +
      fieldRow('Rótulo acima do título (PT)', 'Eyebrow do case. Enter força uma nova linha.', ta('pe_eyebrowpt', P.hero.eyebrowPt)) +
      fieldRow('Rótulo acima do título (EN)', 'Enter força uma nova linha.', ta('pe_eyebrowen', P.hero.eyebrowEn)) +
      fieldRow('Mostrar rótulo acima do título', 'Desligar preserva o texto e remove seu espaço.', switchControl('pe_showeyebrow', P.hero.showEyebrow !== false)) +
      fieldRow('Título (PT)', 'Enter força uma nova linha no case e no card.', '<textarea id="pe_titlept">' + esc(P.hero.titlePt) + '</textarea>') +
      fieldRow('Título (EN)', 'Enter força uma nova linha no case e no card.', '<textarea id="pe_titleen">' + esc(P.hero.titleEn) + '</textarea>') +
      fieldRow('Subtítulo (PT)', '', '<textarea id="pe_subpt">' + esc(P.hero.subtitlePt) + '</textarea>') +
      fieldRow('Subtítulo (EN)', '', '<textarea id="pe_suben">' + esc(P.hero.subtitleEn) + '</textarea>') +
      fieldRow('Tags do card (PT)', 'Separe por vírgulas.', '<input type="text" id="pe_tagspt" value="' + esc(tagsPt.join(', ')) + '">') +
      fieldRow('Tags do card (EN)', 'Separe por vírgulas e mantenha a mesma ordem do PT.', '<input type="text" id="pe_tagsen" value="' + esc(tagsEn.join(', ')) + '">') +
      fieldRow('Tamanho do card', 'Usa as opções já declaradas no índice de projetos.', selectDe('pe_cardsize', indexEntry.cardSize || 'normal', cardSizes.map(function (s) { return [s, s]; }))) +
      fieldRow('Projeto em destaque', 'No desktop, ocupa a largura da grade sem alterar a ordem.', switchControl('pe_featured', indexEntry.featured === true)) +
      fieldRow('Papel (PT)', 'Enter força uma nova linha.', ta('pe_rolept', P.hero.rolePt)) +
      fieldRow('Papel (EN)', 'Enter força uma nova linha.', ta('pe_roleen', P.hero.roleEn)) +
      fieldRow('Escopo (PT)', 'Enter força uma nova linha.', ta('pe_scopept', P.hero.scopePt)) +
      fieldRow('Escopo (EN)', 'Enter força uma nova linha.', ta('pe_scopeen', P.hero.scopeEn)) +
      fieldRow('Capa', 'Envie um arquivo, cole um caminho assets/ ou uma URL HTTPS direta.', '<input type="text" id="pe_cover" value="' + esc(P.cover) + '"><input type="file" id="pe_cover_upload" accept="image/*">') +
      fieldRow('Capa para celular', 'Opcional. Aceita upload, caminho assets/ ou URL HTTPS; vazia usa a capa principal.', '<input type="text" id="pe_covermobile" value="' + esc(P.coverMobile || indexEntry.coverMobile) + '"><input type="file" id="pe_covermobile_upload" accept="image/*">') +
      fieldRow('Capa clara?', 'Ative para capas predominantemente claras (fundo amarelo, branco, etc). O header, fixo por cima da grade, troca a cor do texto para escura só enquanto passa por cima deste card.', switchControl('pe_coverlight', indexEntry.coverLight)) +
      '</div></details>' +
      '<details class="group"' + projectSection('cover') + '><summary>Espaçamento da capa</summary><div class="group-body">' +
      deviceTabsHtml('cover-spacing') +
      blockSpacingFields(P, 'coverSpacing', function () { save(); }, false, { marginTop: 18, marginBottom: 0 }) +
      '</div></details>' +
      projectBlocks.map(function (b, i) {
        return '<details class="group"' + projectSection('bloco-' + i) + '><summary>' +
          esc((i + 1) + '. ' + resumoDoBloco(b)) + '</summary><div class="group-body">' +
          camposDoBloco(b, i) +
           '<div style="border-top:1px solid var(--line);padding-top:.8rem;margin-top:.8rem">' +
           '<b>Espaçamento</b>' +
           '<p class="hint">Controla as margens externas do bloco. Em galerias, controla também o espaço entre imagens. O padding do rótulo de texto é interno e fixo.</p>' +
          deviceTabsHtml('block-spacing-' + i) +
          blockSpacingFields(b, 'spacing', function () { save(); }, b.type === 'gallery', {
            marginTop: b.type === 'text' ? 0 : 18,
            marginBottom: b.type === 'text' && projectBlocks[i + 1] && projectBlocks[i + 1].type === 'text' ? 18 : 0,
            gap: b.type === 'gallery' ? 18 : 0
          }) +
          '</div>' +
          '<div class="bloco-acoes">' +
          '<button class="btn small" data-bl-sobe="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑ subir</button>' +
          '<button class="btn small" data-bl-desce="' + i + '"' + (i === projectBlocks.length - 1 ? ' disabled' : '') + '>↓ descer</button>' +
          '<button class="btn small" data-bl-dup="' + i + '">duplicar</button>' +
          '<button class="btn small danger" data-bl-remove="' + i + '">remover bloco</button>' +
          '</div></div></details>';
      }).join('') +
      '<div class="bloco-novo">' +
      '<select id="pe_bl_tipo">' + TIPOS_DE_BLOCO_PAINEL.map(function (t) {
        return '<option value="' + t[0] + '">' + esc(t[1]) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn small" id="pe_bl_add">+ adicionar bloco</button>' +
      '</div>';

    /* schedulePreview aqui também: sem isso o editor de projeto era o único
       lugar do painel que alterava conteúdo sem avisar a prévia. */
    function save() { markDirty('content/projects/' + slug + '.json', P, cached.sha); schedulePreview(); }
    function saveIndex() { markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha); schedulePreview(); }
    function tagsFrom(v) { return v.split(',').map(function (t) { return t.trim(); }).filter(Boolean); }
    document.getElementById('pe_slug_apply').addEventListener('click', function () {
      renomearSlugProjeto(slug, document.getElementById('pe_slug').value);
    });
    document.getElementById('pe_slug').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('pe_slug_apply').click(); }
    });
    bindText('pe_eyebrowpt', function (v) { P.hero.eyebrowPt = v; save(); });
    bindText('pe_eyebrowen', function (v) { P.hero.eyebrowEn = v; save(); });
    bindSwitch('pe_showeyebrow', function (v) { if (v) delete P.hero.showEyebrow; else P.hero.showEyebrow = false; save(); });
    bindText('pe_titlept', function (v) { P.hero.titlePt = v; indexEntry.titlePt = v; save(); saveIndex(); });
    bindText('pe_titleen', function (v) { P.hero.titleEn = v; indexEntry.titleEn = v; save(); saveIndex(); });
    bindText('pe_subpt', function (v) { P.hero.subtitlePt = v; indexEntry.subtitlePt = v; save(); saveIndex(); });
    bindText('pe_suben', function (v) { P.hero.subtitleEn = v; indexEntry.subtitleEn = v; save(); saveIndex(); });
    bindText('pe_category', function (v) { P.category = v; indexEntry.category = v; save(); saveIndex(); });
    bindText('pe_tagspt', function (v) { indexEntry.tagsPt = tagsFrom(v); saveIndex(); });
    bindText('pe_tagsen', function (v) { indexEntry.tagsEn = tagsFrom(v); saveIndex(); });
    bindSwitch('pe_featured', function (v) { indexEntry.featured = v; saveIndex(); });
    bindText('pe_rolept', function (v) { P.hero.rolePt = v; save(); });
    bindText('pe_roleen', function (v) { P.hero.roleEn = v; save(); });
    bindText('pe_scopept', function (v) { P.hero.scopePt = v; save(); });
    bindText('pe_scopeen', function (v) { P.hero.scopeEn = v; save(); });
    bindSwitch('pe_coverlight', function (v) { indexEntry.coverLight = v; saveIndex(); });
    bindText('pe_cover', function (v) { P.cover = v; indexEntry.cover = v; save(); saveIndex(); });
    bindText('pe_covermobile', function (v) { P.coverMobile = v; indexEntry.coverMobile = v; save(); saveIndex(); });
    document.getElementById('pe_cardsize').addEventListener('change', function (e) { indexEntry.cardSize = e.target.value; saveIndex(); });
    document.getElementById('pe_status').addEventListener('change', function (e) {
      P.status = e.target.value;
      /* `visible` continua sendo a autoridade da Home. Tornar rascunho apenas
         força a opção segura; publicar não mostra sozinho. */
      if (P.status === 'draft') { indexEntry.visible = false; saveIndex(); }
      save();
    });
    document.getElementById('pe_grain').addEventListener('change', function (e) {
      if (e.target.value === 'inherit') delete P.grainEnabled;
      else P.grainEnabled = e.target.value === 'on';
      save();
    });
    document.getElementById('pe_year').addEventListener('change', function (e) { P.year = Number(e.target.value); indexEntry.year = P.year; save(); saveIndex(); });
    ligarBlocos(P, slug, save, renderProjectEditor);
    var coverUpload = document.getElementById('pe_cover_upload');
    if (coverUpload) coverUpload.addEventListener('change', function () { uploadFile(coverUpload.files[0], slug, function (path) {
      P.cover = path; indexEntry.cover = path; save(); saveIndex(); renderProjectEditor();
    }); });
    var coverMobileUpload = document.getElementById('pe_covermobile_upload');
    if (coverMobileUpload) coverMobileUpload.addEventListener('change', function () { uploadFile(coverMobileUpload.files[0], slug, function (path) {
      P.coverMobile = path; indexEntry.coverMobile = path; save(); saveIndex(); renderProjectEditor();
    }); });

    wireTieredFields();
    wireDeviceTabs(editorEl, renderProjectEditor);
    editorEl.querySelectorAll('details[data-sec]').forEach(function (d) {
      d.addEventListener('toggle', function () { projectSectionOpen[d.getAttribute('data-sec')] = d.open; });
    });
  }

  /* O arquivo NÃO vai mais para o GitHub aqui. Antes, escolher uma imagem
     criava um commit na hora: se você desistisse da edição, a imagem ficava
     órfã no repositório, e ela podia existir sem o JSON que a referencia.
     Agora fica pendente, entra na revisão e sobe no mesmo commit do resto. */
  function uploadFile(file, slug, onDone) {
    if (!file) return Promise.resolve(null);
    var nome = sanitizarNome(file.name);
    if (!nome) { toast('Extensão não permitida. Use jpg, png, webp, avif, gif, svg, mp4, webm ou pdf.', 'err'); return Promise.resolve(null); }
    if (file.size > MAX_MIDIA_BYTES) {
      toast('Arquivo maior que ' + Math.round(MAX_MIDIA_BYTES / 1024 / 1024) + 'MB. Para vídeo pesado, use Vimeo ou URL HTTPS direta.', 'err'); return Promise.resolve(null);
    }
    var pasta = (typeof slug === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) ? slug + '/' : '';
    var path = 'assets/uploads/' + pasta + nome;
    var total = Object.keys(state.pendingUploads).reduce(function (soma, p) {
      return soma + (p === path ? 0 : Number(state.pendingUploads[p].size || 0));
    }, 0) + file.size;
    if (total > MAX_MIDIA_POR_PUBLICACAO) {
      toast('As mídias desta publicação passam de 32MB. Publique o lote atual ou use URL externa/Vimeo para os arquivos maiores.', 'err');
      return Promise.resolve(null);
    }

    return guardarMidia(path, file).then(function () {
      state.pendingUploads[path] = { mime: file.type || '', size: file.size, nome: nome };
      marcarPendenteMudou();
      toast('Mídia pendente. Sobe no próximo Publicar.', 'ok');
      if (onDone) onDone(path);
      return path;
    }).catch(function () {
      toast('Não foi possível guardar a mídia neste navegador.', 'err');
      return null;
    });
  }

  /* ================== SEÇÕES DA HOME ==================
     Espelha a lista SECOES de js/main.js, pela mesma razão que MODOS_CAPA
     espelha validate.js: o painel não importa módulos do site. Se uma seção
     nova entrar lá, precisa entrar aqui também, senão ela existe na página mas
     não pode ser escolhida como destino de menu. */
  var SECOES_PAINEL = [
    ['top', 'Início'], ['work', 'Trabalhos'], ['about', 'Sobre'],
    ['help', 'O que eu faço'], ['faq', 'FAQ'], ['contact', 'Contato']
  ];
  function secaoDoItemPainel(item) {
    var ids = SECOES_PAINEL.map(function (s) { return s[0]; });
    if (item.section && ids.indexOf(item.section) !== -1) return item.section;
    var href = String(item.hrefHome || item.href || '');
    var i = href.indexOf('#');
    var hash = i !== -1 ? href.slice(i + 1) : '';
    if (hash && ids.indexOf(hash) !== -1) return hash;
    return 'top';
  }
  function hrefDaSecaoPainel(id) {
    return 'index.html' + (id === 'top' ? '' : '#' + id);
  }

  /* ================== FUNDO DA CAPA ==================
     Espelha a régua de worker/src/validate.js (parseVimeoUrl). Duplicação
     consciente: o painel não consegue importar módulos do Worker, e o mesmo
     acontece com LIMITS. Quem DECIDE é sempre o Worker, que revalida na
     publicação; isto aqui existe para o erro aparecer enquanto a pessoa
     digita, em vez de só ao publicar. */
  var MODOS_CAPA = [
    ['liquid', 'Fundo animado (padrão)'],
    ['file', 'Arquivo de vídeo'],
    ['vimeo', 'Vimeo'],
    ['none', 'Sem vídeo']
  ];
  var VIMEO_HOSTS_PAINEL = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

  /* Compatibilidade: hero sem videoMode é lido pelo que já existe. */
  function modoDaCapa(hero) {
    var m = hero && hero.videoMode;
    if (m && MODOS_CAPA.some(function (x) { return x[0] === m; })) return m;
    return (hero && hero.backgroundVideo) ? 'file' : 'liquid';
  }

  function parseVimeoNoPainel(valor) {
    if (typeof valor !== 'string') return null;
    var texto = valor.trim();
    if (!texto) return null;
    if (/[<>"'`\\]/.test(texto)) return null;
    if (/^\s*(javascript|data|vbscript|file|blob)\s*:/i.test(texto)) return null;
    var u;
    try { u = new URL(texto); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    if (VIMEO_HOSTS_PAINEL.indexOf(u.hostname.toLowerCase()) === -1) return null;
    if (u.username || u.password) return null;
    var partes = u.pathname.split('/').filter(Boolean);
    var id = null, hash = null;
    if (u.hostname.toLowerCase() === 'player.vimeo.com') {
      if (partes[0] !== 'video' || !partes[1]) return null;
      id = partes[1]; hash = u.searchParams.get('h');
    } else {
      if (!partes[0]) return null;
      id = partes[0];
      if (partes[1]) hash = partes[1];
    }
    if (!/^[0-9]{6,12}$/.test(id)) return null;
    if (hash != null) {
      hash = String(hash);
      if (!/^[a-zA-Z0-9]{6,20}$/.test(hash)) return null;
    }
    return { videoId: id, hash: hash || null };
  }

  /* ================== TEMPLATE CANÔNICO DE PROJETO ==================
     Fonte única da verdade da estrutura de um projeto novo. Substitui o clone
     do primeiro projeto da lista, que trazia problemas reais: um projeto novo
     herdava a quantidade de blocos e de imagens de galeria de outro, os
     rótulos de seção daquele projeto específico, e qualquer campo que só
     existisse nele.

     Aqui a estrutura é declarada, não copiada. Todos os campos de topo que o
     schema atual exige estão presentes (os mesmos que CHAVES_DE_TOPO aceita no
     Worker), com texto vazio, sem capa e com galeria vazia.

     Três blocos de texto porque é a espinha editorial das páginas de projeto
     (contexto, processo, resultado) e o HTML do modelo espera encontrá-los; a
     galeria nasce declarada mas sem imagem nenhuma.

     Espaçamento: nenhum campo de spacing é declarado de propósito. Ausente
     significa "usa o padrão do site" (ver js/content-render.js, blockStyleCss),
     que é o valor seguro — declarar zeros aqui achataria o projeto novo. */
  function projetoNovo(slug, titulo) {
    return {
      $schema: 'Conteúdo de uma página de projeto. Editado pelo painel administrativo.',
      slug: slug,
      status: 'draft',
      client: '',
      year: new Date().getFullYear(),
      category: '',
      services: [],
      seo: { title: '', description: '' },
      hero: {
        eyebrowPt: '', eyebrowEn: '',
        titlePt: titulo, titleEn: '',
        subtitlePt: '', subtitleEn: '',
        rolePt: '', roleEn: '',
        scopePt: '', scopeEn: ''
      },
      cover: '',
      coverMobile: '',
      blocks: [
        { type: 'text', labelPt: 'contexto', labelEn: 'context', textPt: '', textEn: '' },
        { type: 'text', labelPt: 'processo', labelEn: 'process', textPt: '', textEn: '' },
        { type: 'text', labelPt: 'resultado', labelEn: 'outcome', textPt: '', textEn: '' },
        { type: 'gallery', images: [] }
      ]
    };
  }

  /* Entrada correspondente no índice. Nasce oculta (visible:false), o mesmo
     conceito de rascunho que duplicar já usava: o projeto existe no painel mas
     não aparece no site até alguém decidir mostrá-lo. */
  function entradaDeIndiceNova(slug, titulo, ano, ordem) {
    return {
      slug: slug, titlePt: titulo, titleEn: '',
      subtitlePt: '', subtitleEn: '',
      category: '', featured: false, cardSize: 'normal',
      year: ano, cover: '', coverMobile: '', coverLight: false,
      visible: false, order: ordem,
      tagsPt: [], tagsEn: []
    };
  }

  /* Um lugar só para "algo pendente mudou": mantém rascunho, selo da prévia,
     painel de publicação e indicadores de aba em sincronia. */
  function marcarPendenteMudou() {
    updateDirtyIndicators();
    renderPublishPanel();
    atualizarSeloPrevia();
    scheduleDraftSave();
  }

  /* Existe pendência de qualquer tipo, não só JSON alterado? */
  function haPendencias() {
    return Object.keys(state.dirty).length > 0 ||
      Object.keys(state.pendingUploads).length > 0 ||
      Object.keys(state.pendingPages).length > 0 ||
      Object.keys(state.pendingDeletes).length > 0;
  }

  function renderProjects() {
    renderProjectsList();
    renderProjectEditor();
    /* Criar também virou pendente. Antes eram três commits imediatos antes de
       qualquer revisão; agora o projeto nasce só na memória, aparece no painel
       e na prévia, e o índice, o conteúdo e a página sobem juntos no Publicar.
       O molde vem de um projeto existente e é limpo, para o Worker não
       precisar aceitar estrutura arbitrária do cliente. */
    document.getElementById('btnNewProject').addEventListener('click', function () {
      var titlePt = prompt('Título do novo projeto (português):');
      if (!titlePt) return;
      var sugestao = titlePt.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
      var slug = prompt('Slug (ex: campanha-2027):', sugestao);
      if (!slug) return;
      slug = String(slug).trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { toast('Slug inválido. Use letras minúsculas, números e hífen.', 'err'); return; }
      var lista = state.projectsIndex.projects;
      if (lista.some(function (x) { return x.slug === slug; })) { toast('Já existe um projeto com esse slug.', 'err'); return; }

      /* Estrutura vem do template canônico, NÃO de um clone do primeiro
         projeto: um projeto novo não deve herdar quantidade de blocos, imagens
         de galeria nem rótulos de outro projeto. Nada é buscado do GitHub aqui.
         Só a PÁGINA HTML ainda usa um projeto existente como origem, porque o
         Worker recusa marcação vinda do cliente e o modelo precisa ser um
         arquivo já versionado. */
      var novo = projetoNovo(slug, titlePt);
      var caminho = 'content/projects/' + slug + '.json';
      state.projects[slug] = { data: novo, sha: null };
      state.published[caminho] = null;
      markDirty(caminho, novo, null, 'cms: cria projeto ' + slug);

      var ordem = lista.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1;
      lista.push(entradaDeIndiceNova(slug, titlePt, novo.year, ordem));
      markDirty('content/projects/index.json', state.projectsIndex, state.projectsIndexSha);

      var origemPagina = lista.length > 1 ? lista[0].slug : null;
      if (!origemPagina) { toast('É preciso um projeto existente para servir de modelo da página HTML.', 'err'); return; }
      state.pendingPages['work/' + slug + '.html'] = { slug: slug, fromSlug: origemPagina };

      state.editingSlug = slug;
      marcarPendenteMudou();
      renderProjectsList(); renderProjectEditor();
      toast('Projeto "' + slug + '" criado como pendente. Sobe no próximo Publicar.', 'ok');
    });
  }

  /* ---------- Publicação ---------- */
  function renderPublishPanel() {
    var el = document.getElementById('publishSummary');
    var btn = document.getElementById('btnPublish');
    if (!haPendencias()) {
      el.innerHTML = 'Nenhuma alteração pendente.';
      btn.disabled = true;
      return;
    }
    var linhas = [];
    Object.keys(state.dirty).forEach(function (p) {
      linhas.push({ path: p, rotulo: state.published[p] === null ? 'novo' : 'alterado', classe: 'custom' });
    });
    Object.keys(state.pendingPages).forEach(function (p) {
      linhas.push({ path: p, rotulo: 'página nova', classe: 'custom' });
    });
    Object.keys(state.pendingUploads).forEach(function (p) {
      var kb = Math.round((state.pendingUploads[p].size || 0) / 1024);
      linhas.push({ path: p, rotulo: 'mídia · ' + kb + ' KB', classe: 'custom' });
    });
    Object.keys(state.pendingDeletes).forEach(function (p) {
      linhas.push({ path: p, rotulo: 'remover', classe: 'danger' });
    });
    el.innerHTML = '<ul class="summary-list">' + linhas.map(function (l) {
      return '<li><span>' + esc(l.path) + '</span><span class="badge ' + l.classe + '">' + esc(l.rotulo) + '</span></li>';
    }).join('') + '</ul>' +
      '<p class="hint" style="margin-top:.6rem">Tudo isso entra em um único commit.</p>';
    btn.disabled = false;
  }

  /* mensagemCustom: texto opcional vindo da tela de revisão. Quando
     preenchido, substitui a mensagem individual de cada arquivo pela mesma
     mensagem em todos — um commit só, uma frase só. Vazio mantém o padrão
     'cms: atualiza <arquivo>' de cada um, como sempre foi. */
  function doPublish(mensagemCustom) {
    if (!haPendencias()) return;
    document.getElementById('btnPublish').disabled = true;
    document.getElementById('publishResult').innerHTML = 'Publicando…';
    setDraftState('publicando');

    /* Monta as operações na ordem em que o Worker as espera. Os bytes das
       mídias só saem do IndexedDB agora, na hora de publicar — não ficam em
       memória durante a edição. */
    var ops = Object.keys(state.dirty).map(function (p) {
      return { type: 'json', path: p, data: state.dirty[p].data, sha: state.dirty[p].sha || null };
    });
    Object.keys(state.pendingPages).forEach(function (p) {
      ops.push({ type: 'page', slug: state.pendingPages[p].slug, fromSlug: state.pendingPages[p].fromSlug });
    });
    Object.keys(state.pendingDeletes).forEach(function (p) {
      ops.push({ type: 'delete', path: p });
    });

    var caminhosMidia = Object.keys(state.pendingUploads);
    Promise.all(caminhosMidia.map(function (p) {
      return lerMidia(p).then(function (blob) {
        if (!blob) throw new Error('A mídia pendente ' + p + ' não está mais neste navegador.');
        return midiaParaBase64(blob).then(function (b64) {
          return { type: 'binary', path: p, contentBase64: b64, mime: state.pendingUploads[p].mime || '' };
        });
      });
    })).then(function (opsMidia) {
      return api('/api/publish', {
        method: 'POST',
        body: { message: mensagemCustom || null, ops: ops.concat(opsMidia) }
      });
    }).then(function (res) {
      /* Chegou aqui: o Worker moveu a branch. Não existe publicação parcial —
         ou o commit único foi criado, ou caímos no catch. */
      var curto = String(res.commit || '').slice(0, 7);
      document.getElementById('publishResult').innerHTML =
        '<div class="badge default">Publicado em um commit · ' + esc(curto) + '</div>' +
        '<ul class="summary-list" style="margin-top:.6rem">' + (res.paths || []).map(function (p) {
          return '<li><span>' + esc(p) + '</span><span>ok</span></li>';
        }).join('') + '</ul>';

      /* linha de base avança para o que acabou de ser publicado, com os SHAs
         novos, senão a próxima publicação acusaria conflito contra si mesma */
      var shas = res.shas || {};
      Object.keys(state.dirty).forEach(function (p) {
        snapshotPublished(p, state.dirty[p].data);
        if (p === 'content/global.json') state.globalSha = shas[p] || null;
        if (p === 'content/home.json') state.homeSha = shas[p] || null;
        if (p === 'content/projects/index.json') state.projectsIndexSha = shas[p] || null;
        var m = p.match(/^content\/projects\/([a-z0-9-]+)\.json$/);
        if (m && state.projects[m[1]]) state.projects[m[1]].sha = shas[p] || null;
      });
      Object.keys(state.pendingDeletes).forEach(function (p) { delete state.published[p]; });

      state.dirty = {};
      state.pendingPages = {};
      state.pendingDeletes = {};
      return limparTodaMidiaPendente().then(function () {
        localStorage.setItem('cms_last_publish', JSON.stringify({ at: res.publishedAt, commit: res.commit, files: (res.paths || []).length }));
        renderLastPublish();
        clearDraft();                /* só aqui o rascunho morre */
        setDraftState('concluido');
        marcarPendenteMudou();
        toast('Publicado em um commit.', 'ok');
      });
    }).catch(function (e) {
      /* Falha em qualquer etapa: a branch não se moveu, então nada precisa ser
         desfeito. O rascunho e as mídias pendentes ficam intactos para a
         pessoa tentar de novo sem perder trabalho. */
      var msg = e && e.message ? e.message : 'Falha ao publicar.';
      var erro = e && e.body && e.body.error;
      var conflito = erro === 'conflict';
      var camposDesconhecidos = erro === 'unknown_fields';
      var titulo = conflito ? 'Conflito — nada foi publicado'
        : camposDesconhecidos ? 'Campo desconhecido — nada foi publicado'
          : 'Falha — nada foi publicado';
      var ajuda = '';
      if (conflito) {
        ajuda = '<p class="hint">Recarregue o painel para trazer a versão publicada. Seu rascunho e suas mídias continuam salvos neste navegador.</p>';
      } else if (camposDesconhecidos) {
        /* nomeia arquivo e chaves, para a pessoa saber exatamente onde mexer.
           O campo NÃO foi descartado: continua no rascunho, intacto. */
        var chaves = (e.body.keys || []).map(esc).join(', ');
        ajuda = '<p class="hint">Arquivo: <code>' + esc(e.body.path || '') + '</code><br>' +
          'Campo(s): <code>' + chaves + '</code><br>' +
          'O campo não foi apagado — seu rascunho continua como estava. Remova o campo pelo painel, ' +
          'ou inclua-o em CHAVES_DE_TOPO no Worker se ele deve passar a existir.</p>';
      }
      document.getElementById('publishResult').innerHTML =
        '<div class="badge custom">' + titulo + '</div>' +
        '<p style="color:var(--err);margin-top:.5rem">' + esc(msg) + '</p>' + ajuda;
      saveDraftNow();
      setDraftState('falha');
      toast(msg, 'err');
    }).finally(function () {
      document.getElementById('btnPublish').disabled = !haPendencias();
    });
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

  function montarPaineis() {
    renderOverview(); renderAppearance(); renderLayout(); renderHeaderFooter();
    renderHome(); renderProjects(); renderLastPublish(); renderPublishPanel();
    updateDirtyIndicators(); atualizarSeloPrevia();
  }

  function ligarAcoesGerais() {
    document.getElementById('navList').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-panel]');
      if (btn) showPanel(btn.getAttribute('data-panel'));
    });
    /* O clique em Publicar nunca chama doPublish direto: sempre passa pela
       revisão primeiro. abrirRevisao() só resolve quando a pessoa confirma
       (mensagem) ou cancela (null) — nada é publicado antes disso. */
    document.getElementById('btnPublish').addEventListener('click', function () {
      if (!haPendencias()) return;
      revisaoResolver = null;
      abrirRevisao().then(function () {
        return new Promise(function (resolve) { revisaoResolver = resolve; });
      }).then(function (resultado) {
        if (resultado.confirmado) doPublish(resultado.mensagem || null);
      });
    });
    document.getElementById('btnReviewCancel').addEventListener('click', function () { fecharRevisao(false); });
    document.getElementById('btnReviewConfirm').addEventListener('click', function () { fecharRevisao(true); });
    document.getElementById('btnDiscard').addEventListener('click', function () {
      if (!confirm('Descartar todas as alterações não publicadas?\n\nIsso também apaga o rascunho e as mídias pendentes neste navegador, e volta ao conteúdo publicado.')) return;
      /* apaga rascunho E mídias ANTES de recarregar: sem isso o painel voltaria
         oferecendo justamente aquilo que a pessoa acabou de descartar, e os
         bytes ficariam ocupando o IndexedDB sem dono */
      descartarTudoPendente().then(function () { location.reload(); });
    });
    window.addEventListener('beforeunload', function (e) {
      if (haPendencias()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* Faixa de restauração. Banner em vez de confirm() por dois motivos: dá para
     mostrar o horário e quantos arquivos existem, e não trava a montagem do
     painel enquanto a pessoa decide. */
  function oferecerRestauracao(d) {
    var n = Object.keys(d.files).length;
    var banner = document.getElementById('draftBanner');
    if (!banner) return;
    document.getElementById('draftBannerInfo').textContent =
      n + (n === 1 ? ' arquivo com alteração não publicada, salvo ' : ' arquivos com alterações não publicadas, salvos ') + quando(d.savedAt) + '.';
    banner.hidden = false;
    setDraftState('rascunho');
    state.draftSavedAt = d.savedAt;

    document.getElementById('btnDraftRestore').addEventListener('click', function () {
      applyDraft(d);
      banner.hidden = true;
      montarPaineis();
      refreshDraftState();
      schedulePreview();
      toast('Rascunho restaurado.', 'ok');
    });
    document.getElementById('btnDraftDiscard').addEventListener('click', function () {
      if (!confirm('Descartar o rascunho salvo neste navegador?')) return;
      clearDraft();
      banner.hidden = true;
      refreshDraftState();
      toast('Rascunho descartado.');
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    /* /api/status entra no mesmo lote: é dele que saem repositório e branch,
       e sem os dois não há como escolher a chave do rascunho. Antes ele era
       pedido só pela Visão geral, depois da montagem. */
    Promise.all([api('/api/status'), api('/api/global'), api('/api/home'), api('/api/projects')]).then(function (results) {
      state.status = results[0];
      state.repo = results[0].repo; state.branch = results[0].branch;
      state.global = results[1].data; state.globalSha = results[1].sha;
      state.home = results[2].data; state.homeSha = results[2].sha;
      state.projectsIndex = results[3].data; state.projectsIndexSha = results[3].sha;

      /* Linha de base para a revisão (Fase 3): uma cópia congelada do que
         está publicado agora, ANTES de qualquer edição. É necessária porque
         os campos do painel escrevem direto em state.global/home/projects —
         não existe mais uma cópia "limpa" depois do primeiro clique, então
         sem isto não haveria contra o que comparar. */
      snapshotPublished('content/global.json', state.global);
      snapshotPublished('content/home.json', state.home);
      snapshotPublished('content/projects/index.json', state.projectsIndex);

      document.getElementById('app').hidden = false;

      /* O rascunho nunca é aplicado sozinho. O painel monta com o que está
         publicado e oferece a restauração — assim, abrir o painel para
         conferir o site no ar não faz voltar uma edição esquecida. */
      var rascunho = readDraft();
      montarPaineis();
      ligarAcoesGerais();
      if (rascunho) oferecerRestauracao(rascunho); else refreshDraftState();
    }).catch(function (e) {
      document.getElementById('gate').hidden = false;
      document.getElementById('gateMsg').textContent = 'Erro ao carregar o painel: ' + e.message;
    });
  }

  boot();
})();
