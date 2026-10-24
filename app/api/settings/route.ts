import { getLlmSettings, PRESETS, publicSettings, saveLlmSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ...publicSettings(getLlmSettings()), presets: PRESETS });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { baseUrl?: string; model?: string; apiKey?: string };
  if (!body.baseUrl || !/^https?:\/\//i.test(body.baseUrl.trim())) {
    return Response.json({ error: "Enter a URL that starts with http:// or https://" }, { status: 400 });
  }
  const saved = saveLlmSettings({ baseUrl: body.baseUrl, model: body.model ?? "", apiKey: body.apiKey });
  return Response.json(publicSettings(saved));
}
