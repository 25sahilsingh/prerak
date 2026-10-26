import type { Profile } from "../db";
import type { ChatMessage } from "../llm";
import { profileFacts } from "./profile";
import type { RetrievedChunk } from "./retrieve";

export type Lang = "hi" | "en" | "hinglish";

const HINGLISH_RE = /\b(kya|hai|hain|mujhe|mera|meri|mere|kaise|kaun|konsi|kitna|kab|chahiye|milega|milti|yojana|batao|bataiye|liye|karna|kare|karein|nahi|haan|aur|ke|ki|ka)\b/gi;

export function detectLanguage(text: string, preference?: string | null): Lang {
  if (preference === "hi" || preference === "en" || preference === "hinglish") return preference;
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  return (text.match(HINGLISH_RE)?.length ?? 0) >= 2 ? "hinglish" : "en";
}

const LANG_RULE: Record<Lang, string> = {
  hi: "Reply in simple Hindi (Devanagari script). Keep scheme names, scheme IDs, amounts and website links as they are.",
  en: "Reply in simple English.",
  hinglish: "Reply in simple Hinglish (Hindi written in Roman/English letters), the way the user wrote.",
};

const SYSTEM = `You are "Prerak", a friendly helper for women and girls in India. You explain government schemes using ONLY the scheme information given to you below, which comes from an official-source research document dated 23 October 2026.

Rules:
1. Use only the provided scheme information. If the answer is not there, say you don't have that information and suggest myscheme.gov.in or the official portal. Never invent amounts, dates, links or rules.
2. Always mention the scheme ID in square brackets, e.g. [UP-A01], next to each scheme you talk about, and say its status.
3. Status meanings: OPEN = can apply now. ACTIVE = scheme is running. "ACTIVE - existing beneficiaries only" = no new sign-ups. "APPROVED - not yet open" = announced, cannot apply yet. NOT IN FORCE / DISCONTINUED = do not apply. FAKE / NOT A GOVT SCHEME = a scam: clearly warn the user, tell her not to pay or share Aadhaar/OTP/bank details, and suggest the real alternative if one is given.
4. When the user's profile is given, check each eligibility condition against it. For each condition write "Meets", "Does not meet", or "Need to check" (when her profile does not say; tell her what to check). In Hindi use "पूरा करती हैं", "पूरा नहीं करतीं", "जाँच करें".
5. Do not recommend FAKE, DISCONTINUED or NOT IN FORCE schemes as options.
6. Keep answers short and easy: short sentences, bullet points, bold scheme names. No legal jargon. Explain any needed document in plain words.
7. When explaining how to apply, give the official .gov.in / .nic.in link from the information. Copy every link, email and phone/helpline number exactly, character by character, from the information above; never guess, shorten or change one. If a number or link is not in the information, do not write one. Remind: apply only on official portals or at a CSC / Jan Seva Kendra; no official scheme charges a fee beyond the capped service charge; never share an OTP or bank PIN.
8. Be warm and respectful. If the user seems to be in danger or facing violence, first give the helplines 181 (Women Helpline), 1090 (Women Power Line) and 112 (Emergency).`;

export function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => `--- Source ${i + 1}: ${c.scheme_id ? `[${c.scheme_id} | ${c.status}] ${c.scheme_name}` : "General guide"} — ${c.section} ---\n${c.text}`)
    .join("\n\n");
}

export function buildMessages(opts: {
  question: string;
  profile: Profile | null;
  summary: string;
  history: ChatMessage[];
  chunks: RetrievedChunk[];
  broad: boolean;
  lang: Lang;
}): ChatMessage[] {
  const parts = [
    SYSTEM,
    `User profile:\n${profileFacts(opts.profile)}`,
    opts.summary ? `Summary of the earlier conversation:\n${opts.summary}` : "",
    opts.broad
      ? `She is asking which schemes fit her. The sources below were picked as the most relevant to her profile. Recommend ONLY schemes from these sources whose eligibility rules she meets or may meet, best matches first, at most 6. Skip schemes that clearly do not fit her (for example girl-child or student schemes when she has no daughter and is not a student). For each, give one line on the benefit and the key condition, marked Meets / Need to check.`
      : "",
    `Scheme information (sources):\n${formatContext(opts.chunks)}`,
    `Language: ${LANG_RULE[opts.lang]}`,
  ];
  return [
    { role: "system", content: parts.filter(Boolean).join("\n\n") },
    ...opts.history,
    { role: "user", content: opts.question },
  ];
}

export function summaryMessages(previousSummary: string, turns: ChatMessage[]): ChatMessage[] {
  const transcript = turns.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
  return [
    {
      role: "system",
      content:
        "Summarise this conversation between a woman and a government-schemes helper in at most 8 short English bullet points. Keep facts she shared about herself, the scheme IDs discussed, and any open questions. Output only the bullets.",
    },
    { role: "user", content: `${previousSummary ? `Earlier summary:\n${previousSummary}\n\n` : ""}New messages:\n${transcript}` },
  ];
}
