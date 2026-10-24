import { getDb } from "../db";

// Small local models sometimes mistype links and phone numbers ("pmmvy.wcd.gov/in", "1811" for 181).
// Every link and helpline-like number in an answer is checked against the official data; unverified ones are
// corrected to the closest official value or removed.

export type Fix = { kind: "url" | "phone"; from: string; to: string | null };
export type GuardResult = { text: string; fixes: Fix[]; unverified: string[] };

// Emails first so "x@gmail.com" is not read as the domain "gmail.com".
const LINK_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)\]<>"'`*]*)?/gi;

const PHONE_RE =
  /(?<![\w₹.,/-])(\+91[\s-]?\d{5}[\s-]?\d{5}|1800[\s-]?\d{3,4}[\s-]?\d{3,4}|0\d{2,4}[\s-]\d{6,8}|\d{10}|\d{3,6})(?![\w/-]|[.,]\d|\s?%)/g;
const PHONE_CONTEXT = /helpline|help line|helpdesk|call|dial|phone|toll|whatsapp|number|line|हेल्पलाइन|कॉल|फोन|फ़ोन|नंबर|डायल|लाइन/i;
const NOT_PHONE_AFTER = /^\s*(?:%|lakh|lac|crore|rs\b|rupees|₹|years?|yrs|days?|months?|weeks?|hours?|students?|women|girls|seats?|साल|वर्ष|रुपये|लाख|दिन|महीने)/i;
const ALWAYS_PHONE = /^(?:\+91|1800|0\d{2,4}[\s-]|\d{10}$)/;

const CORE_HELPLINES = ["112", "181", "1090", "1930"];

// Office names users must find in person; misspellings here send people to the wrong place.
const TERM_FIXES: [RegExp, string][] = [
  [/\bJan\s+Sev[a]?\s+Kend\w*/gi, "Jan Seva Kendra"],
  [/\bAnganw[a]?d[iy]\s+Kend\w*/gi, "Anganwadi Kendra"],
  [/जन\s+सेवा\s+केंद[्]?[^\s,।.)]*/g, "जन सेवा केंद्र"],
  [/जैन\s+सेवा\s+केंद[्]?[^\s,।.)]*/g, "जन सेवा केंद्र"],
];

const normUrl = (u: string) =>
  u
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/.,;:!?)]+$/, "");
const digits = (s: string) => s.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

type Match = { value: string; index: number };

export function extractLinks(text: string): Match[] {
  return [...text.matchAll(LINK_RE)]
    .map((m) => ({ value: m[0].replace(/[.,;:!?)]+$/, ""), index: m.index! }))
    .filter((m) => m.value.includes("/") || m.value.includes("@") || /\.(?:in|com|org|net|gov|nic|info)\b/i.test(m.value));
}

export function extractPhones(text: string): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const value = m[1];
    const i = m.index!;
    if (!ALWAYS_PHONE.test(value)) {
      if (/^(19|20)\d{2}$/.test(value)) continue; // years
      if (/(₹|rs\.?|inr)\s*$/i.test(text.slice(Math.max(0, i - 4), i))) continue; // money
      if (NOT_PHONE_AFTER.test(text.slice(i + value.length, i + value.length + 12))) continue;
      const around = text.slice(Math.max(0, i - 45), i) + " " + text.slice(i + value.length, i + value.length + 30);
      if (!PHONE_CONTEXT.test(around)) continue;
    }
    out.push({ value, index: i });
  }
  return out;
}

type Whitelist = { urls: Map<string, string>; hosts: Set<string>; emails: Set<string>; phones: Map<string, string> };
const g = globalThis as unknown as { __guardWhitelist?: Whitelist };

export function loadWhitelist(): Whitelist {
  if (g.__guardWhitelist) return g.__guardWhitelist;
  const db = getDb();
  const texts = [
    ...(db.prepare("SELECT links, how_to_apply, current_status, benefit, eligibility, documents FROM schemes").all() as Record<string, string>[]).flatMap(
      (r) => Object.values(r),
    ),
    ...(db.prepare("SELECT text FROM chunks").all() as { text: string }[]).map((r) => r.text),
  ];
  const wl: Whitelist = { urls: new Map(), hosts: new Set(), emails: new Set(), phones: new Map() };
  for (const t of texts) {
    for (const { value } of extractLinks(t)) {
      if (value.includes("@")) {
        wl.emails.add(value.toLowerCase());
        continue;
      }
      const n = normUrl(value);
      const display = /^https?:\/\//i.test(value) ? value.replace(/[/.,;:]+$/, "") : `https://${value}`;
      if (!wl.urls.has(n) || /^https/.test(display)) wl.urls.set(n, display);
      wl.hosts.add(n.split("/")[0]);
    }
    for (const { value } of extractPhones(t)) wl.phones.set(digits(value), value);
    for (const line of t.split("\n").filter((l) => /helpline/i.test(l))) {
      for (const m of line.matchAll(/\d[\d\s-]{1,14}\d/g)) if (digits(m[0]).length >= 3) wl.phones.set(digits(m[0]), m[0].trim());
    }
  }
  for (const p of CORE_HELPLINES) wl.phones.set(p, p);
  g.__guardWhitelist = wl;
  return wl;
}

function urlVerified(n: string, wl: Whitelist): boolean {
  if (wl.urls.has(n) || wl.hosts.has(n)) return true;
  for (const w of wl.urls.keys()) if (w.startsWith(`${n}/`) || w.startsWith(`${n}?`)) return true;
  return false;
}

function closest(target: string, candidates: Iterable<[string, string]>, maxDist: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [key, display] of candidates) {
    const d = levenshtein(target, key);
    if (d < bestD) {
      bestD = d;
      best = display;
    }
  }
  return bestD <= maxDist ? best : null;
}

/**
 * Checks every link / email / helpline number in `answer`.
 * `preferredUrls` are the official links of the schemes cited for this answer; they are tried first.
 */
export function guardAnswer(answer: string, preferredUrls: string[] = []): GuardResult {
  const wl = loadWhitelist();
  // Invisible characters can hide inside a link ("gov.i\u200Bn") and dodge the checks below.
  let text = answer.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "");
  // Models sometimes split links with a space: "index. php", "gov .in", "https://ssp y-up.gov.in".
  text = text
    .replace(/(\/[\w-]+)\.\s+(php|html?|aspx)\b/g, "$1.$2")
    .replace(/(\.(?:gov|nic|org|co|ac))\s+\.?(in)\b/gi, "$1.$2")
    .replace(/(https?:\/\/[\w-]+)\s+([\w-]+(?:\.[\w-]+)+)/g, "$1$2");
  for (const [re, to] of TERM_FIXES) text = text.replace(re, to);
  const fixes: Fix[] = [];
  const replacements: { index: number; length: number; to: string }[] = [];

  for (const { value, index } of extractLinks(text)) {
    if (value.includes("@")) {
      if (!wl.emails.has(value.toLowerCase())) {
        fixes.push({ kind: "url", from: value, to: null });
        replacements.push({ index, length: value.length, to: "(email not verified - see official links below)" });
      }
      continue;
    }
    const n = normUrl(value);
    if (urlVerified(n, wl)) continue;
    const maxDist = Math.max(3, Math.floor(n.length * 0.2));
    const preferred = preferredUrls.map((u) => [normUrl(u), u] as [string, string]);
    const to = closest(n, preferred, maxDist) ?? closest(n, wl.urls.entries(), maxDist);
    fixes.push({ kind: "url", from: value, to });
    replacements.push({ index, length: value.length, to: to ?? "(link not verified - use the official links below)" });
  }

  for (const { value, index } of extractPhones(text)) {
    const d = digits(value);
    if (wl.phones.has(d)) continue;
    const to = closest(d, [...wl.phones.entries()], d.length <= 5 ? 1 : 2);
    fixes.push({ kind: "phone", from: value, to });
    replacements.push({ index, length: value.length, to: to ?? "(number not verified - see official helplines below)" });
  }

  replacements.sort((a, b) => b.index - a.index);
  for (const r of replacements) text = text.slice(0, r.index) + r.to + text.slice(r.index + r.length);

  // A protocol with no real domain after it ("https://ssp") is a broken link fragment.
  text = text.replace(/https?:\/\/(?![\w-]+(?:\.[\w-]+)+)[\w-]*/g, (frag) => {
    fixes.push({ kind: "url", from: frag, to: null });
    return "";
  });

  const unverified = [
    ...[...text.matchAll(/https?:\/\/(?![\w-]+(?:\.[\w-]+)+)\S*/g)].map((m) => ({ value: m[0], index: m.index! })),
    ...extractLinks(text).filter((m) => (m.value.includes("@") ? !wl.emails.has(m.value.toLowerCase()) : !urlVerified(normUrl(m.value), wl))),
    ...extractPhones(text).filter((m) => !wl.phones.has(digits(m.value))),
  ].map((m) => m.value);
  return { text, fixes, unverified };
}

/** Official links and helplines of a scheme, for the verified "Official links" box under each answer. */
export function officialContacts(linksField: string): { links: string[]; helplines: string[] } {
  const official = linksField.split(/Sources checked:/)[0];
  const links = [...new Set(extractLinks(official).filter((m) => !m.value.includes("@")).map((m) => (/^https?:/i.test(m.value) ? m.value : `https://${m.value}`)))];
  const helplines = official
    .split("\n")
    .filter((l) => /^Helpline:/i.test(l.trim()))
    .map((l) => l.replace(/^\s*Helpline:\s*/i, "").trim())
    .filter(Boolean);
  return { links, helplines };
}
