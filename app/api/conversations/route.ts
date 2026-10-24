import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const conv = getDb().prepare("SELECT id, title FROM conversations WHERE id = ?").get(id);
  if (!conv) return Response.json({ error: "Conversation not found" }, { status: 404 });
  const messages = (
    getDb().prepare("SELECT role, content, sources FROM messages WHERE conversation_id = ? ORDER BY id").all(id) as {
      role: string;
      content: string;
      sources: string;
    }[]
  ).map((m) => ({ ...m, sources: JSON.parse(m.sources || "[]") }));
  return Response.json({ ...conv, messages });
}
