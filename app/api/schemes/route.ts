import { getScheme, listSchemes } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const s = getScheme(id);
    return s ? Response.json(s) : Response.json({ error: "Scheme not found" }, { status: 404 });
  }
  return Response.json(listSchemes());
}
