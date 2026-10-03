function pad(n) {
  return String(n).padStart(2, '0');
}

function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main() {
  const params = new URLSearchParams(location.search);
  const domain = params.get('d') ?? '';
  const reason = params.get('r') ?? 'limit';

  document.getElementById('domain').textContent = domain;

  if (reason === 'ban') {
    document.getElementById('title').textContent = '今すぐ禁止されています';
    document.getElementById('hint').textContent = '設定画面で禁止を解除すると再び利用できます。';
    return;
  }

  document.getElementById('title').textContent = '今日の利用時間の上限に達しました';
  document.getElementById('hint').textContent = '明日また利用できます。';

  const { sites = [], usage = {} } = await browser.storage.local.get(['sites', 'usage']);
  const site = sites.find((s) => s.domain === domain);
  const spentMs = usage[dayKey()]?.[domain] ?? 0;

  if (site) {
    document.getElementById('detail').textContent =
      `上限 ${site.limitMinutes} 分 / 今日の利用 約 ${Math.floor(spentMs / 60000)} 分`;
  }
}

main();
