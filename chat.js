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

function getProviderConfig() {
  const requested = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  if (requested === "claude" || requested === "anthropic") {
    return { provider: "anthropic", providerLabel: "Claude",   ready: Boolean(anthropicKey), model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514" };
  }
  if (requested === "openai") {
    return { provider: "openai",    providerLabel: "ChatGPT",  ready: Boolean(openaiKey),    model: process.env.OPENAI_MODEL    || "gpt-4o" };
  }
  if (requested === "gemini") {
    return { provider: "gemini",    providerLabel: "Gemini",   ready: Boolean(geminiKey),    model: process.env.GEMINI_MODEL    || "gemini-2.5-flash" };
  }
  if (anthropicKey) return { provider: "anthropic", providerLabel: "Claude",  ready: true, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514" };
  if (geminiKey)    return { provider: "gemini",    providerLabel: "Gemini",  ready: true, model: process.env.GEMINI_MODEL    || "gemini-2.5-flash" };
  if (openaiKey)    return { provider: "openai",    providerLabel: "ChatGPT", ready: true, model: process.env.OPENAI_MODEL    || "gpt-4o" };

  return { provider: "none", providerLabel: "nenhum", ready: false, model: "" };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-10)
    .map((m) => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: String(m && m.content ? m.content : "").trim().slice(0, 1600)
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
      max_tokens: 1000,
      system: CHRISTIAN_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Erro ao chamar Claude.");
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
      generationConfig: { temperature: 0.72, topP: 0.9, maxOutputTokens: 1000 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Erro ao chamar Gemini.");
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "";
  if (!text) throw new Error("Gemini não retornou texto.");
  return text;
}

function buildTranscript(messages) {
  return messages.map((m) => `${m.role === "assistant" ? "GODCHAT" : "Pessoa"}: ${m.content}`).join("\n\n");
}

async function callOpenAI(messages, model) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      instructions: CHRISTIAN_SYSTEM_PROMPT,
      input: buildTranscript(messages),
      max_output_tokens: 700,
      store: false
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Erro ao chamar OpenAI.");
  const text = data.output_text ||
    (Array.isArray(data.output)
      ? data.output.flatMap((i) => i.content || []).filter((p) => p.type === "output_text").map((p) => p.text).join("\n").trim()
      : "");
  if (!text) throw new Error("OpenAI não retornou texto.");
  return text.trim();
}

// ─── Vercel handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS para o mesmo domínio
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const config = getProviderConfig();

  if (!config.ready) {
    res.status(503).json({
      error: "Configure ANTHROPIC_API_KEY, GEMINI_API_KEY ou OPENAI_API_KEY nas variáveis de ambiente do Vercel."
    });
    return;
  }

  const messages = normalizeMessages(req.body?.messages);

  if (!messages.length) {
    res.status(400).json({ error: "Escreva uma mensagem antes de enviar." });
    return;
  }

  try {
    let answer;
    if (config.provider === "anthropic") answer = await callAnthropic(messages, config.model);
    else if (config.provider === "gemini")   answer = await callGemini(messages, config.model);
    else                                      answer = await callOpenAI(messages, config.model);

    res.status(200).json({ answer, provider: config.provider, providerLabel: config.providerLabel, model: config.model });
  } catch (err) {
    res.status(502).json({ error: err.message || "A IA não respondeu corretamente." });
  }
}
