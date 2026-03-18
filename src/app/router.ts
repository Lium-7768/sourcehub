import type { Env } from './types';
import { error, html, json } from './response';
import { requireResultsToken } from './auth';
import { handlePublicResults } from '../api/public/items';

function renderUi(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PingHub</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: #11182b;
      --panel-2: #0e1526;
      --border: #24304d;
      --text: #e6edf3;
      --muted: #9fb0c8;
      --accent: #6cb6ff;
      --good: #2ecc71;
      --bad: #ff7675;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #0b1020 0%, #0a0f1d 100%);
      color: var(--text);
    }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .hero { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 30px; line-height: 1.2; }
    .sub { margin-top: 8px; color: var(--muted); font-size: 14px; }
    .chip {
      display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px;
      border: 1px solid var(--border); border-radius: 999px;
      background: rgba(108,182,255,0.08); color: var(--accent); font-size: 13px; white-space: nowrap;
    }
    .panel {
      background: var(--panel); border: 1px solid var(--border); border-radius: 18px;
      padding: 18px; box-shadow: 0 16px 50px rgba(0,0,0,.28);
    }
    .controls {
      display: grid; grid-template-columns: 180px 1fr 140px; gap: 12px; margin-bottom: 16px;
    }
    label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
    input, select {
      width: 100%; border: 1px solid var(--border); background: var(--panel-2); color: var(--text);
      border-radius: 12px; padding: 12px 14px; outline: none; font-size: 14px;
    }
    input:focus, select:focus {
      border-color: var(--accent); box-shadow: 0 0 0 3px rgba(108,182,255,.12);
    }
    button {
      width: 100%; border: 1px solid var(--border); background: var(--accent); color: #08101d;
      border-radius: 12px; padding: 12px 14px; font-weight: 700; cursor: pointer; font-size: 14px; margin-top: 21px;
    }
    .topbar {
      display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap;
    }
    .meta { display: flex; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 13px; }
    .status { font-size: 13px; color: var(--muted); }
    .status.good { color: var(--good); }
    .status.bad { color: var(--bad); }
    .table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 14px; }
    table { width: 100%; border-collapse: collapse; min-width: 980px; background: var(--panel-2); }
    th, td {
      padding: 12px 14px; text-align: left; border-bottom: 1px solid rgba(36,48,77,.75); font-size: 14px; vertical-align: top;
    }
    th { position: sticky; top: 0; background: #10182c; color: #cfe1ff; z-index: 1; }
    tr:hover td { background: rgba(108,182,255,.04); }
    .num { font-variant-numeric: tabular-nums; }
    .muted { color: var(--muted); }
    .footer-note { margin-top: 14px; color: var(--muted); font-size: 13px; }
    @media (max-width: 900px) {
      .controls { grid-template-columns: 1fr; }
      button { margin-top: 0; }
    }
    @media (max-width: 640px) {
      .wrap { padding: 14px; }
      .hero { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div>
        <h1>PingHub</h1>
        <div class="sub">按节点国家筛选，查看当前仓库文件中的公开可用节点。</div>
      </div>
      <div class="chip">country filter</div>
    </div>

    <section class="panel">
      <div class="controls">
        <div>
          <label for="limit">数量</label>
          <input id="limit" type="number" min="1" max="100" value="20" />
        </div>
        <div>
          <label for="country">国家 / 地区</label>
          <select id="country">
            <option value="">全部</option>
          </select>
        </div>
        <div>
          <button id="loadBtn">刷新结果</button>
        </div>
      </div>

      <div class="topbar">
        <div class="meta">
          <span id="metaCount">count: -</span>
          <span id="metaLimit">limit: -</span>
          <span id="metaCountry">country: -</span>
        </div>
        <div id="status" class="status">等待加载</div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Host</th>
              <th>Latency</th>
              <th>Loss</th>
              <th>Jitter</th>
              <th>Country</th>
              <th>Checked At</th>
            </tr>
          </thead>
          <tbody id="rows">
            <tr><td colspan="6" class="muted">还没加载数据</td></tr>
          </tbody>
        </table>
      </div>

      <div class="footer-note">
        页面已收窄为只展示筛选和主要结果字段，隐藏内部使用字段。
      </div>
    </section>
  </div>

  <script>
    const limitEl = document.getElementById('limit');
    const countryEl = document.getElementById('country');
    const loadBtn = document.getElementById('loadBtn');
    const rowsEl = document.getElementById('rows');
    const statusEl = document.getElementById('status');
    const metaCountEl = document.getElementById('metaCount');
    const metaLimitEl = document.getElementById('metaLimit');
    const metaCountryEl = document.getElementById('metaCountry');
    const initialUrl = new URL(window.location.href);

    function esc(v) {
      return String(v ?? '').replace(/[&<>\"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    }

    function setStatus(text, kind = '') {
      statusEl.textContent = text;
      statusEl.className = 'status' + (kind ? ' ' + kind : '');
    }

    function renderRows(items) {
      if (!items.length) {
        rowsEl.innerHTML = '<tr><td colspan="6" class="muted">没有结果</td></tr>';
        return;
      }

      rowsEl.innerHTML = items.map((item) => {
        return '<tr>' +
          '<td>' + esc(item.host) + '</td>' +
          '<td class="num">' + esc(item.latency_ms ?? '-') + '</td>' +
          '<td class="num">' + esc(item.loss_pct ?? '-') + '</td>' +
          '<td class="num">' + esc(item.jitter_ms ?? '-') + '</td>' +
          '<td>' + esc(item.country ?? '-') + '</td>' +
          '<td>' + esc(item.checked_at ?? '-') + '</td>' +
          '</tr>';
      }).join('');
    }

    function syncCountryOptions(countries, selectedCountry) {
      const current = countryEl.value;
      const keep = selectedCountry || current;
      countryEl.innerHTML = '<option value="">全部</option>' +
        countries.map((country) => '<option value="' + esc(country) + '">' + esc(country) + '</option>').join('');
      if (keep && countries.includes(keep)) {
        countryEl.value = keep;
      } else if (selectedCountry) {
        countryEl.value = selectedCountry;
      }
    }

    function syncUrl(limit, country) {
      const url = new URL(window.location.href);
      url.searchParams.set('limit', String(limit));
      if (country) url.searchParams.set('country', country);
      else url.searchParams.delete('country');
      window.history.replaceState({}, '', url.toString());
    }

    const initialLimit = Number(initialUrl.searchParams.get('limit') || limitEl.value || 20);
    if (Number.isFinite(initialLimit)) {
      limitEl.value = String(Math.max(1, Math.min(100, initialLimit)));
    }
    const initialCountry = (initialUrl.searchParams.get('country') || '').trim();

    async function loadResults() {
      const limit = Math.max(1, Math.min(100, Number(limitEl.value || 20)));
      const country = countryEl.value.trim() || initialCountry;
      const params = new URLSearchParams({ limit: String(limit) });
      if (country) params.set('country', country);

      loadBtn.disabled = true;
      setStatus('加载中...');

      try {
        const res = await fetch('/ui/results?' + params.toString(), {
          headers: {
            'Accept': 'application/json'
          }
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          rowsEl.innerHTML = '<tr><td colspan="6" class="muted">请求失败：' + esc(data?.error || res.status) + '</td></tr>';
          metaCountEl.textContent = 'count: -';
          metaLimitEl.textContent = 'limit: ' + limit;
          metaCountryEl.textContent = 'country: -';
          setStatus('请求失败：' + (data?.error || res.status), 'bad');
          return;
        }

        const items = Array.isArray(data.items) ? data.items : [];
        const availableCountries = Array.isArray(data?.meta?.available_countries) ? data.meta.available_countries : [];
        syncCountryOptions(availableCountries, data?.meta?.country || initialCountry || '');
        syncUrl(limit, countryEl.value.trim());
        renderRows(items);
        metaCountEl.textContent = 'count: ' + (data?.meta?.count ?? '-');
        metaLimitEl.textContent = 'limit: ' + (data?.meta?.limit ?? limit);
        metaCountryEl.textContent = 'country: ' + (data?.meta?.country ?? 'all');
        setStatus('加载成功', 'good');
      } catch (err) {
        rowsEl.innerHTML = '<tr><td colspan="6" class="muted">网络错误：' + esc(err?.message || err) + '</td></tr>';
        setStatus('网络错误', 'bad');
      } finally {
        loadBtn.disabled = false;
      }
    }

    loadBtn.addEventListener('click', loadResults);
    limitEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadResults(); });
    countryEl.addEventListener('change', loadResults);
    loadResults();
  </script>
</body>
</html>`;
}

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === '/') {
    return json({
      name: 'sourcehub',
      status: 'ok',
      endpoints: ['POST /api/results', 'GET /ui'],
    });
  }

  if (pathname === '/ui') {
    return html(renderUi());
  }

  if (pathname === '/ui/results') {
    const body = {
      limit: Number(url.searchParams.get('limit') || '20'),
      country: (url.searchParams.get('country') || '').trim() || null,
    };
    return handlePublicResults(new Request(new URL('/api/results', url.origin).toString(), {
      method: 'POST',
      headers: new Headers({
        'authorization': 'Bearer sourcehub-results-token-v1',
        'accept': 'application/json',
        'content-type': 'application/json',
      }),
      body: JSON.stringify(body),
    }));
  }

  if (pathname === '/api/results') {
    const authError = requireResultsToken(request);
    if (authError) return authError;
    return handlePublicResults(request);
  }

  return error('Not found', 404);
}
