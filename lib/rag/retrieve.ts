import { getDb, type Profile } from "../db";
import { embed, fromBlob } from "./embed";
import { NOT_RECOMMENDABLE, profileInterests } from "./profile";

export type RetrievedChunk = {
  id: number;
  scheme_id: string | null;
  scheme_name: string;
  status: string;
  section: string;
  text: string;
  score: number;
};

type ChunkRow = {
  id: number;
  scheme_id: string | null;
  section: string;
  text: string;
  embedding: Buffer;
  name: string | null;
  status: string | null;
  category: string | null;
  applies_to: string | null;
  aka: string | null;
};

type Indexed = Omit<ChunkRow, "embedding"> & { vec: Float32Array; profileText: string };

const g = globalThis as unknown as { __chunkIndex?: Indexed[]; __aliases?: { id: string; re: RegExp }[] };

function loadIndex(): Indexed[] {
  if (g.__chunkIndex) return g.__chunkIndex;
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.scheme_id, c.section, c.text, c.embedding, s.name, s.status, s.category, s.applies_to, s.aka
       FROM chunks c LEFT JOIN schemes s ON s.id = c.scheme_id`,
    )
    .all() as ChunkRow[];
  g.__chunkIndex = rows.map(({ embedding, ...r }) => ({
    ...r,
    vec: fromBlob(embedding),
    profileText: [r.name, r.category, r.applies_to, r.aka].filter(Boolean).join(" | "),
  }));
  return g.__chunkIndex;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Names and "also known as" entries, e.g. "MKSY", "Kanya Sumangala Yojana", "Free Silai Machine Yojana".
function loadAliases(): { id: string; re: RegExp }[] {
  if (g.__aliases) return g.__aliases;
  const rows = getDb().prepare("SELECT id, name, aka FROM schemes").all() as { id: string; name: string; aka: string }[];
  const out: { id: string; re: RegExp }[] = [];
  for (const r of rows) {
    const base = [r.name.replace(/\s*\(.*$/, ""), ...(r.aka ? r.aka.split(",") : [])].map((n) => n.replace(/['‘’]/g, "").trim());
    const variants = new Set<string>();
    for (const n of base) {
      variants.add(n);
      const short = n.replace(/\s+(yojana|scheme|abhiyan)$/i, "").replace(/^(mukhyamantri|pradhan mantri|up|uttar pradesh)\s+/i, "");
      if (short.split(/\s+/).length >= 2 || /^[A-Z-]{3,}$/.test(short)) variants.add(short);
    }
    for (const n of variants) {
      if (n.length >= 3) out.push({ id: r.id, re: new RegExp(`(^|[^\\p{L}])${escapeRe(n)}([^\\p{L}]|$)`, "iu") });
    }
  }
  g.__aliases = out;
  return out;
}

export function mentionedSchemeIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const m of text.matchAll(/\b(UP-[AB]\d{2}|IN-\d{2})\b/gi)) ids.add(m[1].toUpperCase());
  const plain = text.replace(/['‘’]/g, "");
  for (const a of loadAliases()) if (a.re.test(plain)) ids.add(a.id);
  return ids;
}

const STOP = new Set(
  "a an the is are am was were be to of in on for and or with my me i we our you your it this that what which who how do does can could should will would about any all there have has get give tell please kya hai hain ka ki ke ko me mein se aur ya mujhe mera meri mere koi kaun kaise kitna kitne batao bataiye liye yojana scheme schemes".split(
    " ",
  ),
);

// The PDF is in English, so Hindi / Hinglish words are mapped to English keywords for the keyword search.
const GLOSSARY: [RegExp, string][] = [
  [/विधवा|vidhwa|vidhva|widow/i, "widow destitute"],
  [/पेंशन|pension/i, "pension"],
  [/गर्भवती|garbhvati|pregnan|प्रसव|delivery/i, "pregnant maternity delivery"],
  [/छात्रवृत्ति|chhatravritti|scholarship|वजीफा/i, "scholarship"],
  [/बेटी|बालिका|कन्या|beti|ladki|kanya/i, "girl daughter"],
  [/शादी|विवाह|shaadi|shadi|vivah/i, "marriage"],
  [/दस्तावेज|कागज|dastavez|kagaz|kaagaz|documents?/i, "documents"],
  [/आवेदन|apply|avedan|kaise/i, "apply"],
  [/पात्र|patrata|eligib/i, "eligibility"],
  [/लोन|ऋण|karz|loan/i, "loan credit"],
  [/घर|आवास|makaan|awas|awaas|housing/i, "housing awas"],
  [/गैस|सिलेंडर|gas|cylinder/i, "LPG Ujjwala"],
  [/सिलाई|silai|sewing/i, "silai sewing"],
  [/स्कूटी|scooty/i, "scooty"],
  [/दहेज|dahej|dowry/i, "dowry"],
  [/हिंसा|मारपीट|hinsa|violence|marpeet/i, "violence one stop centre helpline"],
  [/बुजुर्ग|वृद्ध|budhapa|vriddh|old age/i, "old age elderly"],
  [/विकलांग|दिव्यांग|viklang|divyang|disab/i, "disability divyang"],
  [/स्वयं सहायता|समूह|shg|samuh/i, "self help group SHG"],
  [/व्यापार|धंधा|business|vyapar|dhandha/i, "business entrepreneur"],
  [/मजदूर|निर्माण|mazdoor|majdoor|construction/i, "construction worker"],
  [/पोषण|आंगनवाड़ी|poshan|anganwadi|nutrition/i, "nutrition anganwadi"],
  [/हेल्पलाइन|helpline|शिकायत/i, "helpline"],
];

function ftsQuery(text: string): string | null {
  const expanded = [text, ...GLOSSARY.filter(([re]) => re.test(text)).map(([, en]) => en)].join(" ");
  const tokens = (expanded.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
  if (!tokens.length) return null;
  return [...new Set(tokens)].map((t) => `"${t}"`).join(" OR ");
}

function keywordSearch(text: string, k: number): number[] {
  const q = ftsQuery(text);
  if (!q) return [];
  try {
    return (
      getDb().prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?").all(q, k) as {
        rowid: number;
      }[]
    ).map((r) => r.rowid);
  } catch {
    return [];
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const BROAD_RE =
  /eligible|which schemes|what schemes|all schemes|list|for me|benefits? for|kaun\s*si|kon\s*si|konsi|sab(hi)?|mere liye|mujhe kya|कौन|सभी|मेरे लिए|योजनाएं|योजनाओं/i;
const FAKE_QUESTION_RE = /fake|real|genuine|scam|fraud|sach|asli|nakli|farzi|jhooth|फर्जी|असली|नकली|सच/i;

export type RetrieveResult = { chunks: RetrievedChunk[]; broad: boolean; mentioned: string[] };

export async function retrieve(opts: { query: string; previousUserTurn?: string; profile: Profile | null; k?: number }): Promise<RetrieveResult> {
  const index = loadIndex();
  const byId = new Map(index.map((c) => [c.id, c]));
  const searchText = [opts.previousUserTurn, opts.query].filter(Boolean).join("\n");
  const broad = BROAD_RE.test(opts.query);
  const interests = profileInterests(opts.profile);
  const k = opts.k ?? (broad ? 10 : 6);

  // The current question decides which schemes are "named"; the previous turn only helps follow-ups.
  let mentioned = mentionedSchemeIds(opts.query);
  if (mentioned.size === 0 && opts.previousUserTurn) mentioned = mentionedSchemeIds(opts.previousUserTurn);

  const vecQuery = broad && interests.length ? `${searchText}\n${interests.map((i) => i.query).join("; ")}` : searchText;
  const [qv] = await embed([vecQuery], "query");

  const vectorRanked = index
    .map((c) => ({ id: c.id, s: dot(qv, c.vec) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 20)
    .map((x) => x.id);
  const keywordRanked = keywordSearch(searchText, 20);

  // Reciprocal rank fusion: a chunk near the top of either list scores well.
  const scores = new Map<number, number>();
  const fuse = (ids: number[]) => ids.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank + 1)));
  fuse(vectorRanked);
  fuse(keywordRanked);

  for (const c of index) {
    if (c.scheme_id && mentioned.has(c.scheme_id)) scores.set(c.id, (scores.get(c.id) ?? 0) + 0.05);
  }
  if (interests.length) {
    // For "what am I eligible for?" the profile matters more than the wording, so every matching
    // scheme's eligibility chunk becomes a candidate, not only those already in the top 20.
    const weight = broad ? 0.02 : 0.008;
    for (const c of index) {
      if (!scores.has(c.id) && !(broad && c.section === "Eligibility")) continue;
      const hits = interests.filter((i) => i.match.test(c.profileText)).length;
      if (hits) scores.set(c.id, (scores.get(c.id) ?? 0) + weight * Math.min(hits, 2) + (broad && c.section === "Eligibility" ? 0.005 : 0));
    }
  }

  const asksAboutFake = FAKE_QUESTION_RE.test(opts.query);
  const topHits = new Set([vectorRanked[0], keywordRanked[0]]);
  const ranked = [...scores.entries()]
    .map(([id, score]) => ({ c: byId.get(id)!, score }))
    .filter(({ c }) => {
      if (!c.status || !NOT_RECOMMENDABLE.test(c.status)) return true;
      // Keep fake / closed schemes only when the user is asking about them, so the bot can warn.
      return mentioned.has(c.scheme_id!) || asksAboutFake || topHits.has(c.id);
    })
    .sort((a, b) => b.score - a.score);

  const perScheme = new Map<string, number>();
  const maxPerScheme = mentioned.size === 1 ? 5 : broad ? 1 : 2;
  const chunks: RetrievedChunk[] = [];
  for (const { c, score } of ranked) {
    const key = c.scheme_id ?? "guide";
    const limit = c.scheme_id && mentioned.has(c.scheme_id) ? 5 : maxPerScheme;
    if ((perScheme.get(key) ?? 0) >= limit) continue;
    perScheme.set(key, (perScheme.get(key) ?? 0) + 1);
    chunks.push({
      id: c.id,
      scheme_id: c.scheme_id,
      scheme_name: c.name ?? "General guide",
      status: c.status ?? "",
      section: c.section,
      text: c.text,
      score,
    });
    if (chunks.length >= k) break;
  }
  return { chunks, broad, mentioned: [...mentioned] };
}
