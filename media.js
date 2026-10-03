// 再生中の音声・動画を検知して background に通知する（全フレームで動作）
(() => {
  const HEARTBEAT_MS = 30 * 1000;

  let playing = false;
  let heartbeat = null;

  function isAudible(m) {
    return !m.paused && !m.ended && !m.muted && m.volume > 0;
  }

  function isPlaying() {
    return [...document.querySelectorAll('audio, video')].some(isAudible);
  }

  function report(state) {
    browser.runtime.sendMessage({ type: 'media', playing: state }).catch(() => {});
  }

  function sync() {
    const now = isPlaying();
    if (now === playing) return;
    playing = now;

    report(now);
    if (now) {
      heartbeat = setInterval(() => report(true), HEARTBEAT_MS);
    } else {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  // メディアイベントはバブリングしないので capture で拾う
  for (const type of ['play', 'playing', 'pause', 'ended', 'emptied', 'volumechange']) {
    document.addEventListener(type, sync, true);
  }

  window.addEventListener('pagehide', () => {
    if (playing) report(false);
  });
})();
