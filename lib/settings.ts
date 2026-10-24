import { getDb } from "./db";

export type LlmSettings = { baseUrl: string; model: string; apiKey: string };

export const PRESETS = [
  { id: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { id: "lmstudio", label: "LM Studio", baseUrl: "http://localhost:1234/v1" },
  { id: "llamacpp", label: "llama.cpp server", baseUrl: "http://127.0.0.1:8080/v1" },
  { id: "vllm", label: "vLLM", baseUrl: "http://localhost:8000/v1" },
] as const;

const KEYS = { baseUrl: "llm_base_url", model: "llm_model", apiKey: "llm_api_key" } as const;

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getLlmSettings(): LlmSettings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    baseUrl: normalizeBaseUrl(saved[KEYS.baseUrl] || process.env.LLM_BASE_URL || "http://localhost:11434/v1"),
    model: saved[KEYS.model] ?? process.env.LLM_MODEL ?? "",
    apiKey: saved[KEYS.apiKey] ?? process.env.LLM_API_KEY ?? "",
  };
}

export function isConfigured(): boolean {
  const row = getDb().prepare("SELECT 1 FROM settings WHERE key = ?").get(KEYS.baseUrl);
  return !!row || !!process.env.LLM_BASE_URL;
}

export function saveLlmSettings(s: Partial<LlmSettings>): LlmSettings {
  const upsert = getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  if (s.baseUrl !== undefined) upsert.run(KEYS.baseUrl, normalizeBaseUrl(s.baseUrl));
  if (s.model !== undefined) upsert.run(KEYS.model, s.model.trim());
  if (s.apiKey !== undefined) upsert.run(KEYS.apiKey, s.apiKey.trim());
  return getLlmSettings();
}

export function publicSettings(s: LlmSettings) {
  return { baseUrl: s.baseUrl, model: s.model, hasApiKey: !!s.apiKey };
}
