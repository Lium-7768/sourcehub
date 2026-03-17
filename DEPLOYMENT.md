# SourceHub Deployment & Operations

当前版本已经收敛为一条很简单的链路：

1. 原始数据进入仓库
2. 格式化为 `data/normalized/probe_input.csv`
3. GitHub Actions 读取这个文件做探测
4. 只保留探测成功的 IP
5. 写回仓库文件 `src/data/public-results.json`
6. Cloudflare Worker 只负责读这个文件并对外提供 `/api/results`

---

## 1. 当前架构

### 代码目录

```text
/root/.openclaw/workspace/sourcehub
```

### 线上服务

- Worker 名称：`sourcehub`
- Worker URL：`https://sourcehub.lium840471184.workers.dev`

### 当前不再使用的旧组件

以下旧链路已经移除：

- Cloudflare D1 作为公开结果主存储
- Worker `scheduled()` 定时探测
- Cloudflare Cron Trigger 驱动探测
- “探测后刷新 D1” 这条链路

---

## 2. 现在真正生效的数据源

公开结果直接来自仓库文件：

```text
src/data/public-results.json
```

这个文件由 GitHub Actions 更新。

中间文件：

- `data/normalized/probe_input.csv`：处理好的待探测 IP 列表
- `data/results/probe_results.json`：成功结果
- `data/results/probe_results.csv`：成功结果 CSV
- `data/results/probe_failures.csv`：失败结果

---

## 3. 当前 GitHub Actions

主 workflow：

```text
.github/workflows/probe-refresh.yml
```

作用：

- 手动触发或定时触发
- 运行 `npm run pipeline:public-results`
- 更新结果文件
- 自动 commit + push 回仓库
- 上传 artifact

### 输入参数

- `probe_limit`：本次最多测试多少条，默认 `2000`

---

## 4. 本地运行

### 4.1 安装依赖

```bash
npm install
```

### 4.2 类型检查

```bash
npm run check
```

### 4.3 跑主线

```bash
npm run pipeline:public-results
```

会生成：

- `data/results/probe_results.json`
- `data/results/probe_results.csv`
- `data/results/probe_failures.csv`
- `src/data/public-results.json`

---

## 5. 部署

当前 Worker 只负责提供接口，不再负责探测或落库。

部署：

```bash
npm run deploy
```

---

## 6. smoke 检查

```bash
BASE_URL='https://sourcehub.lium840471184.workers.dev' \
RESULTS_TOKEN='sourcehub-results-token-v1' \
npm run smoke
```

检查点：

- `/` 可访问
- `/api/results` 未鉴权返回 401
- `/api/results` 已鉴权正常返回
- 返回元信息中的 `source` 为 `repo_file`

---

## 7. 当前维护原则

- 仓库文件优先，尽量不要再引回数据库中间层
- 公开结果只保留测试成功的 IP
- Worker 尽量保持只读、只展示
- 多余逻辑直接删，不保留双轨
