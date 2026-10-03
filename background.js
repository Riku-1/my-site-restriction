const TICK_ALARM = 'tick';
const TICK_MINUTES = 1;
// アラームが発火しないまま長時間空いた場合（スリープ等）に、その時間をまるごと加算しないための上限
const MAX_CHUNK_MS = 2 * TICK_MINUTES * 60 * 1000;
// 再生中の通知は30秒ごとに届く。これが途切れたら再生終了とみなす
const PLAYING_TTL_MS = 90 * 1000;
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

// 計測対象を集める: 操作中のアクティブタブ + 音声を再生中のタブ（背景でも可）
// 戻り値: domain -> { rule, tabs }
async function collectTargets(sites, playing, now) {
  const targets = new Map();
  const add = (tab) => {
    const rule = tab?.url ? findRule(hostOf(tab.url), sites) : null;
    if (!rule) return;
    if (!targets.has(rule.domain)) targets.set(rule.domain, { rule, tabs: [] });
    const entry = targets.get(rule.domain);
    if (!entry.tabs.some((t) => t.id === tab.id)) entry.tabs.push(tab);
  };

  add(await currentActiveTab());

  const tabIds = new Set();
  for (const [key, ts] of Object.entries(playing)) {
    if (now - ts > PLAYING_TTL_MS) {
      delete playing[key];
      continue;
    }
    tabIds.add(Number(key.split(':')[0]));
  }
  for (const tabId of tabIds) {
    add(await browser.tabs.get(tabId).catch(() => null));
  }

  return targets;
}

async function track() {
  const now = Date.now();
  const { sites = [], usage = {}, session = null, playing = {} } = await browser.storage.local.get([
    'sites',
    'usage',
    'session',
    'playing',
  ]);

  // 直前の計測区間を、そのときの対象ドメインすべてに加算する
  if (session) {
    const elapsed = Math.max(0, Math.min(now - session.since, MAX_CHUNK_MS));
    const day = dayKey(session.since);
    usage[day] ??= {};
    for (const domain of session.domains ?? []) {
      usage[day][domain] = (usage[day][domain] ?? 0) + elapsed;
    }
  }
  pruneUsage(usage, now);

  const targets = await collectTargets(sites, playing, now);

  await browser.storage.local.set({
    usage,
    playing,
    session: targets.size ? { since: now, domains: [...targets.keys()] } : null,
  });

  // 上限に達したドメインのタブは、前面・背景を問わずブロックする（再生も止まる）
  for (const { rule, tabs } of targets.values()) {
    const spent = usage[dayKey(now)]?.[rule.domain] ?? 0;
    if (spent < rule.limitMinutes * 60 * 1000) continue;
    const url = browser.runtime.getURL(`blocked.html?d=${encodeURIComponent(rule.domain)}`);
    for (const tab of tabs) {
      await browser.tabs.update(tab.id, { url }).catch(() => {});
    }
  }
}

async function clearSession() {
  // ブラウザ終了中の時間を計測しないよう、起動時にセッションと再生状態を破棄する
  await browser.storage.local.set({ session: null, playing: {} });
}

async function setPlaying(sender, isPlaying) {
  const key = `${sender.tab.id}:${sender.frameId ?? 0}`;
  const { playing = {} } = await browser.storage.local.get('playing');
  if (isPlaying) playing[key] = Date.now();
  else delete playing[key];
  await browser.storage.local.set({ playing });
}

browser.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) enqueue(track);
});

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'media' || !sender.tab) return;
  enqueue(async () => {
    await setPlaying(sender, msg.playing);
    await track();
  });
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
