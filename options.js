const form = document.getElementById('form');
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const errorBox = document.getElementById('error');

const banForm = document.getElementById('ban-form');
const banList = document.getElementById('ban-list');
const banEmpty = document.getElementById('ban-empty');
const banErrorBox = document.getElementById('ban-error');

function pad(n) {
  return String(n).padStart(2, '0');
}

function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "https://www.YouTube.com/watch" → "youtube.com"
function normalizeDomain(input) {
  const raw = input.trim().toLowerCase();
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

async function load() {
  const { sites = [], usage = {} } = await browser.storage.local.get(['sites', 'usage']);
  const today = usage[dayKey()] ?? {};

  list.replaceChildren();
  empty.hidden = sites.length > 0;

  for (const site of sites) {
    const spentMin = Math.floor((today[site.domain] ?? 0) / 60000);

    const tr = document.createElement('tr');

    const tdDomain = document.createElement('td');
    tdDomain.textContent = site.domain;

    const tdLimit = document.createElement('td');
    tdLimit.className = 'num';
    tdLimit.textContent = `${site.limitMinutes} 分`;

    const tdSpent = document.createElement('td');
    tdSpent.className = 'num';
    tdSpent.textContent = `${spentMin} 分`;

    const tdAction = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '削除';
    del.addEventListener('click', () => removeSite(site.domain));
    tdAction.append(del);

    tr.append(tdDomain, tdLimit, tdSpent, tdAction);
    list.append(tr);
  }
}

async function loadBans() {
  const { bans = [] } = await browser.storage.local.get('bans');
  const { unbanned = {} } = await browser.storage.session.get('unbanned');

  banList.replaceChildren();
  banEmpty.hidden = bans.length > 0;

  for (const ban of bans) {
    // 禁止中かどうか: 登録済みで、かつ今回の起動中に解除されていないもの
    const banned = ban.enabled !== false && !unbanned[ban.domain];

    const tr = document.createElement('tr');

    const tdDomain = document.createElement('td');
    tdDomain.textContent = ban.domain;

    const tdToggle = document.createElement('td');
    const label = document.createElement('label');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = banned;
    toggle.addEventListener('change', () => setBanned(ban.domain, toggle.checked));
    const text = document.createElement('span');
    if (banned) {
      text.textContent = ' 禁止中';
      text.className = 'ban-on';
    } else if (ban.enabled === false) {
      text.textContent = ' 解除';
    } else {
      text.textContent = ' 解除中（再起動まで）';
    }
    label.append(toggle, text);
    tdToggle.append(label);

    const tdAction = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '削除';
    del.addEventListener('click', () => removeBan(ban.domain));
    tdAction.append(del);

    tr.append(tdDomain, tdToggle, tdAction);
    banList.append(tr);
  }
}

async function saveSite(domain, limitMinutes) {
  const { sites = [] } = await browser.storage.local.get('sites');
  const next = sites.filter((s) => s.domain !== domain);
  next.push({ domain, limitMinutes });
  next.sort((a, b) => a.domain.localeCompare(b.domain));
  await browser.storage.local.set({ sites: next });
}

async function removeSite(domain) {
  const { sites = [] } = await browser.storage.local.get('sites');
  await browser.storage.local.set({ sites: sites.filter((s) => s.domain !== domain) });
  load();
}

// banned=false: 解除（ブラウザを再起動するまで利用可能）
// banned=true : 禁止に戻す
async function setBanned(domain, banned) {
  const { bans = [] } = await browser.storage.local.get('bans');
  const next = bans.map((b) => (b.domain === domain ? { domain } : b));
  await browser.storage.local.set({ bans: next });

  const { unbanned = {} } = await browser.storage.session.get('unbanned');
  if (banned) delete unbanned[domain];
  else unbanned[domain] = true;
  await browser.storage.session.set({ unbanned });
  loadBans();
}

async function removeBan(domain) {
  const { bans = [] } = await browser.storage.local.get('bans');
  await browser.storage.local.set({ bans: bans.filter((b) => b.domain !== domain) });

  const { unbanned = {} } = await browser.storage.session.get('unbanned');
  delete unbanned[domain];
  await browser.storage.session.set({ unbanned });
  loadBans();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.textContent = '';

  const data = new FormData(form);
  const domain = normalizeDomain(String(data.get('domain')));
  const limitMinutes = Number(data.get('minutes'));

  if (!domain || !domain.includes('.')) {
    errorBox.textContent = 'ドメインを正しく入力してください（例: youtube.com）';
    return;
  }
  if (!Number.isInteger(limitMinutes) || limitMinutes < 1) {
    errorBox.textContent = '上限は1分以上の整数で入力してください';
    return;
  }

  await saveSite(domain, limitMinutes);
  form.reset();
  load();
});

banForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  banErrorBox.textContent = '';

  const domain = normalizeDomain(String(new FormData(banForm).get('domain')));
  if (!domain || !domain.includes('.')) {
    banErrorBox.textContent = 'ドメインを正しく入力してください（例: example.com）';
    return;
  }

  const { bans = [] } = await browser.storage.local.get('bans');
  const next = bans.filter((b) => b.domain !== domain);
  next.push({ domain });
  next.sort((a, b) => a.domain.localeCompare(b.domain));
  await browser.storage.local.set({ bans: next });

  // 追加したときは必ず禁止中にする
  const { unbanned = {} } = await browser.storage.session.get('unbanned');
  delete unbanned[domain];
  await browser.storage.session.set({ unbanned });

  banForm.reset();
  loadBans();
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.sites || changes.usage) load();
  if (changes.bans || changes.unbanned) loadBans();
});

load();
loadBans();
