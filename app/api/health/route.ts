import { listModels } from "@/lib/llm";
import { publicSettings, resolveLlmSettings, SettingsError } from "@/lib/settings";

export const dynamic = "force-dynamic";

// POST because the visitor's settings, API key included, travel in the body rather than the URL.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { llm?: unknown };
  let s;
  try {
    s = resolveLlmSettings(body.llm);
  } catch (e) {
    if (e instanceof SettingsError) return Response.json({ configured: false, ok: false, baseUrl: "", model: "", models: [], error: e.message });
    throw e;
  }
  if (!s) return Response.json({ configured: false, ok: false, baseUrl: "", model: "", models: [] });
  const base = { configured: true, ...publicSettings(s) };
  try {
    const models = await listModels(s, 4000);
    const modelFound = models.length > 0 && (!s.model || models.includes(s.model));
    return Response.json({ ...base, ok: true, models, modelFound });
  } catch (e) {
    return Response.json({ ...base, ok: false, models: [], error: e instanceof Error ? e.message : String(e) });
  }
}
