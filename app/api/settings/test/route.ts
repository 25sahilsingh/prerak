import { describeLlmError, listModels } from "@/lib/llm";
import { resolveLlmSettings, SettingsError } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { llm?: unknown };
  let s;
  try {
    s = resolveLlmSettings(body.llm);
  } catch (e) {
    if (e instanceof SettingsError) return Response.json({ ok: false, models: [], error: e.message }, { status: 400 });
    throw e;
  }
  if (!s) return Response.json({ ok: false, models: [], error: "Enter your model server's address." }, { status: 400 });
  try {
    const models = await listModels(s, 6000);
    return Response.json({ ok: true, models });
  } catch (e) {
    return Response.json({ ok: false, models: [], error: describeLlmError(e, s) });
  }
}
