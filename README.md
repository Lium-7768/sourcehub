# SourceHub

一个基于 **Cloudflare Workers + D1 + Cron Triggers** 的 source manager MVP。

当前版本已经具备：

- Source CRUD（创建 / 列表 / 详情 / 更新 / 启停）
- `cloudflare_dns` source 同步
- `text_url` source 同步（支持 `line` / `regex_ip`）
- `json_api` source 同步（支持 `extract_path` + `field_map`）
- 手动触发同步
- 保守 cron 定时同步
- 同步频率控制
- Public API 基础防刷
- Admin 列表筛选（sources / sync-runs）
- Cron 可观测性（`success / skipped / failed`）
- Admin 调试入口：`POST /api/admin/cron/run-once`

> 当前是 **Cloudflare 平台优先实现**。业务逻辑有可迁移空间，但运行时、数据库、cron 和 secrets 目前都依赖 Cloudflare。

## 文档

- 部署与运维：`DEPLOYMENT.md`

## 当前可用 API

### Admin
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

### Public
- `GET /api/public/items`
- `GET /api/public/export/:sourceId?format=json|txt`

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1

```bash
npx wrangler d1 create sourcehub
```

把返回的 `database_id` 写入 `wrangler.toml`。

### 3. 跑迁移

```bash
npx wrangler d1 migrations apply sourcehub --remote
```

### 4. 准备部署凭据

```bash
export CLOUDFLARE_API_TOKEN=YOUR_DEPLOY_TOKEN
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID
```

先检查：

```bash
npx wrangler whoami
```

### 5. 写入 Worker runtime secrets

```bash
printf '%s' "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
```

### 6. 部署

```bash
npx wrangler deploy
```

## Admin 鉴权

所有 `/api/admin/*` 都要求：

```http
Authorization: Bearer YOUR_ADMIN_TOKEN
```

## 当前筛选能力

### `GET /api/admin/sources`
支持：
- `type=text_url|json_api|cloudflare_dns`
- `enabled=1|0|true|false`
- `is_public=1|0|true|false`

### `GET /api/admin/sync-runs`
支持：
- `source_id=...`
- `status=running|success|failed|skipped`
- `trigger_type=manual|cron`

## Cron 调试

当前提供：

```bash
POST /api/admin/cron/run-once
```

用于：
- 主动执行一次 scheduled 逻辑
- 验证 cron 的 `success / skipped / failed`
- 不必硬等真实 cron

## 当前默认规则

- `sync_interval_min` 最小 5，最大 1440，默认 60
- disabled source 不允许 sync
- cron 默认 `*/30 * * * *`
- `/api/public/items` 默认 `limit=50`，最大 `100`
- `/api/public/export/:sourceId` 上限 `1000`

## 推荐发布流程

1. 改代码
2. `npm run check`
3. `npx wrangler whoami`
4. 必要时更新 Worker secrets
5. `npx wrangler deploy`
6. 打线上 API 回归测试
7. 测通后再宣告完成

## 说明

更详细的流程、复盘和踩坑修正，见：

- `DEPLOYMENT.md`
