import { listModels } from "@/lib/llm";
import { getLlmSettings, isConfigured, publicSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = getLlmSettings();
  const base = { configured: isConfigured(), ...publicSettings(s) };
  try {
    const models = await listModels(s.baseUrl, s.apiKey, 4000);
    const modelFound = models.length > 0 && (!s.model || models.includes(s.model));
    return Response.json({ ...base, ok: true, models, modelFound });
  } catch (e) {
    return Response.json({ ...base, ok: false, models: [], error: e instanceof Error ? e.message : String(e) });
  }
}
