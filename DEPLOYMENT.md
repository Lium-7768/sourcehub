# SourceHub Deployment & Operations

这份文档记录 **SourceHub 当前真实可用的部署方式、运行位置、环境变量、运维步骤**。

## 1. 项目位置

### 本地源码目录

```text
/root/.openclaw/workspace/sourcehub
```

这是当前 SourceHub 的源码目录。所有开发、修改、检查、部署都从这里进行。

### 线上运行位置

SourceHub 当前运行在 **Cloudflare Workers**：

- Worker 名称：`sourcehub`
- 线上地址：`https://sourcehub.lium840471184.workers.dev`

### 数据库位置

SourceHub 当前使用 **Cloudflare D1**：

- 数据库名：`sourcehub`
- 数据库 ID：`1386437c-4208-47e0-9a07-ee2a1976f9a7`

## 2. 运行时配置

当前 Worker 运行时依赖以下绑定 / 环境变量：

### D1 绑定

- `DB`

在代码中的定义：

```ts
export interface Env {
  DB: D1Database;
  CF_API_TOKEN?: string;
  ADMIN_TOKEN?: string;
}
```

### 环境变量

#### `CF_API_TOKEN`
用途：
- 给 `cloudflare_dns` 类型 source 使用
- Worker 运行时调用 Cloudflare API 读取 DNS 记录

#### `ADMIN_TOKEN`
用途：
- 保护 `/api/admin/*`
- 所有管理接口都必须带：

```http
Authorization: Bearer YOUR_ADMIN_TOKEN
```

## 3. 本地 secrets 存放方式

当前敏感值统一放在本地：

```text
/root/.openclaw/workspace/.secrets/tokens.json
```

注意：
- 这是**本地凭据仓库**，方便取值、轮换、复用
- 线上 Worker 真正使用的 secret 仍然需要通过 `wrangler secret put` 注入

## 4. 当前 wrangler 配置

当前 `wrangler.toml`：

```toml
name = "sourcehub"
main = "src/index.ts"
compatibility_date = "2025-03-15"

[[d1_databases]]
binding = "DB"
database_name = "sourcehub"
database_id = "1386437c-4208-47e0-9a07-ee2a1976f9a7"

[triggers]
crons = ["*/30 * * * *"]

[observability]
enabled = true
```

含义：
- Worker 名称：`sourcehub`
- D1 绑定：`DB`
- 定时任务：每 30 分钟触发一次
- 已开启 observability

## 5. 当前 npm scripts

```json
{
  "dev": "wrangler dev",
  "deploy": "wrangler deploy",
  "cf-typegen": "wrangler types",
  "check": "tsc --noEmit"
}
```

最常用的是：

```bash
npm run check
npm run deploy
```

## 6. 初始化 / 部署流程

## 第一步：进入项目目录

```bash
cd /root/.openclaw/workspace/sourcehub
```

## 第二步：安装依赖

```bash
npm install
```

## 第三步：创建 D1（仅首次）

```bash
npx wrangler d1 create sourcehub
```

创建完成后，把返回的 `database_id` 填回 `wrangler.toml`。

## 第四步：执行迁移

本地：

```bash
npx wrangler d1 migrations apply sourcehub --local
```

远程：

```bash
npx wrangler d1 migrations apply sourcehub --remote
```

## 第五步：准备 Cloudflare 环境变量

部署前需要提供：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

示例：

```bash
export CLOUDFLARE_API_TOKEN=YOUR_CF_TOKEN
export CLOUDFLARE_ACCOUNT_ID=52a843c7becbd1c0a0756b1cf4983948
```

建议先验证：

```bash
npx wrangler whoami
```

如果这里失败，通常不是代码问题，而是 token 失效 / 权限不够。

## 第六步：写入 Worker secrets

把运行时真正需要的 secret 写入 Cloudflare Worker：

```bash
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
printf '%s' "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN
```

注意：
- `CF_API_TOKEN` 是给 Worker 运行时调用 Cloudflare API 用的
- `ADMIN_TOKEN` 是给 `/api/admin/*` 鉴权用的

## 第七步：部署

```bash
npx wrangler deploy
```

部署成功后，Worker 会更新到线上地址：

```text
https://sourcehub.lium840471184.workers.dev
```

## 7. 当前 cron 机制

当前定时器：

```toml
[triggers]
crons = ["*/30 * * * *"]
```

即：
- 每 30 分钟触发一次 Worker 的 scheduled 入口

但并不是每次都强制全量同步，而是：
- 只处理 `enabled = 1` 的 source
- 只有到达 `sync_interval_min` 的 source 才真正执行 sync
- 没到时间就跳过

## 8. 当前同步控制规则

每个 source 有一个字段：

- `sync_interval_min`

当前规则：
- 最小值：`5`
- 最大值：`1440`
- 默认值：`60`

并且：
- 手动 sync 受频率控制
- cron sync 也受频率控制
- source 被 disable 后，不允许继续 sync

## 9. 当前 public API 的基础防刷规则

### `GET /api/public/items`

- 默认：`limit=50`
- 最大：`100`
- 返回缓存头

### `GET /api/public/export/:sourceId`

- 导出上限：`1000`
- 返回缓存头

## 10. 当前管理接口

以下接口都需要：

```http
Authorization: Bearer YOUR_ADMIN_TOKEN
```

### Source 管理

- `GET /api/admin/sources`
- `POST /api/admin/sources`
- `GET /api/admin/sources/:id`
- `PUT /api/admin/sources/:id`
- `POST /api/admin/sources/:id/enable`
- `POST /api/admin/sources/:id/disable`
- `POST /api/admin/sources/:id/sync`

### Sync Run 管理

- `GET /api/admin/sync-runs`
- `GET /api/admin/sync-runs/:id`

## 11. 当前筛选能力

### `GET /api/admin/sources`
支持参数：
- `type=text_url|json_api|cloudflare_dns`
- `enabled=1|0|true|false`
- `is_public=1|0|true|false`

示例：

```bash
curl 'https://sourcehub.lium840471184.workers.dev/api/admin/sources?enabled=1' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

curl 'https://sourcehub.lium840471184.workers.dev/api/admin/sources?type=text_url&is_public=1' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### `GET /api/admin/sync-runs`
支持参数：
- `source_id=...`
- `status=running|success|failed`

示例：

```bash
curl 'https://sourcehub.lium840471184.workers.dev/api/admin/sync-runs?status=success' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

curl 'https://sourcehub.lium840471184.workers.dev/api/admin/sync-runs?source_id=SOURCE_ID&status=success' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

## 12. 典型日常操作流程

推荐固定流程：

1. 修改源码
2. 本地检查类型
3. 验证 Cloudflare token
4. 必要时更新 Worker secrets
5. 部署
6. 线上回归测试
7. 测通后再对外宣告完成

对应命令示例：

```bash
cd /root/.openclaw/workspace/sourcehub
npm run check

export CLOUDFLARE_API_TOKEN=YOUR_CF_TOKEN
export CLOUDFLARE_ACCOUNT_ID=52a843c7becbd1c0a0756b1cf4983948
npx wrangler whoami

printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
printf '%s' "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN

npx wrangler deploy
```

## 13. 部署后建议回归项

至少检查这些：

### 基础检查
```bash
curl 'https://sourcehub.lium840471184.workers.dev/'
```

### Public API
```bash
curl 'https://sourcehub.lium840471184.workers.dev/api/public/items?limit=20'
curl 'https://sourcehub.lium840471184.workers.dev/api/public/export/SOURCE_ID?format=txt'
```

### Admin API
```bash
curl 'https://sourcehub.lium840471184.workers.dev/api/admin/sources?enabled=1' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

curl 'https://sourcehub.lium840471184.workers.dev/api/admin/sync-runs?status=success' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### 安全收口检查
- 同一 source 刚 sync 完立刻再 sync，应返回频控拦截
- disable 后再 sync，应被拦下
- public `limit` 超大时，应被压到最大值

## 14. 当前注意事项

### 1）Cloudflare token 是当前最不稳定点
最近几次部署过程里，Cloudflare token 出现过“刚能用，过会儿又失效”的情况。

所以如果部署失败，优先检查：

```bash
npx wrangler whoami
```

而不是先怀疑代码。

### 2）本地 `wrangler dev` 参考价值低于线上回归
此前本地 dev 过程里出现过连不上、空响应等问题，因此目前更可靠的方式是：

- `npm run check`
- `npx wrangler deploy`
- 线上 API 回归测试

## 15. 当前结论

截至目前，SourceHub 已经具备：

- source 创建 / 更新 / 启停
- 手动 sync
- cron 保守同步
- 同步频率控制
- public API 基础防刷
- admin sources 筛选
- admin sync-runs 筛选

当前已经达到：

**最小可运行 + 最小安全收口 + 最小可观测** 的后端 MVP 状态。
