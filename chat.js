export const config = { maxDuration: 30 };

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function getProviderConfig() {
  const requested = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  if ((requested === "claude" || requested === "anthropic") && anthropicKey)
    return { provider: "anthropic", providerLabel: "Claude", ready: true, model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001", key: anthropicKey };
  if (requested === "gemini" && geminiKey)
    return { provider: "gemini", providerLabel: "Gemini", ready: true, model: process.env.GEMINI_MODEL || "gemini-2.0-flash", key: geminiKey };
  if (requested === "openai" && openaiKey)
    return { provider: "openai", providerLabel: "ChatGPT", ready: true, model: process.env.OPENAI_MODEL || "gpt-4o-mini", key: openaiKey };

  // Auto-detect
  if (anthropicKey) return { provider: "anthropic", providerLabel: "Claude", ready: true, model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001", key: anthropicKey };
  if (geminiKey)    return { provider: "gemini",    providerLabel: "Gemini", ready: true, model: process.env.GEMINI_MODEL || "gemini-2.0-flash", key: geminiKey };
  if (openaiKey)    return { provider: "openai",    providerLabel: "ChatGPT", ready: true, model: process.env.OPENAI_MODEL || "gpt-4o-mini", key: openaiKey };

  return { provider: "none", providerLabel: "nenhum", ready: false, model: "", key: "" };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-10)
    .map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content || "").trim().slice(0, 1600)
    }))
    .filter((m) => m.content);
}

// ─── ANTHROPIC ────────────────────────────────────────────────────────────────
async function callAnthropic(messages, model, key) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: CHRISTIAN_SYSTEM_PROMPT,
      messages
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic ${res.status}`);
  const text = data?.content?.[0]?.text || "";
  if (!text) throw new Error("Anthropic não retornou texto.");
  return text.trim();
}

// ─── GEMINI ──────────────────────────────────────────────────────────────────
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

// ─── OPENAI ───────────────────────────────────────────────────────────────────
async function callOpenAI(messages, model, key) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "system", content: CHRISTIAN_SYSTEM_PROMPT }, ...messages]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI ${res.status}`);
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("OpenAI não retornou texto.");
  return text.trim();
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Método não permitido." }); return; }

  const cfg = getProviderConfig();
  if (!cfg.ready) {
    res.status(503).json({ error: "Nenhuma chave de IA configurada. Adicione ANTHROPIC_API_KEY, GEMINI_API_KEY ou OPENAI_API_KEY nas variáveis de ambiente do Vercel." });
    return;
  }

  const body = await readBody(req).catch(() => ({}));
  const messages = normalizeMessages(body.messages);

  if (!messages.length) {
    res.status(400).json({ error: "Nenhuma mensagem recebida." });
    return;
  }

  try {
    let answer;
    if (cfg.provider === "anthropic") answer = await callAnthropic(messages, cfg.model, cfg.key);
    else if (cfg.provider === "gemini") answer = await callGemini(messages, cfg.model, cfg.key);
    else if (cfg.provider === "openai") answer = await callOpenAI(messages, cfg.model, cfg.key);
    else throw new Error("Provedor desconhecido.");

    res.status(200).json({ answer, provider: cfg.provider, providerLabel: cfg.providerLabel, model: cfg.model });
  } catch (err) {
    console.error("[GODCHAT chat]", err.message);
    res.status(502).json({ error: err.message || "A IA não respondeu." });
  }
}
