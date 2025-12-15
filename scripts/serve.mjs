import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const key = a.slice(2);
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    i++;
  } else {
    args.set(key, "true");
  }
}

const host = args.get("host") ?? "0.0.0.0";
const port = Number(args.get("port") ?? "8200");
const rootDir = path.resolve(args.get("root") ?? process.cwd());

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".ico": return "image/x-icon";
    case ".txt": return "text/plain; charset=utf-8";
    default: return "application/octet-stream";
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const withoutQuery = decoded.split("?")[0].split("#")[0];
  const normalized = path.normalize(withoutQuery).replace(/^([/\\])+/, "");
  const full = path.resolve(rootDir, normalized);
  if (!full.startsWith(rootDir + path.sep) && full !== rootDir) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return send(res, 400, "Bad Request");
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    }

    const reqPath = req.url === "/" ? "/index.html" : req.url;
    const fullPath = safeResolve(reqPath);
    if (!fullPath) return send(res, 400, "Bad Request");

    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      return send(res, 404, "Not Found");
    }

    if (stat.isDirectory()) {
      const idx = path.join(fullPath, "index.html");
      try {
        await fs.access(idx);
        const buf = await fs.readFile(idx);
        if (req.method === "HEAD") return send(res, 200, "", { "Content-Type": contentType(idx) });
        return send(res, 200, buf, { "Content-Type": contentType(idx) });
      } catch {
        return send(res, 404, "Not Found");
      }
    }

    const buf = await fs.readFile(fullPath);
    if (req.method === "HEAD") return send(res, 200, "", { "Content-Type": contentType(fullPath) });
    return send(res, 200, buf, { "Content-Type": contentType(fullPath) });
  } catch (e) {
    return send(res, 500, "Internal Server Error");
  }
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`[serve] ${rootDir} -> http://${host}:${port}/`);
});

