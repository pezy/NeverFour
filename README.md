# Never Four

事不过三 is a personal self-hosted page for showing the current set of up to three things. The public page is read-only; sets are changed only by authenticated POST requests.

## V1 Scope

- `/` and `/now` show the `now` set.
- `/:setKey` shows an existing set; unknown sets return 404.
- `POST /api/sets/:setKey` replaces the whole set.
- A set contains 0 to 3 items. More than 3 is rejected, not trimmed.
- Each item has `text` and optional `url`.
- Pages are public. Writes require one global `WRITE_TOKEN`.
- Rendering is server-side HTML and CSS.

## Deployment Requirements

- Cloudflare account with Workers and D1 access.
- Node.js and npm.
- Wrangler via `npx wrangler`.
- A Worker named `never-four`.
- A D1 database named `never-four`.
- A production secret named `WRITE_TOKEN`.

Current deployment:

- URL: `https://never-four.urbancpz.workers.dev`
- Worker: `never-four`
- D1 database: `never-four`
- D1 database id: `1da4d2b7-8f64-43aa-8746-0967c994271e`
- Local secret file: `.dev.vars` is intentionally ignored by Git.

## Cloudflare Setup Order

Run these from the project root after the Worker code and `wrangler.toml` exist:

```bash
npx wrangler login
npx wrangler d1 create never-four
npx wrangler secret put WRITE_TOKEN
npx wrangler deploy
```

If `npx wrangler secret put WRITE_TOKEN` says the Worker name is missing, you are either outside the project root or `wrangler.toml` does not define `name = "never-four"` yet.

Temporary workaround:

```bash
npx wrangler secret put WRITE_TOKEN --name never-four
```

Local development:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

## POST Shape

Curl example:

```bash
curl -X POST "$NEVER_FOUR_URL/api/sets/now" \
  -H "authorization: Bearer $WRITE_TOKEN" \
  -H "content-type: application/json" \
  --data '{
    "title": "当前三件事",
    "items": [
      { "text": "Write the product page" },
      { "text": "Read one paper", "url": "https://example.com" }
    ]
  }'
```

Shortcut example:

- Method: `POST`
- URL: `https://<worker>.workers.dev/api/sets/now`
- Headers: `authorization: Bearer <WRITE_TOKEN>`, `content-type: application/json`
- Body: JSON with `title` and `items`

```json
{
  "title": "Current Three",
  "items": [
    { "text": "Write the product page" },
    { "text": "Read one paper", "url": "https://example.com" }
  ]
}
```

Expected success response: the updated set JSON plus its public URL.

## First Implementation Target

Build the smallest Cloudflare Worker that satisfies V1:

- D1 migration for sets and items.
- `wrangler.toml` with Worker name, D1 binding, and required `WRITE_TOKEN` secret.
- One Worker entrypoint for GET pages and POST replacement.
- One small runnable check for auth, three-item rejection, and idempotent replacement.
- README examples for `curl` and iOS Shortcuts.

Skipped for V1: CLI, dynamic OG images, multi-user hosting, history, theme system, and public set index.
