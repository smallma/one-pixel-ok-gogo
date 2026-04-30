/* ========================================
   onePixelOkGogo Overlay — Content Script
   Handles overlay rendering, drag, keyboard
   ======================================== */
(function () {
  'use strict';

  let STORAGE_KEY = 'pp_data';

  let state = {
    layers: [],
    selectedLayerIndex: -1,
    allVisible: true,
  };

  let container = null;
  let guidesContainer = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragLayerOffsetX = 0;
  let dragLayerOffsetY = 0;
  let dragLayerIndex = -1;
  // Guide drag state
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
    window.addEventListener('resize', () => {
      if (!isDraggingGuide) renderGuides();
    });
  }

  function createContainer() {
    // Remove any existing container first (e.g. after extension reload)
    const existing = document.getElementById('pp-overlay-container');
    if (existing) existing.remove();

    container = document.createElement('div');
    container.id = 'pp-overlay-container';
    // Append to documentElement (html tag) to avoid body stacking issues
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
        state = data[STORAGE_KEY];
      }
      migrateLayersToFixed();
      renderOverlays();
    });
  }

  // One-time migration: layers were absolute (document-relative), now fixed
  // (viewport-relative). Old offsetY may be a large value (e.g. 4528 from a
  // scrolled page) that lands far below the visible viewport. Reset such
  // layers to "horizontally centered, top edge at viewport top" so they
  // remain usable.
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
    if (changed) saveState();
  }

  function saveState() {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      if (chrome.runtime.lastError) return;
      // Notify popup to refresh its UI
      try {
        chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
      } catch (_) {}
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
        if (panelContainer) {
          panelContainer.classList.add('pp-hidden');
        }
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
      // Image not decoded yet — retry once it is, otherwise we'd center against 0×0.
      img.addEventListener('load', () => alignLayer(originStr, targetLayerIndex), { once: true });
      return;
    }
    layer.naturalWidth = naturalW;
    layer.naturalHeight = naturalH;
    const scale = layer.scale || 1;
    const iw = naturalW * scale;
    const ih = naturalH * scale;
    // Layers are fixed to the viewport, so positions are viewport-relative
    // (no scroll offset). Same basis as guides → centers always coincide.
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = 0;
    let top = 0;

    const centerX = (vw - iw) / 2;
    const centerY = (vh - ih) / 2;

    // top/bottom only change Y (X stays put); left/right only change X (Y stays put);
    // center recenters horizontally always, vertically only if layer fits.
    const currentX = layer.offsetX !== undefined ? layer.offsetX : centerX;
    const currentY = layer.offsetY !== undefined ? layer.offsetY : 0;

    switch (originStr || 'top') {
      case 'top':
        left = currentX;
        top = 0;
        break;
      case 'bottom':
        left = currentX;
        top = vh - ih;
        break;
      case 'left':
        left = 0;
        top = currentY;
        break;
      case 'right':
        left = vw - iw;
        top = currentY;
        break;
      case 'center':
      default:
        left = centerX;
        top = (ih <= vh) ? centerY : currentY;
        break;
    }

    layer.offsetX = Math.round(left);
    layer.offsetY = Math.round(top);
    layer.origin = originStr; // store it just for UI highlighting
    saveState();
  }

  /* ---------- Panel UI ---------- */
  let panelContainer = null;
  let panelDragStartX = 0;
  let panelDragStartY = 0;
  let panelStartLeft = 0;
  let panelStartTop = 0;

  function togglePanel() {
    if (!panelContainer) {
      createPanel();
    }
    panelContainer.classList.toggle('pp-hidden');
  }

  function createPanel() {
    panelContainer = document.createElement('div');
    panelContainer.id = 'pp-panel-container';
    panelContainer.classList.add('pp-hidden');

    const header = document.createElement('div');
    header.id = 'pp-panel-drag-header';
    panelContainer.appendChild(header);

    const iframe = document.createElement('iframe');
    iframe.id = 'pp-panel-iframe';
    iframe.src = chrome.runtime.getURL('popup.html');
    iframe.allow = 'clipboard-read; clipboard-write';
    panelContainer.appendChild(iframe);

    document.documentElement.appendChild(panelContainer);

    // Panel dragging
    let isDraggingPanel = false;
    header.addEventListener('mousedown', (e) => {
      isDraggingPanel = true;
      panelDragStartX = e.clientX;
      panelDragStartY = e.clientY;
      const rect = panelContainer.getBoundingClientRect();
      panelStartLeft = rect.left;
      panelStartTop = rect.top;
      
      // Change to absolute positioning for drag to work properly
      panelContainer.style.right = 'auto';
      panelContainer.style.bottom = 'auto';
      panelContainer.style.left = panelStartLeft + 'px';
      panelContainer.style.top = panelStartTop + 'px';

      // Add transparent overlay to iframe to prevent it from eating mouse events during drag
      iframe.style.pointerEvents = 'none';
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
        iframe.style.pointerEvents = 'auto';
      }
    });
  }

  /* ---------- Storage change listener ---------- */
  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      // Only react to local storage changes from popup
      if (area !== 'local') return;
      if (!changes[STORAGE_KEY]) return;
      const newVal = changes[STORAGE_KEY].newValue;
      if (!newVal) return;
      
      state = newVal;
      
      // Prevent destroying DOM while dragging (layer or guide)
      if (!isDragging && !isDraggingGuide) {
        renderOverlays();
      }
    });
  }

  /* ---------- Render ---------- */
  function renderOverlays() {
    if (!container) createContainer();
    container.innerHTML = '';

    // Always re-render guides (they are independent of layers)
    renderGuides();

    // Only the selected layer is shown on the page
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

      // Opacity
      img.style.setProperty('opacity', layer.opacity, 'important');

      // Wait for image to load to get correct dimensions for positioning
      const applyStyles = () => {
        const naturalW = img.naturalWidth || layer.naturalWidth || 0;
        const naturalH = img.naturalHeight || layer.naturalHeight || 0;
        const scale = layer.scale || 1;

        // Set explicit size so CSS transform scale works correctly
        img.style.setProperty('width', naturalW + 'px', 'important');
        img.style.setProperty('height', naturalH + 'px', 'important');
        img.style.setProperty('transform', 'scale(' + scale + ')', 'important');

        // Initial setup for newly added layers — compute placement inline so we
        // don't depend on `state` not being swapped out by a concurrent storage
        // event between this call and the style write below.
        if (layer.isNew) {
          layer.isNew = false;
          layer.naturalWidth = naturalW;
          layer.naturalHeight = naturalH;

          const vw = window.innerWidth;
          const iw = naturalW * scale;

          // Default: horizontally centered on viewport, top edge at viewport top.
          // Layer is fixed-positioned, so coordinates are viewport-relative.
          layer.offsetX = Math.round((vw - iw) / 2);
          layer.offsetY = 0;
          layer.fixedMigrated = true;
          layer.origin = 'top';
          // Also write back to current `state.layers` in case `layer` is from a
          // stale reference (storage listener may have swapped state).
          if (state.layers[index] && state.layers[index] !== layer) {
            state.layers[index].offsetX = layer.offsetX;
            state.layers[index].offsetY = layer.offsetY;
            state.layers[index].origin = layer.origin;
            state.layers[index].isNew = false;
            state.layers[index].naturalWidth = naturalW;
            state.layers[index].naturalHeight = naturalH;
            state.layers[index].fixedMigrated = true;
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

      // Interactivity — unlocked layers are draggable
      if (!layer.locked) {
        img.classList.add('pp-draggable');
        img.addEventListener('mousedown', (e) => onDragStart(e, index), true);
      }

      // Always the selected layer — mark it
      img.classList.add('pp-selected');

      container.appendChild(img);
  }

  /* ---------- Guides render ---------- */
  function renderGuides() {
    if (!guidesContainer) createGuidesContainer();
    guidesContainer.innerHTML = '';

    // Visibility — empty container if hidden
    if (state.guidesVisible === false) return;

    const guides = state.guides || [];
    if (!guides.length) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Initialize null positions to viewport center, then persist them.
    let needsSave = false;
    guides.forEach((g) => {
      if (g.pos == null) {
        g.pos = g.axis === 'h' ? Math.round(vh / 2) : Math.round(vw / 2);
        needsSave = true;
      }
    });
    if (needsSave) saveState();

    // Pull global style with defaults
    const gs = state.guideStyle || {};
    const lineWidth = Math.max(1, Number(gs.width) || 1);
    const lineStyle = gs.style || 'dashed';
    const lineColor = gs.color || '#ff2a76';
    const locked = !!state.guidesLocked;

    // Sort by position to compute spacing between adjacent same-axis guides.
    const hGuides = guides.filter((g) => g.axis === 'h').slice().sort((a, b) => a.pos - b.pos);
    const vGuides = guides.filter((g) => g.axis === 'v').slice().sort((a, b) => a.pos - b.pos);

    // Render each guide line
    guides.forEach((g) => {
      const el = document.createElement('div');
      el.className = 'pp-guide ' + (g.axis === 'h' ? 'pp-guide-h' : 'pp-guide-v');
      if (locked) el.classList.add('pp-guide-locked');
      el.dataset.guideId = g.id;

      if (g.axis === 'h') {
        // Place line so its visual center sits exactly at g.pos
        el.style.setProperty('top', (g.pos - Math.floor(lineWidth / 2)) + 'px', 'important');
        el.style.setProperty('border-top', `${lineWidth}px ${lineStyle} ${lineColor}`, 'important');
      } else {
        el.style.setProperty('left', (g.pos - Math.floor(lineWidth / 2)) + 'px', 'important');
        el.style.setProperty('border-left', `${lineWidth}px ${lineStyle} ${lineColor}`, 'important');
      }

      // Position label (current px)
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

    // Spacing labels between adjacent same-axis guides
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

  /* ---------- Guide drag ---------- */
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

  /* ---------- Drag ---------- */
  function onDragStart(e, index) {
    const layer = state.layers[index];
    if (!layer || layer.locked) return;

    e.preventDefault();
    e.stopPropagation();

    isDragging = true;
    dragLayerIndex = index;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragLayerOffsetX = layer.offsetX || 0;
    dragLayerOffsetY = layer.offsetY || 0;

    // Select this layer visually without destroying the DOM
    if (state.selectedLayerIndex !== index) {
      state.selectedLayerIndex = index;
      container.querySelectorAll('.pp-layer-img').forEach(el => el.classList.remove('pp-selected'));
      const activeImg = container.querySelector(`img[data-index="${index}"]`);
      if (activeImg) activeImg.classList.add('pp-selected');
      // Save state to notify popup, but storage listener will ignore it because isDragging = true
      saveState();
    }

    // Prevent iframe from swallowing mouseup if user releases over the panel
    if (panelContainer) {
      const iframe = panelContainer.querySelector('iframe');
      if (iframe) iframe.style.pointerEvents = 'none';
    }

    const onMove = (ev) => {
      if (!isDragging) return;
      const dx = ev.clientX - dragStartX;
      const dy = ev.clientY - dragStartY;
      const newX = dragLayerOffsetX + dx;
      const newY = dragLayerOffsetY + dy;
      
      state.layers[dragLayerIndex].offsetX = newX;
      state.layers[dragLayerIndex].offsetY = newY;
      
      // Update DOM directly for smooth dragging without full re-render
      const img = container.querySelector(`img[data-index="${dragLayerIndex}"]`);
      if (img) {
        img.style.setProperty('left', newX + 'px', 'important');
        img.style.setProperty('top', newY + 'px', 'important');
      }
    };

    const onUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      
      // Restore iframe pointer events
      if (panelContainer) {
        const iframe = panelContainer.querySelector('iframe');
        if (iframe) iframe.style.pointerEvents = 'auto';
      }
      
      saveState();
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  }

  /* ---------- Keyboard ---------- */
  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Alt + S → toggle visibility on selected layer
      if (e.altKey && e.code === 'KeyS') {
        e.preventDefault();
        const layer = state.layers[state.selectedLayerIndex];
        if (layer) {
          layer.visible = !layer.visible;
          saveState();
          renderOverlays();
        }
        return;
      }

      // Alt + C → toggle lock on selected layer
      if (e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        const layer = state.layers[state.selectedLayerIndex];
        if (layer) {
          layer.locked = !layer.locked;
          saveState();
          renderOverlays();
        }
        return;
      }

      // Arrow keys → move selected layer
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const layer = state.layers[state.selectedLayerIndex];
        if (!layer) return;
        if (!state.allVisible || !layer.visible) return;

        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;

        if (e.key === 'ArrowUp') layer.offsetY = (layer.offsetY || 0) - step;
        if (e.key === 'ArrowDown') layer.offsetY = (layer.offsetY || 0) + step;
        if (e.key === 'ArrowLeft') layer.offsetX = (layer.offsetX || 0) - step;
        if (e.key === 'ArrowRight') layer.offsetX = (layer.offsetX || 0) + step;

        saveState();
        renderOverlays();
      }
    }, true); // capture phase so it works even when a page element has focus
  }

  /* ---------- Window resize → recalc positions ---------- */
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
