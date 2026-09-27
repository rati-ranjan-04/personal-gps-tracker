module.exports = async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end();
  }
  const template = process.env.OFFLINE_TILE_URL;
  if (!template) {
    res.statusCode = 503;
    return res.end("Offline downloads are not configured.");
  }
  const query = new URL(req.url, "http://localhost").searchParams;
  const z = Number(query.get("z")),
    x = Number(query.get("x")),
    y = Number(query.get("y"));
  if (
    !["z", "x", "y"].every((k) => query.has(k) && /^\d+$/.test(query.get(k))) ||
    ![z, x, y].every(Number.isInteger) ||
    z < 0 ||
    z > 17 ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  ) {
    res.statusCode = 400;
    return res.end("Invalid tile.");
  }
  try {
    const url = template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    const type = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !type.startsWith("image/"))
      throw new Error("Tile unavailable");
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length > 2000000) throw new Error("Tile too large");
    res.setHeader("Content-Type", type);
    res.end(bytes);
  } catch {
    res.statusCode = 502;
    res.end("Map tile unavailable.");
  }
};
