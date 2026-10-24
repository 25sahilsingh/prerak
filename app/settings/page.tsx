"use client";

import { useEffect, useState } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { useLang } from "@/components/i18n";

type Preset = { id: string; label: string; baseUrl: string };
type TestState = { kind: "idle" } | { kind: "testing" } | { kind: "ok"; models: string[] } | { kind: "error"; message: string };

const inputCls = "w-full min-h-12 rounded-xl border-2 border-brand-100 bg-white px-3 text-base focus:border-brand-500 focus:outline-none";

const HELP: Record<string, { hi: string; en: string }> = {
  ollama: {
    hi: "Ollama इंस्टॉल करें, फिर टर्मिनल में चलाएँ: ollama pull qwen2.5:7b (या कोई और मॉडल)। Ollama अपने-आप चालू रहता है।",
    en: "Install Ollama, then run in a terminal: ollama pull qwen2.5:7b (or any model). Ollama keeps running in the background.",
  },
  lmstudio: {
    hi: "LM Studio में मॉडल डाउनलोड करें, फिर Developer टैब में 'Start Server' दबाएँ।",
    en: "Download a model in LM Studio, then press 'Start Server' in the Developer tab.",
  },
  llamacpp: {
    hi: "चलाएँ: llama-server -m your-model.gguf --port 8080",
    en: "Run: llama-server -m your-model.gguf --port 8080",
  },
  vllm: { hi: "चलाएँ: vllm serve <model-name> --port 8000", en: "Run: vllm serve <model-name> --port 8000" },
};

export default function SettingsPage() {
  const { t } = useLang();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [preset, setPreset] = useState<string>("");
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setPresets(s.presets);
        setBaseUrl(s.baseUrl);
        setModel(s.model);
        setHasApiKey(s.hasApiKey);
        setPreset(s.presets.find((p: Preset) => p.baseUrl === s.baseUrl)?.id ?? "");
        void runTest(s.baseUrl, "");
      })
      .catch(() => {});
  }, []);

  async function runTest(url = baseUrl, key = apiKey) {
    setTest({ kind: "testing" });
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url, apiKey: key }),
      });
      const body = await res.json();
      if (body.ok) {
        setTest({ kind: "ok", models: body.models });
        setModel((m) => (m && body.models.includes(m) ? m : m || body.models[0] || ""));
      } else setTest({ kind: "error", message: body.error });
    } catch (e) {
      setTest({ kind: "error", message: (e as Error).message });
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSave("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, model, ...(apiKey ? { apiKey } : clearKey ? { apiKey: "" } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setHasApiKey(body.hasApiKey);
      setApiKey("");
      setClearKey(false);
      setSave("saved");
    } catch (err) {
      setSaveError((err as Error).message);
      setSave("error");
    }
  }

  const choosePreset = (p: Preset) => {
    setPreset(p.id);
    setBaseUrl(p.baseUrl);
    setModel("");
    setSave("idle");
    void runTest(p.baseUrl, apiKey);
  };

  return (
    <form onSubmit={onSave} className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("AI मॉडल सेटिंग्स", "AI model settings")}</h1>
        <p className="mt-1 text-ink/75">
          {t(
            "एक बार सेट करना होता है। किसी जानकार की मदद ले सकती हैं।",
            "Set this up once. You can ask someone who knows computers to help.",
          )}
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-brand-100 bg-white p-4">
        <h2 className="text-lg font-bold text-brand-700">{t("1. आप कौन सा मॉडल सर्वर इस्तेमाल करती हैं?", "1. Which model server do you use?")}</h2>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choosePreset(p)}
              className={`flex min-h-14 flex-col items-start justify-center rounded-xl border-2 px-3 text-left ${
                preset === p.id ? "border-brand-500 bg-brand-50" : "border-brand-100 hover:border-brand-500"
              }`}
            >
              <span className="font-bold">{p.label}</span>
              <span className="break-all text-xs text-ink/60">{p.baseUrl}</span>
            </button>
          ))}
        </div>
        {preset && HELP[preset] && <p className="rounded-xl bg-cream p-3 text-sm">{t(HELP[preset].hi, HELP[preset].en)}</p>}
      </section>

      <section className="space-y-4 rounded-2xl border border-brand-100 bg-white p-4">
        <h2 className="text-lg font-bold text-brand-700">{t("2. पता और मॉडल", "2. Address and model")}</h2>
        <div>
          <label htmlFor="baseUrl" className="mb-1 block font-semibold">
            {t("API पता (OpenAI-compatible)", "API base URL (OpenAI-compatible)")}
          </label>
          <input
            id="baseUrl"
            className={inputCls}
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setPreset(presets.find((p) => p.baseUrl === e.target.value.trim())?.id ?? "");
              setSave("idle");
            }}
            placeholder="http://localhost:11434/v1"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-sm text-ink/65">{t("आमतौर पर /v1 पर खत्म होता है।", "Usually ends with /v1.")}</p>
        </div>

        <div>
          <label htmlFor="apiKey" className="mb-1 block font-semibold">
            {t("API key (ज़रूरी नहीं)", "API key (optional)")}
          </label>
          <input
            id="apiKey"
            className={inputCls}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? t("सेव है - बदलने के लिए नई लिखें", "Saved - type a new one to replace") : t("लोकल सर्वर के लिए खाली छोड़ें", "Leave empty for local servers")}
            autoComplete="off"
          />
          {hasApiKey && (
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} className="h-5 w-5 accent-brand-500" />
              {t("सेव की हुई key हटाएँ", "Remove the saved key")}
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={() => runTest()}
          disabled={test.kind === "testing" || !baseUrl}
          className="min-h-12 w-full rounded-xl border-2 border-brand-500 bg-white font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
        >
          {test.kind === "testing" ? t("जाँच हो रही है...", "Testing...") : t("कनेक्शन जाँचें", "Test connection")}
        </button>

        {test.kind === "ok" && test.models.length > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900">
            <CheckIcon className="shrink-0" />
            {t(`जुड़ गया! ${test.models.length} मॉडल मिले।`, `Connected! Found ${test.models.length} model(s).`)}
          </p>
        )}
        {test.kind === "ok" && test.models.length === 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-950">
            <AlertIcon className="shrink-0" />
            {t(
              "सर्वर से जुड़ गया, पर कोई मॉडल डाउनलोड नहीं है। पहले एक मॉडल डाउनलोड करें (जैसे: ollama pull qwen2.5:7b), फिर दोबारा जाँचें।",
              "Connected to the server, but no model is downloaded yet. Download one first (e.g. ollama pull qwen2.5:7b), then test again.",
            )}
          </p>
        )}
        {test.kind === "error" && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-red-900">
            <AlertIcon className="shrink-0" />
            {test.message}
          </p>
        )}

        <div>
          <label htmlFor="model" className="mb-1 block font-semibold">
            {t("मॉडल", "Model")}
          </label>
          {test.kind === "ok" && test.models.length > 0 ? (
            <select id="model" className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
              {!test.models.includes(model) && model && <option value={model}>{model}</option>}
              {test.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="model"
              className={inputCls}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t("जैसे qwen2.5:7b (खाली = सर्वर का पहला मॉडल)", "e.g. qwen2.5:7b (empty = server's first model)")}
              autoComplete="off"
              spellCheck={false}
            />
          )}
          <p className="mt-1 text-sm text-ink/65">
            {t(
              "हिंदी के लिए 7B-9B आकार के Qwen, Llama 3.1 या Gemma मॉडल अच्छे रहते हैं।",
              "7B-9B models such as Qwen, Llama 3.1 or Gemma work well for Hindi.",
            )}
          </p>
        </div>
      </section>

      <div className="sticky bottom-20 z-10 space-y-2 rounded-2xl bg-cream/95 py-2 md:bottom-2">
        <button
          type="submit"
          disabled={save === "saving" || !baseUrl}
          className="min-h-14 w-full rounded-2xl bg-brand-500 text-lg font-bold text-white shadow hover:bg-brand-600 disabled:opacity-60"
        >
          {save === "saving" ? t("सेव हो रहा है...", "Saving...") : t("सेव करें", "Save")}
        </button>
        {save === "saved" && (
          <p role="status" className="text-center font-semibold text-emerald-700">
            {t("सेव हो गया!", "Saved!")}{" "}
            <a href="/chat" className="underline">
              {t("अब सवाल पूछें", "Now ask a question")}
            </a>
          </p>
        )}
        {save === "error" && (
          <p role="alert" className="text-center font-semibold text-red-700">
            {saveError || t("सेव नहीं हो पाया।", "Could not save.")}
          </p>
        )}
      </div>
    </form>
  );
}
