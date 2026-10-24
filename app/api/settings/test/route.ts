import { describeLlmError, listModels } from "@/lib/llm";
import { getLlmSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { baseUrl?: string; apiKey?: string };
  const baseUrl = body.baseUrl?.trim();
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return Response.json({ ok: false, error: "Enter a URL that starts with http:// or https://" }, { status: 400 });
  }
  // An empty key field means "keep the saved key".
  const apiKey = body.apiKey || getLlmSettings().apiKey;
  try {
    const models = await listModels(baseUrl, apiKey, 6000);
    return Response.json({ ok: true, models });
  } catch (e) {
    return Response.json({ ok: false, models: [], error: describeLlmError(e, baseUrl) });
  }
}
