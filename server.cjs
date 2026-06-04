const http = require("http");
const fs = require("fs");
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
- Respostas de 2 a 5 parágrafos, a menos que a pessoa peça algo longo.
`.trim();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) return;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function getProviderConfig() {
  const requested = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Explícito: claude / anthropic
  if (requested === "claude" || requested === "anthropic") {
    return {
      provider: "anthropic",
      providerLabel: "Claude",
      ready: Boolean(anthropicKey),
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
    };
  }

  // Explícito: openai
  if (requested === "openai") {
    return {
      provider: "openai",
      providerLabel: "ChatGPT",
      ready: Boolean(openaiKey),
      model: process.env.OPENAI_MODEL || "gpt-4o"
    };
  }

  // Explícito: gemini
  if (requested === "gemini") {
    return {
      provider: "gemini",
      providerLabel: "Gemini",
      ready: Boolean(geminiKey),
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash"
    };
  }

  // Auto-detect por ordem: Anthropic → Gemini → OpenAI
  if (anthropicKey) {
    return {
      provider: "anthropic",
      providerLabel: "Claude",
      ready: true,
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
    };
  }

  if (geminiKey) {
    return {
      provider: "gemini",
      providerLabel: "Gemini",
      ready: true,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash"
    };
  }

  if (openaiKey) {
    return {
      provider: "openai",
      providerLabel: "ChatGPT",
      ready: true,
      model: process.env.OPENAI_MODEL || "gpt-4o"
    };
  }

  return {
    provider: requested || "none",
    providerLabel: "Claude, Gemini ou ChatGPT",
    ready: false,
    model: ""
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-10)
    .map((message) => ({
      role: message && message.role === "assistant" ? "assistant" : "user",
      content: String(message && message.content ? message.content : "").trim().slice(0, 1600)
    }))
    .filter((message) => message.content);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 40000) {
        reject(new Error("Mensagem muito longa."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  const config = getProviderConfig();

  if (!config.ready) {
    sendJson(res, 503, {
      error: "Configure ANTHROPIC_API_KEY, GEMINI_API_KEY ou OPENAI_API_KEY no arquivo .env e reinicie o servidor."
    });
    return;
  }

  let payload;

  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Envie uma mensagem válida." });
    return;
  }

  const messages = normalizeMessages(payload.messages);

  if (!messages.length) {
    sendJson(res, 400, { error: "Escreva uma mensagem antes de enviar." });
    return;
  }

  try {
    let answer;

    if (config.provider === "anthropic") {
      answer = await callAnthropic(messages, config.model);
    } else if (config.provider === "openai") {
      answer = await callOpenAI(messages, config.model);
    } else {
      answer = await callGemini(messages, config.model);
    }

    sendJson(res, 200, {
      answer,
      provider: config.provider,
      providerLabel: config.providerLabel,
      model: config.model
    });
  } catch (error) {
    sendJson(res, 502, {
      error: error.message || "A IA não respondeu corretamente."
    });
  }
}

// ─── ANTHROPIC / CLAUDE ─────────────────────────────────────────────────────
async function callAnthropic(messages, model) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 999999,
      system: CHRISTIAN_SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }))
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error && data.error.message ? data.error.message : "Erro ao chamar Claude.");
  }

  const text = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()
    : "";

  if (!text) throw new Error("Claude não retornou texto.");
  return text;
}

// ─── GEMINI ─────────────────────────────────────────────────────────────────
async function callGemini(messages, model) {
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: CHRISTIAN_SYSTEM_PROMPT }]
        },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        })),
        generationConfig: {
          temperature: 0.72,
          topP: 0.9,
          maxOutputTokens: 999999,
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error && data.error.message ? data.error.message : "Erro ao chamar Gemini.");
  }

  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    Array.isArray(data.candidates[0].content.parts)
      ? data.candidates[0].content.parts.map((p) => p.text || "").join("\n").trim()
      : "";

  if (!text) throw new Error("Gemini não retornou texto.");
  return text;
}

// ─── OPENAI ──────────────────────────────────────────────────────────────────
function buildTranscript(messages) {
  return messages
    .map((m) => `${m.role === "assistant" ? "GODCHAT" : "Pessoa"}: ${m.content}`)
    .join("\n\n");
}

async function callOpenAI(messages, model) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      instructions: CHRISTIAN_SYSTEM_PROMPT,
      input: buildTranscript(messages),
      max_output_tokens: 9999999,
      store: false
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error && data.error.message ? data.error.message : "Erro ao chamar OpenAI.");
  }

  const text = data.output_text || extractOpenAIText(data);
  if (!text) throw new Error("OpenAI não retornou texto.");
  return text.trim();
}

function extractOpenAIText(data) {
  if (!Array.isArray(data.output)) return "";

  return data.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((part) => part.type === "output_text" && part.text)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

// ─── STATIC FILES ────────────────────────────────────────────────────────────
function serveStatic(req, res, pathname) {
  const safePathname = pathname === "/" ? "/index.html" : pathname;

  if (safePathname.includes("\0") || safePathname.split("/").some((part) => part.startsWith("."))) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.resolve(ROOT_DIR, `.${decodeURIComponent(safePathname)}`);

  if (filePath !== ROOT_DIR && !filePath.startsWith(ROOT_DIR + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  });
}

// ─── SERVER ──────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/chat/status") {
    const config = getProviderConfig();
    sendJson(res, 200, {
      ready: config.ready,
      provider: config.provider,
      providerLabel: config.providerLabel,
      model: config.model
    });
    return;
  }

  if (requestUrl.pathname === "/api/chat") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Método não permitido." });
      return;
    }
    await handleChat(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  serveStatic(req, res, requestUrl.pathname);
});

server.listen(PORT, "127.0.0.1", () => {
  const config = getProviderConfig();
  console.log(`\nGODCHAT aberto em http://127.0.0.1:${PORT}`);
  console.log(`Chat: ${config.providerLabel}${config.ready ? ` (${config.model})` : " — aguardando chave no .env"}`);

  if (!config.ready) {
    console.log(`\nPara ativar o chat, adicione ao .env uma destas chaves:`);
    console.log(`  ANTHROPIC_API_KEY='sua-chave'   # Claude (recomendado)`);
    console.log(`  GEMINI_API_KEY='AQ.Ab8RN6Iw4f5cQ242NYcea-vkH5DH3OEpoQ97YuSgiqzBun2-Hg'       # Gemini`);
    console.log(`  OPENAI_API_KEY='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'       # ChatGPT`);
  }
});
