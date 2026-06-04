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

// Lê o body raw e faz parse — o Vercel NÃO popula req.body automaticamente
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
  const requested    = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  if (requested === "claude" || requested === "anthropic")
    return { provider: "anthropic", providerLabel: "Claude",  ready: Boolean(anthropicKey), model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001" };
  if (requested === "openai")
    return { provider: "openai",    providerLabel: "ChatGPT", ready: Boolean(openaiKey),    model: process.env.OPENAI_MODEL    || "gpt-4o-mini" };
  if (requested === "gemini")
    return { provider: "gemini",    providerLabel: "Gemini",  ready: Boolean(geminiKey),    model: process.env.GEMINI_MODEL    || "gemini-2.0-flash" };

  // auto-detect
  if (anthropicKey) return { provider: "anthropic", providerLabel: "Claude",  ready: true, model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001" };
  if (geminiKey)    return { provider: "gemini",    providerLabel: "Gemini",  ready: true, model: process.env.GEMINI_MODEL    || "gemini-2.0-flash" };
  if (openaiKey)    return { provider: "openai",    providerLabel: "ChatGPT", ready: true, model: process.env.OPENAI_MODEL    || "gpt-4o-mini" };

  return { provider: "none", providerLabel: "nenhum", ready: false, model: "" };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-6)  // menos mensagens = menos tokens de contexto
    .map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content || "").trim().slice(0, 800) // limite por mensagem
    }))
    .filter((m) => m.content);
}

async function callAnthropic(messages, model) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 60000,
      system: CHRISTIAN_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic ${res.status}`);
  const text = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()
    : "";
  if (!text) throw new Error("Claude não retornou texto.");
  return text;
}

async function callGemini(messages, model) {
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: CHRISTIAN_SYSTEM_PROMPT }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      })),
      generationConfig: { temperature: 0.72, topP: 0.9, maxOutputTokens: 60000 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Gemini ${res.status}`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "";
  if (!text) throw new Error("Gemini não retornou texto.");
  return text;
}

async function callOpenAI(messages, model) {
  // Usa /v1/chat/completions (endpoint universal, mais confiável que /v1/responses)
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      max_tokens: 60000,
      messages: [
        { role: "system", content: CHRISTIAN_SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content }))
      ]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI ${res.status}`);
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("OpenAI não retornou texto.");
  return text;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "Método não permitido." }); return; }

  const config = getProviderConfig();
  if (!config.ready) {
    res.status(503).json({ error: "Nenhuma chave de IA configurada. Adicione ANTHROPIC_API_KEY, GEMINI_API_KEY ou OPENAI_API_KEY nas variáveis do Vercel." });
    return;
  }

  // Lê e parseia o body manualmente (req.body é undefined no Vercel sem body-parser)
  const body = await readBody(req).catch(() => ({}));
  const messages = normalizeMessages(body.messages);

  if (!messages.length) {
    res.status(400).json({ error: "Nenhuma mensagem recebida." });
    return;
  }

  try {
    let answer;
    if      (config.provider === "anthropic") answer = await callAnthropic(messages, config.model);
    else if (config.provider === "gemini")    answer = await callGemini(messages, config.model);
    else                                       answer = await callOpenAI(messages, config.model);

    res.status(200).json({ answer, provider: config.provider, providerLabel: config.providerLabel, model: config.model });
  } catch (err) {
    console.error("[GODCHAT]", err.message);
    res.status(502).json({ error: err.message || "A IA não respondeu." });
  }
}
