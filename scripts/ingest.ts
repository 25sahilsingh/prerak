import fs from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { DATA_DIR, getDb } from "../lib/db";
import { embed, toBlob } from "../lib/rag/embed";

const PDF_PATH = path.join(process.cwd(), "Women_Schemes_UP_Women_Oct2026_RAG.pdf");

const SECTION_LABELS = [
  "Benefit",
  "Eligibility (who can apply)",
  "Not eligible (exclusions)",
  "Documents required",
  "How to apply",
  "Application window / deadline",
  "Current status",
  "Official link and helpline",
  "Sources checked",
] as const;
type Label = (typeof SECTION_LABELS)[number] | "Who can use this";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A heading is "<Label> - <scheme name> (<state>)". The state name is whatever the PDF says,
// and it may wrap, so the heading runs until the closing ")" at the end of a line.
const HEADING_RE = new RegExp(
  `^(Who can use this(?: in .*)?|${SECTION_LABELS.map(escapeRe).join("|")}) - [\\s\\S]*?\\)[ \\t]*$`,
  "gm",
);
// UP-A01, IN-26, or a new state such as BR-01 / MH-A12.
const SCHEME_ID = "[A-Z]{2,6}-[A-Z]?\\d+";

type ParsedScheme = {
  id: string;
  name: string;
  page: number;
  meta: Record<string, string>;
  sections: Partial<Record<Label, string>>;
};

const clean = (s: string) => s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function parseMeta(block: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const part of oneLine(block).split(" | ")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    let key = part.slice(0, i).trim();
    if (key.startsWith("Status")) key = "Status";
    meta[key] = part.slice(i + 1).trim();
  }
  return meta;
}

function parseScheme(id: string, name: string, body: string, page: number): ParsedScheme {
  const headings = [...body.matchAll(HEADING_RE)];
  const metaEnd = headings[0]?.index ?? body.length;
  const meta = parseMeta(body.slice(0, metaEnd));
  const sections: ParsedScheme["sections"] = {};
  headings.forEach((h, i) => {
    const start = h.index! + h[0].length;
    const end = headings[i + 1]?.index ?? body.length;
    const label = (h[1].startsWith("Who can use this") ? "Who can use this" : h[1]) as Label;
    const text = clean(body.slice(start, end));
    sections[label] = sections[label] ? `${sections[label]}\n${text}` : text;
  });
  return { id, name, page, meta, sections };
}

export async function ingestPdf(pdfPath: string): Promise<{ schemes: number; states: { state: string; count: number }[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(pdfPath)));
  const { text: pages } = await extractText(pdf, { mergePages: false });

  // Track page offsets so each scheme knows where it starts.
  const pageStarts: number[] = [];
  let full = "";
  for (const p of pages) {
    pageStarts.push(full.length);
    full += p + "\n";
  }
  const pageOf = (offset: number) => pageStarts.findLastIndex((s) => s <= offset) + 1;

  // The scheme title can wrap, so it runs until the "Scheme ID:" line.
  const headerRe = new RegExp(`^\\[(${SCHEME_ID})\\] ([\\s\\S]+?)\\n(?=Scheme ID:)`, "gm");
  const headers = [...full.matchAll(headerRe)];
  if (!headers.length) throw new Error("No schemes found. Each scheme must start with [ID] and a Scheme ID: line.");
  const intro = full.slice(0, headers[0].index);

  const schemes: ParsedScheme[] = headers.map((h, i) => {
    const end = headers[i + 1]?.index ?? full.length;
    const body = full
      .slice(h.index! + h[0].length, end)
      .replace(/^Continued: \[[^\]]+\].*$/gm, "")
      .replace(/^Part \d+ - .*$/gm, "")
      .replace(/^Page \d+$/gm, "");
    return parseScheme(h[1], oneLine(h[2]), body, pageOf(h.index!));
  });

  if (!schemes.length) throw new Error("No schemes found. Each scheme must start with [ID] and a Scheme ID: line.");
  const missing = schemes.filter((s) => !s.sections["Eligibility (who can apply)"] || !s.sections["Benefit"]);
  if (missing.length) throw new Error(`Schemes missing sections: ${missing.map((s) => s.id).join(", ")}`);

  const db = getDb();
  db.exec("DELETE FROM chunks; DELETE FROM schemes; DROP TABLE IF EXISTS chunks_fts;");
  db.exec(`CREATE VIRTUAL TABLE chunks_fts USING fts5(text, scheme_name, aka, content='', tokenize='unicode61 remove_diacritics 2');`);

  type ChunkIn = { scheme_id: string | null; section: string; text: string; name: string; aka: string };
  const chunks: ChunkIn[] = [];

  const insertScheme = db.prepare(`INSERT INTO schemes
    (id, name, state, category, status, applies_to, department, aka, verification, benefit, eligibility, documents,
     how_to_apply, window, current_status, links, page, raw)
    VALUES (@id, @name, @state, @category, @status, @applies_to, @department, @aka, @verification, @benefit,
     @eligibility, @documents, @how_to_apply, @window, @current_status, @links, @page, @raw)`);

  const catalogue = schemes.map((s) => {
    const sec = s.sections;
    const eligibility = [sec["Eligibility (who can apply)"], sec["Not eligible (exclusions)"] && `Not eligible:\n${sec["Not eligible (exclusions)"]}`]
      .filter(Boolean)
      .join("\n");
    const links = [sec["Official link and helpline"], sec["Sources checked"] && `Sources checked:\n${sec["Sources checked"]}`]
      .filter(Boolean)
      .join("\n");
    const row = {
      id: s.id,
      name: s.name,
      state: s.meta["State"] ?? "",
      category: s.meta["Category"] ?? "",
      status: s.meta["Status"] ?? "",
      applies_to: s.meta["Applies to"] ?? "",
      department: s.meta["Department"] ?? "",
      aka: s.meta["Also known as"] ?? "",
      verification: s.meta["Verification"] ?? "",
      benefit: sec["Benefit"] ?? "",
      eligibility,
      documents: sec["Documents required"] ?? "",
      how_to_apply: sec["How to apply"] ?? "",
      window: sec["Application window / deadline"] ?? "",
      current_status: sec["Current status"] ?? "",
      links,
      page: s.page,
      raw: JSON.stringify(s.sections),
    };

    const head = `[${row.id}] ${row.name} (${row.state}) | Status: ${row.status}`;
    const add = (section: string, body: string) => {
      if (body.trim()) chunks.push({ scheme_id: row.id, section, text: `${head}\n${section}:\n${body}`, name: row.name, aka: row.aka });
    };
    add(
      "Overview and benefit",
      `Category: ${row.category}\nAlso known as: ${row.aka}\nApplies to: ${row.applies_to}\nDepartment: ${row.department}\nBenefit: ${row.benefit}`,
    );
    add("Eligibility", eligibility);
    add("Documents required", row.documents);
    add("How to apply", [row.how_to_apply, row.window && `Application window / deadline: ${row.window}`].filter(Boolean).join("\n"));
    add("Current status and official link", [row.current_status, sec["Official link and helpline"]].filter(Boolean).join("\n"));
    return row;
  });

  const introBody = clean(intro.split(/^Index of schemes$/m)[0]);
  for (const part of introBody.split(/^(?=Safety rules$)/m)) {
    chunks.push({ scheme_id: null, section: "Guide", text: `General guide (how to read statuses, safety rules)\n${part}`, name: "Guide", aka: "" });
  }

  console.log(`Parsed ${catalogue.length} schemes into ${chunks.length} chunks. Embedding...`);
  const vectors = await embed(chunks.map((c) => c.text), "passage");

  const insertChunk = db.prepare("INSERT INTO chunks (scheme_id, section, text, embedding) VALUES (?, ?, ?, ?)");
  const insertFts = db.prepare("INSERT INTO chunks_fts (rowid, text, scheme_name, aka) VALUES (?, ?, ?, ?)");
  db.transaction(() => {
    for (const row of catalogue) insertScheme.run(row);
    chunks.forEach((c, i) => {
      const { lastInsertRowid } = insertChunk.run(c.scheme_id, c.section, c.text, toBlob(vectors[i]));
      insertFts.run(lastInsertRowid, c.text, c.name, c.aka);
    });
  })();

  fs.writeFileSync(
    path.join(DATA_DIR, "schemes.json"),
    JSON.stringify(catalogue.map(({ raw: _raw, ...rest }) => rest), null, 2),
  );

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const s of catalogue) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
  }
  console.log("By status:", byStatus);
  console.log("By category:", byCategory);
  console.log(`Wrote data/app.db and data/schemes.json`);

  const counts = new Map<string, number>();
  for (const s of catalogue) counts.set(s.state || "Unknown", (counts.get(s.state || "Unknown") ?? 0) + 1);
  return {
    schemes: catalogue.length,
    states: [...counts.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => a.state.localeCompare(b.state)),
  };
}

async function main() {
  if (process.argv.includes("--if-missing")) {
    const { n } = getDb().prepare("SELECT COUNT(*) AS n FROM schemes").get() as { n: number };
    if (n > 0) return;
    console.log("First run: building the scheme database from the PDF (takes a few minutes once)...");
  }
  const pdfPath = process.argv.find((arg) => arg.endsWith(".pdf")) ?? PDF_PATH;
  await ingestPdf(pdfPath);
}

const invoked = process.argv[1]?.includes("ingest.ts");
if (invoked) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
