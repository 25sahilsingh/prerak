import { randomUUID } from "node:crypto";
import { getDb, getProfile, getScheme } from "@/lib/db";
import { guardAnswer, officialContacts } from "@/lib/rag/guard";
import { complete, describeLlmError, streamChat, type ChatMessage } from "@/lib/llm";
import { buildMessages, detectLanguage, summaryMessages } from "@/lib/rag/prompt";
import { retrieve } from "@/lib/rag/retrieve";
import { resolveLlmSettings, SettingsError, type LlmSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_TURNS = 6;
const SUMMARIZE_AFTER = 10;

type Source = { id: string; name: string; status: string; links: string[]; helplines: string[] };
type MsgRow = { id: number; role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const body = (await req.json()) as { message?: string; conversationId?: string; profileId?: string; llm?: unknown };
  const question = body.message?.trim();
  if (!question) return Response.json({ error: "Please type a question." }, { status: 400 });

  let llm: LlmSettings | null;
  try {
    llm = resolveLlmSettings(body.llm);
  } catch (e) {
    if (e instanceof SettingsError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  if (!llm) return Response.json({ error: "Connect your AI model in Settings first." }, { status: 400 });
  const model = llm;

  const db = getDb();
  const profile = body.profileId ? getProfile(body.profileId) : null;

  let convId = body.conversationId;
  let conv = convId
    ? (db.prepare("SELECT id, summary, summarized_upto FROM conversations WHERE id = ?").get(convId) as
        | { id: string; summary: string; summarized_upto: number }
        | undefined)
    : undefined;
  if (!conv) {
    convId = randomUUID();
    db.prepare("INSERT INTO conversations (id, profile_id, title) VALUES (?, ?, ?)").run(convId, profile?.id ?? null, question.slice(0, 80));
    conv = { id: convId, summary: "", summarized_upto: 0 };
  }

  const all = db.prepare("SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY id").all(convId) as MsgRow[];
  const recent = all.slice(-RECENT_TURNS);
  const previousUserTurn = [...all].reverse().find((m) => m.role === "user")?.content;

  const { chunks, broad } = await retrieve({ query: question, previousUserTurn, profile });
  const lang = detectLanguage(question, profile?.language);
  const messages = buildMessages({
    question,
    profile,
    summary: conv.summary,
    history: recent.map((m) => ({ role: m.role, content: m.content })),
    chunks,
    broad,
    lang,
  });

  const sources: Source[] = [];
  for (const c of chunks) {
    if (!c.scheme_id || sources.some((s) => s.id === c.scheme_id)) continue;
    const scheme = getScheme(c.scheme_id);
    sources.push({ id: c.scheme_id, name: c.scheme_name, status: c.status, ...officialContacts(scheme?.links ?? "") });
  }

  const userMsgId = db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)").run(convId, question).lastInsertRowid;

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: "meta", conversationId: convId, sources });
      let answer = "";
      try {
        // Devanagari often tokenises to one token per letter, so Hindi answers need a larger budget.
        for await (const delta of streamChat(model, messages, { signal: req.signal, maxTokens: lang === "en" ? 1200 : 2400 })) {
          answer += delta;
          send(controller, { type: "delta", text: delta });
        }
        if (!answer.trim()) throw new Error("The model returned an empty answer.");
        const guarded = guardAnswer(answer, sources.flatMap((s) => s.links));
        if (guarded.text !== answer) {
          answer = guarded.text;
          send(controller, { type: "replace", text: answer, fixes: guarded.fixes });
        }
        db.prepare("INSERT INTO messages (conversation_id, role, content, sources) VALUES (?, 'assistant', ?, ?)").run(
          convId,
          answer,
          JSON.stringify(sources),
        );
        send(controller, { type: "done", unverified: guarded.unverified });
      } catch (e) {
        // An unanswered question would otherwise sit in the history the model sees next turn.
        db.prepare("DELETE FROM messages WHERE id = ?").run(userMsgId);
        answer = "";
        if (!req.signal.aborted) send(controller, { type: "error", message: describeLlmError(e, model) });
      } finally {
        controller.close();
      }
      if (answer) void maybeSummarize(convId!, model);
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

const summarizing = new Set<string>();

// Folds messages older than the recent window into the conversation summary, so long chats stay within the model's context.
async function maybeSummarize(convId: string, llm: LlmSettings) {
  if (summarizing.has(convId)) return;
  const db = getDb();
  const conv = db.prepare("SELECT summary, summarized_upto FROM conversations WHERE id = ?").get(convId) as { summary: string; summarized_upto: number };
  const pending = db
    .prepare("SELECT id, role, content FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id")
    .all(convId, conv.summarized_upto) as MsgRow[];
  if (pending.length < SUMMARIZE_AFTER) return;
  const toFold = pending.slice(0, pending.length - RECENT_TURNS);
  summarizing.add(convId);
  try {
    const summary = await complete(llm, summaryMessages(conv.summary, toFold.map((m): ChatMessage => ({ role: m.role, content: m.content }))));
    if (summary) {
      db.prepare("UPDATE conversations SET summary = ?, summarized_upto = ? WHERE id = ?").run(summary, toFold[toFold.length - 1].id, convId);
    }
  } catch {
    // A failed summary only means the next turn sends a little more history.
  } finally {
    summarizing.delete(convId);
  }
}
