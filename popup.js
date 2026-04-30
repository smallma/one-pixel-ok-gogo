/* ========================================
   onePixelOkGogo Overlay — Popup Logic
   ======================================== */
(function () {
  'use strict';

  let STORAGE_KEY = 'pp_data';
  const MAX_LAYERS = 50;

  let state = {
    layers: [],
    selectedLayerIndex: -1,
    allVisible: true,
    guides: [], // [{ id, axis: 'h'|'v', pos: number }] — pos is viewport-relative px
    guidesVisible: true,
    guidesLocked: false,
    guideStyle: { width: 1, style: 'dashed', color: '#ff2a76' },
  };

  let activeTab = 'layers';

  /* ---------- DOM refs ---------- */
  const $ = (sel) => document.querySelector(sel);
  const fileInput = $('#fileInput');
  const layerGrid = $('#layerGrid');
  const layerCount = $('#layerCount');
  const emptyHint = $('#emptyHint');
  const layerControls = $('#layerControls');
  const btnUpload = $('#btnUpload');
  const btnPaste = $('#btnPaste');
  const btnShow = $('#btnShow');
  const btnLock = $('#btnLock');
  const btnReset = $('#btnReset');
  const btnDelete = $('#btnDelete');
  const btnClose = $('#btnClose');
  const dropZone = $('#dropZone');
  const inputX = $('#inputX');
  const inputY = $('#inputY');
  const inputScale = $('#inputScale');
  const opacitySlider = $('#opacitySlider');
  const opacityValue = $('#opacityValue');
  const btnAddH = $('#btnAddH');
  const btnAddV = $('#btnAddV');
  const btnClearGuides = $('#btnClearGuides');
  const guideList = $('#guideList');
  const guideCount = $('#guideCount');
  const guidesEmptyHint = $('#guidesEmptyHint');
  const btnGuidesShow = $('#btnGuidesShow');
  const btnGuidesLock = $('#btnGuidesLock');
  const guideWidthSel = $('#guideWidth');
  const guideStyleSel = $('#guideStyle');
  const guideColorCustom = $('#guideColorCustom');

  /* ---------- Init ---------- */
  chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn('GET_TAB_ID failed:', chrome.runtime.lastError.message);
    } else if (res && res.tabId) {
      STORAGE_KEY = 'pp_data_' + res.tabId;
    }
    loadState();
    bindEvents();
    listenForContentMessages();
  });

  /* ---------- State I/O ---------- */
  function loadState() {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      if (data[STORAGE_KEY]) {
        state = { ...state, ...data[STORAGE_KEY] };
      }
      renderUI();
    });
  }

  function saveState(notify = true) {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      if (notify) notifyContent();
    });
  }

  function notifyContent() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RENDER' }).catch(() => {});
      }
    });
  }

  /* ---------- Listen for content script updates (drag, keyboard) ---------- */
  function listenForContentMessages() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATED') {
        chrome.storage.local.get(STORAGE_KEY, (data) => {
          if (data[STORAGE_KEY]) {
            state = { ...state, ...data[STORAGE_KEY] };
            renderUI();
          }
        });
      }
    });
  }

  /* ---------- Events ---------- */
  function bindEvents() {
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    btnPaste.addEventListener('click', handlePaste);
    
    // Global paste event (supports Cmd+V / Ctrl+V)
    document.addEventListener('paste', (e) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        addImagesFromFiles(e.clipboardData.files);
      }
    });
    btnShow.addEventListener('click', toggleShow);
    btnLock.addEventListener('click', toggleLock);
    btnReset.addEventListener('click', resetPosition);
    btnDelete.addEventListener('click', deleteLayer);

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'CLOSE_PANEL' }).catch(() => {});
          }
        });
      });
    }

    // Global spatial keyboard shortcuts for the popup (mirrors content.js)
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;

      // Option+Cmd/Ctrl+S — toggle show on active tab (Guides tab → guides)
      if (mod && e.altKey && !e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        if (activeTab === 'guides') toggleGuidesVisible();
        else toggleShow();
        return;
      }
      // Option+Cmd/Ctrl+C — toggle lock on active tab (Guides tab → guides)
      if (mod && e.altKey && !e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        if (activeTab === 'guides') toggleGuidesLocked();
        else toggleLock();
        return;
      }
      // Legacy: Alt+S / Alt+C still work for layers
      if (e.altKey && !mod && e.code === 'KeyS') {
        e.preventDefault();
        toggleShow();
        return;
      }
      if (e.altKey && !mod && e.code === 'KeyC') {
        e.preventDefault();
        toggleLock();
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // If focused on Scale, let native up/down work (or we can override it, but usually scale needs up/down)
        // Wait, if we prevent default, scale input up/down won't work. Let's exclude scale input if it's focused.
        if (document.activeElement === inputScale) return;

        const layer = state.layers[state.selectedLayerIndex];
        if (!layer) return;

        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;

        if (e.key === 'ArrowUp') layer.offsetY = (layer.offsetY || 0) - step;
        if (e.key === 'ArrowDown') layer.offsetY = (layer.offsetY || 0) + step;
        if (e.key === 'ArrowLeft') layer.offsetX = (layer.offsetX || 0) - step;
        if (e.key === 'ArrowRight') layer.offsetX = (layer.offsetX || 0) + step;

        saveState();
        renderUI();
      }
    });

    inputX.addEventListener('input', () => updateOffset('offsetX', Number(inputX.value)));
    inputY.addEventListener('input', () => updateOffset('offsetY', Number(inputY.value)));
    
    inputScale.addEventListener('input', () => {
      const val = parseFloat(inputScale.value);
      if (!isNaN(val) && val >= 0.001) updateOffset('scale', Math.round(val * 1000) / 1000);
    });

    opacitySlider.addEventListener('input', handleOpacity);

    // Origin arrow buttons
    document.querySelectorAll('.pp-arrow-btn').forEach((btn) => {
      btn.addEventListener('click', () => setOrigin(btn.dataset.origin));
    });

    // Drag & Drop on popup
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('active');
    });
    document.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !document.contains(e.relatedTarget)) {
        dropZone.classList.remove('active');
      }
    });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('active');
      const files = e.dataTransfer.files;
      if (files.length) addImagesFromFiles(files);
    });

    // Tab switching
    document.querySelectorAll('.pp-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Guides
    if (btnAddH) btnAddH.addEventListener('click', () => addGuide('h'));
    if (btnAddV) btnAddV.addEventListener('click', () => addGuide('v'));
    if (btnClearGuides) btnClearGuides.addEventListener('click', clearGuides);
    if (btnGuidesShow) btnGuidesShow.addEventListener('click', toggleGuidesVisible);
    if (btnGuidesLock) btnGuidesLock.addEventListener('click', toggleGuidesLocked);

    // Style controls
    if (guideWidthSel) guideWidthSel.addEventListener('change', () => {
      state.guideStyle = { ...state.guideStyle, width: Number(guideWidthSel.value) };
      saveState();
    });
    if (guideStyleSel) guideStyleSel.addEventListener('change', () => {
      state.guideStyle = { ...state.guideStyle, style: guideStyleSel.value };
      saveState();
    });
    document.querySelectorAll('.pp-color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        state.guideStyle = { ...state.guideStyle, color: sw.dataset.color };
        saveState();
        renderUI();
      });
    });
    if (guideColorCustom) guideColorCustom.addEventListener('input', () => {
      state.guideStyle = { ...state.guideStyle, color: guideColorCustom.value };
      saveState();
      renderUI();
    });
  }

  function toggleGuidesVisible() {
    state.guidesVisible = !state.guidesVisible;
    saveState();
    renderUI();
  }

  function toggleGuidesLocked() {
    state.guidesLocked = !state.guidesLocked;
    saveState();
    renderUI();
  }

  /* ---------- Tabs ---------- */
  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('.pp-tab').forEach((t) => {
      t.classList.toggle('pp-tab-active', t.dataset.tab === name);
    });
    document.querySelectorAll('.pp-tab-panel').forEach((p) => {
      p.classList.toggle('pp-tab-panel-active', p.id === 'tab' + name.charAt(0).toUpperCase() + name.slice(1));
    });
  }

  /* ---------- Guides ---------- */
  function addGuide(axis) {
    if (!state.guides) state.guides = [];
    // Use sentinel `null` for pos — content.js will replace with viewport center
    // on first render so we don't have to ask for the viewport from here.
    state.guides.push({ id: crypto.randomUUID(), axis, pos: null });
    saveState();
    renderUI();
  }

  function deleteGuide(id) {
    state.guides = (state.guides || []).filter((g) => g.id !== id);
    saveState();
    renderUI();
  }

  function clearGuides() {
    if (!state.guides || !state.guides.length) return;
    state.guides = [];
    saveState();
    renderUI();
  }

  /* ---------- File / Paste handlers ---------- */
  function handleFileSelect(e) {
    addImagesFromFiles(e.target.files);
    fileInput.value = '';
  }

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

  async function handlePaste() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
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
      }
    } catch (err) {
      console.warn('Paste failed:', err);
    }
  }

  /* ---------- Layer CRUD ---------- */
  function addLayer(opts) {
    if (state.layers.length >= MAX_LAYERS) return;

    const layer = {
      id: crypto.randomUUID(),
      name: opts.name || 'Untitled',
      imageData: opts.imageData,
      naturalWidth: opts.naturalWidth,
      naturalHeight: opts.naturalHeight,
      visible: true,
      locked: false,
      opacity: 1,
      origin: 'top',
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      isNew: true,
    };

    state.layers.push(layer);
    state.selectedLayerIndex = state.layers.length - 1;
    saveState();
    renderUI();
  }

  function deleteLayer() {
    const idx = state.selectedLayerIndex;
    if (idx < 0 || idx >= state.layers.length) return;
    state.layers.splice(idx, 1);
    state.selectedLayerIndex = state.layers.length ? Math.min(idx, state.layers.length - 1) : -1;
    saveState();
    renderUI();
  }

  function deleteLayerByIndex(idx) {
    if (idx < 0 || idx >= state.layers.length) return;
    state.layers.splice(idx, 1);
    state.selectedLayerIndex = state.layers.length ? Math.min(state.selectedLayerIndex, state.layers.length - 1) : -1;
    saveState();
    renderUI();
  }

  function selectLayer(idx) {
    state.selectedLayerIndex = idx;
    saveState();
    renderUI();
  }

  /* ---------- Layer property updates ---------- */
  function toggleShow() {
    const layer = selectedLayer();
    if (!layer) return;
    layer.visible = !layer.visible;
    saveState();
    renderUI();
  }

  function toggleLock() {
    const layer = selectedLayer();
    if (!layer) return;
    layer.locked = !layer.locked;
    saveState();
    renderUI();
  }

  function setOrigin(origin) {
    const layer = selectedLayer();
    if (!layer) return;
    
    // Instead of doing origin math here, we tell content.js to calculate 
    // the absolute document coordinates based on the viewport and save it.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ALIGN_ORIGIN', origin: origin }).catch(() => {});
      }
    });
  }

  function resetPosition() {
    const layer = selectedLayer();
    if (!layer) return;
    layer.offsetX = 0;
    layer.offsetY = 0;
    layer.scale = 1;
    saveState();
    renderUI();
  }

  function updateOffset(key, value) {
    const layer = selectedLayer();
    if (!layer) return;
    layer[key] = value;
    saveState();
    renderUI();
  }

  function handleOpacity() {
    const layer = selectedLayer();
    if (!layer) return;
    layer.opacity = opacitySlider.value / 100;
    opacityValue.textContent = opacitySlider.value + '%';
    updateSliderTrack();
    saveState(true);
  }

  /* ---------- Helpers ---------- */
  function selectedLayer() {
    return state.layers[state.selectedLayerIndex] || null;
  }

  function updateSliderTrack() {
    opacitySlider.style.setProperty('--slider-pct', opacitySlider.value + '%');
  }

  /* ---------- Render ---------- */
  function renderUI() {
    const count = state.layers.length;
    layerCount.textContent = count;
    emptyHint.style.display = count ? 'none' : '';

    // Render layer thumbnails
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

      // Badges
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

      // Delete icon
      const deleteIcon = document.createElement('span');
      deleteIcon.className = 'pp-layer-delete-icon';
      deleteIcon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      deleteIcon.title = 'Delete layer';
      deleteIcon.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent selecting the layer
        deleteLayerByIndex(idx);
      });
      item.appendChild(deleteIcon);

      item.appendChild(name);
      layerGrid.appendChild(item);
    });

    // Show/hide controls
    const layer = selectedLayer();
    if (layer) {
      layerControls.classList.add('visible');

      // Show button
      btnShow.classList.toggle('pp-ctrl-active', layer.visible);
      // Lock button
      btnLock.classList.toggle('pp-ctrl-active', layer.locked);

      // Origin arrows
      document.querySelectorAll('.pp-arrow-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.origin === layer.origin);
      });

      // Inputs
      inputX.value = layer.offsetX;
      inputY.value = layer.offsetY;
      inputScale.value = layer.scale;

      // Opacity
      opacitySlider.value = Math.round(layer.opacity * 100);
      opacityValue.textContent = Math.round(layer.opacity * 100) + '%';
      updateSliderTrack();
    } else {
      layerControls.classList.remove('visible');
    }

    renderGuides();
  }

  function renderGuides() {
    if (!guideList) return;

    // Show/Lock buttons
    if (btnGuidesShow) btnGuidesShow.classList.toggle('pp-ctrl-active', state.guidesVisible !== false);
    if (btnGuidesLock) btnGuidesLock.classList.toggle('pp-ctrl-active', !!state.guidesLocked);

    // Style selects
    const gs = state.guideStyle || { width: 1, style: 'dashed', color: '#ff2a76' };
    if (guideWidthSel) guideWidthSel.value = String(gs.width);
    if (guideStyleSel) guideStyleSel.value = gs.style;
    document.querySelectorAll('.pp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.dataset.color.toLowerCase() === (gs.color || '').toLowerCase());
    });
    if (guideColorCustom && gs.color) guideColorCustom.value = gs.color;

    const guides = state.guides || [];
    guideCount.textContent = guides.length;
    guidesEmptyHint.style.display = guides.length ? 'none' : '';

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
      del.addEventListener('click', () => deleteGuide(g.id));

      row.appendChild(axis);
      row.appendChild(pos);
      row.appendChild(del);
      guideList.appendChild(row);
    });
  }
})();
