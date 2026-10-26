import fs from "node:fs";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";

const PDF = path.join(process.cwd(), "Women_Schemes_UP_Women_Oct2026_RAG.pdf");
const PUBLIC_ID = "prerak/women-schemes-up-oct-2026";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

export function cloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME?.trim() && process.env.CLOUDINARY_API_KEY?.trim() && process.env.CLOUDINARY_API_SECRET?.trim());
}

export async function uploadPdfToCloudinary(pdfPath: string): Promise<string> {
  cloudinary.config({
    cloud_name: required("CLOUDINARY_CLOUD_NAME"),
    api_key: required("CLOUDINARY_API_KEY"),
    api_secret: required("CLOUDINARY_API_SECRET"),
    secure: true,
  });
  const result = await cloudinary.uploader.upload(pdfPath, {
    resource_type: "raw",
    public_id: PUBLIC_ID,
    overwrite: true,
    unique_filename: false,
    type: "upload",
  });
  return result.secure_url;
}

async function main() {
  if (!fs.existsSync(PDF)) throw new Error(`PDF not found: ${PDF}`);
  const url = await uploadPdfToCloudinary(PDF);
  console.log("Uploaded.");
  console.log(url);
}

const invoked = process.argv[1]?.includes("upload-pdf.ts");
if (invoked) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
