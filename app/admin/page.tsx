"use client";

import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/components/i18n";

type Ok = { schemes: number; states: { state: string; count: number }[]; cloudinaryUrl: string | null; cloudinaryNote: string | null };

export default function AdminPage() {
  const { t } = useLang();
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Ok | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setDone(null);
    try {
      const body = new FormData();
      body.set("password", password);
      body.set("file", file);
      const res = await fetch("/api/admin/ingest", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setDone(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">{t("योजना PDF अपलोड", "Upload a schemes PDF")}</h1>
      <p className="text-ink/75">
        {t(
          "नई PDF वही प्रारूप रखे: हर योजना [कोड] से शुरू हो और उसमें State लिखा हो। अपलोड के बाद राज्य की सूची अपने आप बनती है।",
          "The new PDF must use the same layout: each scheme starts with [ID] and has a State field. After upload, the state filters are rebuilt from the file.",
        )}
      </p>
      <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-brand-100 bg-white p-4">
        <label className="block">
          <span className="mb-1 block font-semibold">{t("एडमिन पासवर्ड", "Admin password")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full min-h-12 rounded-xl border-2 border-brand-100 px-3 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold">{t("PDF फ़ाइल", "PDF file")}</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !file}
          className="min-h-12 w-full rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? t("पढ़ रहे हैं... कुछ मिनट लग सकते हैं", "Reading the PDF... this can take a few minutes") : t("अपलोड करें और योजनाएँ बनाएँ", "Upload and build schemes")}
        </button>
      </form>
      {error && <p className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
      {done && (
        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold">{t(`${done.schemes} योजनाएँ तैयार`, `${done.schemes} schemes ready`)}</p>
          <ul className="text-sm">
            {done.states.map((s) => (
              <li key={s.state}>
                {s.state}: {s.count}
              </li>
            ))}
          </ul>
          {done.cloudinaryUrl && (
            <p className="break-all text-sm">
              Cloudinary: <a className="underline" href={done.cloudinaryUrl}>{done.cloudinaryUrl}</a>
            </p>
          )}
          {done.cloudinaryNote && <p className="text-sm text-ink/70">{done.cloudinaryNote}</p>}
          <Link href="/schemes" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline">
            {t("योजनाएँ देखें", "View schemes")}
          </Link>
        </div>
      )}
    </div>
  );
}
