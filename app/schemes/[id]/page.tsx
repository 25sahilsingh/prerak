import { notFound } from "next/navigation";
import { getScheme } from "@/lib/db";
import { SchemeDetail } from "./SchemeDetail";

export const dynamic = "force-dynamic";

export default async function SchemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scheme = getScheme(decodeURIComponent(id).toUpperCase());
  if (!scheme) notFound();
  return <SchemeDetail scheme={scheme} />;
}
