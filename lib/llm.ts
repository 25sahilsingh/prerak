import OpenAI from "openai";
import { getLlmSettings, normalizeBaseUrl, type LlmSettings } from "./settings";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function client(s: LlmSettings) {
  return new OpenAI({ baseURL: s.baseUrl, apiKey: s.apiKey || "not-needed", timeout: 300_000, maxRetries: 0 });
}

export async function listModels(baseUrl: string, apiKey?: string, timeoutMs = 5000): Promise<string[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Server answered ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { data?: { id: string }[] | null; models?: { name?: string; model?: string; capabilities?: unknown }[] };
  // llama.cpp's server is the one that returns a "models" list with "capabilities" next to "data".
  serverKind.set(normalizeBaseUrl(baseUrl), body.models?.some((m) => m.capabilities) ? "llamacpp" : "other");
  const ids = body.data?.map((m) => m.id) ?? body.models?.map((m) => m.model ?? m.name ?? "") ?? [];
  return ids.filter(Boolean);
}

const serverKind = new Map<string, "llamacpp" | "other">();

async function isLlamaCpp(s: LlmSettings): Promise<boolean> {
  // A busy server can answer slowly; guessing "not llama.cpp" would route Hindi through the chat parser that breaks it.
  if (!serverKind.has(s.baseUrl)) await listModels(s.baseUrl, s.apiKey, 30_000).catch(() => {});
  return serverKind.get(s.baseUrl) === "llamacpp";
}

// llama.cpp's chat-output parser can silently stop a stream partway through Hindi text. Rendering the prompt with
// the server's own template and using plain text completion avoids that parser entirely.
async function llamaCppPrompt(s: LlmSettings, messages: ChatMessage[], signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${s.baseUrl.replace(/\/v1$/, "")}/apply-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}) },
      body: JSON.stringify({ messages }),
      signal,
    });
    if (!res.ok) return null;
    return ((await res.json()) as { prompt?: string }).prompt ?? null;
  } catch {
    return null;
  }
}

async function resolveModel(s: LlmSettings): Promise<string> {
  if (s.model) return s.model;
  const models = await listModels(s.baseUrl, s.apiKey);
  if (!models.length) throw new Error("The model server has no models loaded.");
  return models[0];
}

// Strips <think>...</think> blocks that reasoning models stream before the answer.
function thinkFilter() {
  let inThink = false;
  let buf = "";
  return (piece: string): string => {
    buf += piece;
    let out = "";
    for (;;) {
      if (inThink) {
        const end = buf.indexOf("</think>");
        if (end < 0) {
          buf = buf.slice(-8);
          return out;
        }
        buf = buf.slice(end + 8);
        inThink = false;
      } else {
        const start = buf.indexOf("<think>");
        if (start < 0) {
          // Hold back a possible partial "<think" tag at the end.
          const keep = buf.lastIndexOf("<");
          const safe = keep >= 0 && buf.length - keep < 7 ? keep : buf.length;
          out += buf.slice(0, safe);
          buf = buf.slice(safe);
          return out;
        }
        out += buf.slice(0, start);
        buf = buf.slice(start + 7);
        inThink = true;
      }
    }
  };
}

export async function* streamChat(messages: ChatMessage[], opts: { maxTokens?: number; signal?: AbortSignal } = {}) {
  const s = getLlmSettings();
  const model = await resolveModel(s);
  const params = { model, stream: true as const, temperature: 0.1, max_tokens: opts.maxTokens ?? 1200 };
  const filter = thinkFilter();

  const llamaCpp = await isLlamaCpp(s);
  let prompt = llamaCpp ? await llamaCppPrompt(s, messages, opts.signal) : null;
  if (llamaCpp && !prompt) prompt = await llamaCppPrompt(s, messages, opts.signal);
  if (prompt) {
    // Even /completion runs llama.cpp's output parser, which aborts when the model emits a token it can't decode
    // (common in Devanagari). Retrying from the same point fails the same way, so the unfinished last word is held
    // back while streaming; on that error it is dropped and generation resumes from the word boundary.
    let produced = "";
    let pending = "";
    let tokens = 0;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${s.baseUrl.replace(/\/v1$/, "")}/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}) },
        body: JSON.stringify({
          prompt: prompt + produced,
          stream: true,
          temperature: Math.min(params.temperature + 0.1 * attempt, 0.4),
          n_predict: params.max_tokens - tokens,
          cache_prompt: true,
        }),
        signal: opts.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Server answered ${res.status} ${await res.text().catch(() => "")}`);
      const decoder = new TextDecoder();
      let buf = "";
      let parserError: string | null = null;
      read: for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
        buf += decoder.decode(bytes, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6)) as { content?: string; stop?: boolean; error?: { message?: string } };
          if (ev.error) {
            const msg = ev.error.message ?? "Model server error";
            if (!/does not match the expected .* format/i.test(msg)) throw new Error(msg);
            parserError = msg;
            break read;
          }
          if (ev.content) {
            tokens++;
            pending += ev.content.replace(/\uFFFD/g, "");
            const cut = pending.search(/\s(?=\S*$)/) + 1;
            if (cut > 0) {
              const done = pending.slice(0, cut);
              pending = pending.slice(cut);
              produced += done;
              const text = filter(done);
              if (text) yield text;
            }
          }
          if (ev.stop) break read;
        }
      }
      if (!parserError) {
        const text = filter(pending);
        if (text) yield text;
        return;
      }
      pending = "";
      if (attempt >= 6 || tokens >= params.max_tokens) throw new Error(parserError);
    }
  }

  const stream = await client(s).chat.completions.create({ ...params, messages }, { signal: opts.signal });
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content;
    if (delta) {
      const text = filter(delta);
      if (text) yield text;
    }
  }
}

export async function complete(messages: ChatMessage[], maxTokens = 400): Promise<string> {
  let out = "";
  for await (const t of streamChat(messages, { maxTokens })) out += t;
  return out.trim();
}

export function describeLlmError(e: unknown, baseUrl: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/ECONNREFUSED|fetch failed|Connection error|ENOTFOUND|timed? ?out|aborted/i.test(msg))
    return `Can't reach your model at ${baseUrl}. Start your local model server or update it in Settings.`;
  if (/model/i.test(msg) && /not found|does not exist/i.test(msg)) return `The model name in Settings was not found on ${baseUrl}. Pick one from the list in Settings.`;
  return `The model server returned an error: ${msg}`;
}
