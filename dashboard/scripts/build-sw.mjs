import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = (await readdir("dist/assets")).map((file) => `/assets/${file}`);
const index = await readFile("dist/index.html", "utf8");
const version = createHash("sha256").update(index).digest("hex").slice(0, 12);
await writeFile(
  "dist/sw.js",
  `
const CACHE = 'waypoint-shell-${version}';
const ASSETS = ${JSON.stringify(["/", "/index.html", "/favicon.svg", ...assets])};
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('waypoint-shell-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method!=='GET' || url.origin!==self.location.origin || url.pathname.startsWith('/api/') || url.pathname==='/tracker.html') return;
  if(event.request.mode==='navigate') {
    event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));
  } else if(ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached=>cached || fetch(event.request)));
  }
});
`,
);
console.log(
  `Generated offline app shell: ${assets.length} assets (${version})`,
);
