import type { Profile } from "../db";

export const NOT_RECOMMENDABLE = /FAKE|DISCONTINUED|NOT IN FORCE/i;

type Interest = { match: RegExp; why: string; query: string };

// Each interest is tested against "name | category | applies_to | aka" of a scheme.
export function profileInterests(p: Profile | null): Interest[] {
  if (!p) return [];
  const out: Interest[] = [];
  const add = (match: RegExp, why: string, query: string) => out.push({ match, why, query });
  const tags = new Set(p.occupation_tags);

  if (p.pregnant_or_lactating) add(/maternity|matru|janani|nutrition|poshan|pregnan/i, "pregnant or lactating", "pregnant woman maternity benefit nutrition");
  if (p.marital_status === "widow" || p.marital_status === "destitute")
    add(/widow|destitute|nirashrit|pension/i, "widow or destitute", "widow destitute woman pension");
  if (p.marital_status === "divorced") add(/distress|dowry|one stop|sakhi|legal aid/i, "divorced or separated", "woman in distress support legal aid");
  if (p.age != null && p.age >= 60) add(/elderly|old age|vriddh|60\+|bus/i, "age 60 or above", "old age pension free bus travel elderly woman");
  if (p.disability) add(/disab|divyang/i, "person with disability", "disability pension divyang");
  if (p.is_student)
    add(/scholarship|education|pragati|student|scooty|vidya/i, "student", "girl student scholarship education");
  if ((p.daughters_count ?? 0) > 0) add(/girl child|kanya|sukanya|daughter|beti/i, "has daughters", "girl child daughter savings scheme");
  if ((p.daughters_count ?? 0) > 0 || (p.marital_status === "unmarried" && (p.age ?? 0) >= 18))
    add(/marriage|vivah|shadi/i, "marriage of self or daughter", "marriage grant for daughter");
  if (tags.has("construction_worker")) add(/construction/i, "registered construction worker", "construction worker welfare board scheme");
  if (tags.has("shg_member")) add(/shg|self.help|livelihood|lakhpati|bc sakhi|drone/i, "self-help group member", "self help group SHG women livelihood");
  if (tags.has("artisan")) add(/artisan|vishwakarma|craft|skills/i, "artisan or craftsperson", "artisan craftsperson loan training");
  if (tags.has("entrepreneur")) add(/business|entrepreneur|loan|mudra|udyami|self-employment/i, "wants to start a business", "loan for women business self-employment");
  if (tags.has("farmer")) add(/livelihood|gramodyog|village|rural/i, "farmer or rural worker", "rural livelihood village industry");
  if (tags.has("working_woman")) add(/working women|hostel|sakhi niwas/i, "working woman", "working women hostel");
  if (p.has_ration_card || (p.annual_income != null && p.annual_income <= 120000))
    add(/lpg|ujjwala|housing|awas|awaas/i, "low-income household", "free LPG connection housing scheme poor family");
  return out;
}

export function profileFacts(p: Profile | null): string {
  if (!p) return "No profile saved. Ask for age, income, category or family details only if needed to judge eligibility.";
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) lines.push(`- ${label}: ${Array.isArray(v) ? v.join(", ") : v}`);
  };
  push("Name", p.name);
  push("Age", p.age);
  push("Gender", p.gender);
  push("District (UP)", p.district);
  push("Annual family income (Rs)", p.annual_income);
  push("Social category", p.social_category);
  push("Marital status", p.marital_status);
  lines.push(`- Pregnant or breastfeeding: ${p.pregnant_or_lactating ? "yes" : "no"}`);
  push("Number of children", p.children_count);
  push("Number of daughters", p.daughters_count);
  lines.push(`- Currently a student: ${p.is_student ? "yes" : "no"}`);
  push("Education level", p.education_level);
  lines.push(`- Has a disability: ${p.disability ? "yes" : "no"}`);
  push("Work / occupation", p.occupation_tags);
  lines.push(`- Has a ration card: ${p.has_ration_card ? "yes" : "no"}`);
  return lines.join("\n");
}
