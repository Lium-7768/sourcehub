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

## 7. 新增一个 Cloudflare source

```json
{
  "name": "my cf zone",
  "type": "cloudflare_dns",
  "enabled": true,
  "is_public": false,
  "tags": ["owned", "cf"],
  "config": {
    "zone_id": "YOUR_ZONE_ID",
    "record_types": ["A", "AAAA", "CNAME"],
    "name_filter": "*.example.com"
  }
}
```

## 8. 新增一个 text_url source

逐行解析：

```json
{
  "name": "public ip list",
  "type": "text_url",
  "enabled": true,
  "is_public": true,
  "tags": ["public", "ip"],
  "config": {
    "url": "https://example.com/ip.txt",
    "kind": "ip",
    "parse_mode": "line"
  }
}
```

整段文本提取 IP：

```json
{
  "name": "regex ip source",
  "type": "text_url",
  "enabled": true,
  "is_public": true,
  "tags": ["public", "ip"],
  "config": {
    "url": "https://example.com/page.txt",
    "parse_mode": "regex_ip"
  }
}
```

## 9. 新增一个 json_api source

```json
{
  "name": "json ip source",
  "type": "json_api",
  "enabled": true,
  "is_public": true,
  "tags": ["public", "api"],
  "config": {
    "url": "https://example.com/api/list",
    "kind": "ip",
    "extract_path": "data.items",
    "field_map": {
      "item_key": "ip",
      "ip": "ip",
      "latency": "latency",
      "speed": "speed"
    }
  }
}
```

## 10. 安全收口默认值

- `sync_interval_min` 最小 5 分钟，最大 1440 分钟
- source 被禁用后，不允许再手动 sync
- 手动 sync / cron sync 都受频率控制
- cron 默认每 30 分钟跑一次：`*/30 * * * *`
- `GET /api/public/items` 默认 `limit=50`，最大 `100`
- `GET /api/public/export/:sourceId` 导出上限 `1000`
- public API 带短缓存头，减轻被刷时的直接压力

## 11. Admin 列表筛选

### sources
支持：
- `type=text_url|json_api|cloudflare_dns`
- `enabled=true|false|1|0`
- `is_public=true|false|1|0`

示例：
```bash
GET /api/admin/sources?enabled=1
GET /api/admin/sources?type=text_url&is_public=1
```

### sync-runs
支持：
- `source_id=...`
- `status=running|success|failed`

示例：
```bash
GET /api/admin/sync-runs?status=failed
GET /api/admin/sync-runs?source_id=SOURCE_ID&status=success
```

## 12. 常用调用

- `POST /api/admin/sources`（带 `Authorization: Bearer YOUR_ADMIN_TOKEN`）
- `PUT /api/admin/sources/:id`（带 `Authorization: Bearer YOUR_ADMIN_TOKEN`）
- `POST /api/admin/sources/:id/enable`（带 `Authorization: Bearer YOUR_ADMIN_TOKEN`）
- `POST /api/admin/sources/:id/disable`（带 `Authorization: Bearer YOUR_ADMIN_TOKEN`）
- `POST /api/admin/sources/:id/sync`（带 `Authorization: Bearer YOUR_ADMIN_TOKEN`）
- `GET /api/admin/sources?enabled=1`
- `GET /api/admin/sources?type=text_url&is_public=1`
- `GET /api/admin/sync-runs?status=failed`
- `GET /api/admin/sync-runs?source_id=SOURCE_ID&status=success`
- `GET /api/admin/sync-runs/:id`（带 `Authorization: Bearer YOUR_ADMIN_TOKEN`）
- `GET /api/public/items?kind=dns_record&limit=50`
- `GET /api/public/items?source_id=SOURCE_ID&limit=50`
- `GET /api/public/export/SOURCE_ID?format=json`
- `GET /api/public/export/SOURCE_ID?format=txt`

## 注意

当前版本还是 MVP：
- 还没有后台登录页面，但已支持最小 Bearer Token 鉴权
- 已支持 source 更新与启停
- 已支持把 Cloudflare DNS 记录写入 `items`
- 已支持 `text_url` source（`line` / `regex_ip`）
- 已支持 `json_api` source（`extract_path` / `field_map`）
- 已支持公开查询和按 source 导出
- 已支持最小安全收口，不再是完全裸奔状态
