# SourceHub API Examples

这份文档给出 `SourceHub` 最常用的 API 调用示例，尽量保持“拿来就能改”。

在下面所有示例里，先约定两个环境变量：

```bash
export BASE_URL='https://sourcehub.lium840471184.workers.dev'
export ADMIN_TOKEN='YOUR_ADMIN_TOKEN'
```

如果你部署在自己的域名或 workers.dev 子域，把 `BASE_URL` 改成你自己的地址即可。

---

# 1. 查看服务是否在线

```bash
curl "$BASE_URL/"
```

---

# 2. 创建 source

## 2.1 创建 `text_url`

```bash
curl -X POST "$BASE_URL/api/admin/sources" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
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
  }'
```

## 2.2 创建 `json_api`

```bash
curl -X POST "$BASE_URL/api/admin/sources" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
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
  }'
```

## 2.3 创建 `cloudflare_dns`

```bash
curl -X POST "$BASE_URL/api/admin/sources" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
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
  }'
```

---

# 3. 查看 source 列表

## 3.1 查看全部 source

```bash
curl "$BASE_URL/api/admin/sources" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 3.2 带筛选

### 只看启用中的

```bash
curl "$BASE_URL/api/admin/sources?enabled=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 只看公开的 `text_url`

```bash
curl "$BASE_URL/api/admin/sources?type=text_url&is_public=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

# 4. 查看单个 source

```bash
curl "$BASE_URL/api/admin/sources/SOURCE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

# 5. 更新 source

## 5.1 更新同步频率和 tags

```bash
curl -X PUT "$BASE_URL/api/admin/sources/SOURCE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "sync_interval_min": 30,
    "tags": ["prod", "ok"]
  }'
```

## 5.2 更新 config

```bash
curl -X PUT "$BASE_URL/api/admin/sources/SOURCE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "config": {
      "url": "https://www.cloudflare.com/ips-v4",
      "kind": "ip",
      "parse_mode": "regex_ip"
    }
  }'
```

---

# 6. 启用 / 禁用 source

## 6.1 启用

```bash
curl -X POST "$BASE_URL/api/admin/sources/SOURCE_ID/enable" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 6.2 禁用

```bash
curl -X POST "$BASE_URL/api/admin/sources/SOURCE_ID/disable" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

# 7. 手动触发同步

```bash
curl -X POST "$BASE_URL/api/admin/sources/SOURCE_ID/sync" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

如果被频控拦截，典型返回类似：

```json
{
  "error": "Sync blocked by frequency control. Try again in about 30 minute(s)"
}
```

如果 source 已禁用，典型返回类似：

```json
{
  "error": "Source is disabled"
}
```

---

# 8. 查看同步记录

## 8.1 查看全部 sync-runs

```bash
curl "$BASE_URL/api/admin/sync-runs" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 8.2 按状态筛选

```bash
curl "$BASE_URL/api/admin/sync-runs?status=failed" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 8.3 按 source 筛选

```bash
curl "$BASE_URL/api/admin/sync-runs?source_id=SOURCE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 8.4 只看 cron

```bash
curl "$BASE_URL/api/admin/sync-runs?trigger_type=cron" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 8.5 只看 cron skipped

```bash
curl "$BASE_URL/api/admin/sync-runs?trigger_type=cron&status=skipped" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 8.6 查看单条 sync-run

```bash
curl "$BASE_URL/api/admin/sync-runs/RUN_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

# 9. 主动执行一次 cron 逻辑

```bash
curl -X POST "$BASE_URL/api/admin/cron/run-once" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

用途：
- 调试 scheduled 逻辑
- 不必等真实 cron
- 直接观察 `success / skipped / failed`

---

# 10. Public API

## 10.1 查询公开 items

```bash
curl "$BASE_URL/api/public/items"
```

## 10.2 指定 source_id

```bash
curl "$BASE_URL/api/public/items?source_id=SOURCE_ID"
```

## 10.3 指定 kind

```bash
curl "$BASE_URL/api/public/items?kind=dns_record&limit=50"
```

## 10.4 导出 JSON

```bash
curl "$BASE_URL/api/public/export/SOURCE_ID?format=json"
```

## 10.5 导出 TXT

```bash
curl "$BASE_URL/api/public/export/SOURCE_ID?format=txt"
```

---

# 11. 常见失败示例

## 11.1 创建非法 `text_url`

```bash
curl -X POST "$BASE_URL/api/admin/sources" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "name": "bad text",
    "type": "text_url",
    "config": {
      "parse_mode": "line"
    }
  }'
```

返回：

```json
{
  "error": "text_url config.url is required"
}
```

## 11.2 更新非法 `parse_mode`

```bash
curl -X PUT "$BASE_URL/api/admin/sources/SOURCE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "config": {
      "url": "https://www.cloudflare.com/ips-v4",
      "kind": "ip",
      "parse_mode": "bad_mode"
    }
  }'
```

返回：

```json
{
  "error": "text_url config.parse_mode must be line or regex_ip"
}
```

---

# 12. 推荐调试顺序

如果你刚部署完，建议按这个顺序验：

1. `GET /`
2. `POST /api/admin/sources` 创建一个 `text_url`
3. `POST /api/admin/sources/:id/sync`
4. `GET /api/admin/sync-runs?source_id=...`
5. `GET /api/public/items?source_id=...`
6. `GET /api/public/export/:sourceId?format=json`
7. `POST /api/admin/cron/run-once`
8. `GET /api/admin/sync-runs?trigger_type=cron`
