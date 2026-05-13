// onePixelOkGogo Overlay — Background Service Worker

const DEFAULT_STATE = {
  layers: [],
  selectedLayerIndex: -1,
  allVisible: true
};

// Force-apply updates the moment Chrome finishes downloading them.
// Without this, the new version only kicks in after Chrome decides to unload
// the service worker (can be hours). After reload, onInstalled fires with
// reason "update" and re-injects the new content script into open tabs.
chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.runtime.reload();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('pp_data', (data) => {
    if (!data.pp_data) {
      chrome.storage.local.set({ pp_data: DEFAULT_STATE });
    }
  });

  // Inject content script + CSS into already-open tabs so the extension works
  // without requiring a page reload after install / update.
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (/^(chrome|edge|about|chrome-extension|devtools|file|view-source):/i.test(tab.url)) continue;
      chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css'],
      }).catch(() => {});
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      }).catch(() => {});
    }
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' }).catch(() => {});
  }
});

// Relay messages between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab?.id });
    return false;
  }
  if (message.type === 'NOTIFY_CONTENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RENDER' }).catch(() => {});
      }
    });
  }
  if (message.type === 'NOTIFY_POPUP') {
    // Popup listens via chrome.runtime.onMessage — this is a broadcast
  }
  return false;
});

// Clean up isolated tab state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove('pp_data_' + tabId);
});
