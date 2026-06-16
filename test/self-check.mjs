import assert from "node:assert/strict";
import { isAuthorized, normalizePayload, setsEqual, validateSetKey } from "../src/index.js";

assert.equal(validateSetKey("now"), true);
assert.equal(validateSetKey("favorite-repos"), true);
assert.equal(validateSetKey("FavoriteRepos"), false);
assert.equal(validateSetKey(""), false);

assert.deepEqual(
  normalizePayload({
    title: "Current Three",
    items: [
      { text: " Write the product page " },
      { text: "Read one paper", url: "https://example.com/path" },
    ],
  }),
  {
    title: "Current Three",
    items: [{ text: "Write the product page" }, { text: "Read one paper", url: "https://example.com/path" }],
  },
);

assert.equal(
  normalizePayload({
    title: "Too many",
    items: [{ text: "one" }, { text: "two" }, { text: "three" }, { text: "four" }],
  }).error,
  "too_many_items",
);

assert.equal(
  normalizePayload({
    title: "Bad link",
    items: [{ text: "nope", url: "javascript:alert(1)" }],
  }).error,
  "invalid_item",
);

assert.equal(
  isAuthorized(new Request("https://example.com", { headers: { authorization: "Bearer token" } }), "token"),
  true,
);
assert.equal(isAuthorized(new Request("https://example.com"), "token"), false);

const payload = { title: "Idempotent", items: [{ text: "same" }] };
assert.deepEqual(normalizePayload(payload), normalizePayload(payload));
assert.equal(
  setsEqual({ key: "now", title: "Idempotent", updated_at: "2026-06-17T00:00:00.000Z", items: [{ text: "same" }] }, normalizePayload(payload)),
  true,
);
