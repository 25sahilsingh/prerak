export type LlmSettings = {
  baseUrl: string;
  model: string;
  apiKey: string;
  /** True for the operator's own fallback from .env, which may point at localhost. Visitor addresses are not. */
  trusted: boolean;
};

export type Preset = { id: string; label: string; baseUrl: string; port?: number };

// Servers with a port run on the visitor's own computer and need a tunnel when the app is hosted elsewhere.
export const PRESETS: Preset[] = [
  { id: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1", port: 11434 },
  { id: "lmstudio", label: "LM Studio", baseUrl: "http://localhost:1234/v1", port: 1234 },
  { id: "llamacpp", label: "llama.cpp server", baseUrl: "http://127.0.0.1:8080/v1", port: 8080 },
  { id: "vllm", label: "vLLM", baseUrl: "http://localhost:8000/v1", port: 8000 },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
];

export class SettingsError extends Error {}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function operatorSettings(): LlmSettings | null {
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  if (!baseUrl) return null;
  return { baseUrl: normalizeBaseUrl(baseUrl), model: process.env.LLM_MODEL ?? "", apiKey: process.env.LLM_API_KEY ?? "", trusted: true };
}

/**
 * The visitor's model, sent by their browser with each request and never stored on the server.
 * Without one, falls back to the operator's model from .env (if any). The two are never mixed, so the
 * operator's key is never sent to an address a visitor typed.
 */
export function resolveLlmSettings(input: unknown): LlmSettings | null {
  const v = (input ?? {}) as Partial<Record<"baseUrl" | "model" | "apiKey", unknown>>;
  if (typeof v.baseUrl !== "string" || !v.baseUrl.trim()) return operatorSettings();
  const baseUrl = normalizeBaseUrl(v.baseUrl);
  const model = typeof v.model === "string" ? v.model.trim() : "";
  const apiKey = typeof v.apiKey === "string" ? v.apiKey.trim() : "";
  if (!/^https?:\/\/[^\s/]+/i.test(baseUrl) || baseUrl.length > 500) throw new SettingsError("Enter a URL that starts with http:// or https://");
  if (model.length > 200 || apiKey.length > 1000) throw new SettingsError("The model name or API key is too long.");
  return { baseUrl, model, apiKey, trusted: false };
}

export function serverDefault() {
  const s = operatorSettings();
  return s ? { model: s.model } : null;
}

export function publicSettings(s: LlmSettings) {
  // The operator's address can be an internal one, so only the visitor's own address is echoed back.
  return { baseUrl: s.trusted ? "" : s.baseUrl, model: s.model, usingServerDefault: s.trusted };
}
