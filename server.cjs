// server.cjs — Servidor local para desenvolvimento (npm start)
const http = require("http");
const fs   = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
loadEnv(path.join(ROOT, ".env"));
const PORT = Number(process.env.PORT || 3000);

// ── Carrega .env ──────────────────────────────────────────────────────────────
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(function(line) {
    var t = line.trim();
    if (!t || t[0] === "#") return;
    var eq = t.indexOf("=");
    if (eq < 0) return;
    var k = t.slice(0, eq).trim();
    var v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k && process.env[k] === undefined) process.env[k] = v;
  });
}

// ── Reutiliza as mesmas funções da /api ───────────────────────────────────────
const chatHandler       = require("./api/chat.js");
const chatStatusHandler = require("./api/chat-status.js");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".svg":  "image/svg+xml"
};

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

// Adapta o res do http.Server para a interface do Vercel (res.status().json())
function wrapRes(res) {
  res.status = function(code) {
    res._statusCode = code;
    return res;
  };
  res.json = function(obj) {
    res.writeHead(res._statusCode || 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  };
  res.end = (function(orig) {
    return function(data) {
      if (!res.headersSent && res._statusCode) res.writeHead(res._statusCode);
      orig.call(res, data);
    };
  })(res.end);
  return res;
}

http.createServer(async function(req, res) {
  var url  = new URL(req.url, "http://localhost");
  var path_ = url.pathname;
  wrapRes(res);

  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (path_ === "/api/chat" || path_ === "/api/chat/") {
    if (req.method !== "POST") { sendJson(res, 405, { error: "Método não permitido." }); return; }
    await chatHandler(req, res);
    return;
  }

  if (path_ === "/api/chat/status" || path_ === "/api/chat-status") {
    chatStatusHandler(req, res);
    return;
  }

  // Arquivos estáticos
  var safe = path_ === "/" ? "/index.html" : path_;
  if (safe.includes("..")) { res.writeHead(403); res.end("Forbidden"); return; }
  var file = path.join(ROOT, safe.replace(/\//g, path.sep));
  fs.readFile(file, function(err, data) {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    var ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });

}).listen(PORT, "0.0.0.0", function() {
  var gKey = process.env.GEMINI_API_KEY    ? "✓" : "✗";
  var aKey = process.env.ANTHROPIC_API_KEY ? "✓" : "✗";
  var oKey = process.env.OPENAI_API_KEY    ? "✓" : "✗";
  console.log("\n✝  GODCHAT → http://localhost:" + PORT);
  console.log("   Gemini " + gKey + "  |  Anthropic " + aKey + "  |  OpenAI " + oKey + "\n");
});
