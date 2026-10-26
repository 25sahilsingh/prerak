// End-to-end check against a running app (npm run build && npm start) with LLM_BASE_URL set to a reachable model.
// Usage: npm run e2e [-- <case>[,<case>...]]   cases: en, hi, hinglish, profile
import { guardAnswer } from "../lib/rag/guard";

const BASE = process.env.APP_URL ?? "http://localhost:3000";

type Result = { answer: string; sources: { id: string }[]; conv?: string; error?: string; fixes: { from: string; to: string | null }[]; ms: number };

async function chat(message: string, opts: { conversationId?: string; profileId?: string } = {}): Promise<Result> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, ...opts }),
  });
  const r: Result = { answer: "", sources: [], fixes: [], ms: 0 };
  for (const line of (await res.text()).split("\n").filter(Boolean)) {
    const ev = JSON.parse(line);
    if (ev.type === "meta") Object.assign(r, { conv: ev.conversationId, sources: ev.sources });
    if (ev.type === "delta") r.answer += ev.text;
    if (ev.type === "replace") Object.assign(r, { answer: ev.text, fixes: ev.fixes });
    if (ev.type === "error") r.error = ev.message;
  }
  r.ms = Date.now() - t0;
  return r;
}

let failures = 0;
function check(title: string, r: Result, expect: { sources?: string[]; includesAny?: RegExp; devanagari?: boolean }) {
  const problems: string[] = [];
  if (r.error) problems.push(`error: ${r.error}`);
  if (!r.answer.trim()) problems.push("empty answer");
  const leftover = guardAnswer(r.answer).unverified;
  if (leftover.length) problems.push(`unverified links/numbers in final answer: ${leftover.join(", ")}`);
  for (const id of expect.sources ?? []) if (!r.sources.some((s) => s.id === id)) problems.push(`expected source ${id}`);
  if (expect.includesAny && !expect.includesAny.test(r.answer)) problems.push(`answer should match ${expect.includesAny}`);
  if (expect.devanagari && !/[\u0900-\u097F]/.test(r.answer)) problems.push("answer should be in Hindi");
  if (problems.length) failures++;
  console.log(`\n${problems.length ? "FAIL" : "PASS"}  ${title}  (${(r.ms / 1000).toFixed(0)}s, sources: ${r.sources.map((s) => s.id).join(" ")})`);
  for (const p of problems) console.log(`      - ${p}`);
  for (const f of r.fixes) console.log(`      guard fixed: "${f.from}" -> ${f.to ? `"${f.to}"` : "removed"}`);
  console.log(r.answer.replace(/^/gm, "      | "));
}

const cases: Record<string, () => Promise<void>> = {
  en: async () =>
    check("English: documents for Kanya Sumangala", await chat("What documents do I need for Kanya Sumangala Yojana?"), {
      sources: ["UP-A01"],
      includesAny: /birth certificate|Aadhaar/i,
    }),
  hi: async () =>
    check("Hindi: widow pension eligibility", await chat("विधवा पेंशन के लिए क्या पात्रता है?"), {
      sources: ["UP-B01"],
      devanagari: true,
    }),
  hinglish: async () =>
    check("Hinglish: fake silai machine scheme", await chat("Mujhe free silai machine yojana ka form kahan milega?"), {
      sources: ["UP-B21"],
      includesAny: /fake|फर्जी|फेक|nakli|farzi|not a (real )?gov|सरकारी योजना नहीं/i,
    }),
  profile: async () => {
    const profile = await (
      await fetch(`${BASE}/api/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sunita", age: 24, district: "Lucknow", annual_income: 90000, social_category: "OBC", marital_status: "married",
          pregnant_or_lactating: true, children_count: 0, daughters_count: 0, has_ration_card: true,
        }),
      })
    ).json();
    const r1 = await chat("Which schemes am I eligible for?", { profileId: profile.id });
    check("Profile: pregnant, OBC, income 90k - eligibility", r1, { sources: ["IN-01"], includesAny: /PMMVY|Matru Vandana|Janani|JSY/i });
    const r2 = await chat("Tell me more about PMMVY. How much money will I get?", { profileId: profile.id, conversationId: r1.conv });
    check("Memory turn 2: PMMVY amount", r2, { sources: ["IN-01"], includesAny: /5,?000/ });
    const r3 = await chat("And how do I apply for it?", { profileId: profile.id, conversationId: r1.conv });
    check("Memory turn 3: follow-up 'it' resolves to PMMVY", r3, { sources: ["IN-01"], includesAny: /PMMVY|Matru Vandana|pmmvy/i });
  },
};

const only = process.argv[2]?.split(",") ?? Object.keys(cases);
const health = await (await fetch(`${BASE}/api/health`)).json();
console.log(`Model: ${health.model || "(first available)"} at ${health.baseUrl} - ${health.ok ? "reachable" : "NOT reachable"}`);
if (!health.ok) process.exit(1);
for (const name of only) {
  if (!cases[name]) throw new Error(`Unknown case "${name}". Cases: ${Object.keys(cases).join(", ")}`);
  await cases[name]().catch((e) => {
    failures++;
    console.log(`\nFAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  });
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll end-to-end checks passed");
process.exit(failures ? 1 : 0);
