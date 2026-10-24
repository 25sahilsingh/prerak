"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatIcon, GearIcon, HomeIcon, ListIcon, UserIcon } from "./icons";
import { LangToggle, useLang } from "./i18n";

const ITEMS = [
  { href: "/", hi: "होम", en: "Home", Icon: HomeIcon },
  { href: "/chat", hi: "पूछें", en: "Ask", Icon: ChatIcon },
  { href: "/schemes", hi: "योजनाएं", en: "Schemes", Icon: ListIcon },
  { href: "/profile", hi: "प्रोफ़ाइल", en: "Profile", Icon: UserIcon },
  { href: "/settings", hi: "सेटिंग्स", en: "Settings", Icon: GearIcon },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useLang();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-brand-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 text-lg font-bold text-white">प्र</span>
            <span className="text-lg font-bold text-brand-700">Prerak · प्रेरक</span>
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {ITEMS.map(({ href, hi, en, Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium ${active(href) ? "bg-brand-100 text-brand-700" : "text-ink/80 hover:bg-brand-50"}`}
              >
                <Icon width={20} height={20} />
                {t(hi, en)}
              </Link>
            ))}
          </nav>
          <LangToggle />
        </div>
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-100 bg-white md:hidden">
        <div className="grid grid-cols-5">
          {ITEMS.map(({ href, hi, en, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active(href) ? "text-brand-600" : "text-ink/70"}`}
            >
              <Icon />
              {t(hi, en)}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
