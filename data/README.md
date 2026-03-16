# SourceHub data flow

当前数据目录只服务一条主线：

```text
imports -> normalized -> results -> D1 public source -> /api/results
```

## 目录说明

### `imports/`
原始输入样本。

规则：
- 只进不改
- 保留原始文件名和批次信息
- 方便之后复盘来源和重新归一化

### `normalized/`
中间清洗产物。

包含：
- `first_pass_candidates.csv`：第一次标准化后的总表
- `probe_input.csv`：按 IP 去重、适合 probe 的输入
- `first_pass_summary.json`：这次规范化的统计摘要

### `rejects/`
结构化淘汰结果。

包含：
- `first_pass_rejects.csv`：第一阶段就被判定为噪音/坏结构/不在范围内的记录

### `results/`
probe 输出。

包含：
- `probe_results.json`：当前正式刷新到 D1 的输入文件
- `probe_results.csv`：便于人工浏览和导出
- `probe_failures.csv`：本轮 probe 未通过项

---

## 当前正式发布链路

```text
data/results/probe_results.json
  -> scripts/refresh_public_results_db.mjs
  -> D1 source: src_public_results_db
  -> GET /api/results
```

也就是说：

- 文件结果只是中间产物
- 正式对外以 D1 中的公开结果为准
- Public API 不再直接读文件

---

## 常用操作

### 1. 重新规范化输入

```bash
node scripts/normalize-candidates.mjs
```

### 2. 重新跑 probe

```bash
node scripts/run-probe-input.mjs
```

可选：

```bash
PROBE_LIMIT=200 node scripts/run-probe-input.mjs
```

### 3. 把 probe 结果刷新进 D1

```bash
npm run refresh:public-results
```

### 4. 一口气跑完整主线

```bash
npm run pipeline:public-results
```

---

## 注意

- `probe_results.json` 是正式刷新源，改它就等于改即将发布的数据
- `imports/` 不要直接手改
- 如果要新增批次，优先新增文件，不要覆盖旧样本
