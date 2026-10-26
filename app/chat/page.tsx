"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertIcon, ArrowDownIcon, LinkIcon, PhoneIcon, PlusIcon, SendIcon, ShieldIcon, StopIcon, UserIcon } from "@/components/icons";
import { useLang } from "@/components/i18n";
import { ModelBanner, useModelHealth } from "@/components/ModelStatus";
import { StatusBadge, statusInfo } from "@/components/StatusBadge";
import { store } from "@/lib/client";

type Source = { id: string; name: string; status: string; links?: string[]; helplines?: string[] };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; error?: string; fixed?: number; stopped?: boolean };

const distanceFromBottom = () => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
type ProfileLite = { name: string | null; age: number | null; district: string | null; marital_status: string | null; pregnant_or_lactating: boolean };

const STARTERS = [
  { hi: "मेरे लिए कौन सी योजनाएं हैं?", en: "Which schemes am I eligible for?" },
  { hi: "गर्भवती महिलाओं के लिए कौन सी योजना है?", en: "Which schemes help pregnant women?" },
  { hi: "बेटी की पढ़ाई के लिए क्या मदद मिलती है?", en: "What help is there for my daughter's education?" },
  { hi: "विधवा पेंशन के लिए कैसे आवेदन करें?", en: "How do I apply for the widow pension?" },
  { hi: "क्या 'फ्री सिलाई मशीन योजना' असली है?", en: "Is the 'Free Silai Machine Yojana' real?" },
  { hi: "अपना काम शुरू करने के लिए लोन कैसे मिलेगा?", en: "How can I get a loan to start a business?" },
];

function SourceChips({ sources }: { sources: Source[] }) {
  const { t } = useLang();
  if (!sources.length) return null;
  return (
    <div className="mt-3 border-t border-brand-100 pt-2">
      <p className="mb-1.5 text-xs font-semibold text-ink/60">{t("जानकारी इन योजनाओं से:", "Information from these schemes:")}</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => {
          const tone = statusInfo(s.status).tone;
          return (
            <Link
              key={s.id}
              href={`/schemes/${s.id}`}
              className={`flex min-h-11 max-w-full flex-col justify-center rounded-xl border-2 px-3 py-1 text-left text-sm hover:shadow ${
                tone === "green" ? "border-emerald-200 bg-emerald-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"
              }`}
            >
              <span className="line-clamp-1 font-semibold">
                {s.id} · {s.name}
              </span>
              <StatusBadge status={s.status} className="mt-0.5 self-start" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Links and helplines come from the scheme database, not from the model, so they are always the official ones. */
function OfficialLinks({ sources, answer }: { sources: Source[]; answer: string }) {
  const { t } = useLang();
  const usable = sources.filter((s) => statusInfo(s.status).tone !== "red" && ((s.links?.length ?? 0) > 0 || (s.helplines?.length ?? 0) > 0));
  // Prefer the schemes the answer actually talks about; otherwise show the top few sources.
  const mentioned = usable.filter((s) => answer.includes(s.id));
  const rows = mentioned.length ? mentioned : usable.slice(0, 3);
  if (!rows.length) return null;
  return (
    <div className="mt-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm">
      <p className="mb-1.5 flex items-center gap-1.5 font-bold text-emerald-900">
        <ShieldIcon width={18} height={18} />
        {t("सरकारी लिंक और हेल्पलाइन (जाँचे हुए)", "Official links and helplines (verified)")}
      </p>
      <ul className="space-y-1.5">
        {rows.map((s) => (
          <li key={s.id}>
            <span className="font-semibold">{s.name}</span>
            {s.links?.map((href) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center gap-1 break-all text-emerald-800 underline">
                <LinkIcon width={16} height={16} className="shrink-0" />
                {href.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            ))}
            {s.helplines?.map((h) => (
              <span key={h} className="flex items-center gap-1 text-emerald-900">
                <PhoneIcon width={16} height={16} className="shrink-0" />
                {h}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Typing() {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-2 text-ink/70" role="status" aria-live="polite">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2.5 w-2.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      {t("प्रेरक सोच रहा है... (इसमें थोड़ा समय लग सकता है)", "Prerak is thinking... (this can take a little while)")}
    </div>
  );
}

export default function ChatPage() {
  const { t, lang } = useLang();
  const { health, refresh } = useModelHealth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitingFirstToken, setWaitingFirstToken] = useState(false);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const convRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoAskedRef = useRef(false);
  // Follow new text only while the reader is at the bottom; scrolling up releases it.
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const pid = store.profileId;
    if (pid)
      fetch(`/api/profile?id=${encodeURIComponent(pid)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setProfile)
        .catch(() => {});
    const askParam = new URLSearchParams(window.location.search).get("ask");
    if (askParam) {
      if (autoAskedRef.current) return;
      autoAskedRef.current = true;
      window.history.replaceState(null, "", "/chat");
      store.conversationId = null;
      void ask(askParam);
      return;
    }
    const cid = store.conversationId;
    if (cid)
      fetch(`/api/conversations?id=${encodeURIComponent(cid)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (!c) return (store.conversationId = null);
          convRef.current = c.id;
          setMessages(c.messages);
        })
        .catch(() => {});
  }, []);

  useEffect(() => {
    const release = () => {
      pinnedRef.current = false;
      setShowJump(distanceFromBottom() > 80);
    };
    // Auto-follow only ever scrolls down, so any upward move (scrollbar drag included) came from the reader.
    let lastY = window.scrollY;
    const onScroll = () => {
      const far = distanceFromBottom() > 80;
      if (!far) pinnedRef.current = true;
      else if (window.scrollY < lastY - 2) pinnedRef.current = false;
      lastY = window.scrollY;
      setShowJump(far && !pinnedRef.current);
    };
    const onWheel = (e: WheelEvent) => e.deltaY < 0 && release();
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => e.touches[0].clientY > touchY + 5 && release();
    const onKey = (e: KeyboardEvent) => ["ArrowUp", "PageUp", "Home"].includes(e.key) && release();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (pinnedRef.current) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
    else setShowJump(distanceFromBottom() > 80);
  }, [messages, waitingFirstToken]);

  function jumpToLatest() {
    pinnedRef.current = true;
    setShowJump(false);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }

  function stop() {
    abortRef.current?.abort();
    setMessages((all) => {
      const last = all[all.length - 1];
      return last?.role === "assistant" ? [...all.slice(0, -1), { ...last, stopped: true }] : all;
    });
  }

  function newChat() {
    abortRef.current?.abort();
    convRef.current = null;
    store.conversationId = null;
    setMessages([]);
    setBusy(false);
    setWaitingFirstToken(false);
    inputRef.current?.focus();
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    pinnedRef.current = true;
    setShowJump(false);
    setBusy(true);
    setWaitingFirstToken(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "", sources: [] }]);
    const updateLast = (fn: (m: Msg) => Msg) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, conversationId: convRef.current, profileId: store.profileId, llm: store.llm }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "meta") {
            convRef.current = ev.conversationId;
            store.conversationId = ev.conversationId;
            updateLast((m) => ({ ...m, sources: ev.sources }));
          } else if (ev.type === "delta") {
            setWaitingFirstToken(false);
            updateLast((m) => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === "replace") {
            updateLast((m) => ({ ...m, content: ev.text, fixed: ev.fixes?.length ?? 0 }));
          } else if (ev.type === "error") {
            updateLast((m) => ({ ...m, error: ev.message }));
            void refresh();
          }
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        updateLast((m) => ({
          ...m,
          error: t("सर्वर से जुड़ नहीं पाए। इंटरनेट/सर्वर जाँचें और फिर कोशिश करें।", "Could not reach the app server. Please check and try again.") + ` (${(e as Error).message})`,
        }));
      }
    } finally {
      setBusy(false);
      setWaitingFirstToken(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-3 md:flex-row md:items-start">
      <aside className="order-first md:order-last md:w-64 md:shrink-0">
        <div className="flex items-center gap-2 rounded-2xl border border-brand-100 bg-white p-3 text-sm md:flex-col md:items-stretch">
          <div className="flex flex-1 items-center gap-2">
            <UserIcon className="shrink-0 text-brand-500" />
            {profile ? (
              <span>
                <span className="font-semibold">{profile.name || t("आपकी प्रोफ़ाइल", "Your profile")}</span>
                <span className="block text-ink/65">
                  {[profile.age && `${profile.age} ${t("साल", "yrs")}`, profile.district, profile.pregnant_or_lactating && t("गर्भवती/धात्री", "pregnant/breastfeeding")]
                    .filter(Boolean)
                    .join(" · ") || t("जवाब आपकी प्रोफ़ाइल के हिसाब से", "Answers use your profile")}
                </span>
              </span>
            ) : (
              <span className="text-ink/75">{t("प्रोफ़ाइल भरने से जवाब आपके हिसाब से मिलेंगे", "Fill your profile for answers that fit you")}</span>
            )}
          </div>
          <Link href="/profile" className="flex min-h-11 items-center justify-center rounded-xl border-2 border-brand-200 px-3 font-semibold text-brand-700 hover:bg-brand-50">
            {profile ? t("बदलें", "Edit") : t("भरें", "Fill")}
          </Link>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <ModelBanner health={health} />

        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-bold">{t("प्रेरक से पूछें", "Ask Prerak")}</h1>
          <button
            type="button"
            onClick={newChat}
            className="flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-brand-200 bg-white px-3 font-semibold text-brand-700 hover:bg-brand-50"
          >
            <PlusIcon width={20} height={20} />
            {t("नई बातचीत", "New chat")}
          </button>
        </div>

        <div className="flex-1 space-y-4" aria-live="polite">
          {empty && (
            <div className="rounded-2xl border border-brand-100 bg-white p-4">
              <p className="mb-3 text-ink/80">
                {t("नमस्ते! मैं प्रेरक हूँ। कोई सवाल चुनें या लिखें:", "Hi! I'm Prerak. Pick a question or type your own:")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {STARTERS.map((s) => (
                  <button
                    key={s.en}
                    type="button"
                    onClick={() => ask(lang === "hi" ? s.hi : s.en)}
                    className="min-h-12 rounded-2xl border-2 border-brand-200 bg-brand-50 px-4 py-2 text-left font-medium text-brand-700 hover:border-brand-500"
                  >
                    {t(s.hi, s.en)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-4 py-2.5 text-white">
                {m.content}
              </div>
            ) : (
              <div key={i} className="max-w-[95%] rounded-2xl rounded-bl-md border border-brand-100 bg-white px-4 py-3 shadow-sm">
                {m.content ? (
                  <div className="prose-chat">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  !m.error && !m.stopped && <Typing />
                )}
                {m.stopped && (
                  <p className="mt-2 text-xs font-medium text-ink/60">{t("आपने जवाब रोक दिया।", "You stopped this answer.")}</p>
                )}
                {m.error && (
                  <div role="alert" className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-900">
                    <AlertIcon className="shrink-0" />
                    <span>
                      {m.error}{" "}
                      <Link href="/settings" className="font-semibold underline">
                        {t("सेटिंग्स", "Settings")}
                      </Link>
                    </span>
                  </div>
                )}
                {!!m.fixed && (
                  <p className="mt-2 text-xs text-ink/60">
                    {t(
                      `${m.fixed} लिंक/नंबर सरकारी जानकारी से मिलाकर ठीक किए गए।`,
                      `${m.fixed} link(s)/number(s) were corrected against the official data.`,
                    )}
                  </p>
                )}
                {m.sources && m.content && !(busy && i === messages.length - 1) && <OfficialLinks sources={m.sources} answer={m.content} />}
                {m.sources && m.content && <SourceChips sources={m.sources} />}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>

        {showJump && (
          <div className="pointer-events-none sticky bottom-[9.5rem] z-10 flex justify-center md:bottom-24">
            <button
              type="button"
              onClick={jumpToLatest}
              className="pointer-events-auto flex min-h-11 items-center gap-1.5 rounded-full border-2 border-brand-200 bg-white px-4 font-semibold text-brand-700 shadow-lg hover:bg-brand-50"
            >
              <ArrowDownIcon width={18} height={18} />
              {t("नीचे जाएँ", "Jump to latest")}
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="sticky bottom-[4.5rem] mt-4 flex items-end gap-2 rounded-2xl border-2 border-brand-200 bg-white p-2 shadow-lg md:bottom-3"
        >
          <label htmlFor="q" className="sr-only">
            {t("अपना सवाल लिखें", "Type your question")}
          </label>
          <textarea
            id="q"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={1}
            placeholder={t("अपना सवाल यहाँ लिखें...", "Type your question here...")}
            className="max-h-40 min-h-12 flex-1 resize-none rounded-xl px-3 py-2.5 text-base focus:outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label={t("जवाब रोकें", "Stop answer")}
              title={t("जवाब रोकें", "Stop answer")}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-brand-500 bg-white text-brand-600 hover:bg-brand-50"
            >
              <StopIcon width={20} height={20} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label={t("भेजें", "Send")}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <SendIcon />
            </button>
          )}
        </form>
        <p className="mt-2 text-center text-xs text-ink/60">
          {t(
            "प्रेरक AI है, गलती कर सकता है। आवेदन से पहले सरकारी वेबसाइट पर जाँचें।",
            "Prerak is AI and can make mistakes. Check the official website before applying.",
          )}
        </p>
      </section>
    </div>
  );
}
