/**
 * Database access.
 *
 * SQLite through Node's built-in `node:sqlite`. That choice is deliberate:
 * there is no native module to compile, no service to start, and no credentials
 * to hand out, so `git clone && npm run setup && npm run dev` gives anyone —
 * including a judge with ten minutes — a working app with real data in it.
 *
 * The trade is that this is a single-writer, single-node database. That is fine
 * for the scale this app operates at (a trip is a handful of writes over
 * several months), and `supabase/schema.sql` carries the same model to Postgres
 * for a hosted deployment. Everything below goes through the small query
 * helpers rather than raw driver calls, so swapping the driver means changing
 * this file and nothing else.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';

export type Row = Record<string, unknown>;

const DEFAULT_PATH = path.join(process.cwd(), 'data', 'capitolpass.db');

let instance: DatabaseSync | null = null;

function databasePath(): string {
  return process.env.CAPITOLPASS_DB ?? DEFAULT_PATH;
}

/**
 * The process-wide connection.
 *
 * Next.js recreates modules across hot reloads in development, so the handle is
 * parked on globalThis to avoid opening a new file handle on every save.
 */
export function db(): DatabaseSync {
  if (instance) return instance;

  const globalKey = '__capitolpass_db__';
  const existing = (globalThis as Record<string, unknown>)[globalKey] as DatabaseSync | undefined;
  if (existing) {
    instance = existing;
    return instance;
  }

  const handle = new DatabaseSync(databasePath());
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');
  handle.exec('PRAGMA busy_timeout = 5000');

  instance = handle;
  (globalThis as Record<string, unknown>)[globalKey] = handle;
  return handle;
}

/** Apply schema.sql. Idempotent — every statement is CREATE ... IF NOT EXISTS. */
export function migrate(handle: DatabaseSync = db()): void {
  const sql = readFileSync(path.join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');
  handle.exec(sql);
  handle
    .prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)')
    .run('migrated_at', new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export type Param = string | number | null | bigint | Uint8Array;

/**
 * node:sqlite rejects `undefined` and booleans outright. Rather than make every
 * call site remember that, normalise here: undefined becomes NULL and booleans
 * become the 0/1 that the schema's INTEGER columns expect.
 */
function normalise(params: unknown[]): Param[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'number' || typeof p === 'string' || typeof p === 'bigint') return p;
    if (p instanceof Uint8Array) return p;
    // Objects and arrays are a caller mistake — they should have been
    // JSON.stringify'd, and silently doing it for them hides bugs.
    throw new TypeError(
      `Unsupported SQL parameter of type ${typeof p}. JSON-encode it before binding.`,
    );
  });
}

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...normalise(params)) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | null {
  const row = db().prepare(sql).get(...normalise(params));
  return (row as T) ?? null;
}

export function run(sql: string, ...params: unknown[]): { changes: number } {
  const result = db().prepare(sql).run(...normalise(params));
  return { changes: Number(result.changes) };
}

/**
 * Run `fn` inside a transaction.
 *
 * node:sqlite has no transaction wrapper of its own, and several flows here are
 * genuinely multi-statement — creating a trip writes the trip and all of its
 * requests, and a half-created trip is worse than none.
 */
export function transaction<T>(fn: () => T): T {
  const handle = db();
  handle.exec('BEGIN');
  try {
    const result = fn();
    handle.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      handle.exec('ROLLBACK');
    } catch {
      // A rollback failure means the transaction was already unwound; the
      // original error is the one worth surfacing.
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export function newId(): string {
  return randomUUID();
}

/** URL-safe opaque token for sessions and magic links. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Six-character trip join code.
 *
 * The alphabet omits characters that get misread when a teacher writes a code
 * on a whiteboard and thirty students type it from the back of the room:
 * no 0/O, no 1/I/L, no 5/S, no 8/B.
 */
const JOIN_ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ2346789';

export function newJoinCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += JOIN_ALPHABET[bytes[i] % JOIN_ALPHABET.length];
  }
  return code;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// JSON column helpers
// ---------------------------------------------------------------------------

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
