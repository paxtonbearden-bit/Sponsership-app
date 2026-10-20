import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

// Point TEST_DATABASE_URL at a scratch Postgres (user must be a superuser).
// The test database is dropped and recreated every run.
const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/postgres";
const dbName = "rls_test";

const root = path.resolve(__dirname, "..");

function withDb(url: string, db: string) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export async function createDatabase(): Promise<Client> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const db = new Client({ connectionString: withDb(adminUrl, dbName) });
  await db.connect();
  await db.query(fs.readFileSync(path.join(__dirname, "shim.sql"), "utf8"));
  const dir = path.join(root, "migrations");
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.query(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  return db;
}

type Who = { id: string } | "anon";

/**
 * Run SQL as a given user (or anonymous) inside a transaction that always rolls
 * back, so tests can't contaminate each other. Returns the rows, or the error.
 */
export async function as<T = Record<string, unknown>>(
  db: Client,
  who: Who,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number; error?: { code?: string; message: string } }> {
  await db.query("begin");
  try {
    if (who === "anon") {
      await db.query("set local role anon");
    } else {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [who.id]);
    }
    const res = await db.query(sql, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { rows: [], rowCount: 0, error: { code: err.code, message: err.message } };
  } finally {
    await db.query("rollback");
  }
}
