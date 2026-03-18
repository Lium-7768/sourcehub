# sourcehub

一个基于 **Cloudflare Workers + GitHub Actions + 仓库结果文件** 的公开结果发布服务。

当前主线已经收敛为一条很简单的链路：

1. 原始数据进入仓库 `data/imports/`
2. 规范化生成 `data/normalized/probe_input.csv`
3. GitHub Actions 运行 probe pipeline
4. 只保留探测成功的结果
5. 写回 `data/results/*` 和 `src/data/public-results.json`
6. Worker 直接读取仓库内的 `src/data/public-results.json` 对外提供接口

也就是说：

- 不再依赖数据库存公开结果
- 不再依赖 Worker 内部的定时 probe
- 不再保留旧的“探测后刷库”双轨链路

## 当前目录约定

- `data/imports/`：原始导入数据
- `data/normalized/probe_input.csv`：规范化后的待探测列表
- `data/results/probe_results.json`：本轮 probe 成功结果
- `data/results/probe_results.csv`：成功结果 CSV
- `data/results/probe_failures.csv`：失败结果 CSV
- `src/data/public-results.json`：Worker 真实对外读取的数据源

## API

结果接口 token 只读取 Worker 环境变量 `RESULTS_API_TOKEN`。
如果未配置，接口会直接返回服务端配置错误。

### `POST /api/results`

需要 Bearer Token，并通过 JSON body 提交查询参数。

示例：

```bash
curl "$BASE_URL/api/results" \
  -H "Authorization: Bearer $RESULTS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":5,"country":"JP"}'
```

### `GET /ui`

浏览器页面入口。

### `POST /ui/results`

UI 内部结果接口。现在也只接受 `POST`，旧的 `GET /ui/results?...` 已经封掉。

## 本地执行

### 1. 安装依赖

```bash
npm install
```

### 2. 类型检查

```bash
npm run check
```

### 3. 规范化输入

```bash
npm run normalize:candidates
```

### 4. 跑完整主线

```bash
npm run pipeline:public-results
```

它会：

1. 扫描 `data/imports/`
2. 做 imports 质量闸门和增量规范化
3. 生成 `data/normalized/probe_input.csv`
4. 运行 probe
5. 更新 `data/results/*`
6. 更新 `src/data/public-results.json`

## GitHub Actions

主 workflow：

- `.github/workflows/probe-refresh.yml`

当前行为：

- 支持手动触发
- 每 **1 小时** 定时触发
- 默认 `PROBE_LIMIT=300`
- 默认 `PROBE_CONCURRENCY=20`
- 运行后自动提交结果文件回仓库
- 当 `src/data/public-results.json` 有变化时，自动 deploy Worker

## smoke

```bash
BASE_URL="https://your-worker.workers.dev" \
RESULTS_TOKEN="your-results-token" \
npm run smoke
```

当前 smoke 会检查：

- `/` 可访问
- 未鉴权 `POST /api/results` 返回 401
- 已鉴权 `POST /api/results` 返回正常
- `meta.source === "repo_file"`

## 当前设计原则

- 原始数据和处理结果尽量保留在仓库文件里
- 对外公开结果只信任“测试成功”的 IP
- Worker 尽量保持只读、只展示
- 清理旧逻辑，但不随手删除现有数据样本和产物
