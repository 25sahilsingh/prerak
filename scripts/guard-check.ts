// Offline check of the link / helpline guard against mistakes seen from real local models.
import { guardAnswer } from "../lib/rag/guard";

type Case = { name: string; input: string; mustContain: string[]; mustNotContain: string[] };

const cases: Case[] = [
  {
    name: "corrupted PMMVY links",
    input:
      "1. Go to https://pmmvy.wcd.gov.ind/ (the exact link is https://pmmvy.wcd.gov .in as given).\n* Go to **https://pmmvy.wcd.gov/in/**\n* Only use the official portal (https://pmmvy.wcd.gov/).",
    mustContain: ["https://pmmvy.wcd.gov.in"],
    mustNotContain: ["pmmvy.wcd.gov.ind", "pmmvy.wcd.gov/in", "pmmvy.wcd.gov/)", " .in"],
  },
  {
    name: "zero-width space inside link",
    input: "Apply at **https://mksy.up.gov.i\u200Bn/women_welfare/index.php** today.",
    mustContain: ["https://mksy.up.gov.in/women_welfare/index.php"],
    mustNotContain: ["\u200B", "gov.in.i"],
  },
  {
    name: "link split by a space",
    input: "- [UP-B01] (Nirashrit Mahila Pension): https://ssp y-up.gov.in/ (पेंशन पोर्टल)",
    mustContain: ["https://sspy-up.gov.in"],
    mustNotContain: ["https://ssp ", "ssp https"],
  },
  {
    name: "office name typo",
    input: "Visit your nearest Jan Seva Kendri or जैन सेवा केंद्र.",
    mustContain: ["Jan Seva Kendra", "जन सेवा केंद्र"],
    mustNotContain: ["Kendri", "जैन"],
  },
  {
    name: "wrong helpline 1811",
    input: "call the toll-free helpline 1811 (Women Helpline) or 1090 (Women Power Line).",
    mustContain: ["helpline 181 (Women", "1090"],
    mustNotContain: ["1811"],
  },
  {
    name: "split index. php link",
    input: "Apply on **https://mksy.up.gov.ini/women_welfare/index. php** today.",
    mustContain: ["https://mksy.up.gov.in/women_welfare/index.php"],
    mustNotContain: ["gov.ini", "index. php"],
  },
  {
    name: "invented link is removed",
    input: "Register at https://free-silai-yojana.online/apply now.",
    mustContain: ["link not verified"],
    mustNotContain: ["free-silai-yojana.online"],
  },
  {
    name: "correct values and amounts untouched",
    input:
      "Get ₹5,000 (₹3,000 + ₹2,000) within 730 days. Call 1800-419-0001 or 181, or visit myscheme.gov.in and https://pmmvy.wcd.gov.in/. Report on cybercrime.gov.in or 1930. Income below ₹ 8 lakh. Born after 2019.",
    mustContain: ["₹5,000", "730 days", "1800-419-0001", "181", "myscheme.gov.in", "https://pmmvy.wcd.gov.in/", "cybercrime.gov.in", "1930", "2019"],
    mustNotContain: ["not verified"],
  },
  {
    name: "Hindi helpline typo",
    input: "महिला हेल्पलाइन 1819 पर कॉल करें।",
    mustContain: ["181"],
    mustNotContain: ["1819"],
  },
];

let failed = 0;
for (const c of cases) {
  const r = guardAnswer(c.input, ["https://pmmvy.wcd.gov.in/"]);
  const problems = [
    ...c.mustContain.filter((s) => !r.text.includes(s)).map((s) => `missing "${s}"`),
    ...c.mustNotContain.filter((s) => r.text.includes(s)).map((s) => `still contains "${s}"`),
    ...r.unverified.map((u) => `unverified "${u}"`),
  ];
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${c.name}${problems.length ? `\n     ${problems.join("\n     ")}\n     -> ${r.text}` : ""}`);
}
console.log(failed ? `\n${failed} case(s) failed` : "\nall guard cases passed");
process.exit(failed ? 1 : 0);
