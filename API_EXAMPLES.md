# SourceHub API Examples

先约定环境变量：

```bash
export BASE_URL='https://sourcehub.lium840471184.workers.dev'
export RESULTS_TOKEN='your-results-token'
```

---

## 1. 服务状态

```bash
curl "$BASE_URL/"
```

浏览器 UI：

```text
$BASE_URL/ui
```

---

## 2. 读取公开结果

### 2.1 默认读取

```bash
curl "$BASE_URL/api/results" \
  -H "Authorization: Bearer $RESULTS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}'
```

### 2.2 按国家筛选

```bash
curl "$BASE_URL/api/results" \
  -H "Authorization: Bearer $RESULTS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":20,"country":"US"}'
```

### 2.3 未鉴权访问（应返回 401）

```bash
curl "$BASE_URL/api/results" \
  -H "Content-Type: application/json" \
  -d '{"limit":1}'
```

---

## 3. UI 结果接口

`/ui/results` 现在也只接受 `POST`。

```bash
curl "$BASE_URL/ui/results" \
  -H "Content-Type: application/json" \
  -d '{"limit":20,"country":"JP"}'
```

旧的 `GET /ui/results?limit=...&country=...` 已经返回 405。

---

## 4. 返回格式

当前 `/api/results` 直接读取仓库文件 `src/data/public-results.json`。

返回示例：

```json
{
  "items": [
    {
      "host": "129.146.165.161",
      "port": 443,
      "latency_ms": 33,
      "loss_pct": 0,
      "jitter_ms": 0,
      "ping_avg_ms": null,
      "ping_loss_pct": 100,
      "ping_ok": false,
      "tcp_avg_ms": 33,
      "tcp_jitter_ms": 0,
      "tcp_loss_pct": 0,
      "tcp_ok": true,
      "score": 93.4,
      "country": "US",
      "checked_at": "2026-03-18T07:40:40.998Z"
    }
  ],
  "meta": {
    "limit": 10,
    "count": 1,
    "source": "repo_file",
    "country": null,
    "available_countries": ["JP", "SG", "US"],
    "updated_at": "2026-03-18T07:40:40.998Z"
  }
}
```

---

## 5. 本地 smoke

```bash
BASE_URL="$BASE_URL" RESULTS_TOKEN="$RESULTS_TOKEN" npm run smoke
```
