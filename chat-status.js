export const config = { maxDuration: 10 };

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

  if (anthropicKey) return { provider: "anthropic", providerLabel: "Claude",  ready: true, model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001" };
  if (geminiKey)    return { provider: "gemini",    providerLabel: "Gemini",  ready: true, model: process.env.GEMINI_MODEL    || "gemini-2.0-flash" };
  if (openaiKey)    return { provider: "openai",    providerLabel: "ChatGPT", ready: true, model: process.env.OPENAI_MODEL    || "gpt-4o-mini" };

  return { provider: "none", providerLabel: "nenhum", ready: false, model: "" };
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const c = getProviderConfig();
  res.status(200).json({ ready: c.ready, provider: c.provider, providerLabel: c.providerLabel, model: c.model });
}
