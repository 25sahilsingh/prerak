import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schemes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT,
  category TEXT,
  status TEXT,
  applies_to TEXT,
  department TEXT,
  aka TEXT,
  verification TEXT,
  benefit TEXT,
  eligibility TEXT,
  documents TEXT,
  how_to_apply TEXT,
  window TEXT,
  current_status TEXT,
  links TEXT,
  page INTEGER,
  raw TEXT
);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheme_id TEXT REFERENCES schemes(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding BLOB
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text, scheme_name, aka,
  content='', tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT,
  age INTEGER,
  gender TEXT,
  district TEXT,
  annual_income INTEGER,
  social_category TEXT,
  marital_status TEXT,
  pregnant_or_lactating INTEGER DEFAULT 0,
  children_count INTEGER,
  daughters_count INTEGER,
  is_student INTEGER DEFAULT 0,
  education_level TEXT,
  disability INTEGER DEFAULT 0,
  occupation_tags TEXT DEFAULT '[]',
  has_ration_card INTEGER DEFAULT 0,
  language TEXT DEFAULT 'auto',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT,
  summary TEXT DEFAULT '',
  summarized_upto INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const globalForDb = globalThis as unknown as { __db?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__db) return globalForDb.__db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  globalForDb.__db = db;
  return db;
}

export type Scheme = {
  id: string;
  name: string;
  state: string;
  category: string;
  status: string;
  applies_to: string;
  department: string;
  aka: string;
  verification: string;
  benefit: string;
  eligibility: string;
  documents: string;
  how_to_apply: string;
  window: string;
  current_status: string;
  links: string;
  page: number;
};

export type Profile = {
  id: string;
  name: string | null;
  age: number | null;
  gender: string | null;
  district: string | null;
  annual_income: number | null;
  social_category: string | null;
  marital_status: string | null;
  pregnant_or_lactating: boolean;
  children_count: number | null;
  daughters_count: number | null;
  is_student: boolean;
  education_level: string | null;
  disability: boolean;
  occupation_tags: string[];
  has_ration_card: boolean;
  language: string;
};

type ProfileRow = Omit<Profile, "pregnant_or_lactating" | "is_student" | "disability" | "has_ration_card" | "occupation_tags"> & {
  pregnant_or_lactating: number;
  is_student: number;
  disability: number;
  has_ration_card: number;
  occupation_tags: string;
};

export function rowToProfile(r: ProfileRow): Profile {
  return {
    ...r,
    pregnant_or_lactating: !!r.pregnant_or_lactating,
    is_student: !!r.is_student,
    disability: !!r.disability,
    has_ration_card: !!r.has_ration_card,
    occupation_tags: JSON.parse(r.occupation_tags || "[]"),
  };
}

export function getProfile(id: string): Profile | null {
  const row = getDb().prepare("SELECT * FROM profiles WHERE id = ?").get(id) as ProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

export function saveProfile(p: Profile): Profile {
  getDb()
    .prepare(
      `INSERT INTO profiles (id, name, age, gender, district, annual_income, social_category, marital_status,
        pregnant_or_lactating, children_count, daughters_count, is_student, education_level, disability,
        occupation_tags, has_ration_card, language)
       VALUES (@id, @name, @age, @gender, @district, @annual_income, @social_category, @marital_status,
        @pregnant_or_lactating, @children_count, @daughters_count, @is_student, @education_level, @disability,
        @occupation_tags, @has_ration_card, @language)
       ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, age=excluded.age, gender=excluded.gender, district=excluded.district,
        annual_income=excluded.annual_income, social_category=excluded.social_category,
        marital_status=excluded.marital_status, pregnant_or_lactating=excluded.pregnant_or_lactating,
        children_count=excluded.children_count, daughters_count=excluded.daughters_count,
        is_student=excluded.is_student, education_level=excluded.education_level, disability=excluded.disability,
        occupation_tags=excluded.occupation_tags, has_ration_card=excluded.has_ration_card,
        language=excluded.language, updated_at=datetime('now')`,
    )
    .run({
      ...p,
      pregnant_or_lactating: p.pregnant_or_lactating ? 1 : 0,
      is_student: p.is_student ? 1 : 0,
      disability: p.disability ? 1 : 0,
      has_ration_card: p.has_ration_card ? 1 : 0,
      occupation_tags: JSON.stringify(p.occupation_tags ?? []),
    });
  return getProfile(p.id)!;
}

export function listSchemes(): Scheme[] {
  return getDb().prepare("SELECT * FROM schemes ORDER BY rowid").all() as Scheme[];
}

export function getScheme(id: string): Scheme | null {
  return (getDb().prepare("SELECT * FROM schemes WHERE id = ?").get(id) as Scheme | undefined) ?? null;
}
