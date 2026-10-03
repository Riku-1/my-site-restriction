const form = document.getElementById('form');
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const errorBox = document.getElementById('error');

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

browser.storage.onChanged.addListener((changes) => {
  if (changes.sites || changes.usage) load();
});

load();
