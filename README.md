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
- Source 基础配置校验（create / update）
- 结构化校验错误返回（`validation_failed` + `fields`）
- sync 前运行时校验（避免“配置看着合法，一跑就炸”）
- adapter 级失败收口（空结果 / 无效 key / 无效 IP / 过滤后无数据会直接报错）

> 当前是 **Cloudflare 平台优先实现**。业务逻辑有可迁移空间，但运行时、数据库、cron 和 secrets 目前都依赖 Cloudflare。

## License

MIT

## 文档

- 部署与运维：`DEPLOYMENT.md`
- API 调用示例：`API_EXAMPLES.md`

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

可以参考：

```bash
cp .env.example .env
```

需要理解这 4 个值：

- `CLOUDFLARE_API_TOKEN`：给 Wrangler CLI 部署 / `whoami` 使用
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账号 ID
- `CF_API_TOKEN`：给 Worker runtime 调 Cloudflare API 使用
- `ADMIN_TOKEN`：保护 `/api/admin/*`

先检查 deploy 凭据：

```bash
export CLOUDFLARE_API_TOKEN=YOUR_DEPLOY_TOKEN
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID
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

## Source 配置规则

### `text_url`
必须：
- `config.url` 是合法 `http/https` URL
- 当 `parse_mode = line` 时，`config.kind` 必填

可选：
- `config.parse_mode = line | regex_ip`

示例：

```json
{
  "name": "demo text source",
  "type": "text_url",
  "enabled": true,
  "is_public": true,
  "tags": ["demo", "ip"],
  "config": {
    "url": "https://www.cloudflare.com/ips-v4",
    "kind": "ip",
    "parse_mode": "line"
  }
}
```

### `json_api`
必须：
- `config.url` 是合法 `http/https` URL
- `config.kind` 必填
- `config.extract_path` 必填
- `config.field_map` 必填且不能为空
- `config.field_map` 必须至少包含一个稳定键映射：
  - `itemKey`
  - `item_key`
  - `id`
  - `ip`
  - `domain`

示例：

```json
{
  "name": "demo json api",
  "type": "json_api",
  "enabled": true,
  "is_public": false,
  "tags": ["api", "demo"],
  "config": {
    "url": "https://example.com/api/nodes",
    "extract_path": "data.items",
    "kind": "dns_record",
    "field_map": {
      "itemKey": "id",
      "name": "name",
      "type": "type",
      "content": "content"
    },
    "headers": {
      "Authorization": "Bearer YOUR_UPSTREAM_TOKEN"
    }
  }
}
```

### `cloudflare_dns`
必须：
- `config.zone_id` 必填
- `config.zone_id` 必须看起来像 Cloudflare zone id（32 位十六进制）

可选：
- `config.record_types`
- `config.name_filter`

如果传 `config.record_types`，目前只接受：
- `A`
- `AAAA`
- `CNAME`
- `TXT`
- `MX`
- `NS`
- `SRV`
- `CAA`
- `PTR`
- `HTTPS`
- `SVCB`

示例：

```json
{
  "name": "demo cf dns",
  "type": "cloudflare_dns",
  "enabled": true,
  "is_public": false,
  "tags": ["cloudflare", "dns"],
  "config": {
    "zone_id": "YOUR_ZONE_ID",
    "record_types": ["A", "AAAA", "CNAME"],
    "name_filter": "api"
  }
}
```

> 这个 source 依赖 Worker runtime secret：`CF_API_TOKEN`

## 结构化校验错误

create / update / sync 前运行时校验失败时，现在统一返回结构化错误：

```json
{
  "error": "validation_failed",
  "details": {
    "fields": {
      "config.url": "required"
    }
  }
}
```

再比如：

```json
{
  "error": "validation_failed",
  "details": {
    "fields": {
      "config.field_map": "must include one stable key mapping: itemKey, item_key, id, ip, or domain"
    }
  }
}
```

运行前校验还会拦这种情况：

```json
{
  "error": "validation_failed",
  "details": {
    "fields": {
      "env.CF_API_TOKEN": "required for cloudflare_dns sync"
    }
  }
}
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

## 常见错误 / 返回

### `404 Not found`
- 路由不存在
- 或资源 ID 不存在

### `401 Unauthorized`
- 没带 `Authorization: Bearer ...`
- 或 `ADMIN_TOKEN` 不正确

### `400 Bad Request`
常见于：
- source 配置结构不合法
- source 配置虽然存在，但达不到当前更严格规则
- sync 前运行时校验失败

### `429` / 频控拦截
常见于：
- 刚同步完立刻再次 sync

典型文案：

```text
Sync blocked by frequency control. Try again in about X minute(s)
```

### disabled source 拦截
典型文案：

```text
Source is disabled
```

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

## CI

项目当前已包含最轻量 GitHub Actions：
- 安装依赖
- 执行 `npm run check`

## 说明

更详细的流程、复盘和踩坑修正，见：

- `DEPLOYMENT.md`
- `API_EXAMPLES.md`
