# SourceHub

一个基于 **Cloudflare Workers + D1 + Cron** 的公开结果聚合与发布服务。

当前仓库已经从早期的通用 source manager 方案，收束到一条很窄的主线：

- 从原始样本文件中整理候选
- 生成 probe 输入
- 执行 TCP connect probe
- 将结果刷新到 D1 中的正式公开 source
- 通过 `GET /api/results` 对外提供稳定结果

## 当前状态

已稳定可用的核心能力：

- 文件流整理：`imports -> normalized -> results`
- TCP connect probe（80/443 或指定端口）
- probe 结果写入 D1
- 公开结果接口：`GET /api/results`
- 结果接口 token 鉴权
- 定时 probe（cron）
- unknown / pending_recheck / stale_unknown 生命周期处理
- 自动化测试覆盖关键路径

当前公开结果来自 D1，而不是直接读本地结果文件。

> 注意：仓库当前不再维护完整单元测试集，主验证方式是 `npm run check` + `npm run smoke`。

---

## 核心接口

### Public

#### `GET /api/results`

返回公开 probe 结果。

要求带鉴权头之一：

```http
Authorization: Bearer sourcehub-results-token-v1
```

或：

```http
X-Results-Token: sourcehub-results-token-v1
```

示例：

```bash
curl 'https://YOUR_WORKER/api/results?limit=10' \
  -H 'Authorization: Bearer sourcehub-results-token-v1'
```

查询参数：

- `limit`：默认 `50`，最大 `100`
- `source_id`：可选，只看某个公开 source

返回示例：

```json
{
  "items": [
    {
      "host": "163.192.47.170",
      "latency_ms": 8,
      "loss_pct": 0,
      "jitter_ms": 0,
      "score": 98.4,
      "org": "Oracle Corporation",
      "city": "Belmont",
      "country": "US",
      "checked_at": "2026-03-15T17:59:38.477Z"
    }
  ],
  "meta": {
    "limit": 10,
    "count": 1,
    "source": "db_results"
  }
}
```

### Root

#### `GET /`

最小状态页，返回服务名和当前公开入口。

---

## 数据流

当前主线文件流：

```text
data/imports
  -> data/normalized/first_pass_candidates.csv
  -> data/normalized/probe_input.csv
  -> data/results/probe_results.json
  -> D1 source: src_public_results_db
  -> GET /api/results
```

其中：

- `imports/`：原始输入样本，只进不改
- `normalized/`：清洗和去重后的中间产物
- `results/`：probe 通过结果与失败记录

补充说明见：`data/README.md`

---

## 可执行脚本

### 1. 规范化候选输入

```bash
node scripts/normalize-candidates.mjs
```

输出：

- `data/normalized/first_pass_candidates.csv`
- `data/normalized/probe_input.csv`
- `data/rejects/first_pass_rejects.csv`
- `data/normalized/first_pass_summary.json`

### 2. 执行 probe

```bash
node scripts/run-probe-input.mjs
```

可选环境变量：

- `PROBE_LIMIT`：限制本次扫描条数

输出：

- `data/results/probe_results.json`
- `data/results/probe_results.csv`
- `data/results/probe_failures.csv`

### 3. 刷新公开结果到 D1

```bash
npm run refresh:public-results
```

等价于：

```bash
node scripts/refresh_public_results_db.mjs
```

默认会把：

- `data/results/probe_results.json`

刷新到：

- `src_public_results_db`

### 4. 跑完整主线

```bash
npm run pipeline:public-results
```

等价于：

1. 先跑 probe
2. 再刷新 D1 公共结果

---

## 本地开发

### 安装依赖

```bash
npm install
```

### 类型检查

```bash
npm run check
```

### 烟雾检查

```bash
BASE_URL="https://YOUR_WORKER" RESULTS_TOKEN="sourcehub-results-token-v1" npm run smoke
```

当前仓库不再维护独立单元测试集，保留：

- TypeScript 类型检查
- 线上接口烟雾检查

---

## 部署

### 1. 准备 D1

```bash
npx wrangler d1 create sourcehub
```

把返回的 `database_id` 写进 `wrangler.toml`。

### 2. 跑迁移

```bash
npx wrangler d1 migrations apply sourcehub --remote
```

### 3. 准备 deploy token

```bash
export CLOUDFLARE_API_TOKEN=YOUR_DEPLOY_TOKEN
npx wrangler whoami
```

### 4. 配置运行时 secret

当前主线不依赖额外运行时 secret。

如果你后面自己扩展私有管理接口或第三方同步能力，再按需要增加 secret。

### 5. 部署

```bash
npx wrangler deploy
```

---

## 迁移

当前迁移文件：

- `0001_init.sql`
- `0002_measurements.sql`
- `0003_probe_state.sql`
- `0004_unknown_recheck.sql`

新增含义：

- `0003_probe_state.sql`：给 `sources` 增加 probe 状态字段
- `0004_unknown_recheck.sql`：给 `items` 增加 unknown/recheck 生命周期字段与索引

---

## 排序规则

`GET /api/results` 当前使用稳定排序：

1. `score DESC`
2. `checked_at DESC`
3. `item_key ASC`

这样可以避免同分结果顺序漂移，保证 API 和 DB 抽样对比一致。

---

## 兼容性说明

当前正式对外路径只有：

- `GET /api/results`
- `results/probe_results.json -> D1 -> public API`

仓库已经移除了不再使用的 admin/export/ui/sync 旧模块；如果文档和代码有冲突，以当前主线为准。

---

## 常用命令

```bash
npm run check
BASE_URL="https://YOUR_WORKER" RESULTS_TOKEN="sourcehub-results-token-v1" npm run smoke
npm run refresh:public-results
npm run pipeline:public-results
npx wrangler deploy
```

---

## License

MIT
