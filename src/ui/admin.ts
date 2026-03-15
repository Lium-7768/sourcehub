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
  <title>SourceHub Admin UI</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: #121933;
      --panel-2: #182246;
      --text: #e9eefc;
      --muted: #99a4c3;
      --line: #29355f;
      --primary: #6ea8fe;
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
    .wrap {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
    }
    h1, h2, h3 { margin: 0 0 12px; }
    p { margin: 0; color: var(--muted); }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: 1.1fr 1.3fr;
      margin-top: 16px;
    }
    .panel {
      background: rgba(18, 25, 51, 0.95);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    }
    .toolbar, .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .toolbar { margin-top: 12px; }
    input, select, textarea, button {
      font: inherit;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      padding: 10px 12px;
    }
    input, select, textarea { width: 100%; }
    textarea {
      min-height: 180px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
    }
    button {
      cursor: pointer;
      background: #233264;
    }
    button.primary { background: #2f5fd7; }
    button.green { background: #18653a; }
    button.red { background: #7c2631; }
    button.ghost { background: transparent; }
    .muted { color: var(--muted); }
    .stack { display: grid; gap: 12px; }
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
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 999px;
      background: #20305f;
      color: #dbe7ff;
      font-size: 12px;
    }
    .status-success { color: #8ef0a4; }
    .status-failed { color: #ff9a9a; }
    .status-running { color: #ffd37d; }
    .status-idle, .status-skipped { color: #aeb8d9; }
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
    .small { font-size: 12px; }
    .section-title { display:flex; justify-content:space-between; align-items:center; gap:12px; }
    @media (max-width: 980px) {
      .grid { grid-template-columns: 1fr; }
      .item-head { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>SourceHub Admin UI</h1>
    <p>最小可用后台。填入 <code>ADMIN_TOKEN</code> 后，可以看 source、创建 source、启停、手动 sync、看 sync-runs。</p>

    <div class="grid">
      <section class="panel stack">
        <div>
          <h2>连接</h2>
          <div class="toolbar">
            <input id="tokenInput" type="password" placeholder="粘贴 ADMIN_TOKEN" />
            <button id="saveTokenBtn" class="primary">保存 token</button>
            <button id="checkBtn" class="ghost">测试连接</button>
          </div>
          <p id="authStatus" class="muted small" style="margin-top:8px;">还没连接</p>
        </div>

        <div>
          <div class="section-title">
            <h2>创建 source</h2>
            <button id="fillTextBtn" class="ghost">填 text_url 示例</button>
          </div>
          <p class="muted small">直接贴 JSON body。默认给你一个最小模板。</p>
          <textarea id="createBody"></textarea>
          <div class="toolbar">
            <button id="createBtn" class="green">创建</button>
            <button id="cronBtn" class="ghost">跑一次 cron</button>
            <button id="reloadBtn" class="ghost">刷新列表</button>
          </div>
        </div>

        <div>
          <h2>输出</h2>
          <pre id="output">等待操作…</pre>
        </div>
      </section>

      <section class="panel stack">
        <div>
          <div class="section-title">
            <h2>Sources</h2>
            <span id="sourceCount" class="muted small"></span>
          </div>
          <div id="sources" class="list"></div>
        </div>

        <div>
          <div class="section-title">
            <h2>最近 sync-runs</h2>
            <span id="runCount" class="muted small"></span>
          </div>
          <div id="runs" class="list"></div>
        </div>
      </section>
    </div>
  </div>

  <script>
    const tokenInput = document.getElementById('tokenInput');
    const authStatus = document.getElementById('authStatus');
    const createBody = document.getElementById('createBody');
    const output = document.getElementById('output');
    const sourcesEl = document.getElementById('sources');
    const runsEl = document.getElementById('runs');
    const sourceCount = document.getElementById('sourceCount');
    const runCount = document.getElementById('runCount');

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
      return 'status-' + String(status || 'idle').toLowerCase();
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

    async function loadAll() {
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

    document.getElementById('saveTokenBtn').addEventListener('click', () => {
      saveToken();
      loadAll();
    });

    document.getElementById('checkBtn').addEventListener('click', async () => {
      saveToken();
      try {
        const data = await api('/api/admin/sources');
        authStatus.textContent = '连接正常';
        authStatus.className = 'small status-success';
        setOutput(data);
        loadAll();
      } catch (err) {
        authStatus.textContent = '连接失败：' + err.message;
        authStatus.className = 'small status-failed';
        setOutput(err.payload || err.message || String(err));
      }
    });

    document.getElementById('fillTextBtn').addEventListener('click', () => {
      createBody.value = JSON.stringify(defaultCreateBody, null, 2);
    });

    document.getElementById('reloadBtn').addEventListener('click', loadAll);

    document.getElementById('cronBtn').addEventListener('click', async () => {
      try {
        const data = await api('/api/admin/cron/run-once', { method: 'POST' });
        setOutput(data);
        loadAll();
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
        loadAll();
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
          loadAll();
          return;
        }
        if (action === 'toggle') {
          const enabled = target.getAttribute('data-enabled') === '1';
          const data = await api('/api/admin/sources/' + id + '/' + (enabled ? 'disable' : 'enable'), { method: 'POST' });
          setOutput(data);
          loadAll();
          return;
        }
      } catch (err) {
        setOutput(err.payload || err.message || String(err));
      }
    });

    if (getToken()) {
      loadAll();
    }
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
