const { dispatch } = require("./providers.cjs");
const buckets = new Map();
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end(
      JSON.stringify({ error: "Use POST for navigation requests." }),
    );
  }
  res.setHeader("Content-Type", "application/json");
  if (!(req.headers["content-type"] || "").startsWith("application/json")) {
    res.statusCode = 415;
    return res.end(JSON.stringify({ error: "JSON required." }));
  }
  const now = Date.now();
  for (const [key, b] of buckets) if (now - b.time > 60000) buckets.delete(key);
  const ip = req.socket?.remoteAddress || "client";
  const bucket = buckets.get(ip) || { time: now, count: 0 };
  bucket.count++;
  if (buckets.size < 1000 || buckets.has(ip)) buckets.set(ip, bucket);
  if (bucket.count > 90 || (!buckets.has(ip) && buckets.size >= 1000)) {
    res.statusCode = 429;
    return res.end(
      JSON.stringify({ error: "Too many requests. Try again in a minute." }),
    );
  }
  try {
    let body = req.body;
    if (
      body &&
      Buffer.byteLength(
        typeof body === "string" ? body : JSON.stringify(body),
      ) > 32768
    ) {
      res.statusCode = 413;
      return res.end(JSON.stringify({ error: "Request too large." }));
    }
    if (!body) {
      let raw = "";
      for await (const part of req) {
        raw += part;
        if (raw.length > 32768) {
          res.statusCode = 413;
          return res.end(JSON.stringify({ error: "Request too large." }));
        }
      }
      body = JSON.parse(raw);
    }
    if (typeof body === "string") body = JSON.parse(body);
    if (!body || typeof body !== "object")
      throw new Error("Invalid navigation request.");
    const result = await dispatch(body);
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = 503;
    res.end(
      JSON.stringify({
        error:
          error.name === "TimeoutError"
            ? "The map service timed out. Please retry."
            : error.message || "The navigation service is unavailable.",
      }),
    );
  }
};
