# SourceHub Deployment & Operations

当前版本只有一条正式链路：

1. 原始数据进入仓库 `data/imports/`
2. 规范化为 `data/normalized/probe_input.csv`
3. GitHub Actions 做 probe
4. 只保留成功结果
5. 写回 `src/data/public-results.json`
6. Cloudflare Worker 只负责读取该文件并对外提供接口

---

## 1. 当前架构

### 代码目录

```text
/root/.openclaw/workspace/sourcehub
```

### 线上服务

- Worker 名称：`sourcehub`
- Worker URL：`https://sourcehub.lium840471184.workers.dev`

### 当前已废弃的旧链路

以下思路已经不再是当前实现：

- 数据库存储公开结果
- Worker `scheduled()` 自己做探测
- Cloudflare Cron Trigger 驱动探测
- 旧的探测后刷库链路

---

## 2. 当前真实数据源

Worker 直接读取：

```text
src/data/public-results.json
```

中间文件：

- `data/normalized/probe_input.csv`
- `data/results/probe_results.json`
- `data/results/probe_results.csv`
- `data/results/probe_failures.csv`

---

## 3. GitHub Actions

主 workflow：

```text
.github/workflows/probe-refresh.yml
```

当前行为：

- 支持手动触发和定时触发
- 每 **1 小时** 定时运行
- 默认 `PROBE_LIMIT=300`
- 默认 `PROBE_CONCURRENCY=20`
- 运行 `npm run pipeline:public-results`
- 自动提交结果文件回仓库
- 上传 artifact
- 当 `src/data/public-results.json` 有变化时自动 deploy Worker

---

## 4. Worker 环境变量

当前至少需要：

- `RESULTS_API_TOKEN`：结果接口鉴权 token

`/api/results` 与 `/ui/results` 都已经收口到 `POST`，并且依赖这个 token。

---

## 5. 本地运行

### 安装依赖

```bash
npm install
```

### 类型检查

```bash
npm run check
```

### 跑主线

```bash
npm run pipeline:public-results
```

输出：

- `data/results/probe_results.json`
- `data/results/probe_results.csv`
- `data/results/probe_failures.csv`
- `src/data/public-results.json`

---

## 6. 部署

当前 Worker 只负责提供接口，不负责 probe。

```bash
npm run deploy
```

---

## 7. smoke 检查

```bash
BASE_URL='https://sourcehub.lium840471184.workers.dev' \
RESULTS_TOKEN='your-results-token' \
npm run smoke
```

检查点：

- `/` 可访问
- `POST /api/results` 未鉴权返回 401
- `POST /api/results` 已鉴权正常返回
- 返回元信息中的 `source` 为 `repo_file`

---

## 8. 维护原则

- 仓库文件优先，不再引回数据库中间层
- 公开结果只保留探测成功的 IP
- Worker 保持只读、只展示
- 清理旧遗留，但不做无必要的大删库/大删文件
