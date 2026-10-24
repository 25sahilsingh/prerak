"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChatIcon } from "@/components/icons";
import { useLang } from "@/components/i18n";
import { useModelHealth } from "@/components/ModelStatus";
import { store } from "@/lib/client";

export default function Home() {
  const { t } = useLang();
  const { health } = useModelHealth();
  const [hasProfile, setHasProfile] = useState(false);
  useEffect(() => setHasProfile(!!store.profileId), []);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
      <div>
        <h1 className="text-5xl font-bold text-brand-700">Prerak</h1>
        <p className="mt-1 text-2xl font-semibold text-brand-500">प्रेरक</p>
      </div>

      <div className="space-y-1 text-lg">
        <p>आपके लिए सरकारी योजनाएँ</p>
        <p className="text-ink/70">Find government schemes for you</p>
      </div>

      <Link
        href={hasProfile ? "/chat" : "/profile?next=chat"}
        className="flex min-h-16 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 text-xl font-bold text-white shadow-lg hover:bg-brand-700"
      >
        <ChatIcon />
        {t("बात शुरू करें", "Start chat")}
      </Link>

      <div className="flex gap-6 text-brand-700">
        <Link href="/profile" className="min-h-11 py-2 underline underline-offset-4">
          {t("मेरी प्रोफ़ाइल", "My profile")}
        </Link>
        <Link href="/schemes" className="min-h-11 py-2 underline underline-offset-4">
          {t("सभी योजनाएँ", "All schemes")}
        </Link>
      </div>

      {health && !(health.ok && health.modelFound) && (
        <Link href="/settings" className="text-sm text-amber-700 underline">
          {t("AI मॉडल जुड़ा नहीं है - सेटिंग्स खोलें", "AI model not connected - open Settings")}
        </Link>
      )}
    </div>
  );
}
