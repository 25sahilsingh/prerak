"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertIcon } from "./icons";
import { useLang } from "./i18n";

export type Health = {
  ok: boolean;
  configured: boolean;
  baseUrl: string;
  model: string;
  models: string[];
  modelFound?: boolean;
  error?: string;
};

export function useModelHealth(pollMs = 0) {
  const [health, setHealth] = useState<Health | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setHealth(await res.json());
    } catch {
      setHealth(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
    if (!pollMs) return;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);
  return { health, refresh };
}

export function ModelBanner({ health }: { health: Health | null }) {
  const { t } = useLang();
  if (!health || (health.ok && health.modelFound !== false)) return null;
  const message = !health.ok
    ? t(
        `आपका AI मॉडल ${health.baseUrl} पर नहीं मिल रहा। अपना लोकल मॉडल सर्वर चालू करें या सेटिंग्स में पता बदलें।`,
        `Can't reach your model at ${health.baseUrl}. Start your local model server or update it in Settings.`,
      )
    : health.models.length === 0
      ? t(
          `${health.baseUrl} पर सर्वर चल रहा है, पर कोई मॉडल डाउनलोड नहीं है। एक मॉडल डाउनलोड करें या सेटिंग्स देखें।`,
          `Your model server at ${health.baseUrl} is running but has no model downloaded. Download a model or check Settings.`,
        )
      : t(
          `मॉडल "${health.model}" सर्वर पर नहीं मिला। सेटिंग्स में सूची से मॉडल चुनें।`,
          `Model "${health.model}" was not found on the server. Pick one from the list in Settings.`,
        );
  return (
    <div role="alert" className="mb-3 flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-amber-950">
      <AlertIcon className="mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <p>{message}</p>
        <Link href="/settings" className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700">
          {t("सेटिंग्स खोलें", "Open Settings")}
        </Link>
      </div>
    </div>
  );
}
