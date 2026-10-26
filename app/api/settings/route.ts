import { allowPrivateModelUrls } from "@/lib/safe-fetch";
import { PRESETS, serverDefault } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Each visitor's model is kept in their own browser, so there is nothing to save here.
export async function GET() {
  return Response.json({ presets: PRESETS, serverDefault: serverDefault(), allowPrivate: allowPrivateModelUrls });
}
