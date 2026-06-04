// api/chat.js — GODCHAT Serverless Function (Vercel / CommonJS)

const SYSTEM_PROMPT = `
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

function getProvider() {
  const req    = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  const aKey   = process.env.ANTHROPIC_API_KEY;
  const gKey   = process.env.GEMINI_API_KEY;
  const oKey   = process.env.OPENAI_API_KEY;
  const aModel = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  const gModel = process.env.GEMINI_MODEL    || "gemini-2.0-flash";
  const oModel = process.env.OPENAI_MODEL    || "gpt-4o-mini";

  if ((req === "anthropic" || req === "claude") && aKey) return { name: "anthropic", label: "Claude",  model: aModel, key: aKey };
  if (req === "gemini"  && gKey) return { name: "gemini",    label: "Gemini",  model: gModel, key: gKey };
  if (req === "openai"  && oKey) return { name: "openai",    label: "ChatGPT", model: oModel, key: oKey };
  if (aKey) return { name: "anthropic", label: "Claude",  model: aModel, key: aKey };
  if (gKey) return { name: "gemini",    label: "Gemini",  model: gModel, key: gKey };
  if (oKey) return { name: "openai",    label: "ChatGPT", model: oModel, key: oKey };
  return null;
}

function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-10)
    .map(function(m) {
      return {
        role:    m && m.role === "assistant" ? "assistant" : "user",
        content: String(m && m.content ? m.content : "").trim().slice(0, 1600)
      };
    })
    .filter(function(m) { return m.content.length > 0; });
}

async function readBody(req) {
  // Vercel already parses the body into req.body
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  return new Promise(function(resolve) {
    var raw = "";
    req.on("data", function(c) { raw += c; });
    req.on("end", function() {
      try { resolve(JSON.parse(raw || "{}")); } catch(e) { resolve({}); }
    });
    req.on("error", function() { resolve({}); });
  });
}

async function callGemini(messages, model, key) {
  var contents = messages.map(function(m) {
    return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
  });
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key;
  var res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: contents,
      generationConfig: { maxOutputTokens: 4096 }
    })
  });
  var data = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error("Gemini " + res.status + ": " + (data.error && data.error.message ? data.error.message : "erro desconhecido"));
  var text = data.candidates && data.candidates[0] && data.candidates[0].content &&
             data.candidates[0].content.parts && data.candidates[0].content.parts[0]
             ? data.candidates[0].content.parts[0].text : "";
  if (!text) throw new Error("Gemini não retornou texto.");
  return text.trim();
}

async function callAnthropic(messages, model, key) {
  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model, max_tokens: 4096, system: SYSTEM_PROMPT, messages: messages })
  });
  var data = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error("Anthropic " + res.status + ": " + (data.error && data.error.message ? data.error.message : "erro desconhecido"));
  var text = data.content && data.content[0] ? data.content[0].text : "";
  if (!text) throw new Error("Anthropic não retornou texto.");
  return text.trim();
}

async function callOpenAI(messages, model, key) {
  var res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify({
      model: model, max_tokens: 4096,
      messages: [{ role: "system", content: SYSTEM_PROMPT }].concat(messages)
    })
  });
  var data = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error("OpenAI " + res.status + ": " + (data.error && data.error.message ? data.error.message : "erro desconhecido"));
  var text = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
  if (!text) throw new Error("OpenAI não retornou texto.");
  return text.trim();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Método não permitido." }); return; }

  var provider = getProvider();
  if (!provider) {
    res.status(503).json({ error: "Nenhuma chave de IA configurada. Adicione GEMINI_API_KEY (ou ANTHROPIC_API_KEY / OPENAI_API_KEY) nas variáveis de ambiente do Vercel." });
    return;
  }

  var body;
  try { body = await readBody(req); } catch(e) { body = {}; }

  var messages = normalizeMessages(body && body.messages ? body.messages : null);
  if (!messages.length) { res.status(400).json({ error: "Nenhuma mensagem recebida." }); return; }

  try {
    var answer;
    if      (provider.name === "gemini")    answer = await callGemini(messages, provider.model, provider.key);
    else if (provider.name === "anthropic") answer = await callAnthropic(messages, provider.model, provider.key);
    else if (provider.name === "openai")    answer = await callOpenAI(messages, provider.model, provider.key);
    else throw new Error("Provedor inválido.");

    res.status(200).json({ answer: answer, provider: provider.name, providerLabel: provider.label, model: provider.model });
  } catch(err) {
    console.error("[GODCHAT]", err.message);
    res.status(502).json({ error: err.message || "A IA não respondeu." });
  }
};
