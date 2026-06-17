# 事不过三 · Never Four

一个自托管的极简页面，只展示「当前最多三件事」。页面公开只读，内容仅能通过带全局 token 的 POST 整组替换。

- `/` 和 `/now` 展示 `now` 这一组。
- `/:setKey` 展示已存在的组，未知组返回 404。
- 一组 0–3 项，超过 3 项会被拒绝（不截断）。

线上实例：<https://never-four.urbancpz.workers.dev>

---

## 部署

需要 Node.js 18+、一个开通了 Workers 和 D1 的 Cloudflare 账号。命令都通过 `npx wrangler` 运行，无需全局安装。

**先在本地跑起来（最快，1 分钟看到页面）：**

```bash
cp .dev.vars.example .dev.vars   # 然后把里面的 WRITE_TOKEN 改成任意本地 token
npm run db:migrate:local         # 建本地 D1 表
npm run dev                      # 打开 http://localhost:8787
npm test                         # 覆盖鉴权 / 超 3 项拒绝 / 整组替换 的最小测试
```

**部署到 Cloudflare：**

```bash
npx wrangler login
npx wrangler d1 create never-four     # 把输出里的 database_id 填进 wrangler.toml 的 [[d1_databases]]
npm run db:migrate:remote             # 给线上 D1 建表
npx wrangler secret put WRITE_TOKEN   # 设置全局写入 token（POST 时要用）
npm run deploy                        # 部署，输出里就是你的 workers.dev 地址
```

部署后访问输出的 `https://never-four.<你的子域>.workers.dev` 即可公开查看。

> 若 `wrangler secret put` 提示找不到 Worker 名，确认你在项目根目录、且 `wrangler.toml` 里 `name = "never-four"`。临时绕过：`npx wrangler secret put WRITE_TOKEN --name never-four`。

---

## curl

用 `WRITE_TOKEN` 整组替换某个 setKey（下例是 `now`）。`items` 给 0–3 项，每项有 `text`、可选 `url`；给 4 项会返回 400。

```bash
export NEVER_FOUR_URL="https://never-four.<你的子域>.workers.dev"
export WRITE_TOKEN="你的-token"

curl -X POST "$NEVER_FOUR_URL/api/sets/now" \
  -H "authorization: Bearer $WRITE_TOKEN" \
  -H "content-type: application/json" \
  --data '{
    "title": "当前三件事",
    "items": [
      { "text": "写产品页面" },
      { "text": "读一篇论文", "url": "https://example.com" }
    ]
  }'
```

成功返回更新后的组 JSON 和它的公开地址 `public_url`。把上面的 `now` 换成别的 setKey（如 `papers`、`books`），就是另一组的独立公开页。

---

## iOS 快捷指令

用「获取 URL 内容」动作即可一键更新：

- **方法**：`POST`
- **URL**：`https://never-four.<你的子域>.workers.dev/api/sets/now`
- **请求头**：
  - `authorization`：`Bearer <你的 WRITE_TOKEN>`
  - `content-type`：`application/json`
- **请求体**：选「JSON」，结构如下

```json
{
  "title": "当前三件事",
  "items": [
    { "text": "写产品页面" },
    { "text": "读一篇论文", "url": "https://example.com" }
  ]
}
```

运行后即可在公开页看到新内容。
