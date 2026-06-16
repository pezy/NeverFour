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

function renderPage(set, env, currentUrl) {
  const siteTitle = env.SITE_TITLE || "事不过三";
  const ownerName = env.OWNER_NAME || "";
  const slots = [0, 1, 2].map((index) => renderSlot(set.items[index], index)).join("");
  const updated = set.updated_at ? formatDate(set.updated_at) : "Awaiting first POST";
  const description = set.items.map((item) => item.text).join(" · ") || `${siteTitle}: ${set.title}`;
  const canonical = new URL(set.key === "now" ? "/now" : `/${set.key}`, currentUrl).toString();

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(set.title)} · ${escapeHtml(siteTitle)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <meta property="og:title" content="${escapeAttr(`${set.title} · ${siteTitle}`)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(canonical)}">
  <meta property="og:type" content="website">
  <style>
    :root {
      color-scheme: light;
      --paper: oklch(98.3% 0.008 96);
      --ink: oklch(18% 0.018 250);
      --muted: oklch(48% 0.018 250);
      --line: oklch(82% 0.022 105);
      --accent: oklch(48% 0.17 34);
      --wash: oklch(93% 0.028 145);
      --slot: oklch(99% 0.004 96);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--paper);
      color: var(--ink);
      font-family: ui-serif, "Songti SC", "Noto Serif SC", Georgia, serif;
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
      z-index: 1;
    }
    .skip:focus { top: 1rem; }
    main {
      width: min(1120px, calc(100% - 32px));
      min-height: 100vh;
      margin: 0 auto;
      padding: clamp(32px, 7vw, 88px) 0;
      display: grid;
      align-content: center;
      gap: clamp(28px, 5vw, 56px);
    }
    header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: end;
      border-bottom: 1px solid var(--line);
      padding-bottom: clamp(18px, 3vw, 28px);
    }
    .brand {
      margin: 0 0 10px;
      color: var(--accent);
      font: 700 clamp(16px, 2vw, 20px) ui-sans-serif, system-ui, "PingFang SC", sans-serif;
    }
    h1 {
      margin: 0;
      max-width: 12ch;
      font-size: clamp(48px, 10vw, 128px);
      line-height: .92;
      letter-spacing: 0;
      text-wrap: balance;
    }
    .meta {
      margin: 0 0 8px;
      color: var(--muted);
      font: 500 14px/1.5 ui-sans-serif, system-ui, "PingFang SC", sans-serif;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .slots {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: clamp(12px, 2vw, 18px);
    }
    .slot {
      min-height: clamp(210px, 28vw, 340px);
      padding: clamp(18px, 3vw, 28px);
      border-radius: 8px;
      background: var(--slot);
      box-shadow: 0 1px 0 var(--line), 0 18px 50px oklch(18% 0.02 250 / .08);
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 28px;
      text-decoration: none;
      color: inherit;
    }
    .slot.empty {
      background: color-mix(in oklch, var(--wash) 56%, var(--paper));
      box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--line) 70%, transparent);
    }
    .num {
      color: var(--accent);
      font: 700 13px/1 ui-sans-serif, system-ui, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    .text {
      align-self: end;
      margin: 0;
      font-size: clamp(24px, 3.2vw, 42px);
      line-height: 1.14;
      text-wrap: balance;
    }
    .empty .text {
      color: color-mix(in oklch, var(--muted) 45%, transparent);
    }
    footer {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      color: var(--muted);
      font: 500 13px/1.5 ui-sans-serif, system-ui, "PingFang SC", sans-serif;
    }
    @media (hover: hover) {
      a.slot {
        transition: transform 160ms cubic-bezier(.16,1,.3,1), box-shadow 160ms cubic-bezier(.16,1,.3,1);
      }
      a.slot:hover {
        transform: translateY(-3px);
        box-shadow: 0 1px 0 var(--line), 0 24px 60px oklch(18% 0.02 250 / .12);
      }
    }
    @media (max-width: 760px) {
      main { align-content: start; }
      header {
        grid-template-columns: 1fr;
        align-items: start;
      }
      .meta { text-align: left; }
      .slots { grid-template-columns: 1fr; }
      .slot { min-height: 156px; }
      footer { display: grid; }
    }
    @media (prefers-reduced-motion: reduce) {
      a.slot { transition: none; }
      a.slot:hover { transform: none; }
    }
  </style>
</head>
<body>
  <a class="skip" href="#main-content">Skip to main content</a>
  <main id="main-content">
    <header>
      <div>
        <p class="brand">${escapeHtml(siteTitle)}</p>
        <h1>${escapeHtml(set.title)}</h1>
      </div>
      <p class="meta">${escapeHtml(updated)}</p>
    </header>
    <section class="slots" aria-label="${escapeAttr(set.title)}">
      ${slots}
    </section>
    <footer>
      <span>${escapeHtml(ownerName)}</span>
      <span>${escapeHtml(set.key)}</span>
    </footer>
  </main>
</body>
</html>`;
}

function renderSlot(item, index) {
  const number = String(index + 1).padStart(2, "0");
  if (!item) {
    return `<article class="slot empty"><span class="num">${number}</span><p class="text"> </p></article>`;
  }

  const content = `<span class="num">${number}</span><p class="text">${escapeHtml(item.text)}</p>`;
  return item.url
    ? `<a class="slot" href="${escapeAttr(item.url)}" rel="noopener noreferrer">${content}</a>`
    : `<article class="slot">${content}</article>`;
}

function notFound(env) {
  return html(renderPage({ key: "404", title: "未找到", updated_at: null, items: [] }, env, "https://never-four.invalid/"), false, 404);
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
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
