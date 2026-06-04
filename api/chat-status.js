// api/chat-status.js — GODCHAT Status Endpoint (Vercel / CommonJS)

function getProvider() {
  var req    = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  var aKey   = process.env.ANTHROPIC_API_KEY;
  var gKey   = process.env.GEMINI_API_KEY;
  var oKey   = process.env.OPENAI_API_KEY;
  var aModel = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  var gModel = process.env.GEMINI_MODEL    || "gemini-2.0-flash";
  var oModel = process.env.OPENAI_MODEL    || "gpt-4o-mini";

  if ((req === "anthropic" || req === "claude") && aKey) return { name: "anthropic", label: "Claude",  model: aModel, ready: true };
  if (req === "gemini"  && gKey) return { name: "gemini",    label: "Gemini",  model: gModel, ready: true };
  if (req === "openai"  && oKey) return { name: "openai",    label: "ChatGPT", model: oModel, ready: true };
  if (aKey) return { name: "anthropic", label: "Claude",  model: aModel, ready: true };
  if (gKey) return { name: "gemini",    label: "Gemini",  model: gModel, ready: true };
  if (oKey) return { name: "openai",    label: "ChatGPT", model: oModel, ready: true };
  return { name: "none", label: "nenhum", model: "", ready: false };
}

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  var p = getProvider();
  res.status(200).json({ ready: p.ready, provider: p.name, providerLabel: p.label, model: p.model });
};
