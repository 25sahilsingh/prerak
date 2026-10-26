"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { useLang } from "@/components/i18n";
import { StatusBadge, statusInfo, type Tone } from "@/components/StatusBadge";

type SchemeCard = { id: string; name: string; state: string; category: string; status: string; aka: string; benefit: string; applies_to: string };

// Groups the PDF's ~30 category labels into a handful of topics a user can scan.
const TOPICS = [
  { id: "girl", hi: "बेटी व पढ़ाई", en: "Daughters & education", re: /girl|education|scholar|savings/i },
  { id: "marriage", hi: "शादी", en: "Marriage", re: /marriage/i },
  { id: "health", hi: "गर्भावस्था व पोषण", en: "Pregnancy & nutrition", re: /maternity|nutrition|health/i },
  { id: "pension", hi: "पेंशन", en: "Pension", re: /pension/i },
  { id: "work", hi: "रोज़गार व लोन", en: "Jobs, business & loans", re: /livelihood|business|loan|shg|skills|entrepreneur/i },
  { id: "home", hi: "घर व गैस", en: "Housing & LPG", re: /housing|lpg|household|fuel/i },
  { id: "safety", hi: "सुरक्षा व मदद", en: "Safety & support", re: /safety|distress|support|umbrella|empowerment|transport/i },
  { id: "fake", hi: "फर्जी योजनाएं", en: "Fake schemes", re: /fake/i },
] as const;

const btn = (on: boolean) =>
  `min-h-11 shrink-0 whitespace-nowrap rounded-full border-2 px-4 text-sm font-medium ${on ? "border-brand-500 bg-brand-500 text-white" : "border-brand-200 bg-white hover:border-brand-500"}`;
// One sideways-scrolling row per filter group on phones, wrapping rows on wider screens.
const row = "-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0";

export function SchemeCatalogue({ schemes }: { schemes: SchemeCard[] }) {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string>("");
  const [where, setWhere] = useState("");
  const [tone, setTone] = useState<"" | Tone>("");

  const states = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of schemes) {
      const name = s.state.trim() || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.keys()].sort((a, b) => a.localeCompare(b));
  }, [schemes]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const topicRe = TOPICS.find((x) => x.id === topic)?.re;
    return schemes.filter(
      (s) =>
        (!needle || `${s.id} ${s.name} ${s.aka} ${s.category} ${s.benefit} ${s.state}`.toLowerCase().includes(needle)) &&
        (!topicRe || topicRe.test(s.category)) &&
        (!where || s.state.trim() === where) &&
        (!tone || statusInfo(s.status).tone === tone),
    );
  }, [schemes, q, topic, where, tone]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("सभी योजनाएं", "All schemes")}</h1>
        <p className="text-ink/75">{t(`${schemes.length} योजनाएँ`, `${schemes.length} schemes`)}</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-3">
        <label className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-brand-100 px-3 focus-within:border-brand-500">
          <SearchIcon className="text-ink/50" />
          <span className="sr-only">{t("खोजें", "Search")}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("योजना का नाम खोजें, जैसे सुमंगला, Ujjwala, pension", "Search a scheme, e.g. Sumangala, Ujjwala, pension")}
            className="min-h-11 flex-1 bg-transparent text-base focus:outline-none"
          />
        </label>
        <div className={row}>
          <button type="button" className={btn(topic === "")} onClick={() => setTopic("")}>
            {t("सभी विषय", "All topics")}
          </button>
          {TOPICS.map((x) => (
            <button key={x.id} type="button" className={btn(topic === x.id)} onClick={() => setTopic(topic === x.id ? "" : x.id)}>
              {t(x.hi, x.en)}
            </button>
          ))}
        </div>
        <div className={row}>
          <button type="button" className={btn(where === "")} onClick={() => setWhere("")}>
            {t("सभी राज्य", "All states")}
          </button>
          {states.map((state) => (
            <button key={state} type="button" className={btn(where === state)} onClick={() => setWhere(where === state ? "" : state)}>
              {state === "Uttar Pradesh" ? t("उत्तर प्रदेश", "Uttar Pradesh") : /^Central/i.test(state) ? t("केंद्र सरकार", "Central") : state}
            </button>
          ))}
        </div>
        <div className={row}>
          {(
            [
              ["", t("कोई भी स्थिति", "Any status")],
              ["green", t("खुली / चालू", "Open / active")],
              ["amber", t("जल्द / सीमित", "Soon / limited")],
              ["red", t("फर्जी / बंद", "Fake / closed")],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" className={btn(tone === v)} onClick={() => setTone(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-ink/70" role="status">
        {t(`${filtered.length} योजनाएं मिलीं`, `${filtered.length} schemes found`)}
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((s) => {
          const red = statusInfo(s.status).tone === "red";
          return (
            <li key={s.id}>
              <Link
                href={`/schemes/${s.id}`}
                className={`flex h-full flex-col gap-2 rounded-2xl border-2 bg-white p-4 shadow-sm transition hover:shadow-md ${red ? "border-red-200" : "border-brand-100 hover:border-brand-200"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={s.status} />
                  <span className="text-xs text-ink/60">
                    {s.id} · {s.state === "Uttar Pradesh" ? t("उत्तर प्रदेश", "Uttar Pradesh") : /^Central/i.test(s.state) ? t("केंद्र सरकार", "Central") : s.state}
                  </span>
                </div>
                <h2 className={`text-lg font-bold leading-snug ${red ? "text-red-800" : ""}`}>{s.name}</h2>
                <p className="text-sm text-ink/60">{s.category}</p>
                <p className="line-clamp-3 text-sm">{s.benefit}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
