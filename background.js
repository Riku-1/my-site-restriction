const TICK_ALARM = 'tick';
const TICK_MINUTES = 1;
// アラームが発火しないまま長時間空いた場合（スリープ等）に、その時間をまるごと加算しないための上限
const MAX_CHUNK_MS = 2 * TICK_MINUTES * 60 * 1000;
const KEEP_DAYS = 7;

// 状態更新を直列化して、同時実行による二重加算を防ぐ
let queue = Promise.resolve();
function enqueue(fn) {
  queue = queue.then(fn).catch((e) => console.error('site-time-limit:', e));
  return queue;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hostOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
}

// example.com の上限は sub.example.com にも適用する
function findRule(host, sites) {
  if (!host) return null;
  return sites.find((s) => host === s.domain || host.endsWith('.' + s.domain)) ?? null;
}

// Firefox がフォーカスされ、ユーザーが操作中のときだけ、そのウィンドウのアクティブタブを返す
async function currentActiveTab() {
  const [win, idle] = await Promise.all([
    browser.windows.getLastFocused(),
    browser.idle.queryState(60),
  ]);
  if (!win.focused || idle !== 'active') return null;
  const [tab] = await browser.tabs.query({ active: true, windowId: win.id });
  return tab ?? null;
}

function pruneUsage(usage, now) {
  const cutoff = dayKey(now - KEEP_DAYS * 24 * 60 * 60 * 1000);
  for (const day of Object.keys(usage)) {
    if (day < cutoff) delete usage[day];
  }
}

async function track() {
  const now = Date.now();
  const { sites = [], usage = {}, session = null } = await browser.storage.local.get([
    'sites',
    'usage',
    'session',
  ]);

  // 直前の計測区間を加算してから、現在の状態で計測し直す
  if (session?.domain) {
    const elapsed = Math.min(now - session.since, MAX_CHUNK_MS);
    const day = dayKey(session.since);
    usage[day] ??= {};
    usage[day][session.domain] = (usage[day][session.domain] ?? 0) + Math.max(elapsed, 0);
  }
  pruneUsage(usage, now);

  const tab = await currentActiveTab();
  const rule = tab ? findRule(hostOf(tab.url), sites) : null;

  await browser.storage.local.set({
    usage,
    session: rule ? { domain: rule.domain, since: now } : null,
  });

  if (rule) {
    const spent = usage[dayKey(now)]?.[rule.domain] ?? 0;
    if (spent >= rule.limitMinutes * 60 * 1000) {
      const url = browser.runtime.getURL(`blocked.html?d=${encodeURIComponent(rule.domain)}`);
      await browser.tabs.update(tab.id, { url });
    }
  }
}

async function clearSession() {
  // ブラウザ終了中の時間を計測しないよう、起動時にセッションを破棄する
  await browser.storage.local.set({ session: null });
}

browser.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) enqueue(track);
});

browser.tabs.onActivated.addListener(() => enqueue(track));
browser.tabs.onRemoved.addListener(() => enqueue(track));
browser.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.url || info.status === 'complete') enqueue(track);
});
browser.windows.onFocusChanged.addListener(() => enqueue(track));

browser.idle.setDetectionInterval(60);
browser.idle.onStateChanged.addListener(() => enqueue(track));

browser.storage.onChanged.addListener((changes) => {
  if (changes.sites) enqueue(track);
});

browser.runtime.onStartup.addListener(() => enqueue(clearSession));
browser.runtime.onInstalled.addListener(() => enqueue(clearSession));
