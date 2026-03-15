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

> 当前是 **Cloudflare 平台优先实现**。业务逻辑有可迁移空间，但运行时、数据库、cron 和 secrets 目前都依赖 Cloudflare。

## License

MIT

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

## Source 配置示例

### `text_url`

适合：
- 每行一个值的文本源
- IP 列表
- 简单文本列表

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

可选 `parse_mode`：
- `line`
- `regex_ip`

---

### `json_api`

适合：
- 返回 JSON 的接口源
- 需要从 JSON 中抽字段

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

常用配置：
- `url`
- `extract_path`
- `kind`
- `field_map`
- `headers`

---

### `cloudflare_dns`

适合：
- 读取你自己 Cloudflare Zone 下的 DNS 记录

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

常用配置：
- `zone_id`
- `record_types`
- `name_filter`

> 这个 source 依赖 Worker runtime secret：`CF_API_TOKEN`

## 基础配置校验

当前 create / update 已补最基础校验。

### 通用校验
- `name` 必须是非空字符串
- `tags` 必须是字符串数组
- `enabled` / `is_public` 必须是布尔值
- `sync_interval_min` 必须是数字
- `type` 必须是：`text_url | json_api | cloudflare_dns`
- `config` 必须是对象

### `text_url` 校验
- `config.url` 必填
- `config.kind` 如果传，必须是非空字符串
- `config.parse_mode` 如果传，只能是 `line` 或 `regex_ip`

### `json_api` 校验
- `config.url` 必填
- `config.kind` / `config.extract_path` 如果传，必须是非空字符串
- `config.field_map` 如果传，必须是对象，且值必须是非空字符串
- `config.headers` 如果传，必须是对象，且值必须是非空字符串

### `cloudflare_dns` 校验
- `config.zone_id` 必填
- `config.record_types` 如果传，必须是非空字符串数组
- `config.name_filter` 如果传，必须是非空字符串

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
- 缺少某类 source 的必填配置

示例：

```text
text_url config.url is required
json_api config.field_map must be an object
cloudflare_dns config.zone_id is required
```

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
