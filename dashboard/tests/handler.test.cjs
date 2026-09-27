const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const handler = require("../server/handler.cjs");
const offline = require("../server/offline.cjs");
test("HTTP boundary handles methods, bad JSON, oversized bodies and offline capability", async () => {
  const server = http.createServer((req, res) =>
    req.url.startsWith("/tile") ? offline(req, res) : handler(req, res),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base)).status, 405);
    assert.equal(
      (await fetch(base, { method: "POST", body: "x" })).status,
      415,
    );
    assert.equal(
      (
        await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: "x".repeat(33000) }),
        })
      ).status,
      413,
    );
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"action":"config"}',
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(base + "/tile?z=1&x=0&y=0")).status, 503);
    process.env.OFFLINE_TILE_URL = "http://127.0.0.1/{z}/{x}/{y}";
    assert.equal((await fetch(base + "/tile?z=1")).status, 400);
    assert.equal((await fetch(base + "/tile?z=1&x=20&y=0")).status, 400);
  } finally {
    delete process.env.OFFLINE_TILE_URL;
    await new Promise((r) => server.close(r));
  }
});
