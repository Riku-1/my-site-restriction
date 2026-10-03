function pad(n) {
  return String(n).padStart(2, '0');
}

function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main() {
  const domain = new URLSearchParams(location.search).get('d') ?? '';
  document.getElementById('domain').textContent = domain;

  const { sites = [], usage = {} } = await browser.storage.local.get(['sites', 'usage']);
  const site = sites.find((s) => s.domain === domain);
  const spentMs = usage[dayKey()]?.[domain] ?? 0;

  if (site) {
    document.getElementById('detail').textContent =
      `上限 ${site.limitMinutes} 分 / 今日の利用 約 ${Math.floor(spentMs / 60000)} 分`;
  }
}

main();
