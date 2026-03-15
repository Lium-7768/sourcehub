function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAdminUi(): Response {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SourceHub</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: #121933;
      --panel-2: #182246;
      --text: #e9eefc;
      --muted: #99a4c3;
      --line: #29355f;
      --primary: #5b8cff;
      --green: #29c36a;
      --red: #ff6b6b;
      --yellow: #ffcc66;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #09101f 0%, #0d1430 100%);
      color: var(--text);
    }
    .wrap { max-width: 1480px; margin: 0 auto; padding: 24px; }
    h1, h2, h3 { margin: 0 0 12px; }
    p { margin: 0; color: var(--muted); }
    .panel {
      background: rgba(18, 25, 51, 0.95);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 12px;
    }
    input, textarea, button, select {
      font: inherit;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      padding: 10px 12px;
    }
    input, select { min-width: 180px; }
    textarea {
      width: 100%;
      min-height: 180px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
    }
    button { cursor: pointer; background: #233264; }
    button.primary { background: #2f5fd7; }
    button.green { background: #18653a; }
    button.red { background: #7c2631; }
    button.ghost { background: transparent; }
    .muted { color: var(--muted); }
    .small { font-size: 12px; }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      background: #20305f;
      color: #dbe7ff;
      font-size: 12px;
    }
    .status-success { color: #8ef0a4; }
    .status-failed { color: #ff9a9a; }
    .status-running { color: #ffd37d; }
    .status-idle, .status-skipped, .status-unknown { color: #aeb8d9; }
    .table-wrap {
      overflow: auto;
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1200px;
      background: rgba(255,255,255,0.02);
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(41, 53, 95, 0.9);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th {
      position: sticky;
      top: 0;
      background: #111936;
      color: #cfe0ff;
      z-index: 1;
    }
    tr:hover td { background: rgba(255,255,255,0.03); }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #0a1126;
      padding: 12px;
      font-size: 12px;
      margin: 0;
      color: #c8d5f5;
    }
    .metric-good { color: #8ef0a4; font-weight: 600; }
    .metric-mid { color: #ffd37d; font-weight: 600; }
    .metric-bad { color: #ff9a9a; font-weight: 600; }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(3, 6, 16, 0.72);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
      z-index: 30;
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      width: min(1100px, 100%);
      max-height: 92vh;
      overflow: auto;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: #0f1732;
      box-shadow: 0 24px 80px rgba(0,0,0,0.45);
      padding: 18px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 14px;
    }
    .list { display: grid; gap: 10px; margin-top: 12px; }
    .item {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      background: rgba(255,255,255,0.02);
    }
    .item-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .section-title {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
    }
    .rank { font-weight: 700; color: #dbe7ff; }
    @media (max-width: 980px) {
      .header { flex-direction: column; }
      .grid { grid-template-columns: 1fr; }
      .item-head { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <h1>SourceHub</h1>
        <p>默认看结果，不默认看底层原始 JSON。admin 只在需要管理时打开。</p>
        <div class="badges">
          <span class="badge">Results first</span>
          <span class="badge">Admin modal</span>
        </div>
      </div>
      <div class="toolbar" style="margin-top:0;">
        <input id="sourceIdFilter" placeholder="可选：填 source_id 过滤" />
        <select id="statusFilter">
          <option value="">全部状态</option>
          <option value="ok">ok</option>
          <option value="unknown">unknown</option>
          <option value="fail">fail</option>
        </select>
        <button id="loadPublicBtn" class="ghost">刷新结果</button>
        <button id="openAdminBtn" class="primary">打开 Admin</button>
      </div>
    </div>

    <section class="panel">
      <div class="section-title">
        <div>
          <h2>结果页</h2>
          <p class="small muted">先看 host / 延迟 / 丢包 / 状态。还没测到的数据先显示 <code>--</code>。</p>
        </div>
        <span id="publicCount" class="small muted"></span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>host</th>
              <th>端口</th>
              <th>地区</th>
              <th>延迟</th>
              <th>丢包</th>
              <th>抖动</th>
              <th>状态</th>
              <th>分数</th>
              <th>最近测试</th>
              <th>source</th>
            </tr>
          </thead>
          <tbody id="publicTableBody">
            <tr><td colspan="11" class="muted">加载中…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <div id="adminModal" class="modal-backdrop">
    <div class="modal">
      <div class="section-title">
        <div>
          <h2>Admin</h2>
          <p class="small muted">这里只在需要管理 source / sync 的时候用。</p>
        </div>
        <div class="toolbar" style="margin-top:0;">
          <button id="closeAdminBtn" class="ghost">关闭</button>
        </div>
      </div>

      <div class="grid">
        <section class="panel">
          <div>
            <h3>连接</h3>
            <div class="toolbar">
              <input id="tokenInput" type="password" placeholder="粘贴 ADMIN_TOKEN" />
              <button id="saveTokenBtn" class="primary">保存 token</button>
              <button id="checkBtn" class="ghost">测试连接</button>
            </div>
            <p id="authStatus" class="muted small" style="margin-top:8px;">还没连接</p>
          </div>

          <div style="margin-top:16px;">
            <div class="section-title">
              <h3>创建 source</h3>
              <button id="fillTextBtn" class="ghost">填 text_url 示例</button>
            </div>
            <p class="small muted">直接贴 JSON body。</p>
            <textarea id="createBody"></textarea>
            <div class="toolbar">
              <button id="createBtn" class="green">创建</button>
              <button id="cronBtn" class="ghost">跑一次 cron</button>
              <button id="reloadBtn" class="ghost">刷新 admin 数据</button>
            </div>
          </div>

          <div style="margin-top:16px;">
            <h3>输出</h3>
            <pre id="output">等待操作…</pre>
          </div>
        </section>

        <section class="panel">
          <div>
            <div class="section-title">
              <h3>Sources</h3>
              <span id="sourceCount" class="small muted"></span>
            </div>
            <div id="sources" class="list"></div>
          </div>

          <div style="margin-top:16px;">
            <div class="section-title">
              <h3>最近 sync-runs</h3>
              <span id="runCount" class="small muted"></span>
            </div>
            <div id="runs" class="list"></div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <script>
    function escapeHtml(input) {
      return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    const tokenInput = document.getElementById('tokenInput');
    const authStatus = document.getElementById('authStatus');
    const createBody = document.getElementById('createBody');
    const output = document.getElementById('output');
    const sourcesEl = document.getElementById('sources');
    const runsEl = document.getElementById('runs');
    const sourceCount = document.getElementById('sourceCount');
    const runCount = document.getElementById('runCount');
    const publicTableBody = document.getElementById('publicTableBody');
    const publicCount = document.getElementById('publicCount');
    const sourceIdFilter = document.getElementById('sourceIdFilter');
    const statusFilter = document.getElementById('statusFilter');
    const adminModal = document.getElementById('adminModal');

    const defaultCreateBody = {
      name: 'demo text source',
      type: 'text_url',
      enabled: true,
      is_public: true,
      sync_interval_min: 5,
      tags: ['demo', 'ui'],
      config: {
        url: 'https://www.cloudflare.com/ips-v4',
        kind: 'ip',
        parse_mode: 'regex_ip'
      }
    };

    createBody.value = JSON.stringify(defaultCreateBody, null, 2);
    tokenInput.value = localStorage.getItem('sourcehub.admin.token') || '';

    function saveToken() {
      localStorage.setItem('sourcehub.admin.token', tokenInput.value.trim());
    }

    function getToken() {
      return tokenInput.value.trim();
    }

    function setOutput(data) {
      output.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }

    function badge(text) {
      return '<span class="badge">' + escapeHtml(text) + '</span>';
    }

    function statusClass(status) {
      return 'status-' + String(status || 'unknown').toLowerCase();
    }

    function formatMetric(value, unit) {
      if (value === null || value === undefined || value === '') return '--';
      const num = Number(value);
      if (!Number.isFinite(num)) return '--';
      return num.toFixed(num >= 10 ? 0 : 1) + unit;
    }

    function metricClass(value, reverse = false) {
      if (value === null || value === undefined || value === '') return 'muted';
      const num = Number(value);
      if (!Number.isFinite(num)) return 'muted';
      if (reverse) {
        if (num <= 1) return 'metric-good';
        if (num <= 5) return 'metric-mid';
        return 'metric-bad';
      }
      if (num <= 100) return 'metric-good';
      if (num <= 250) return 'metric-mid';
      return 'metric-bad';
    }

    function openAdminModal() {
      adminModal.classList.add('open');
    }

    function closeAdminModal() {
      adminModal.classList.remove('open');
    }

    async function api(path, options = {}) {
      const token = getToken();
      const headers = new Headers(options.headers || {});
      if (token) headers.set('authorization', 'Bearer ' + token);
      const res = await fetch(path, { ...options, headers });
      const text = await res.text();
      let body;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
      if (!res.ok) {
        const error = new Error((body && body.error) || ('HTTP ' + res.status));
        error.payload = body;
        throw error;
      }
      return body;
    }

    async function publicApi(path) {
      const res = await fetch(path);
      const text = await res.text();
      let body;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
      if (!res.ok) throw new Error((body && body.error) || ('HTTP ' + res.status));
      return body;
    }

    function renderPublicTable(items) {
      const statusWanted = statusFilter.value;
      const filtered = statusWanted ? items.filter((item) => String(item.status || 'unknown') === statusWanted) : items;
      publicCount.textContent = filtered.length + ' 条';
      if (!filtered.length) {
        publicTableBody.innerHTML = '<tr><td colspan="11" class="muted">暂无结果</td></tr>';
        return;
      }
      publicTableBody.innerHTML = filtered.map((item, index) => (
        '<tr>'
        + '<td class="rank">' + (index + 1) + '</td>'
        + '<td>' + escapeHtml(String(item.host || item.item_key || '--')) + '</td>'
        + '<td>' + escapeHtml(String(item.port || '--')) + '</td>'
        + '<td>' + escapeHtml(String(item.region || '--')) + '</td>'
        + '<td class="' + metricClass(item.latency_ms) + '">' + escapeHtml(formatMetric(item.latency_ms, 'ms')) + '</td>'
        + '<td class="' + metricClass(item.loss_pct, true) + '">' + escapeHtml(formatMetric(item.loss_pct, '%')) + '</td>'
        + '<td>' + escapeHtml(formatMetric(item.jitter_ms, 'ms')) + '</td>'
        + '<td class="' + statusClass(item.status) + '">' + escapeHtml(String(item.status || 'unknown')) + '</td>'
        + '<td>' + escapeHtml(item.score === null || item.score === undefined ? '--' : String(Number(item.score).toFixed(1))) + '</td>'
        + '<td>' + escapeHtml(String(item.checked_at || '--')) + '</td>'
        + '<td>' + escapeHtml(String(item.source_id || '')) + '</td>'
        + '</tr>'
      )).join('');
    }

    async function loadPublicItems() {
      try {
        const sourceId = sourceIdFilter.value.trim();
        const query = new URLSearchParams();
        query.set('limit', '100');
        if (sourceId) query.set('source_id', sourceId);
        const data = await publicApi('/api/public/results?' + query.toString());
        renderPublicTable(data.items || []);
      } catch (err) {
        publicTableBody.innerHTML = '<tr><td colspan="11" class="status-failed">' + escapeHtml(err.message || String(err)) + '</td></tr>';
      }
    }

    function renderSources(items) {
      sourceCount.textContent = items.length + ' 条';
      if (!items.length) {
        sourcesEl.innerHTML = '<p class="muted small">暂无 source</p>';
        return;
      }
      sourcesEl.innerHTML = items.map((item) => {
        const config = escapeHtml(item.config_json || '{}');
        return '<div class="item">'
          + '<div class="item-head">'
          +   '<div>'
          +     '<h3>' + escapeHtml(item.name) + '</h3>'
          +     '<div class="badges">'
          +       badge(item.id)
          +       badge(item.type)
          +       badge('interval=' + item.sync_interval_min + 'm')
          +       badge(item.enabled ? 'enabled' : 'disabled')
          +       badge(item.is_public ? 'public' : 'private')
          +       '<span class="badge ' + statusClass(item.last_status) + '">status=' + escapeHtml(item.last_status) + '</span>'
          +     '</div>'
          +     '<p class="muted small" style="margin-top:8px;">items=' + item.item_count + ' · last_sync_at=' + escapeHtml(String(item.last_sync_at)) + '</p>'
          +   '</div>'
          +   '<div class="toolbar">'
          +     '<button class="ghost" data-action="sync" data-id="' + escapeHtml(item.id) + '">sync</button>'
          +     '<button class="ghost" data-action="toggle" data-enabled="' + (item.enabled ? '1' : '0') + '" data-id="' + escapeHtml(item.id) + '">' + (item.enabled ? 'disable' : 'enable') + '</button>'
          +     '<button class="ghost" data-action="copy" data-id="' + escapeHtml(item.id) + '">copy id</button>'
          +   '</div>'
          + '</div>'
          + '<pre style="margin-top:10px;">' + config + '</pre>'
          + (item.last_error ? '<p class="small status-failed" style="margin-top:8px;">' + escapeHtml(item.last_error) + '</p>' : '')
          + '</div>';
      }).join('');
    }

    function renderRuns(items) {
      runCount.textContent = items.length + ' 条';
      if (!items.length) {
        runsEl.innerHTML = '<p class="muted small">暂无 sync-runs</p>';
        return;
      }
      runsEl.innerHTML = items.map((item) => (
        '<div class="item">'
        + '<div class="item-head">'
        +   '<div>'
        +     '<h3>' + escapeHtml(item.id) + '</h3>'
        +     '<div class="badges">'
        +       badge('source=' + item.source_id)
        +       badge('trigger=' + item.trigger_type)
        +       '<span class="badge ' + statusClass(item.status) + '">status=' + escapeHtml(item.status) + '</span>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '<p class="small muted" style="margin-top:8px;">message=' + escapeHtml(String(item.message)) + ' · started_at=' + escapeHtml(item.started_at) + '</p>'
        + (item.error_text ? '<pre style="margin-top:10px;">' + escapeHtml(item.error_text) + '</pre>' : '')
        + '</div>'
      )).join('');
    }

    async function loadAdminData() {
      try {
        const [sources, runs] = await Promise.all([
          api('/api/admin/sources'),
          api('/api/admin/sync-runs'),
        ]);
        renderSources(sources.items || []);
        renderRuns((runs.items || []).slice(0, 20));
        authStatus.textContent = '已连接';
        authStatus.className = 'small status-success';
      } catch (err) {
        authStatus.textContent = '连接失败：' + err.message;
        authStatus.className = 'small status-failed';
        setOutput(err.payload || err.message || String(err));
      }
    }

    document.getElementById('openAdminBtn').addEventListener('click', () => {
      openAdminModal();
      if (getToken()) loadAdminData();
    });
    document.getElementById('closeAdminBtn').addEventListener('click', closeAdminModal);
    adminModal.addEventListener('click', (event) => {
      if (event.target === adminModal) closeAdminModal();
    });

    document.getElementById('loadPublicBtn').addEventListener('click', loadPublicItems);
    statusFilter.addEventListener('change', loadPublicItems);

    document.getElementById('saveTokenBtn').addEventListener('click', () => {
      saveToken();
      loadAdminData();
    });

    document.getElementById('checkBtn').addEventListener('click', async () => {
      saveToken();
      try {
        const data = await api('/api/admin/sources');
        authStatus.textContent = '连接正常';
        authStatus.className = 'small status-success';
        setOutput(data);
        loadAdminData();
      } catch (err) {
        authStatus.textContent = '连接失败：' + err.message;
        authStatus.className = 'small status-failed';
        setOutput(err.payload || err.message || String(err));
      }
    });

    document.getElementById('fillTextBtn').addEventListener('click', () => {
      createBody.value = JSON.stringify(defaultCreateBody, null, 2);
    });

    document.getElementById('reloadBtn').addEventListener('click', loadAdminData);

    document.getElementById('cronBtn').addEventListener('click', async () => {
      try {
        const data = await api('/api/admin/cron/run-once', { method: 'POST' });
        setOutput(data);
        loadAdminData();
        loadPublicItems();
      } catch (err) {
        setOutput(err.payload || err.message || String(err));
      }
    });

    document.getElementById('createBtn').addEventListener('click', async () => {
      try {
        const body = JSON.parse(createBody.value);
        const data = await api('/api/admin/sources', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        setOutput(data);
        loadAdminData();
        loadPublicItems();
      } catch (err) {
        setOutput(err.payload || err.message || String(err));
      }
    });

    sourcesEl.addEventListener('click', async (event) => {
      const target = event.target.closest('button[data-action]');
      if (!target) return;
      const id = target.getAttribute('data-id');
      const action = target.getAttribute('data-action');
      if (!id) return;

      try {
        if (action === 'copy') {
          await navigator.clipboard.writeText(id);
          setOutput({ copied: id });
          return;
        }
        if (action === 'sync') {
          const data = await api('/api/admin/sources/' + id + '/sync', { method: 'POST' });
          setOutput(data);
          loadAdminData();
          loadPublicItems();
          return;
        }
        if (action === 'toggle') {
          const enabled = target.getAttribute('data-enabled') === '1';
          const data = await api('/api/admin/sources/' + id + '/' + (enabled ? 'disable' : 'enable'), { method: 'POST' });
          setOutput(data);
          loadAdminData();
          loadPublicItems();
          return;
        }
      } catch (err) {
        setOutput(err.payload || err.message || String(err));
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAdminModal();
    });

    loadPublicItems();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
