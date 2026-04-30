// PerfectPixel Overlay — Background Service Worker

const DEFAULT_STATE = {
  layers: [],
  selectedLayerIndex: -1,
  allVisible: true
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('pp_data', (data) => {
    if (!data.pp_data) {
      chrome.storage.local.set({ pp_data: DEFAULT_STATE });
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
