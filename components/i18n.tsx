"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UiLang = "hi" | "en";

type Ctx = { lang: UiLang; setLang: (l: UiLang) => void; t: (hi: string, en: string) => string };

const LangContext = createContext<Ctx>({ lang: "hi", setLang: () => {}, t: (hi) => hi });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("hi");
  useEffect(() => {
    const saved = localStorage.getItem("uiLang");
    if (saved === "hi" || saved === "en") setLangState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = (l: UiLang) => {
    localStorage.setItem("uiLang", l);
    setLangState(l);
  };
  return <LangContext.Provider value={{ lang, setLang, t: (hi, en) => (lang === "hi" ? hi : en) }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** Shows the label in the chosen language with the other language underneath in small text. */
export function Bi({ hi, en, className = "" }: { hi: string; en: string; className?: string }) {
  const { lang } = useLang();
  const [main, sub] = lang === "hi" ? [hi, en] : [en, hi];
  return (
    <span className={className}>
      {main}
      <span className="block text-[0.8em] font-normal opacity-70">{sub}</span>
    </span>
  );
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "hi" ? "en" : "hi")}
      className="min-h-11 rounded-full border-2 border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
      aria-label="Change language / भाषा बदलें"
    >
      {lang === "hi" ? "English" : "हिंदी"}
    </button>
  );
}
