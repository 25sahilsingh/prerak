"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertIcon, ChatIcon, LinkIcon } from "@/components/icons";
import { useLang } from "@/components/i18n";
import { StatusBadge, statusInfo } from "@/components/StatusBadge";
import type { Scheme } from "@/lib/db";

const URL_RE = /(https?:\/\/[^\s)]+)/g;

function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-brand-700 underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Renders the PDF's "• item" lines as a list and other lines as paragraphs. */
function Body({ text }: { text: string }) {
  const lines = text.split("\n").reduce<string[]>((acc, line) => {
    const l = line.trim();
    if (!l) return acc;
    if (l.startsWith("•") || acc.length === 0 || /[.:;)]$/.test(acc[acc.length - 1]) || /^[A-Z][a-z]+.*:$/.test(l)) acc.push(l);
    else acc[acc.length - 1] += ` ${l}`;
    return acc;
  }, []);
  return (
    <div className="space-y-1.5">
      {lines.map((l, i) =>
        l.startsWith("•") ? (
          <div key={i} className="flex gap-2">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            <span>
              <Linkify text={l.slice(1).trim()} />
            </span>
          </div>
        ) : (
          <p key={i}>
            <Linkify text={l} />
          </p>
        ),
      )}
    </div>
  );
}

function Card({ title, children, tone = "default" }: { title: string; children: ReactNode; tone?: "default" | "highlight" }) {
  return (
    <section className={`rounded-2xl border-2 p-4 md:p-5 ${tone === "highlight" ? "border-brand-200 bg-brand-50" : "border-brand-100 bg-white"}`}>
      <h2 className="mb-2 text-lg font-bold text-brand-700">{title}</h2>
      {children}
    </section>
  );
}

export function SchemeDetail({ scheme: s }: { scheme: Scheme }) {
  const { t, lang } = useLang();
  const info = statusInfo(s.status);
  const [officialPart, sourcesPart] = s.links.split(/Sources checked:/);
  const officialLinks = [...new Set([...officialPart.matchAll(URL_RE)].map((m) => m[1].replace(/[.,;]+$/, "")))];
  const askText = lang === "hi" ? `${s.name} [${s.id}] के लिए क्या मैं पात्र हूँ और कैसे आवेदन करूँ?` : `Am I eligible for ${s.name} [${s.id}] and how do I apply?`;

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <Link href="/schemes" className="inline-flex min-h-11 items-center font-medium text-brand-700 underline">
        {t("← सभी योजनाएं", "← All schemes")}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={s.status} />
          <span className="text-sm text-ink/60">
            {s.id} · {s.state} · {s.category}
          </span>
        </div>
        <h1 className="text-2xl font-bold leading-tight md:text-3xl">{s.name}</h1>
        {s.aka && (
          <p className="text-ink/70">
            {t("दूसरे नाम:", "Also known as:")} {s.aka}
          </p>
        )}
        {s.department && <p className="text-sm text-ink/60">{s.department}</p>}
      </header>

      {info.tone === "red" && (
        <div role="alert" className="flex gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-red-900">
          <AlertIcon className="shrink-0" />
          <div>
            <p className="font-bold">
              {s.status.includes("FAKE")
                ? t("यह असली सरकारी योजना नहीं है। आवेदन न करें, पैसे न दें, आधार/OTP/बैंक जानकारी न दें।", "This is not a real government scheme. Do not apply, pay, or share Aadhaar/OTP/bank details.")
                : t("इस योजना में अभी आवेदन नहीं हो सकता।", "You cannot apply for this scheme now.")}
            </p>
            <p className="mt-1 text-sm">{t("शिकायत: साइबर हेल्पलाइन 1930 या cybercrime.gov.in", "Report: cyber helpline 1930 or cybercrime.gov.in")}</p>
          </div>
        </div>
      )}

      <Card title={t("क्या मिलेगा", "What you get")} tone="highlight">
        <Body text={s.benefit} />
      </Card>
      <Card title={t("कौन ले सकता है", "Who can apply")}>
        <Body text={s.eligibility} />
      </Card>
      <Card title={t("ज़रूरी कागज़", "Documents needed")}>
        <Body text={s.documents} />
      </Card>
      <Card title={t("आवेदन कैसे करें", "How to apply")} tone="highlight">
        <Body text={s.how_to_apply} />
        {s.window && (
          <div className="mt-3 rounded-xl bg-white p-3">
            <p className="font-semibold">{t("आवेदन की तारीख", "Application dates")}</p>
            <Body text={s.window} />
          </div>
        )}
        {officialLinks.length > 0 && info.tone !== "red" && (
          <div className="mt-3 flex flex-col gap-2">
            {officialLinks.map((href) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 font-bold text-white hover:bg-brand-600"
              >
                <LinkIcon width={20} height={20} />
                {t("सरकारी वेबसाइट खोलें", "Open official website")}
                <span className="truncate text-sm font-normal opacity-90">({new URL(href).hostname})</span>
              </a>
            ))}
          </div>
        )}
      </Card>
      <Card title={t("अभी की स्थिति", "Current status")}>
        <Body text={s.current_status} />
        {officialPart && (
          <div className="mt-2">
            <Body text={officialPart} />
          </div>
        )}
      </Card>
      {sourcesPart && (
        <details className="rounded-2xl border border-brand-100 bg-white p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">{t("जानकारी के स्रोत", "Sources checked")}</summary>
          <div className="mt-2 text-sm">
            <Body text={sourcesPart} />
          </div>
        </details>
      )}

      <Link
        href={`/chat?ask=${encodeURIComponent(askText)}`}
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-brand-500 bg-white text-lg font-bold text-brand-700 hover:bg-brand-50"
      >
        <ChatIcon />
        {t("इस योजना के बारे में प्रेरक से पूछें", "Ask Prerak about this scheme")}
      </Link>
    </article>
  );
}
