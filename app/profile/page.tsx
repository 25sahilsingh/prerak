"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import { useLang } from "@/components/i18n";
import { store } from "@/lib/client";

type Form = {
  name: string;
  age: string;
  gender: string;
  district: string;
  language: string;
  marital_status: string;
  pregnant_or_lactating: boolean;
  children_count: string;
  daughters_count: string;
  annual_income: string;
  social_category: string;
  has_ration_card: boolean;
  is_student: boolean;
  education_level: string;
  disability: boolean;
  occupation_tags: string[];
};

const EMPTY: Form = {
  name: "",
  age: "",
  gender: "female",
  district: "",
  language: "auto",
  marital_status: "",
  pregnant_or_lactating: false,
  children_count: "",
  daughters_count: "",
  annual_income: "",
  social_category: "",
  has_ration_card: false,
  is_student: false,
  education_level: "",
  disability: false,
  occupation_tags: [],
};

const UP_DISTRICTS =
  "Agra,Aligarh,Ambedkar Nagar,Amethi,Amroha,Auraiya,Ayodhya,Azamgarh,Baghpat,Bahraich,Ballia,Balrampur,Banda,Barabanki,Bareilly,Basti,Bhadohi,Bijnor,Budaun,Bulandshahr,Chandauli,Chitrakoot,Deoria,Etah,Etawah,Farrukhabad,Fatehpur,Firozabad,Gautam Buddh Nagar,Ghaziabad,Ghazipur,Gonda,Gorakhpur,Hamirpur,Hapur,Hardoi,Hathras,Jalaun,Jaunpur,Jhansi,Kannauj,Kanpur Dehat,Kanpur Nagar,Kasganj,Kaushambi,Kushinagar,Lakhimpur Kheri,Lalitpur,Lucknow,Maharajganj,Mahoba,Mainpuri,Mathura,Mau,Meerut,Mirzapur,Moradabad,Muzaffarnagar,Pilibhit,Pratapgarh,Prayagraj,Raebareli,Rampur,Saharanpur,Sambhal,Sant Kabir Nagar,Shahjahanpur,Shamli,Shravasti,Siddharthnagar,Sitapur,Sonbhadra,Sultanpur,Unnao,Varanasi".split(
    ",",
  );

const INCOME_CHIPS = [
  { v: "46000", hi: "₹46 हज़ार तक", en: "Up to ₹46k" },
  { v: "100000", hi: "₹1 लाख तक", en: "Up to ₹1 lakh" },
  { v: "200000", hi: "₹2 लाख तक", en: "Up to ₹2 lakh" },
  { v: "300000", hi: "₹3 लाख तक", en: "Up to ₹3 lakh" },
  { v: "800000", hi: "₹8 लाख तक", en: "Up to ₹8 lakh" },
  { v: "1000000", hi: "₹8 लाख से ज़्यादा", en: "More than ₹8 lakh" },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-brand-100 bg-white p-4 md:p-5">
      <legend className="px-1 text-lg font-bold text-brand-700">{title}</legend>
      {hint && <p className="-mt-1 mb-3 text-sm text-ink/70">{hint}</p>}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-sm text-ink/65">{hint}</p>}
    </div>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  multi = false,
}: {
  options: { v: T; label: string }[];
  value: T | T[];
  onChange: (v: T) => void;
  multi?: boolean;
}) {
  const selected = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  return (
    <div className="flex flex-wrap gap-2" role={multi ? "group" : "radiogroup"}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role={multi ? "checkbox" : "radio"}
          aria-checked={selected(o.v)}
          onClick={() => onChange(o.v)}
          className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-medium transition ${
            selected(o.v) ? "border-brand-500 bg-brand-500 text-white" : "border-brand-200 bg-white text-ink hover:border-brand-500"
          }`}
        >
          {selected(o.v) && <CheckIcon width={16} height={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-brand-500" />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink/65">{hint}</span>}
      </span>
    </label>
  );
}

const inputCls = "w-full min-h-12 rounded-xl border-2 border-brand-100 bg-white px-3 text-base focus:border-brand-500 focus:outline-none";

export default function ProfilePage() {
  const { t } = useLang();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    setNext(new URLSearchParams(window.location.search).get("next"));
    const id = store.profileId;
    if (!id) return;
    fetch(`/api/profile?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p) return;
        setForm({
          ...EMPTY,
          ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === null ? "" : typeof v === "number" ? String(v) : v])),
        } as Form);
      })
      .catch(() => {});
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setStatus("idle");
  };
  const toggleTag = (tag: string) =>
    set("occupation_tags", form.occupation_tags.includes(tag) ? form.occupation_tags.filter((x) => x !== tag) : [...form.occupation_tags, tag]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: store.profileId }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      store.profileId = saved.id;
      setStatus("saved");
      if (next === "chat") router.push("/chat");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("आपकी जानकारी", "About you")}</h1>
        <p className="mt-1 text-ink/75">
          {t(
            "सब सवाल वैकल्पिक हैं। जो पता हो वही भरें।",
            "Every question is optional. Fill only what you know.",
          )}
        </p>
      </div>

      <Section title={t("1. आपके बारे में", "1. About you")}>
        <Field label={t("नाम", "Name")} htmlFor="name">
          <input id="name" className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="given-name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("उम्र (साल)", "Age (years)")} htmlFor="age">
            <input id="age" className={inputCls} inputMode="numeric" type="number" min={0} max={120} value={form.age} onChange={(e) => set("age", e.target.value)} />
          </Field>
          <Field label={t("ज़िला (UP)", "District (UP)")} htmlFor="district">
            <input id="district" className={inputCls} list="districts" value={form.district} onChange={(e) => set("district", e.target.value)} />
            <datalist id="districts">
              {UP_DISTRICTS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label={t("यह जानकारी किसके लिए है?", "Who is this for?")}>
          <Chips
            value={form.gender}
            onChange={(v) => set("gender", v)}
            options={[
              { v: "female", label: t("मेरे लिए (महिला / लड़की)", "Me (woman / girl)") },
              { v: "male", label: t("मैं पुरुष हूँ, परिवार के लिए पूछ रहा हूँ", "I'm a man asking for my family") },
            ]}
          />
        </Field>
        <Field label={t("प्रेरक किस भाषा में जवाब दे?", "Which language should Prerak reply in?")}>
          <Chips
            value={form.language}
            onChange={(v) => set("language", v)}
            options={[
              { v: "auto", label: t("जिसमें मैं पूछूँ", "Same as my question") },
              { v: "hi", label: "हिंदी" },
              { v: "hinglish", label: "Hinglish" },
              { v: "en", label: "English" },
            ]}
          />
        </Field>
      </Section>

      <Section title={t("2. परिवार", "2. Family")}>
        <Field label={t("वैवाहिक स्थिति", "Marital status")}>
          <Chips
            value={form.marital_status}
            onChange={(v) => set("marital_status", form.marital_status === v ? "" : v)}
            options={[
              { v: "unmarried", label: t("अविवाहित", "Unmarried") },
              { v: "married", label: t("विवाहित", "Married") },
              { v: "widow", label: t("विधवा", "Widow") },
              { v: "divorced", label: t("तलाकशुदा / अलग", "Divorced / separated") },
              { v: "destitute", label: t("पति ने छोड़ दिया / निराश्रित", "Abandoned / destitute") },
            ]}
          />
        </Field>
        <Toggle
          label={t("मैं गर्भवती हूँ या बच्चे को दूध पिलाती हूँ", "I am pregnant or breastfeeding")}
          checked={form.pregnant_or_lactating}
          onChange={(v) => set("pregnant_or_lactating", v)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("कुल बच्चे", "Total children")} htmlFor="children">
            <input id="children" className={inputCls} type="number" inputMode="numeric" min={0} value={form.children_count} onChange={(e) => set("children_count", e.target.value)} />
          </Field>
          <Field label={t("इनमें बेटियाँ", "Of them, daughters")} htmlFor="daughters">
            <input id="daughters" className={inputCls} type="number" inputMode="numeric" min={0} value={form.daughters_count} onChange={(e) => set("daughters_count", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title={t("3. आय और कागज़", "3. Income and papers")}>
        <Field
          label={t("परिवार की सालाना आय (₹)", "Yearly family income (₹)")}
          hint={t("घर के सभी लोगों की साल भर की कुल कमाई। अंदाज़ा भी चलेगा।", "Total earnings of everyone in the house in a year. A rough guess is fine.")}
          htmlFor="income"
        >
          <input
            id="income"
            className={inputCls}
            type="number"
            inputMode="numeric"
            min={0}
            value={form.annual_income}
            onChange={(e) => set("annual_income", e.target.value)}
          />
          <div className="mt-2">
            <Chips value={form.annual_income} onChange={(v) => set("annual_income", v)} options={INCOME_CHIPS.map((c) => ({ v: c.v, label: t(c.hi, c.en) }))} />
          </div>
        </Field>
        <Field
          label={t("सामाजिक वर्ग", "Social category")}
          hint={t(
            "यह आपके जाति प्रमाण पत्र पर लिखा होता है। कई छात्रवृत्ति योजनाओं में इसी से राशि तय होती है।",
            "This is written on your caste certificate. Many scholarships decide the amount based on it.",
          )}
        >
          <Chips
            value={form.social_category}
            onChange={(v) => set("social_category", form.social_category === v ? "" : v)}
            options={[
              { v: "General", label: t("सामान्य", "General") },
              { v: "OBC", label: t("पिछड़ा वर्ग (OBC)", "OBC") },
              { v: "SC", label: t("अनुसूचित जाति (SC)", "SC") },
              { v: "ST", label: t("अनुसूचित जनजाति (ST)", "ST") },
              { v: "Minority", label: t("अल्पसंख्यक", "Minority") },
            ]}
          />
        </Field>
        <Toggle
          label={t("हमारे पास राशन कार्ड है", "We have a ration card")}
          hint={t("अंत्योदय या पात्र गृहस्थी कार्ड", "Antyodaya or eligible household card")}
          checked={form.has_ration_card}
          onChange={(v) => set("has_ration_card", v)}
        />
      </Section>

      <Section title={t("4. पढ़ाई और काम", "4. Study and work")}>
        <Toggle label={t("मैं अभी पढ़ाई कर रही हूँ", "I am studying now")} checked={form.is_student} onChange={(v) => set("is_student", v)} />
        <Field label={t("पढ़ाई कहाँ तक की है / कर रही हैं", "Education (done or ongoing)")}>
          <Chips
            value={form.education_level}
            onChange={(v) => set("education_level", form.education_level === v ? "" : v)}
            options={[
              { v: "none", label: t("स्कूल नहीं गई", "No schooling") },
              { v: "up to class 8", label: t("8वीं तक", "Up to class 8") },
              { v: "class 9-10", label: t("9वीं-10वीं", "Class 9-10") },
              { v: "class 11-12", label: t("11वीं-12वीं", "Class 11-12") },
              { v: "diploma / ITI", label: t("डिप्लोमा / ITI", "Diploma / ITI") },
              { v: "graduation or above", label: t("ग्रेजुएशन या ऊपर", "Graduation or above") },
            ]}
          />
        </Field>
        <Toggle label={t("मुझे कोई दिव्यांगता है", "I have a disability")} checked={form.disability} onChange={(v) => set("disability", v)} />
        <Field label={t("काम (जो लागू हो सब चुनें)", "Work (choose all that apply)")}>
          <Chips
            multi
            value={form.occupation_tags}
            onChange={toggleTag}
            options={[
              { v: "construction_worker", label: t("निर्माण मज़दूर (पंजीकृत)", "Construction worker (registered)") },
              { v: "shg_member", label: t("स्वयं सहायता समूह सदस्य", "Self-help group member") },
              { v: "artisan", label: t("कारीगर / हस्तशिल्प", "Artisan / craft") },
              { v: "farmer", label: t("खेती / गाँव का काम", "Farming / village work") },
              { v: "entrepreneur", label: t("अपना काम शुरू करना है", "Want to start a business") },
              { v: "working_woman", label: t("नौकरी करती हूँ", "Working woman") },
            ]}
          />
        </Field>
      </Section>

      <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl bg-cream/95 py-2 md:bottom-2">
        <button
          type="submit"
          disabled={status === "saving"}
          className="min-h-14 rounded-2xl bg-brand-500 text-lg font-bold text-white shadow hover:bg-brand-600 disabled:opacity-60"
        >
          {status === "saving" ? t("सेव हो रहा है...", "Saving...") : next === "chat" ? t("सेव करें और पूछें", "Save and start asking") : t("सेव करें", "Save")}
        </button>
        {status === "saved" && (
          <p role="status" className="text-center font-semibold text-emerald-700">
            {t("सेव हो गया!", "Saved!")}{" "}
            <a href="/chat" className="underline">
              {t("अब सवाल पूछें", "Now ask a question")}
            </a>
          </p>
        )}
        {status === "error" && (
          <p role="alert" className="text-center font-semibold text-red-700">
            {t("सेव नहीं हो पाया। फिर से कोशिश करें।", "Could not save. Please try again.")}
          </p>
        )}
      </div>
    </form>
  );
}
