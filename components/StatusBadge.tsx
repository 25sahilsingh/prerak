"use client";

import { useLang } from "./i18n";

export type Tone = "green" | "amber" | "red";

export function statusInfo(status: string): { tone: Tone; hi: string; en: string } {
  const s = status.toUpperCase();
  if (s.includes("FAKE")) return { tone: "red", hi: "फर्जी - आवेदन न करें", en: "Fake - do not apply" };
  if (s.includes("DISCONTINUED")) return { tone: "red", hi: "बंद हो चुकी", en: "Discontinued" };
  if (s.includes("NOT IN FORCE")) return { tone: "red", hi: "लागू नहीं", en: "Not in force" };
  if (s.includes("EXISTING")) return { tone: "amber", hi: "केवल पुराने लाभार्थी", en: "Existing beneficiaries only" };
  if (s.includes("APPROVED")) return { tone: "amber", hi: "जल्द शुरू होगी", en: "Announced - not open yet" };
  if (s.startsWith("OPEN")) return { tone: "green", hi: "आवेदन खुला है", en: "Open - apply now" };
  return { tone: "green", hi: "चालू है", en: "Active" };
}

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-100 text-emerald-900 border-emerald-300",
  amber: "bg-amber-100 text-amber-900 border-amber-300",
  red: "bg-red-100 text-red-900 border-red-300",
};

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const { t } = useLang();
  const info = statusInfo(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[info.tone]} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${info.tone === "green" ? "bg-emerald-600" : info.tone === "amber" ? "bg-amber-500" : "bg-red-600"}`} />
      {t(info.hi, info.en)}
    </span>
  );
}
