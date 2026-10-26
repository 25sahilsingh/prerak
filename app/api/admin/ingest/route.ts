import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ingestPdf } from "@/scripts/ingest";
import { cloudinaryConfigured, uploadPdfToCloudinary } from "@/scripts/upload-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;

function passwordOk(given: string): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim() ?? "";
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const form = await req.formData();
  if (!passwordOk(String(form.get("password") ?? ""))) {
    return Response.json({ error: "Wrong admin password." }, { status: 401 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a PDF." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "The file must be a PDF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "PDF is larger than 20 MB." }, { status: 400 });
  }

  const destDir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "schemes.pdf");
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

  try {
    const result = await ingestPdf(dest);
    let cloudinaryUrl: string | null = null;
    let cloudinaryNote: string | null = null;
    if (cloudinaryConfigured()) {
      try {
        cloudinaryUrl = await uploadPdfToCloudinary(dest);
      } catch (error) {
        cloudinaryNote = error instanceof Error ? error.message : "Cloudinary upload failed.";
      }
    } else {
      cloudinaryNote = "Cloudinary cloud name is not set, so the PDF was saved and ingested on this computer only.";
    }
    return Response.json({ ...result, cloudinaryUrl, cloudinaryNote });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read that PDF." }, { status: 422 });
  }
}
