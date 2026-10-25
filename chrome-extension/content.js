(() => {
  if (window.__wolAppleMusicBridgeLoaded) return;
  window.__wolAppleMusicBridgeLoaded = true;

  const style = document.createElement('style');
  style.textContent = `
    #wol-bridge-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(340px,calc(100vw - 32px));font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff;background:#142b43;border:1px solid #80bce8;border-radius:16px;box-shadow:0 12px 35px #0007;overflow:hidden}
    #wol-bridge-panel *{box-sizing:border-box} #wol-bridge-panel .wol-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#0a1c2d;font-weight:800}
    #wol-bridge-panel .wol-body{padding:14px} #wol-bridge-panel p{margin:0 0 10px} #wol-bridge-panel .wol-muted{color:#c7d9e7;font-size:12px}
    #wol-bridge-panel button{font:inherit;border:0;border-radius:9px;padding:9px 11px;cursor:pointer;font-weight:700} #wol-bridge-panel .wol-primary{background:#ffe69a;color:#182b42} #wol-bridge-panel .wol-secondary{background:#31506a;color:#fff}
    #wol-bridge-panel .wol-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px} #wol-bridge-panel .wol-status{font-size:12px;color:#b8e6c5;margin-top:9px;min-height:17px}
  `;
  (document.head || document.documentElement).appendChild(style);

  const panel = document.createElement('section');
  panel.id = 'wol-bridge-panel';
  panel.innerHTML = `<div class="wol-head"><span>🍦 Walk Of Life · Apple Music</span><button class="wol-close" aria-label="Close panel">×</button></div><div class="wol-body"><p><strong>Connect to Music on this Mac?</strong></p><p>Walk Of Life can show the song playing in your Mac’s Music app and control playback.</p><p class="wol-muted">The connection stays on this Mac. Click Connect to begin.</p><div class="wol-row"><button class="wol-primary wol-allow">Connect Apple Music</button><button class="wol-secondary wol-later">Not now</button></div><div class="wol-status" role="status"></div></div>`;
  (document.body || document.documentElement).appendChild(panel);
  const status = panel.querySelector('.wol-status');
  let connected = false, poller = null, oldTrack = '';
  startEqualizer();
  let latestPosition = 0, latestDuration = 0, latestState = 'stopped', lastReceivedAt = 0;

  const sendAction = action => {
    try {
      chrome.runtime.sendMessage({type:'WOL_NATIVE_ACTION', action}).catch(() => {
        status.textContent = 'Chrome refreshed the extension. Reload this player tab, then connect again.';
      });
    } catch (_) {
      status.textContent = 'Chrome refreshed the extension. Reload this player tab, then connect again.';
    }
  };
  panel.querySelector('.wol-close').addEventListener('click', () => panel.remove());
  panel.querySelector('.wol-later').addEventListener('click', () => panel.remove());

  panel.querySelector('.wol-allow').addEventListener('click', async () => {
    status.textContent = 'Connecting…';
    const response = await chrome.runtime.sendMessage({type:'WOL_CONNECT'}).catch(err => ({ok:false,error:String(err)}));
    if (!response?.ok) {
      status.textContent = 'Could not start the Mac connection. The helper setup needs fixing.';
      return;
    }
    connected = true;
    status.textContent = 'Connected. Reading the current song…';
    requestStatus();
    poller = setInterval(requestStatus, 1500);
    panel.querySelector('.wol-allow').disabled = true;
    panel.querySelector('.wol-allow').textContent = 'Connected';
  });

  function requestStatus(){ if (connected) sendAction('status'); }
  // Intentionally no live timer/progress updates: the flaky time bar is disabled.
  function startEqualizer() {
    const bars = [...document.querySelectorAll('.equalizer .bar')];
    bars.forEach(bar => {
      const animate = () => {
        bar.style.height = `${12 + Math.random() * 78}%`;
        setTimeout(animate, 140 + Math.random() * 520);
      };
      bar.style.transformOrigin = 'bottom';
      animate();
    });
  }

  let lastArtworkLookupKey = '';
  function lookupArtwork(track, artist, album) {
    const key = [track, artist, album].join('|');
    if (!track || key === lastArtworkLookupKey) return;
    lastArtworkLookupKey = key;
    try {
      chrome.runtime.sendMessage({type:'WOL_ITUNES_LOOKUP', track, artist, album}).catch(() => {});
    } catch (_) {}
  }

  function updatePage(data) {
    if (!data || data.ok === false) {
      status.textContent = data?.error || 'Could not read Music.';
      return;
    }
    const track = data.track || 'Nothing is playing';
    const artist = data.artist || '';
    const album = data.album || '';
    latestPosition = Number(data.position) || 0;
    latestDuration = Number(data.duration) || 0;
    latestState = String(data.state || 'stopped').toLowerCase();
    lastReceivedAt = Date.now();

    const titleEl = document.querySelector('.song-title');
    const artistEl = document.querySelector('.song-artist');
    const albumEl = document.querySelector('.song-album');
    if (titleEl && track !== 'Nothing is playing') titleEl.textContent = track;
    if (artistEl) artistEl.textContent = artist;
    if (albumEl) albumEl.textContent = album;

    const main = document.querySelector('.controls .control.main');
    if (main) main.textContent = latestState === 'playing' ? '⏸' : '▶';

    const cover = document.querySelector('.album-cover');
    if (cover && track !== 'Nothing is playing') {
      // Always use Apple's iTunes Search API artwork, even when Music has embedded art.
      lookupArtwork(track, artist, album);
    } else if (cover && track !== oldTrack) {
      cover.innerHTML = '<span style="font-size:54px" aria-hidden="true">♫</span>';
    }

    status.textContent = track === 'Nothing is playing'
      ? 'Connected, but Music has no current song.'
      : `Now playing: ${track} — ${artist}`;
    oldTrack = track;
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'WOL_NATIVE_RESULT') {
      if (message.data?.lookup) {
        const currentTitle = document.querySelector('.song-title')?.textContent?.trim();
        const cover = document.querySelector('.album-cover');
        if (cover && message.data.artwork && (!currentTitle || currentTitle === message.data.track)) {
          let img = cover.querySelector('img[data-wol-artwork]');
          if (!img) {
            img = document.createElement('img');
            img.dataset.wolArtwork = 'true';
            img.alt = `Album cover for ${message.data.track || 'current song'}`;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
            cover.replaceChildren(img);
          }
          img.src = message.data.artwork;
        }
      } else {
        updatePage(message.data);
      }
    }
  });

  // Make the player’s three visible controls send commands to Music.
  const controls = document.querySelectorAll('.controls .control');
  if (controls.length >= 3) {
    controls[0].style.cursor = 'pointer';
    controls[1].style.cursor = 'pointer';
    controls[2].style.cursor = 'pointer';
    controls[0].title = 'Previous track in Music';
    controls[1].title = 'Play or pause Music';
    controls[2].title = 'Next track in Music';
    controls[0].addEventListener('click', () => sendAction('previous'));
    controls[1].addEventListener('click', () => sendAction('playpause'));
    controls[2].addEventListener('click', () => sendAction('next'));
  }
})();