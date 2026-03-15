# SourceHub Deployment & Operations

这份文档面向 **开源项目维护者 / 二次部署者**，记录 `SourceHub` 当前的真实部署结构、环境变量、初始化流程、发布流程、回归检查，以及基于实际操作得到的复盘结论。

---

# 1. 当前架构总览

`SourceHub` 当前是一套 **Cloudflare 平台优先** 的实现。

## 1.1 运行位置

### 源码目录

```text
/root/.openclaw/workspace/sourcehub
```

### 线上服务

当前部署在 **Cloudflare Workers**：

- Worker 名称：`sourcehub`
- Worker URL：`https://sourcehub.lium840471184.workers.dev`

### 数据库

当前使用 **Cloudflare D1**：

- 数据库名：`sourcehub`
- 数据库 ID：`1386437c-4208-47e0-9a07-ee2a1976f9a7`

### 定时任务

当前使用 **Cloudflare Cron Triggers**：

- 表达式：`*/30 * * * *`
- 含义：每 30 分钟触发一次 `scheduled()`

---

# 2. 项目和 Cloudflare 的关系

这不是“顺手用了 Cloudflare”，而是当前版本本身就建立在 Cloudflare 能力之上。

## 2.1 强绑定 Cloudflare 的部分

以下部分当前是 Cloudflare 绑定设计：

- `wrangler.toml`
- Cloudflare Workers 运行时
- D1 数据库绑定 `env.DB`
- Cron Triggers / `scheduled()`
- Worker Secrets（`CF_API_TOKEN` / `ADMIN_TOKEN`）
- `cloudflare_dns` source adapter

## 2.2 相对平台无关的部分

以下业务逻辑本身是可迁移的：

- source / items / sync_runs 数据模型
- `text_url` adapter
- `json_api` adapter
- 管理 API / 公共 API 的路由逻辑
- sync 频率控制
- cron 可观测性逻辑
- public API limit / cache / export 规则

如果未来要迁到 Node/VPS/Vercel/其他平台，主要需要替换的是：

- Workers 入口层
- D1 数据访问层
- scheduled / cron 触发层
- secret 注入方式
- `cloudflare_dns` adapter 的运行时依赖处理

---

# 3. 当前运行时配置

代码中的 `Env` 定义：

```ts
export interface Env {
  DB: D1Database;
  CF_API_TOKEN?: string;
  ADMIN_TOKEN?: string;
}
```

## 3.1 `DB`

这是 Cloudflare D1 的绑定对象，不是普通字符串环境变量。

用途：
- 存 `sources`
- 存 `items`
- 存 `sync_runs`
- 存 `app_settings`（预留/可扩展）

## 3.2 `CF_API_TOKEN`

用途：
- 仅给 `cloudflare_dns` 类型 source 使用
- Worker 运行时读取 Cloudflare DNS 记录

说明：
- 这是 **Worker runtime secret**
- 不是浏览器使用的 token
- 不是 admin token

## 3.3 `ADMIN_TOKEN`

用途：
- 保护 `/api/admin/*`

所有管理接口都必须带：

```http
Authorization: Bearer YOUR_ADMIN_TOKEN
```

---

# 4. 本地 secrets 与线上 secrets 的区别

这是当前项目里最容易混淆的点之一。

## 4.1 本地 secrets 仓库

当前本地敏感值放在：

```text
/root/.openclaw/workspace/.secrets/tokens.json
```

作用：
- 方便本地运维脚本读取
- 方便轮换、别名化管理
- 避免把 token 写进项目仓库

**注意：这个文件不属于开源仓库内容。不要提交。**

## 4.2 Cloudflare Worker Secrets

Worker 真正运行时读取的是 Cloudflare 侧 secret：

- `CF_API_TOKEN`
- `ADMIN_TOKEN`

它们需要通过 Wrangler 写入：

```bash
printf '%s' "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
```

结论：
- `.secrets/tokens.json` = 本地维护用
- `wrangler secret put` = 线上运行时真正生效

---

# 5. 当前 wrangler 配置

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
- 入口文件：`src/index.ts`
- D1 绑定名：`DB`
- cron：每 30 分钟触发一次
- observability：已开启

---

# 6. 初始化流程（首次部署）

以下流程适用于一个全新的 Cloudflare 账号/环境。

## 6.1 克隆项目

```bash
git clone https://github.com/Lium-7768/sourcehub.git
cd sourcehub
```

## 6.2 安装依赖

```bash
npm install
```

## 6.3 准备 Cloudflare CLI 环境

需要准备：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

示例：

```bash
export CLOUDFLARE_API_TOKEN=YOUR_DEPLOY_TOKEN
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID
```

建议先检查：

```bash
npx wrangler whoami
```

如果这里不通，先不要继续后面的部署步骤。

## 6.4 创建 D1 数据库

```bash
npx wrangler d1 create sourcehub
```

把返回的 `database_id` 写回 `wrangler.toml`。

## 6.5 执行迁移

```bash
npx wrangler d1 migrations apply sourcehub --remote
```

如果本地调试需要，也可以先执行：

```bash
npx wrangler d1 migrations apply sourcehub --local
```

## 6.6 写入 Worker runtime secrets

先准备两个值：

- `CF_API_TOKEN`：给 Worker 运行时拉 Cloudflare DNS 用
- `ADMIN_TOKEN`：给 admin API 鉴权用

写入 Cloudflare：

```bash
printf '%s' "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
```

## 6.7 部署

```bash
npx wrangler deploy
```

部署成功后会得到 Worker 地址，例如：

```text
https://sourcehub.<subdomain>.workers.dev
```

---

# 7. 日常改动 / 发布流程（推荐标准流程）

这是当前项目推荐的日常操作顺序。

## 第一步：修改源码

在项目目录内修改：

```text
src/
README.md
DEPLOYMENT.md
wrangler.toml
migrations/
```

## 第二步：本地类型检查

```bash
npm run check
```

这一步必须先过。

## 第二点五步：跑基础自动化测试

```bash
npm test
```

这一步建议作为发版前默认动作。

## 第三步：验证 Cloudflare 凭据

```bash
npx wrangler whoami
```

如果这一步失败：
- 不要急着怀疑代码
- 先检查 token 是否失效 / 权限是否够

## 第四步：必要时更新 runtime secrets

如果改动涉及：
- `CF_API_TOKEN`
- `ADMIN_TOKEN`

就重新写 secret：

```bash
printf '%s' "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
```

## 第五步：部署

```bash
npx wrangler deploy
```

## 第六步：线上回归测试

至少做：

```bash
curl 'https://YOUR_WORKER_URL/'
```

以及：
- admin 接口检查
- public 接口检查
- sync 检查
- 防刷 / 频控检查
- cron/run-once 检查（如果改到了 scheduled 逻辑）

如果要跑项目自带的最小线上回归：

```bash
export BASE_URL='https://YOUR_WORKER_URL'
export ADMIN_TOKEN='YOUR_ADMIN_TOKEN'
npm run smoke
```

## 第七步：测试通过后再宣告完成

不要在“还没测通”时就说已经完成。

---

# 8. 当前 API 总览

## 8.1 Admin API

全部要求：

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

### Cron 调试

- `POST /api/admin/cron/run-once`

用途：
- 直接运行一次 scheduled 逻辑
- 不必等待真实 cron
- 用于验证 `success / skipped / failed`

## 8.2 Public API

- `GET /api/public/items`
- `GET /api/public/export/:sourceId?format=json|txt`

---

# 9. 当前筛选能力

## 9.1 `GET /api/admin/sources`

支持参数：
- `type=text_url|json_api|cloudflare_dns`
- `enabled=1|0|true|false`
- `is_public=1|0|true|false`

示例：

```bash
curl 'https://YOUR_WORKER_URL/api/admin/sources?enabled=1' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

curl 'https://YOUR_WORKER_URL/api/admin/sources?type=text_url&is_public=1' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

## 9.2 `GET /api/admin/sync-runs`

支持参数：
- `source_id=...`
- `status=running|success|failed|skipped`
- `trigger_type=manual|cron`

示例：

```bash
curl 'https://YOUR_WORKER_URL/api/admin/sync-runs?status=success' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

curl 'https://YOUR_WORKER_URL/api/admin/sync-runs?trigger_type=cron&status=skipped' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

curl 'https://YOUR_WORKER_URL/api/admin/sync-runs?source_id=SOURCE_ID&trigger_type=cron' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

---

# 10. 当前同步和 cron 规则

## 10.1 `sync_interval_min`

每个 source 都有同步频率字段：

- 最小：`5`
- 最大：`1440`
- 默认：`60`

## 10.2 手动 sync 规则

- 受频率控制
- source disabled 时禁止执行

## 10.3 cron sync 规则

cron 触发时：
- 只看 `enabled = 1` 的 source
- 没到时间就跳过
- 到时间才执行同步

## 10.4 cron 可观测性

cron 的运行结果现在会写入 `sync_runs`：

- `trigger_type=cron`
- `status=success`
- `status=skipped`
- `status=failed`

这意味着现在不需要靠猜，可以直接查定时任务到底做了什么。

---

# 11. 当前 public API 限制

## `GET /api/public/items`

- 默认 `limit=50`
- 最大 `100`
- 返回短缓存头

## `GET /api/public/export/:sourceId`

- 导出上限 `1000`
- 返回短缓存头

这些规则的目的，是给 MVP 提供最小基础防刷。

---

# 12. 推荐回归检查清单

每次改动后，至少检查下面这些。

## 12.1 基础健康

```bash
curl 'https://YOUR_WORKER_URL/'
```

## 12.2 Public API

```bash
curl 'https://YOUR_WORKER_URL/api/public/items?limit=20'
curl 'https://YOUR_WORKER_URL/api/public/export/SOURCE_ID?format=txt'
```

## 12.3 Admin API

```bash
curl 'https://YOUR_WORKER_URL/api/admin/sources?enabled=1' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

curl 'https://YOUR_WORKER_URL/api/admin/sync-runs?status=success' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

## 12.4 安全收口

- 同一 source 刚 sync 完立刻再 sync，应返回频控拦截
- disable 后再 sync，应返回禁止执行
- public 超大 `limit` 时，应被截到上限

## 12.5 cron / scheduled 逻辑

推荐直接调：

```bash
curl -X POST 'https://YOUR_WORKER_URL/api/admin/cron/run-once' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

然后再查：

```bash
curl 'https://YOUR_WORKER_URL/api/admin/sync-runs?trigger_type=cron' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

---

# 13. 对之前真实操作流程的复盘与纠错

这一节不是“理想流程”，而是基于本项目真实操作过程总结的修正项。

## 13.1 正确的部分

以下做法是对的，应该保留：

1. **先本地 typecheck，再部署**
2. **先验证 `wrangler whoami`，再继续部署**
3. **改完后先自己打线上 API 回归测试，再告诉用户完成**
4. **敏感值不写进开源仓库，统一放本地 secrets / Cloudflare secrets**
5. **把 `sourcehub` 独立成自己的 git 仓库，再推 GitHub**
6. **推送后把带 token 的 remote URL 清理回普通 URL**

## 13.2 发现的问题 / 不推荐继续这样做

### 问题 1：Cloudflare deploy token 和 runtime `CF_API_TOKEN` 容易概念混淆

之前的真实操作里，Cloudflare API Token 同时被用于：
- Wrangler deploy / whoami
- Worker runtime 调 Cloudflare API

这在小项目里能工作，但概念上容易混淆。

**更清晰的建议：**
- `CLOUDFLARE_API_TOKEN`：只给 Wrangler 部署使用
- `CF_API_TOKEN`：只给 Worker runtime 使用

它们可以暂时是同一个值，但文档和操作上要区分语义。

### 问题 2：不要依赖“强行触发 Cloudflare cron”来做可观测性测试

之前尝试过直接去碰 Cloudflare schedules 相关接口来验证 cron，这条路不稳定，也不够直接。

**已经修正：**
- 现在改成用 `POST /api/admin/cron/run-once` 做调试入口
- 这是当前推荐方法

### 问题 3：`wrangler dev` 不是当前项目最可靠的验证路径

之前本地 dev 过程里出现过：
- 连接失败
- 空响应
- 本地行为和线上不完全一致

**当前推荐：**
- `npm run check`
- `npx wrangler deploy`
- 线上 API 回归测试

### 问题 4：文档一度落后于代码

之前 `DEPLOYMENT.md` / `README.md` 曾短暂落后于代码实际能力，比如：
- 没写 `trigger_type`
- 没写 `skipped`
- 没写 `POST /api/admin/cron/run-once`

**现在已修正。**

### 问题 5：GitHub 推送时不要把 token 挂在长期 remote 上

之前 push 时曾用过：

```bash
https://x-access-token:${GITHUB_TOKEN}@github.com/...
```

这个方式可以临时用，但**不能长期保留在 remote 配置里**。

**已修正：**
- 推送后立刻把 remote 改回普通地址

---

# 14. 当前开源维护建议

如果这个项目继续公开维护，建议遵守下面这些规则：

1. **不要把 `.secrets/` 提交到仓库**
2. **不要把任何真实 token 写进 README / DEPLOYMENT / 示例命令**
3. **所有“完成”都以线上回归测试为准，不以本地感觉为准**
4. **接口新增时，同步更新：**
   - `README.md`
   - `DEPLOYMENT.md`
   - 根路由 `/` 的 endpoints 列表
5. **涉及 scheduled 逻辑的改动，优先用 `POST /api/admin/cron/run-once` 验证**

---

# 15. 当前结论

截至目前，`SourceHub` 已经具备：

- source 创建 / 更新 / 启停
- 手动 sync
- cron 定时 sync
- sync 频率控制
- public API 基础防刷
- admin sources 筛选
- admin sync-runs 筛选
- cron run-once 调试入口
- cron success / skipped / failed 可观测

当前状态可以定义为：

**一个已经真实部署、真实回归过的 Cloudflare Workers + D1 后端 MVP。**
