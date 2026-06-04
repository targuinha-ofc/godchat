const http = require("http");
const fs   = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = __dirname;
loadEnvFile(path.join(ROOT_DIR, ".env"));

const PORT = Number(process.env.PORT || 3000);

const CHRISTIAN_SYSTEM_PROMPT = `
Você é o GODCHAT, um assistente de conversa espiritual cristão católico, em português do Brasil.

Missão:
- Responder com fé cristã, caridade, humildade, reverência, esperança e fidelidade à tradição católica.
- Ajudar a pessoa a rezar, discernir, ler a Bíblia, procurar os sacramentos, praticar a caridade e aproximar-se de Jesus Cristo.
- Usar referências bíblicas curtas e naturais quando ajudarem, sem despejar textos longos.
- Encerrar, quando fizer sentido, com uma pequena oração ou convite prático.

Limites importantes:
- Nunca diga que você é Deus, Jesus Cristo, o Espírito Santo, Nossa Senhora, um anjo ou um santo.
- Nunca afirme falar em nome de Deus de forma direta, como profecia, revelação privada ou garantia divina.
- Se a pessoa pedir "responda como Deus", responda com delicadeza que uma IA não substitui a voz de Deus, mas pode oferecer uma palavra cristã para levar à oração.
- Não substitua padre, diretor espiritual, médico, psicólogo, advogado ou autoridade competente.
- Em risco de autoagressão, violência, abuso, emergência médica ou desespero extremo, incentive ajuda humana imediata e serviços de emergência locais.
- Seja firme na fé, mas nunca cruel, humilhante, manipulador ou condenatório.

Estilo:
- Tom pastoral, sereno, simples e profundamente cristão.
- Pode tratar a pessoa como irmão/irmã, filho/filha na fé, com delicadeza.
- Respostas de 2 a 4 parágrafos.
`.trim();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon"
};

// ─── ENV ──────────────────────────────────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = val;
  });
}

// ─── PROVIDER ─────────────────────────────────────────────────────────────────
function getProviderConfig() {
  const requested    = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  if ((requested === "claude" || requested === "anthropic") && anthropicKey)
    return { provider: "anthropic", providerLabel: "Claude",  ready: true, model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001", key: anthropicKey };
  if (requested === "gemini" && geminiKey)
    return { provider: "gemini",    providerLabel: "Gemini",  ready: true, model: process.env.GEMINI_MODEL    || "gemini-2.0-flash", key: geminiKey };
  if (requested === "openai" && openaiKey)
    return { provider: "openai",    providerLabel: "ChatGPT", ready: true, model: process.env.OPENAI_MODEL    || "gpt-4o-mini", key: openaiKey };

  if (anthropicKey) return { provider: "anthropic", providerLabel: "Claude",  ready: true, model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001", key: anthropicKey };
  if (geminiKey)    return { provider: "gemini",    providerLabel: "Gemini",  ready: true, model: process.env.GEMINI_MODEL    || "gemini-2.0-flash", key: geminiKey };
  if (openaiKey)    return { provider: "openai",    providerLabel: "ChatGPT", ready: true, model: process.env.OPENAI_MODEL    || "gpt-4o-mini", key: openaiKey };

  return { provider: "none", providerLabel: "nenhum", ready: false, model: "", key: "" };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 40000) { reject(new Error("Mensagem muito longa.")); req.destroy(); }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-10)
    .map((m) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: String(m?.content || "").trim().slice(0, 1600) }))
    .filter((m) => m.content);
}

// ─── PROVIDERS ────────────────────────────────────────────────────────────────
async function callAnthropic(messages, model, key) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1024, system: CHRISTIAN_SYSTEM_PROMPT, messages })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic ${res.status}`);
  const text = data?.content?.[0]?.text || "";
  if (!text) throw new Error("Anthropic não retornou texto.");
  return text.trim();
}

async function callGemini(messages, model, key) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: CHRISTIAN_SYSTEM_PROMPT }] },
      contents,
      generationConfig: { maxOutputTokens: 1024 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Gemini ${res.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Gemini não retornou texto.");
  return text.trim();
}

async function callOpenAI(messages, model, key) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "system", content: CHRISTIAN_SYSTEM_PROMPT }, ...messages] })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI ${res.status}`);
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("OpenAI não retornou texto.");
  return text.trim();
}

// ─── CHAT HANDLER ─────────────────────────────────────────────────────────────
async function handleChat(req, res) {
  const cfg = getProviderConfig();
  if (!cfg.ready) {
    sendJson(res, 503, { error: "Nenhuma chave de IA configurada. Adicione a chave no arquivo .env." });
    return;
  }

  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch { sendJson(res, 400, { error: "Envie uma mensagem válida." }); return; }

  const messages = normalizeMessages(payload.messages);
  if (!messages.length) { sendJson(res, 400, { error: "Escreva uma mensagem antes de enviar." }); return; }

  try {
    let answer;
    if (cfg.provider === "anthropic") answer = await callAnthropic(messages, cfg.model, cfg.key);
    else if (cfg.provider === "gemini") answer = await callGemini(messages, cfg.model, cfg.key);
    else if (cfg.provider === "openai") answer = await callOpenAI(messages, cfg.model, cfg.key);
    else throw new Error("Provedor desconhecido.");

    sendJson(res, 200, { answer, provider: cfg.provider, providerLabel: cfg.providerLabel, model: cfg.model });
  } catch (err) {
    console.error("[GODCHAT]", err.message);
    sendJson(res, 502, { error: err.message || "A IA não respondeu." });
  }
}

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
function serveStatic(req, res, pathname) {
  const safe = pathname === "/" ? "/index.html" : pathname;
  if (safe.includes("\0") || safe.split("/").some((p) => p.startsWith("."))) {
    res.writeHead(404); res.end("Not found"); return;
  }
  const filePath = path.resolve(ROOT_DIR, `.${decodeURIComponent(safe)}`);
  if (!filePath.startsWith(ROOT_DIR + path.sep) && filePath !== ROOT_DIR) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(content);
  });
}

// ─── SERVER ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (pathname === "/api/chat/status" || pathname === "/api/chat-status") {
    const cfg = getProviderConfig();
    sendJson(res, 200, { ready: cfg.ready, provider: cfg.provider, providerLabel: cfg.providerLabel, model: cfg.model });
    return;
  }

  if (pathname === "/api/chat") {
    if (req.method !== "POST") { sendJson(res, 405, { error: "Método não permitido." }); return; }
    await handleChat(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405); res.end("Method not allowed"); return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  const cfg = getProviderConfig();
  console.log(`\n✝  GODCHAT → http://localhost:${PORT}`);
  console.log(`   IA: ${cfg.providerLabel}${cfg.ready ? ` (${cfg.model})` : " — adicione a chave no .env"}\n`);
});
