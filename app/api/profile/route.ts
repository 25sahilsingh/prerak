import { randomUUID } from "node:crypto";
import { getProfile, saveProfile, type Profile } from "@/lib/db";

export const dynamic = "force-dynamic";

const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const toStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const profile = id ? getProfile(id) : null;
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
  return Response.json(profile);
}

export async function POST(req: Request) {
  const b = (await req.json()) as Record<string, unknown>;
  const id = typeof b.id === "string" && b.id && getProfile(b.id) ? b.id : randomUUID();
  const profile: Profile = {
    id,
    name: toStr(b.name),
    age: toInt(b.age),
    gender: toStr(b.gender),
    district: toStr(b.district),
    annual_income: toInt(b.annual_income),
    social_category: toStr(b.social_category),
    marital_status: toStr(b.marital_status),
    pregnant_or_lactating: !!b.pregnant_or_lactating,
    children_count: toInt(b.children_count),
    daughters_count: toInt(b.daughters_count),
    is_student: !!b.is_student,
    education_level: toStr(b.education_level),
    disability: !!b.disability,
    occupation_tags: Array.isArray(b.occupation_tags) ? b.occupation_tags.filter((t): t is string => typeof t === "string") : [],
    has_ration_card: !!b.has_ration_card,
    language: toStr(b.language) ?? "auto",
  };
  return Response.json(saveProfile(profile));
}
