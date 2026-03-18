# sourcehub

一个基于 **Cloudflare Workers + GitHub Actions + 仓库结果文件** 的公开 IP 结果发布服务。

当前主线已经收窄成很简单的一条：

1. 原始数据导入仓库
2. 格式化成 `data/normalized/probe_input.csv`
3. GitHub Actions 读取这个处理好的文件做探测
4. 先经过 imports 质量闸门和增量规范化
5. **只有探测成功的 IP** 才写入结果文件
6. Worker 接口直接读取仓库内的 `src/data/public-results.json` 对外返回

也就是说：

- 不再依赖 Cloudflare D1 存公开结果
- 不再依赖 Worker 里的 scheduled / cron probe 逻辑
- 不再保留旧的“探测后刷 D1”链路

## 当前目录约定

- `data/imports/`：原始导入数据
- `data/normalized/probe_input.csv`：格式化后的待探测 IP 列表
- `data/results/probe_results.json`：本次探测成功结果
- `data/results/probe_results.csv`：本次探测成功结果 CSV
- `data/results/probe_failures.csv`：本次探测失败结果
- `src/data/public-results.json`：Worker 对外 API 直接读取的公开结果文件

## API

结果接口的 token 现在只读取 Worker 环境变量 `RESULTS_API_TOKEN`。如果未配置，接口会直接返回服务端配置错误。

### `POST /api/results`

需要 Bearer Token，并通过 JSON body 提交查询参数。

示例：

```bash
curl "$BASE_URL/api/results" \
  -H "Authorization: Bearer $RESULTS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":5}'
```

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
      "org": "Oracle Corporation",
      "city": "Phoenix",
      "country": "US",
      "checked_at": "2026-03-17T12:05:51.309Z"
    }
  ],
  "meta": {
    "limit": 5,
    "count": 1,
    "total_count": 19,
    "source": "repo_file",
    "country": null,
    "available_countries": ["US"],
    "available_regions": [],
    "scanned": 20,
    "failed": 1,
    "updated_at": "2026-03-17T12:05:51.432Z"
  }
}
```

## 本地执行

### 1. 格式化原始数据

```bash
node scripts/normalize-candidates.mjs
```

### 2. 跑主线

```bash
npm run pipeline:public-results
```

它会：

1. 读取 `data/normalized/probe_input.csv`
2. 探测 IP
3. 只保留探测成功的结果
4. 写入：
   - `data/results/probe_results.json`
   - `data/results/probe_results.csv`
   - `data/results/probe_failures.csv`
   - `src/data/public-results.json`

## GitHub Actions

当前使用 workflow：

- `.github/workflows/probe-refresh.yml`

支持：

- 手动触发
- 每 1 小时定时触发
- 运行后自动把结果文件提交回仓库
- 上传 artifacts 方便查看本次探测结果
- 如果仓库里已经配置 `CLOUDFLARE_API_TOKEN` secret，并且 `src/data/public-results.json` 有变化，则自动 deploy Worker
- 如果没有这个 secret，则 deploy 步骤自动跳过，不会强制失败

## smoke

```bash
BASE_URL="https://your-worker.workers.dev" \
RESULTS_TOKEN="your-results-token" \
npm run smoke
```

`smoke` 当前会检查：

- `/` 可访问
- 未鉴权的 `/api/results` 返回 401
- 已鉴权的 `/api/results` 返回正常
- `meta.source === "repo_file"`

## 当前设计原则

- 原始数据和处理结果都尽量落在仓库文件里
- 对外公开结果只信任“测试成功”的 IP
- 能删的旧逻辑就删，不保留双轨系统
