const SET_KEY = /^[a-z0-9-]{1,40}$/;

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "POST" && path.startsWith("/api/sets/")) {
    return replaceSet(request, env, decodeURIComponent(path.slice("/api/sets/".length)));
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const setKey = path === "/" ? "now" : decodeURIComponent(path.slice(1));
  if (!validateSetKey(setKey)) return notFound(env);

  const set = await readSet(env.DB, setKey);
  if (!set && setKey !== "now") return notFound(env);

  const view = set || {
    key: "now",
    title: "当前三件事",
    updated_at: null,
    items: [],
  };

  return html(renderPage(view, env, request.url), request.method === "HEAD");
}

async function replaceSet(request, env, setKey) {
  if (!validateSetKey(setKey)) return json({ error: "invalid_set_key" }, 400);
  if (!isAuthorized(request, env.WRITE_TOKEN)) return json({ error: "unauthorized" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }

  const normalized = normalizePayload(body);
  if (normalized.error) return json({ error: normalized.error }, 400);

  const current = await readSet(env.DB, setKey);
  if (setsEqual(current, normalized)) {
    return json(withPublicUrl(current, request.url));
  }

  const updatedAt = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      "INSERT INTO sets (key, title, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at",
    ).bind(setKey, normalized.title, updatedAt),
    env.DB.prepare("DELETE FROM items WHERE set_key = ?").bind(setKey),
    ...normalized.items.map((item, index) =>
      env.DB.prepare("INSERT INTO items (set_key, position, text, url) VALUES (?, ?, ?, ?)").bind(
        setKey,
        index + 1,
        item.text,
        item.url || null,
      ),
    ),
  ];

  await env.DB.batch(statements);

  return json({
    key: setKey,
    title: normalized.title,
    updated_at: updatedAt,
    items: normalized.items,
    public_url: publicUrl(setKey, request.url),
  });
}

async function readSet(db, setKey) {
  const set = await db.prepare("SELECT key, title, updated_at FROM sets WHERE key = ?").bind(setKey).first();
  if (!set) return null;

  const { results } = await db
    .prepare("SELECT text, url FROM items WHERE set_key = ? ORDER BY position")
    .bind(setKey)
    .all();

  const items = (results || []).map((item) => (item.url ? { text: item.text, url: item.url } : { text: item.text }));
  return { ...set, items };
}

export function validateSetKey(value) {
  return SET_KEY.test(value);
}

export function isAuthorized(request, token) {
  return Boolean(token) && request.headers.get("authorization") === `Bearer ${token}`;
}

export function setsEqual(current, incoming) {
  if (!current) return false;
  return JSON.stringify({ title: current.title, items: current.items }) === JSON.stringify(incoming);
}

export function normalizePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid_payload" };
  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 80) {
    return { error: "invalid_payload" };
  }
  if (!Array.isArray(body.items)) return { error: "invalid_payload" };
  if (body.items.length > 3) return { error: "too_many_items" };

  const items = [];
  for (const item of body.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "invalid_item" };
    if (typeof item.text !== "string" || !item.text.trim() || item.text.length > 200) {
      return { error: "invalid_item" };
    }

    const text = item.text.trim();
    const url = normalizeUrl(item.url);
    if (url === false) return { error: "invalid_item" };
    items.push(url ? { text, url } : { text });
  }

  return { title: body.title.trim(), items };
}

function normalizeUrl(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : false;
  } catch {
    return false;
  }
}

function withPublicUrl(set, requestUrl) {
  return { ...set, public_url: publicUrl(set.key, requestUrl) };
}

function publicUrl(setKey, requestUrl) {
  return new URL(setKey === "now" ? "/now" : `/${setKey}`, requestUrl).toString();
}

const STYLE = `
    :root {
      color-scheme: light;
      --paper: oklch(98.5% 0.009 92);
      --ink: oklch(22% 0.014 65);
      --muted: oklch(50% 0.012 68);
      --faint: oklch(70% 0.012 72);
      --line: oklch(87% 0.013 82);
      --accent: oklch(47% 0.176 33);
      --fill: oklch(99.5% 0.004 92);
      --empty: oklch(96.4% 0.008 90);
      --shadow: 22% 0.02 65;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--paper);
      color: var(--ink);
      font-family: "Songti SC", ui-serif, "Noto Serif SC", Georgia, serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .skip {
      position: absolute;
      left: 1rem;
      top: -4rem;
      background: var(--ink);
      color: var(--paper);
      padding: .7rem 1rem;
      border-radius: 4px;
      z-index: 1;
    }
    .skip:focus { top: 1rem; }
    main {
      width: min(1120px, calc(100% - 40px));
      min-height: 100vh;
      margin: 0 auto;
      padding: clamp(32px, 7vw, 88px) 0;
      display: grid;
      align-content: center;
      gap: clamp(28px, 5vw, 52px);
    }
    header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: end;
      border-bottom: 1px solid var(--line);
      padding-bottom: clamp(16px, 2.4vw, 24px);
    }
    .brand {
      margin: 0 0 12px;
      color: var(--accent);
      font: 700 clamp(15px, 1.6vw, 18px)/1 ui-sans-serif, system-ui, "PingFang SC", sans-serif;
      letter-spacing: .02em;
    }
    h1 {
      margin: 0;
      max-width: 12ch;
      font-size: clamp(46px, 9.5vw, 120px);
      line-height: .94;
      letter-spacing: .01em;
      text-wrap: balance;
    }
    .meta {
      margin: 0 0 10px;
      color: var(--muted);
      font: 500 13px/1.5 ui-sans-serif, system-ui, "PingFang SC", sans-serif;
      text-align: right;
      letter-spacing: .04em;
      font-variant-numeric: tabular-nums;
    }
    .slots {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: clamp(12px, 1.6vw, 16px);
    }
    .slot {
      position: relative;
      min-height: clamp(176px, 21vw, 260px);
      padding: clamp(20px, 2.4vw, 30px);
      border-radius: 4px;
      border: 1px solid var(--line);
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 18px;
      text-decoration: none;
      color: inherit;
    }
    .slot.filled {
      background: var(--fill);
      box-shadow: 0 1px 2px oklch(var(--shadow) / .06), 0 14px 32px oklch(var(--shadow) / .06);
    }
    .slot.empty {
      background: var(--empty);
      border-style: dashed;
      border-color: color-mix(in oklch, var(--line) 82%, var(--ink));
    }
    .num {
      color: var(--accent);
      font: 700 12px/1 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: .16em;
      font-variant-numeric: tabular-nums;
    }
    .empty .num { color: var(--faint); }
    .text {
      align-self: end;
      margin: 0;
      font-size: clamp(23px, 2.9vw, 38px);
      line-height: 1.18;
      text-wrap: balance;
    }
    .go {
      position: absolute;
      top: clamp(18px, 2.2vw, 28px);
      right: clamp(18px, 2.2vw, 28px);
      color: var(--faint);
      font: 600 17px/1 ui-sans-serif, system-ui, sans-serif;
    }
    .notice {
      display: grid;
      gap: 20px;
      justify-items: start;
      padding: clamp(8px, 2vw, 24px) 0;
    }
    .notice p {
      margin: 0;
      max-width: 24ch;
      font-size: clamp(20px, 2.4vw, 30px);
      line-height: 1.42;
      color: var(--muted);
    }
    .back {
      color: var(--accent);
      text-decoration: none;
      font: 600 15px/1 ui-sans-serif, system-ui, "PingFang SC", sans-serif;
      letter-spacing: .02em;
    }
    .back:hover { text-decoration: underline; text-underline-offset: 4px; }
    footer {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      color: var(--muted);
      font: 500 12px/1.5 ui-sans-serif, system-ui, "PingFang SC", sans-serif;
      letter-spacing: .04em;
    }
    .key { color: var(--faint); }
    @media (hover: hover) {
      a.slot {
        transition: transform 180ms cubic-bezier(.16,1,.3,1), box-shadow 180ms cubic-bezier(.16,1,.3,1);
      }
      a.slot:hover {
        transform: translateY(-2px);
        box-shadow: 0 2px 3px oklch(var(--shadow) / .05), 0 20px 42px oklch(var(--shadow) / .10);
      }
      a.slot .go { transition: transform 180ms cubic-bezier(.16,1,.3,1), color 180ms; }
      a.slot:hover .go { color: var(--accent); transform: translate(2px, -2px); }
    }
    @media (max-width: 760px) {
      main { align-content: start; }
      header {
        grid-template-columns: 1fr;
        align-items: start;
      }
      .meta { text-align: left; }
      .slots { grid-template-columns: 1fr; }
      .slot { min-height: clamp(120px, 26vw, 156px); }
      footer { display: grid; gap: 6px; }
    }
    @media (prefers-reduced-motion: reduce) {
      a.slot, a.slot .go { transition: none; }
      a.slot:hover { transform: none; }
    }`;

function documentShell(head, body) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${head}
  <style>${STYLE}
  </style>
</head>
<body>
  <a class="skip" href="#main-content">跳到主要内容</a>
  <main id="main-content">
${body}
  </main>
</body>
</html>`;
}

function renderPage(set, env, currentUrl) {
  const siteTitle = env.SITE_TITLE || "事不过三";
  const ownerName = env.OWNER_NAME || "";
  const slots = [0, 1, 2].map((index) => renderSlot(set.items[index], index)).join("\n      ");
  const meta = set.updated_at ? formatDate(set.updated_at) : "尚未发布";
  const description = set.items.map((item) => item.text).join(" · ") || `${siteTitle}：${set.title}`;
  const canonical = new URL(set.key === "now" ? "/now" : `/${set.key}`, currentUrl).toString();

  const head = `  <title>${escapeHtml(set.title)} · ${escapeHtml(siteTitle)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <meta property="og:title" content="${escapeAttr(`${set.title} · ${siteTitle}`)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(canonical)}">
  <meta property="og:type" content="website">`;

  const body = `    <header>
      <div>
        <p class="brand">${escapeHtml(siteTitle)}</p>
        <h1>${escapeHtml(set.title)}</h1>
      </div>
      <p class="meta">${escapeHtml(meta)}</p>
    </header>
    <section class="slots" aria-label="${escapeAttr(set.title)}">
      ${slots}
    </section>
    <footer>
      <span>${escapeHtml(ownerName)}</span>
      <span class="key">${escapeHtml(set.key)}</span>
    </footer>`;

  return documentShell(head, body);
}

function renderSlot(item, index) {
  const number = String(index + 1).padStart(2, "0");
  if (!item) {
    return `<article class="slot empty"><span class="num">${number}</span><p class="text" aria-hidden="true"></p></article>`;
  }

  const inner = `<span class="num">${number}</span><p class="text">${escapeHtml(item.text)}</p>`;
  return item.url
    ? `<a class="slot filled" href="${escapeAttr(item.url)}" rel="noopener noreferrer"><span class="go" aria-hidden="true">↗</span>${inner}</a>`
    : `<article class="slot filled">${inner}</article>`;
}

function renderNotFound(env) {
  const siteTitle = env.SITE_TITLE || "事不过三";
  const ownerName = env.OWNER_NAME || "";

  const head = `  <title>未找到 · ${escapeHtml(siteTitle)}</title>
  <meta name="robots" content="noindex">`;

  const body = `    <header>
      <div>
        <p class="brand">${escapeHtml(siteTitle)}</p>
        <h1>未找到</h1>
      </div>
      <p class="meta">404</p>
    </header>
    <section class="notice">
      <p>这个集合不存在，或者还没有内容。</p>
      <a class="back" href="/now">回到 now →</a>
    </section>
    <footer>
      <span>${escapeHtml(ownerName)}</span>
      <span class="key">404</span>
    </footer>`;

  return documentShell(head, body);
}

function notFound(env) {
  return html(renderNotFound(env), false, 404);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function html(body, headOnly, status = 200) {
  return new Response(headOnly ? null : body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function formatDate(value) {
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
