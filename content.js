/* ========================================
   onePixelOkGogo Overlay — Content Script
   Overlay rendering + Panel UI (Shadow DOM).
   Replaces the iframe-based panel so DevTools
   device-mode zoom doesn't misalign clicks.
   ======================================== */
(function () {
  'use strict';

  let STORAGE_KEY = 'pp_data';
  const MAX_LAYERS = 50;

  let state = {
    layers: [],
    selectedLayerIndex: -1,
    allVisible: true,
    guides: [],
    guidesVisible: true,
    guidesLocked: false,
    guideStyle: { width: 1, style: 'dashed', color: '#ff2a76' },
  };

  // Overlay containers (light DOM on the page)
  let container = null;
  let guidesContainer = null;

  // Panel host + shadow root
  let panelContainer = null;
  let panelShadow = null;
  let panelInitPromise = null;
  let activeTab = 'layers';

  // Drag state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragLayerOffsetX = 0;
  let dragLayerOffsetY = 0;
  let dragLayerIndex = -1;
  let isDraggingGuide = false;
  let dragGuideId = null;

  /* ---------- Init ---------- */
  function init() {
    createContainer();
    createGuidesContainer();
    loadState();
    setupKeyboard();
    setupMessageListener();
    setupStorageListener();
    setupPasteListener();
    window.addEventListener('resize', () => {
      if (!isDraggingGuide) renderGuides();
    });
  }

  function createContainer() {
    const existing = document.getElementById('pp-overlay-container');
    if (existing) existing.remove();
    container = document.createElement('div');
    container.id = 'pp-overlay-container';
    document.documentElement.appendChild(container);
  }

  function createGuidesContainer() {
    const existing = document.getElementById('pp-guides-container');
    if (existing) existing.remove();
    guidesContainer = document.createElement('div');
    guidesContainer.id = 'pp-guides-container';
    document.documentElement.appendChild(guidesContainer);
  }

  /* ---------- State I/O ---------- */
  function loadState() {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      if (chrome.runtime.lastError) return;
      if (data[STORAGE_KEY]) {
        state = { ...state, ...data[STORAGE_KEY] };
      }
      migrateLayersToFixed();
      migrateLayersToDocumentCoords();
      renderOverlays();
      renderPanelUI();
    });
  }

  function migrateLayersToFixed() {
    if (!state.layers || !state.layers.length) return;
    let changed = false;
    state.layers.forEach((layer) => {
      if (layer.fixedMigrated) return;
      const naturalW = layer.naturalWidth || 0;
      const scale = layer.scale || 1;
      const iw = naturalW * scale;
      const vw = window.innerWidth;
      layer.offsetX = Math.round((vw - iw) / 2);
      layer.offsetY = 0;
      layer.fixedMigrated = true;
      changed = true;
    });
    if (changed) persistState();
  }

  function migrateLayersToDocumentCoords() {
    if (!state.layers || !state.layers.length) return;
    const sx = window.scrollX || 0;
    const sy = window.scrollY || 0;
    let changed = false;
    state.layers.forEach((layer) => {
      if (layer.docMigrated) return;
      layer.offsetX = (layer.offsetX || 0) + sx;
      layer.offsetY = (layer.offsetY || 0) + sy;
      layer.docMigrated = true;
      changed = true;
    });
    if (changed) persistState();
  }

  // Writes to storage without re-rendering. Used by migrations and drag end.
  function persistState() {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      // swallow errors
    });
  }

  // Writes to storage AND re-renders both overlays and panel UI.
  function saveState() {
    persistState();
    renderOverlays();
    renderPanelUI();
  }

  /* ---------- Storage listener (handles external changes) ---------- */
  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (!changes[STORAGE_KEY]) return;
      const newVal = changes[STORAGE_KEY].newValue;
      if (!newVal) return;
      // Ignore during drag so a late storage event can't rewind position.
      if (isDragging || isDraggingGuide) return;
      state = { ...state, ...newVal };
      renderOverlays();
      renderPanelUI();
    });
  }

  /* ---------- Message listener ---------- */
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'RENDER') {
        loadState();
        sendResponse({ ok: true });
      } else if (msg.type === 'TOGGLE_PANEL') {
        togglePanel();
        sendResponse({ ok: true });
      } else if (msg.type === 'CLOSE_PANEL') {
        if (panelContainer) panelContainer.classList.add('pp-hidden');
        sendResponse({ ok: true });
      } else if (msg.type === 'ALIGN_ORIGIN') {
        alignLayer(msg.origin);
        sendResponse({ ok: true });
      }
      return false;
    });
  }

  function alignLayer(originStr, targetLayerIndex = state.selectedLayerIndex) {
    const layer = state.layers[targetLayerIndex];
    if (!layer || !container) return;

    const img = container.querySelector(`img[data-index="${targetLayerIndex}"]`);
    if (!img) return;

    const naturalW = img.naturalWidth || layer.naturalWidth || 0;
    const naturalH = img.naturalHeight || layer.naturalHeight || 0;
    if (!naturalW || !naturalH) {
      img.addEventListener('load', () => alignLayer(originStr, targetLayerIndex), { once: true });
      return;
    }
    layer.naturalWidth = naturalW;
    layer.naturalHeight = naturalH;
    const scale = layer.scale || 1;
    const iw = naturalW * scale;
    const ih = naturalH * scale;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sx = window.scrollX || 0;
    const sy = window.scrollY || 0;

    let left = 0;
    let top = 0;
    const centerX = (vw - iw) / 2 + sx;
    const centerY = (vh - ih) / 2 + sy;
    const currentX = layer.offsetX !== undefined ? layer.offsetX : centerX;
    const currentY = layer.offsetY !== undefined ? layer.offsetY : sy;

    switch (originStr || 'top') {
      case 'top':    left = currentX;       top = sy;             break;
      case 'bottom': left = currentX;       top = sy + vh - ih;   break;
      case 'left':   left = sx;             top = currentY;       break;
      case 'right':  left = sx + vw - iw;   top = currentY;       break;
      case 'center':
      default:
        left = centerX;
        top = (ih <= vh) ? centerY : currentY;
        break;
    }

    layer.offsetX = Math.round(left);
    layer.offsetY = Math.round(top);
    layer.origin = originStr;
    saveState();
  }

  /* ---------- Panel (Shadow DOM) ---------- */
  async function ensurePanel() {
    if (panelContainer) return;
    if (!panelInitPromise) panelInitPromise = createPanel();
    await panelInitPromise;
  }

  async function createPanel() {
    panelContainer = document.createElement('div');
    panelContainer.id = 'pp-panel-container';
    panelContainer.classList.add('pp-hidden');

    panelShadow = panelContainer.attachShadow({ mode: 'open' });

    const [cssText, htmlText] = await Promise.all([
      fetch(chrome.runtime.getURL('popup.css')).then((r) => r.text()),
      fetch(chrome.runtime.getURL('popup.html')).then((r) => r.text()),
    ]);

    // Base styles for the shadow root: layout for host + drag header (which
    // previously lived in content.css and is now inside the shadow).
    const baseCSS = `
      :host {
        display: flex;
        flex-direction: column;
      }
      #pp-panel-drag-header {
        height: 28px;
        background: transparent;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        user-select: none;
        flex-shrink: 0;
      }
      #pp-panel-drag-header:active { cursor: grabbing; }
      #pp-panel-drag-header::before {
        content: "•••";
        color: rgba(255, 255, 255, 0.3);
        font-size: 16px;
        line-height: 1;
        letter-spacing: 4px;
      }
      .pp-popup-host {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
      }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = baseCSS + '\n' + cssText;
    panelShadow.appendChild(styleEl);

    // Parse popup.html
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    // Clone font/preconnect link tags from <head> into shadow root (skip the
    // popup.css link — we already injected its contents inline).
    doc.head.querySelectorAll('link').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (href === 'popup.css') return;
      panelShadow.appendChild(link.cloneNode(true));
    });

    // Drag header
    const header = document.createElement('div');
    header.id = 'pp-panel-drag-header';
    panelShadow.appendChild(header);

    // Strip any scripts from parsed body, then move children into shadow root
    doc.body.querySelectorAll('script').forEach((s) => s.remove());

    const popupHost = document.createElement('div');
    popupHost.className = 'pp-popup-host';
    while (doc.body.firstChild) {
      popupHost.appendChild(doc.body.firstChild);
    }
    panelShadow.appendChild(popupHost);

    document.documentElement.appendChild(panelContainer);

    setupPanelDrag(header, popupHost);
    setupPanelEvents();
    setupPanelDragDrop();
    renderPanelUI();
  }

  async function togglePanel() {
    await ensurePanel();
    panelContainer.classList.toggle('pp-hidden');
  }

  function setupPanelDrag(header, popupHost) {
    let isDraggingPanel = false;
    let panelDragStartX = 0;
    let panelDragStartY = 0;
    let panelStartLeft = 0;
    let panelStartTop = 0;

    header.addEventListener('mousedown', (e) => {
      isDraggingPanel = true;
      panelDragStartX = e.clientX;
      panelDragStartY = e.clientY;
      const rect = panelContainer.getBoundingClientRect();
      panelStartLeft = rect.left;
      panelStartTop = rect.top;
      panelContainer.style.right = 'auto';
      panelContainer.style.bottom = 'auto';
      panelContainer.style.left = panelStartLeft + 'px';
      panelContainer.style.top = panelStartTop + 'px';
      // Block panel content from receiving events while we drag the chrome.
      popupHost.style.pointerEvents = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDraggingPanel) return;
      const dx = e.clientX - panelDragStartX;
      const dy = e.clientY - panelDragStartY;
      panelContainer.style.left = (panelStartLeft + dx) + 'px';
      panelContainer.style.top = (panelStartTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDraggingPanel) {
        isDraggingPanel = false;
        popupHost.style.pointerEvents = '';
      }
    });
  }

  function $p(sel) { return panelShadow ? panelShadow.querySelector(sel) : null; }
  function $$p(sel) { return panelShadow ? panelShadow.querySelectorAll(sel) : []; }

  function setupPanelEvents() {
    const verEl = $p('#appVersion');
    if (verEl) verEl.textContent = 'v' + chrome.runtime.getManifest().version;

    const fileInput = $p('#fileInput');
    $p('#btnUpload').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      addImagesFromFiles(e.target.files);
      fileInput.value = '';
    });
    $p('#btnPaste').addEventListener('click', handlePasteButton);

    $p('#btnShow').addEventListener('click', toggleSelectedShow);
    $p('#btnLock').addEventListener('click', toggleSelectedLock);
    $p('#btnInvert').addEventListener('click', toggleSelectedInvert);
    $p('#btnReset').addEventListener('click', resetSelectedPosition);
    $p('#btnDelete').addEventListener('click', deleteSelected);

    const btnClose = $p('#btnClose');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (panelContainer) panelContainer.classList.add('pp-hidden');
      });
    }

    const inputX = $p('#inputX');
    const inputY = $p('#inputY');
    const inputScale = $p('#inputScale');
    const opacitySlider = $p('#opacitySlider');

    inputX.addEventListener('input', () => updateSelectedField('offsetX', Number(inputX.value)));
    inputY.addEventListener('input', () => updateSelectedField('offsetY', Number(inputY.value)));
    inputScale.addEventListener('input', () => {
      const v = parseFloat(inputScale.value);
      if (!isNaN(v) && v >= 0.001) updateSelectedField('scale', Math.round(v * 1000) / 1000);
    });

    opacitySlider.addEventListener('input', () => {
      const layer = selectedLayer();
      if (!layer) return;
      layer.opacity = opacitySlider.value / 100;
      const valEl = $p('#opacityValue');
      if (valEl) valEl.textContent = opacitySlider.value + '%';
      updateOpacitySliderTrack();
      saveState();
    });

    $$p('.pp-arrow-btn').forEach((btn) => {
      btn.addEventListener('click', () => alignLayer(btn.dataset.origin));
    });

    $$p('.pp-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Guides controls
    $p('#btnAddH').addEventListener('click', () => addGuide('h'));
    $p('#btnAddV').addEventListener('click', () => addGuide('v'));
    $p('#btnClearGuides').addEventListener('click', clearGuides);
    $p('#btnGuidesShow').addEventListener('click', toggleGuidesVisible);
    $p('#btnGuidesLock').addEventListener('click', toggleGuidesLocked);

    const guideWidthSel = $p('#guideWidth');
    const guideStyleSel = $p('#guideStyle');
    const guideColorCustom = $p('#guideColorCustom');
    guideWidthSel.addEventListener('change', () => {
      state.guideStyle = { ...state.guideStyle, width: Number(guideWidthSel.value) };
      saveState();
    });
    guideStyleSel.addEventListener('change', () => {
      state.guideStyle = { ...state.guideStyle, style: guideStyleSel.value };
      saveState();
    });
    $$p('.pp-color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        state.guideStyle = { ...state.guideStyle, color: sw.dataset.color };
        saveState();
      });
    });
    guideColorCustom.addEventListener('input', () => {
      state.guideStyle = { ...state.guideStyle, color: guideColorCustom.value };
      saveState();
    });
  }

  function setupPanelDragDrop() {
    const dropZone = $p('#dropZone');
    panelContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dropZone) dropZone.classList.add('active');
    });
    panelContainer.addEventListener('dragleave', (e) => {
      if (!panelContainer.contains(e.relatedTarget)) {
        if (dropZone) dropZone.classList.remove('active');
      }
    });
    panelContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dropZone) dropZone.classList.remove('active');
      if (e.dataTransfer.files.length) addImagesFromFiles(e.dataTransfer.files);
    });
  }

  // Listen for paste at document level — only intercept when the panel has focus.
  function setupPasteListener() {
    document.addEventListener('paste', (e) => {
      if (!panelContainer || panelContainer.classList.contains('pp-hidden')) return;
      // activeElement is the shadow host when focus is inside shadow root.
      if (document.activeElement !== panelContainer) return;
      const files = e.clipboardData?.files;
      if (!files || !files.length) return;
      const hasImage = Array.from(files).some((f) => f.type.startsWith('image/'));
      if (hasImage) {
        e.preventDefault();
        addImagesFromFiles(files);
      }
    });
  }

  /* ---------- File / clipboard handlers ---------- */
  function addImagesFromFiles(files) {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      if (state.layers.length >= MAX_LAYERS) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          addLayer({
            name: file.name,
            imageData: ev.target.result,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePasteButton() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            addLayer({
              name: `pasted_${Date.now()}.png`,
              imageData: ev.target.result,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
            });
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(blob);
        break;
      }
    } catch (err) {
      console.warn('Paste failed:', err);
    }
  }

  /* ---------- Layer CRUD ---------- */
  function addLayer(opts) {
    if (state.layers.length >= MAX_LAYERS) return;
    state.layers.push({
      id: crypto.randomUUID(),
      name: opts.name || 'Untitled',
      imageData: opts.imageData,
      naturalWidth: opts.naturalWidth,
      naturalHeight: opts.naturalHeight,
      visible: true,
      locked: false,
      inverted: false,
      opacity: 1,
      origin: 'top',
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      isNew: true,
    });
    state.selectedLayerIndex = state.layers.length - 1;
    saveState();
  }

  function deleteSelected() {
    const idx = state.selectedLayerIndex;
    if (idx < 0 || idx >= state.layers.length) return;
    state.layers.splice(idx, 1);
    state.selectedLayerIndex = state.layers.length ? Math.min(idx, state.layers.length - 1) : -1;
    saveState();
  }

  function deleteLayerByIndex(idx) {
    if (idx < 0 || idx >= state.layers.length) return;
    state.layers.splice(idx, 1);
    state.selectedLayerIndex = state.layers.length
      ? Math.min(state.selectedLayerIndex, state.layers.length - 1)
      : -1;
    saveState();
  }

  function selectLayer(idx) {
    state.selectedLayerIndex = idx;
    saveState();
  }

  function selectedLayer() {
    return state.layers[state.selectedLayerIndex] || null;
  }

  function toggleSelectedShow() {
    const layer = selectedLayer();
    if (!layer) return;
    layer.visible = !layer.visible;
    saveState();
  }

  function toggleSelectedLock() {
    const layer = selectedLayer();
    if (!layer) return;
    layer.locked = !layer.locked;
    saveState();
  }

  function toggleSelectedInvert() {
    const layer = selectedLayer();
    if (!layer) return;
    layer.inverted = !layer.inverted;
    saveState();
  }

  function resetSelectedPosition() {
    const layer = selectedLayer();
    if (!layer) return;
    layer.offsetX = 0;
    layer.offsetY = 0;
    layer.scale = 1;
    saveState();
  }

  function updateSelectedField(key, value) {
    const layer = selectedLayer();
    if (!layer) return;
    layer[key] = value;
    saveState();
  }

  function updateOpacitySliderTrack() {
    const slider = $p('#opacitySlider');
    if (slider) slider.style.setProperty('--slider-pct', slider.value + '%');
  }

  /* ---------- Tabs ---------- */
  function switchTab(name) {
    activeTab = name;
    $$p('.pp-tab').forEach((t) => {
      t.classList.toggle('pp-tab-active', t.dataset.tab === name);
    });
    $$p('.pp-tab-panel').forEach((p) => {
      p.classList.toggle(
        'pp-tab-panel-active',
        p.id === 'tab' + name.charAt(0).toUpperCase() + name.slice(1)
      );
    });
  }

  /* ---------- Guides (panel side) ---------- */
  function addGuide(axis) {
    if (!state.guides) state.guides = [];
    state.guides.push({ id: crypto.randomUUID(), axis, pos: null });
    saveState();
  }

  function deleteGuideById(id) {
    state.guides = (state.guides || []).filter((g) => g.id !== id);
    saveState();
  }

  function clearGuides() {
    if (!state.guides || !state.guides.length) return;
    state.guides = [];
    saveState();
  }

  function toggleGuidesVisible() {
    state.guidesVisible = !state.guidesVisible;
    saveState();
  }

  function toggleGuidesLocked() {
    state.guidesLocked = !state.guidesLocked;
    saveState();
  }

  /* ---------- Render: overlay layers ---------- */
  function renderOverlays() {
    if (!container) createContainer();
    container.innerHTML = '';

    renderGuides();

    if (!state.allVisible) return;
    if (state.selectedLayerIndex < 0) return;

    const layer = state.layers[state.selectedLayerIndex];
    const index = state.selectedLayerIndex;

    if (!layer || !layer.visible || !layer.imageData) return;

    const img = document.createElement('img');
    img.src = layer.imageData;
    img.className = 'pp-layer-img';
    img.dataset.index = index;
    img.draggable = false;
    img.alt = '';

    img.style.setProperty('opacity', layer.opacity, 'important');

    if (layer.inverted) {
      img.style.setProperty('filter', 'invert(100%)', 'important');
    } else {
      img.style.removeProperty('filter');
    }

    const applyStyles = () => {
      const naturalW = img.naturalWidth || layer.naturalWidth || 0;
      const naturalH = img.naturalHeight || layer.naturalHeight || 0;
      const scale = layer.scale || 1;

      img.style.setProperty('width', naturalW + 'px', 'important');
      img.style.setProperty('height', naturalH + 'px', 'important');
      img.style.setProperty('transform', 'scale(' + scale + ')', 'important');

      if (layer.isNew) {
        layer.isNew = false;
        layer.naturalWidth = naturalW;
        layer.naturalHeight = naturalH;

        const vw = window.innerWidth;
        const sx = window.scrollX || 0;
        const sy = window.scrollY || 0;
        const iw = naturalW * scale;

        layer.offsetX = Math.round((vw - iw) / 2 + sx);
        layer.offsetY = sy;
        layer.fixedMigrated = true;
        layer.docMigrated = true;
        layer.origin = 'top';

        if (state.layers[index] && state.layers[index] !== layer) {
          state.layers[index].offsetX = layer.offsetX;
          state.layers[index].offsetY = layer.offsetY;
          state.layers[index].origin = layer.origin;
          state.layers[index].isNew = false;
          state.layers[index].naturalWidth = naturalW;
          state.layers[index].naturalHeight = naturalH;
          state.layers[index].fixedMigrated = true;
          state.layers[index].docMigrated = true;
        }
        saveState();
      }

      const currentLayer = state.layers[index] || layer;
      const left = currentLayer.offsetX || 0;
      const top = currentLayer.offsetY || 0;

      img.style.setProperty('left', left + 'px', 'important');
      img.style.setProperty('top', top + 'px', 'important');
    };

    if (img.complete && img.naturalWidth) {
      applyStyles();
    } else {
      img.addEventListener('load', applyStyles, { once: true });
    }

    if (!layer.locked) {
      img.classList.add('pp-draggable');
      img.addEventListener('mousedown', (e) => onLayerDragStart(e, index), true);
    }
    img.classList.add('pp-selected');
    container.appendChild(img);
  }

  /* ---------- Render: overlay guides ---------- */
  function renderGuides() {
    if (!guidesContainer) createGuidesContainer();
    guidesContainer.innerHTML = '';

    if (state.guidesVisible === false) return;

    const guides = state.guides || [];
    if (!guides.length) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let needsSave = false;
    guides.forEach((g) => {
      if (g.pos == null) {
        g.pos = g.axis === 'h' ? Math.round(vh / 2) : Math.round(vw / 2);
        needsSave = true;
      }
    });
    if (needsSave) persistState();

    const gs = state.guideStyle || {};
    const lineWidth = Math.max(1, Number(gs.width) || 1);
    const lineStyle = gs.style || 'dashed';
    const lineColor = gs.color || '#ff2a76';
    const locked = !!state.guidesLocked;

    const hGuides = guides.filter((g) => g.axis === 'h').slice().sort((a, b) => a.pos - b.pos);
    const vGuides = guides.filter((g) => g.axis === 'v').slice().sort((a, b) => a.pos - b.pos);

    guides.forEach((g) => {
      const el = document.createElement('div');
      el.className = 'pp-guide ' + (g.axis === 'h' ? 'pp-guide-h' : 'pp-guide-v');
      if (locked) el.classList.add('pp-guide-locked');
      el.dataset.guideId = g.id;

      if (g.axis === 'h') {
        el.style.setProperty('top', (g.pos - Math.floor(lineWidth / 2)) + 'px', 'important');
        el.style.setProperty('border-top', `${lineWidth}px ${lineStyle} ${lineColor}`, 'important');
      } else {
        el.style.setProperty('left', (g.pos - Math.floor(lineWidth / 2)) + 'px', 'important');
        el.style.setProperty('border-left', `${lineWidth}px ${lineStyle} ${lineColor}`, 'important');
      }

      const label = document.createElement('div');
      label.className = 'pp-guide-label';
      label.textContent = (g.axis === 'h' ? 'y: ' : 'x: ') + Math.round(g.pos) + 'px';
      label.style.setProperty('background', lineColor, 'important');
      if (g.axis === 'h') {
        label.style.setProperty('top', (g.pos + 4) + 'px', 'important');
        label.style.setProperty('left', '8px', 'important');
      } else {
        label.style.setProperty('left', (g.pos + 4) + 'px', 'important');
        label.style.setProperty('top', '8px', 'important');
      }

      if (!locked) {
        el.addEventListener('mousedown', (e) => onGuideDragStart(e, g.id));
      }
      guidesContainer.appendChild(el);
      guidesContainer.appendChild(label);
    });

    function addSpacingLabel(axis, list) {
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const cur = list[i];
        const gap = Math.abs(cur.pos - prev.pos);
        const mid = (prev.pos + cur.pos) / 2;
        const lab = document.createElement('div');
        lab.className = 'pp-guide-spacing';
        lab.style.setProperty('color', lineColor, 'important');
        lab.style.setProperty('border', `1px solid ${lineColor}`, 'important');
        if (axis === 'h') {
          lab.textContent = '↕ ' + Math.round(gap) + 'px';
          lab.style.setProperty('top', (mid - 9) + 'px', 'important');
          lab.style.setProperty('left', '40px', 'important');
        } else {
          lab.textContent = '↔ ' + Math.round(gap) + 'px';
          lab.style.setProperty('left', (mid - 24) + 'px', 'important');
          lab.style.setProperty('top', '40px', 'important');
        }
        guidesContainer.appendChild(lab);
      }
    }
    addSpacingLabel('h', hGuides);
    addSpacingLabel('v', vGuides);
  }

  /* ---------- Render: panel UI ---------- */
  function renderPanelUI() {
    if (!panelShadow) return;

    const count = state.layers.length;
    const layerCount = $p('#layerCount');
    const emptyHint = $p('#emptyHint');
    const layerGrid = $p('#layerGrid');
    if (layerCount) layerCount.textContent = count;
    if (emptyHint) emptyHint.style.display = count ? 'none' : '';

    if (layerGrid) {
      layerGrid.querySelectorAll('.pp-layer-item').forEach((el) => el.remove());

      state.layers.forEach((layer, idx) => {
        const item = document.createElement('div');
        item.className = 'pp-layer-item' + (idx === state.selectedLayerIndex ? ' selected' : '');
        item.addEventListener('click', () => selectLayer(idx));

        const thumb = document.createElement('img');
        thumb.className = 'pp-layer-thumb';
        thumb.src = layer.imageData;
        thumb.alt = layer.name;

        const name = document.createElement('span');
        name.className = 'pp-layer-name';
        name.textContent = layer.name;

        item.appendChild(thumb);

        if (layer.locked) {
          const badge = document.createElement('span');
          badge.className = 'pp-layer-badge';
          badge.textContent = '🔒';
          item.appendChild(badge);
        }
        if (!layer.visible) {
          const badge = document.createElement('span');
          badge.className = 'pp-layer-badge';
          badge.style.top = layer.locked ? '20px' : '2px';
          badge.textContent = '👁';
          badge.style.textDecoration = 'line-through';
          item.appendChild(badge);
        }

        const deleteIcon = document.createElement('span');
        deleteIcon.className = 'pp-layer-delete-icon';
        deleteIcon.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        deleteIcon.title = 'Delete layer';
        deleteIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteLayerByIndex(idx);
        });
        item.appendChild(deleteIcon);

        item.appendChild(name);
        layerGrid.appendChild(item);
      });
    }

    const layerControls = $p('#layerControls');
    const layer = selectedLayer();
    if (layer) {
      if (layerControls) layerControls.classList.add('visible');

      const btnShow = $p('#btnShow');
      const btnLock = $p('#btnLock');
      const btnInvert = $p('#btnInvert');
      if (btnShow) btnShow.classList.toggle('pp-ctrl-active', layer.visible);
      if (btnLock) btnLock.classList.toggle('pp-ctrl-active', layer.locked);
      if (btnInvert) btnInvert.classList.toggle('pp-ctrl-active', !!layer.inverted);

      $$p('.pp-arrow-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.origin === layer.origin);
      });

      const inputX = $p('#inputX');
      const inputY = $p('#inputY');
      const inputScale = $p('#inputScale');
      const opacitySlider = $p('#opacitySlider');
      const opacityValue = $p('#opacityValue');

      // Don't clobber a value the user is actively editing.
      const focused = panelShadow.activeElement;
      if (inputX && focused !== inputX) inputX.value = layer.offsetX;
      if (inputY && focused !== inputY) inputY.value = layer.offsetY;
      if (inputScale && focused !== inputScale) inputScale.value = layer.scale;

      if (opacitySlider && focused !== opacitySlider) {
        opacitySlider.value = Math.round(layer.opacity * 100);
        updateOpacitySliderTrack();
      }
      if (opacityValue) opacityValue.textContent = Math.round(layer.opacity * 100) + '%';
    } else {
      if (layerControls) layerControls.classList.remove('visible');
    }

    renderPanelGuides();
  }

  function renderPanelGuides() {
    if (!panelShadow) return;

    const btnGuidesShow = $p('#btnGuidesShow');
    const btnGuidesLock = $p('#btnGuidesLock');
    if (btnGuidesShow) btnGuidesShow.classList.toggle('pp-ctrl-active', state.guidesVisible !== false);
    if (btnGuidesLock) btnGuidesLock.classList.toggle('pp-ctrl-active', !!state.guidesLocked);

    const gs = state.guideStyle || { width: 1, style: 'dashed', color: '#ff2a76' };
    const guideWidthSel = $p('#guideWidth');
    const guideStyleSel = $p('#guideStyle');
    const guideColorCustom = $p('#guideColorCustom');
    if (guideWidthSel) guideWidthSel.value = String(gs.width);
    if (guideStyleSel) guideStyleSel.value = gs.style;
    $$p('.pp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', (sw.dataset.color || '').toLowerCase() === (gs.color || '').toLowerCase());
    });
    if (guideColorCustom && gs.color) guideColorCustom.value = gs.color;

    const guides = state.guides || [];
    const guideCount = $p('#guideCount');
    const guidesEmptyHint = $p('#guidesEmptyHint');
    const guideList = $p('#guideList');
    if (guideCount) guideCount.textContent = guides.length;
    if (guidesEmptyHint) guidesEmptyHint.style.display = guides.length ? 'none' : '';
    if (!guideList) return;

    guideList.querySelectorAll('.pp-guide-item').forEach((el) => el.remove());

    guides.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'pp-guide-item';

      const axis = document.createElement('span');
      axis.className = 'pp-guide-axis';
      axis.textContent = g.axis === 'h' ? 'H' : 'V';

      const pos = document.createElement('span');
      pos.className = 'pp-guide-pos';
      pos.textContent = g.pos == null ? '— centered —' : `${g.axis === 'h' ? 'y' : 'x'} = ${Math.round(g.pos)}px`;

      const del = document.createElement('button');
      del.className = 'pp-guide-delete';
      del.title = 'Delete guide';
      del.textContent = '×';
      del.addEventListener('click', () => deleteGuideById(g.id));

      row.appendChild(axis);
      row.appendChild(pos);
      row.appendChild(del);
      guideList.appendChild(row);
    });
  }

  /* ---------- Guide drag (overlay side) ---------- */
  function onGuideDragStart(e, guideId) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingGuide = true;
    dragGuideId = guideId;
    const el = guidesContainer.querySelector(`.pp-guide[data-guide-id="${guideId}"]`);
    if (el) el.classList.add('pp-dragging');
    document.addEventListener('mousemove', onGuideDragMove, true);
    document.addEventListener('mouseup', onGuideDragEnd, true);
  }

  function onGuideDragMove(e) {
    if (!isDraggingGuide || !dragGuideId) return;
    const guide = (state.guides || []).find((g) => g.id === dragGuideId);
    if (!guide) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (guide.axis === 'h') {
      guide.pos = Math.max(0, Math.min(vh, e.clientY));
    } else {
      guide.pos = Math.max(0, Math.min(vw, e.clientX));
    }
    renderGuides();
  }

  function onGuideDragEnd() {
    if (!isDraggingGuide) return;
    isDraggingGuide = false;
    dragGuideId = null;
    document.removeEventListener('mousemove', onGuideDragMove, true);
    document.removeEventListener('mouseup', onGuideDragEnd, true);
    saveState();
  }

  /* ---------- Layer drag (overlay side) ---------- */
  function onLayerDragStart(e, index) {
    const layer = state.layers[index];
    if (!layer || layer.locked) return;

    e.preventDefault();
    e.stopPropagation();

    isDragging = true;
    dragLayerIndex = index;
    dragStartX = e.clientX + (window.scrollX || 0);
    dragStartY = e.clientY + (window.scrollY || 0);
    dragLayerOffsetX = layer.offsetX || 0;
    dragLayerOffsetY = layer.offsetY || 0;

    if (state.selectedLayerIndex !== index) {
      state.selectedLayerIndex = index;
      container.querySelectorAll('.pp-layer-img').forEach((el) => el.classList.remove('pp-selected'));
      const activeImg = container.querySelector(`img[data-index="${index}"]`);
      if (activeImg) activeImg.classList.add('pp-selected');
    }

    const dragImg = container.querySelector(`img[data-index="${index}"]`);

    const onMove = (ev) => {
      if (!isDragging) return;
      const dx = (ev.clientX + (window.scrollX || 0)) - dragStartX;
      const dy = (ev.clientY + (window.scrollY || 0)) - dragStartY;
      const newX = dragLayerOffsetX + dx;
      const newY = dragLayerOffsetY + dy;
      state.layers[dragLayerIndex].offsetX = newX;
      state.layers[dragLayerIndex].offsetY = newY;
      if (dragImg) {
        dragImg.style.setProperty('left', newX + 'px', 'important');
        dragImg.style.setProperty('top', newY + 'px', 'important');
      }
    };

    const onUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      saveState();
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  }

  /* ---------- Keyboard ---------- */
  function setupKeyboard() {
    document.addEventListener(
      'keydown',
      (e) => {
        const mod = e.metaKey || e.ctrlKey;

        // Cmd/Ctrl + Alt + S — guides tab toggles guides visibility, else layer.
        if (mod && e.altKey && !e.shiftKey && e.code === 'KeyS') {
          e.preventDefault();
          if (activeTab === 'guides') toggleGuidesVisible();
          else toggleSelectedShow();
          return;
        }
        if (mod && e.altKey && !e.shiftKey && e.code === 'KeyC') {
          e.preventDefault();
          if (activeTab === 'guides') toggleGuidesLocked();
          else toggleSelectedLock();
          return;
        }

        if (e.altKey && !mod && e.code === 'KeyS') {
          e.preventDefault();
          toggleSelectedShow();
          return;
        }
        if (e.altKey && !mod && e.code === 'KeyC') {
          e.preventDefault();
          toggleSelectedLock();
          return;
        }
        if (e.altKey && !mod && e.code === 'KeyI') {
          e.preventDefault();
          toggleSelectedInvert();
          return;
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          // Let the Scale input's native up/down work when it's focused.
          const ae = panelShadow ? panelShadow.activeElement : null;
          if (ae && ae.id === 'inputScale') return;

          const layer = selectedLayer();
          if (!layer) return;
          if (!state.allVisible || !layer.visible) return;

          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowUp') layer.offsetY = (layer.offsetY || 0) - step;
          if (e.key === 'ArrowDown') layer.offsetY = (layer.offsetY || 0) + step;
          if (e.key === 'ArrowLeft') layer.offsetX = (layer.offsetX || 0) - step;
          if (e.key === 'ArrowRight') layer.offsetX = (layer.offsetX || 0) + step;
          saveState();
        }
      },
      true
    );
  }

  /* ---------- Resize ---------- */
  window.addEventListener('resize', () => renderOverlays());

  /* ---------- Bootstrap ---------- */
  function start() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn('GET_TAB_ID failed:', chrome.runtime.lastError.message);
    } else if (res && res.tabId) {
      STORAGE_KEY = 'pp_data_' + res.tabId;
    }
    start();
  });
})();
