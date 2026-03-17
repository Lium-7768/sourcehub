# SourceHub API Examples

当前版本只保留最小公开结果接口。

先约定环境变量：

```bash
export BASE_URL='https://sourcehub.lium840471184.workers.dev'
export RESULTS_TOKEN='sourcehub-results-token-v1'
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
curl "$BASE_URL/api/results?limit=10" \
  -H "Authorization: Bearer $RESULTS_TOKEN"
```

### 2.2 按国家筛选

```bash
curl "$BASE_URL/api/results?limit=20&country=US" \
  -H "Authorization: Bearer $RESULTS_TOKEN"
```

### 2.3 未鉴权访问（应返回 401）

```bash
curl "$BASE_URL/api/results?limit=1"
```

---

## 3. 返回格式

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
      "score": 93.4,
      "country": "US",
      "checked_at": "2026-03-17T12:05:51.309Z"
    }
  ],
  "meta": {
    "limit": 10,
    "count": 1,
    "source": "repo_file",
    "country": null,
    "available_countries": ["US"],
    "scanned": 20,
    "failed": 1,
    "updated_at": "2026-03-17T12:05:51.432Z"
  }
}
```

---

## 4. 本地 smoke

```bash
BASE_URL="$BASE_URL" RESULTS_TOKEN="$RESULTS_TOKEN" npm run smoke
```

当前 smoke 会检查：

- `/` 正常
- 未鉴权 `/api/results` 返回 401
- 已鉴权 `/api/results` 返回 200
- `meta.source === "repo_file"`
