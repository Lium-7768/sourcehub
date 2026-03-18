# SourceHub data flow

当前数据目录只服务一条主线：

```text
imports -> normalized -> results -> src/data/public-results.json -> /api/results
```

## 目录说明

### `imports/`
原始输入样本。

规则：
- 只进不改
- 保留原始文件名和批次信息
- 新批次优先新增文件，不覆盖旧文件

### `normalized/`
中间清洗产物。

包含：
- `first_pass_candidates.csv`：第一次标准化后的总表
- `probe_input.csv`：按 IP 去重、适合 probe 的输入
- `first_pass_summary.json`：本次规范化统计摘要
- `quality_gate.json`：imports 质量闸门结果
- `import_manifest.json`：输入文件指纹清单（增量判断依据）
- `cache/`：按文件缓存的规范化结果，用于避免每次全量重跑

### `rejects/`
结构化淘汰结果。

包含：
- `first_pass_rejects.csv`：第一阶段被判定为噪音 / 坏结构 / 不在范围内的记录

### `results/`
probe 输出。

包含：
- `probe_results.json`：本轮 probe 成功结果
- `probe_results.csv`：成功结果 CSV
- `probe_failures.csv`：本轮 probe 未通过项

---

## 当前正式发布链路

```text
data/imports/*
  -> scripts/normalize-candidates.mjs
  -> data/normalized/probe_input.csv
  -> scripts/run-probe-input.mjs
  -> data/results/probe_results.json
  -> scripts/run_probe_and_refresh.mjs
  -> src/data/public-results.json
  -> POST /api/results
```

也就是说：

- `imports/` 是原始输入
- `normalized/` 是可复算的中间结果
- `results/` 是本轮探测产物
- `src/data/public-results.json` 是公开接口真实读取的数据源

---

## 常用操作

### 1. 重新规范化输入

```bash
npm run normalize:candidates
```

### 2. 单独跑 probe

```bash
node scripts/run-probe-input.mjs
```

可选：

```bash
PROBE_LIMIT=200 node scripts/run-probe-input.mjs
```

### 3. 一口气跑完整主线

```bash
npm run pipeline:public-results
```

这个命令现在会自动：

1. 扫描 `data/imports/` 下全部 `csv/json`
2. 先做 imports 质量闸门（空文件 / 超大文件 / 缺字段 / 不支持结构 / 重复批次 stem）
3. 基于 `import_manifest.json` + `cache/` 做增量规范化，没变的文件直接复用缓存
4. 生成 `normalized/` 和 `rejects/`
5. 从 `probe_input.csv` 中读取 IP 做测试
6. 只保留测试成功结果
7. 更新 `src/data/public-results.json`

---

## 注意

- `imports/` 不要直接手改旧样本
- 想加新数据，直接往 `imports/` 里新增文件
- 对外公开只以成功探测结果为准
