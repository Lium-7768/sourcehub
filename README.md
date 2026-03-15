# SourceHub

一个基于 Cloudflare Workers + D1 的 source manager MVP。

当前已完成的最小能力：
- D1 表结构初始化
- Source CRUD（当前支持创建、列表、详情、更新、启停）
- `cloudflare_dns` source 同步
- `text_url` source 同步（支持 `line` / `regex_ip`）
- `json_api` source 同步（支持 `extract_path` + `field_map`）
- 手动触发同步 API
- 保守 cron 定时同步（默认每 30 分钟触发一次）
- 基础同步频率控制
- Public API 基础防刷（limit / cache / 导出上限）
- Admin 列表最小筛选（sources / sync-runs）
- Cron 可观测性（`sync_runs` 记录 `cron` 的 `success / skipped / failed`）
- Admin 调试入口：`POST /api/admin/cron/run-once`

## 当前可用 API

- `GET /`
- `GET /api/admin/sources`
- `POST /api/admin/sources`
- `GET /api/admin/sources/:id`
- `PUT /api/admin/sources/:id`
- `POST /api/admin/sources/:id/enable`
- `POST /api/admin/sources/:id/disable`
- `POST /api/admin/sources/:id/sync`
- `GET /api/admin/sync-runs`
- `GET /api/admin/sync-runs/:id`
- `POST /api/admin/cron/run-once`
- `GET /api/public/items`
- `GET /api/public/export/:sourceId?format=json|txt`

## 1. 安装依赖

```bash
npm install
```

## 2. 创建 D1 数据库

```bash
npx wrangler d1 create sourcehub
```

把返回的 `database_id` 填进 `wrangler.toml` 的 `database_id`。

## 3. 执行迁移

```bash
npx wrangler d1 migrations apply sourcehub --local
```

部署前再跑一次远程：

```bash
npx wrangler d1 migrations apply sourcehub --remote
```

## 4. 本地启动

```bash
npm run dev
```

## 5. 运行时注入环境变量

本项目当前使用两个运行时环境变量：

- `CF_API_TOKEN`
- `ADMIN_TOKEN`

本地开发示例：

```bash
export CF_API_TOKEN=YOUR_CF_API_TOKEN
export ADMIN_TOKEN=YOUR_ADMIN_TOKEN
npm run dev
```

## 6. 调用 Admin API

所有 `/api/admin/*` 请求都需要带：

```http
Authorization: Bearer YOUR_ADMIN_TOKEN
```

## 7. 安全收口默认值

- `sync_interval_min` 最小 5 分钟，最大 1440 分钟
- source 被禁用后，不允许再手动 sync
- 手动 sync / cron sync 都受频率控制
- cron 默认每 30 分钟跑一次：`*/30 * * * *`
- `GET /api/public/items` 默认 `limit=50`，最大 `100`
- `GET /api/public/export/:sourceId` 导出上限 `1000`
- public API 带短缓存头，减轻被刷时的直接压力

## 8. Admin 列表筛选

### sources
支持：
- `type=text_url|json_api|cloudflare_dns`
- `enabled=true|false|1|0`
- `is_public=true|false|1|0`

### sync-runs
支持：
- `source_id=...`
- `status=running|success|failed|skipped`
- `trigger_type=manual|cron`

## 9. Cron 可观测性

cron 结果会写入 `sync_runs`：

- `trigger_type=cron`
- `status=success`：定时同步成功
- `status=skipped`：没到同步时间，主动跳过
- `status=failed`：定时同步失败

并且现在可以用调试入口主动执行一次：

```bash
POST /api/admin/cron/run-once
```

这样不需要硬等真实 cron，就能验证 scheduled 逻辑。
