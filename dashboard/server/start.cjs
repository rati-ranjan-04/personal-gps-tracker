const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const handler = require("./handler.cjs");
const root = path.resolve(__dirname, "../dist");
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/navigation") return handler(req, res);
    if (url.pathname === "/api/offline-tile")
      return require("./offline.cjs")(req, res);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.statusCode = 400;
      return res.end("Invalid path");
    }
    let file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.statusCode = 403;
      return res.end();
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(pathname) || pathname.startsWith("/api/")) {
        res.statusCode = 404;
        return res.end("Not found");
      }
      file = path.join(root, "index.html");
    }
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Cache-Control",
      file.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
    console.log("Waypoint ready"),
  );
