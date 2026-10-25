let nativePort = null;
let lastTabId = null;
let connecting = false;

function sendToTab(tabId, message) {
  if (typeof tabId !== 'number') return;
  chrome.tabs.sendMessage(tabId, { type: 'WOL_NATIVE_RESULT', data: message }).catch(() => {});
}
function connectNative(tabId) {
  lastTabId = tabId;
  if (nativePort) return true;
  if (connecting) return false;
  connecting = true;
  try {
    nativePort = chrome.runtime.connectNative('com.walkoflife.music');
    nativePort.onMessage.addListener((message) => sendToTab(lastTabId, message));
    nativePort.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message || 'The Mac helper disconnected.';
      nativePort = null;
      connecting = false;
      sendToTab(lastTabId, { ok: false, error });
    });
    connecting = false;
    nativePort.postMessage({ action: 'status' });
    return true;
  } catch (error) {
    nativePort = null;
    connecting = false;
    sendToTab(tabId, { ok: false, error: String(error) });
    return false;
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (message?.type === 'WOL_CONNECT') {
    const ok = connectNative(tabId);
    sendResponse({ ok });
    return true;
  }
  if (message?.type === 'WOL_ITUNES_LOOKUP') {
    const term = [message.track, message.artist, message.album].filter(Boolean).join(' ');
    const url = 'https://itunes.apple.com/search?media=music&entity=song&limit=8&term=' + encodeURIComponent(term);
    fetch(url)
      .then(r => r.json())
      .then(json => {
        const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const results = Array.isArray(json.results) ? json.results : [];
        const best = results.find(x => norm(x.trackName) === norm(message.track) && (!message.artist || norm(x.artistName) === norm(message.artist)))
          || results.find(x => norm(x.trackName) === norm(message.track))
          || results[0];
        sendToTab(tabId, { ok: true, lookup: true, track: message.track, artist: message.artist, artwork: best ? (best.artworkUrl100 || '').replace('100x100bb', '600x600bb') : '' });
      })
      .catch(() => sendToTab(tabId, { ok: true, lookup: true, track: message.track, artist: message.artist, artwork: '' }));
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'WOL_NATIVE_ACTION') {
    if (!nativePort) {
      sendResponse({ ok: false, error: 'Not connected yet. Press Connect Apple Music first.' });
      return true;
    }
    lastTabId = tabId;
    nativePort.postMessage({ action: message.action });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'WOL_DISCONNECT') {
    if (nativePort) {
      try { nativePort.disconnect(); } catch (_) {}
      nativePort = null;
    }
    connecting = false;
    sendResponse({ ok: true });
    return true;
  }
});
