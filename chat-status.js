function getProviderConfig() {
  const requested = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  if (requested === "claude" || requested === "anthropic") {
    return { provider: "anthropic", providerLabel: "Claude",  ready: Boolean(anthropicKey), model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514" };
  }
  if (requested === "openai") {
    return { provider: "openai",   providerLabel: "ChatGPT", ready: Boolean(openaiKey),    model: process.env.OPENAI_MODEL    || "gpt-4o" };
  }
  if (requested === "gemini") {
    return { provider: "gemini",   providerLabel: "Gemini",  ready: Boolean(geminiKey),    model: process.env.GEMINI_MODEL    || "gemini-2.5-flash" };
  }
  if (anthropicKey) return { provider: "anthropic", providerLabel: "Claude",  ready: true, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514" };
  if (geminiKey)    return { provider: "gemini",    providerLabel: "Gemini",  ready: true, model: process.env.GEMINI_MODEL    || "gemini-2.5-flash" };
  if (openaiKey)    return { provider: "openai",    providerLabel: "ChatGPT", ready: true, model: process.env.OPENAI_MODEL    || "gpt-4o" };

  return { provider: "none", providerLabel: "nenhum", ready: false, model: "" };
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const config = getProviderConfig();
  res.status(200).json({
    ready: config.ready,
    provider: config.provider,
    providerLabel: config.providerLabel,
    model: config.model
  });
}
