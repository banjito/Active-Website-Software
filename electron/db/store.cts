/**
 * Offline SQLite store for ampOS Offline (main process).
 *
 * Design: a GENERIC JSON ROW STORE. Rather than mirror ~45 Postgres report
 * schemas (which would require live prod introspection), every mirrored table
 * has the same shape: a small set of scalar columns that reports actually
 * filter on, plus `_raw` holding the complete row as JSON. On read we return
 * JSON.parse(_raw); on write we extract the scalar columns for indexing and
 * stash the full payload in _raw. Tables are created lazily on first access.
 *
 * The audit showed reports only ever filter on:
 *   id, file_url, job_id, status, user_id, asset_id, report_id
 * so those are the only real columns we need.
 *
 * Sync columns (_sync_status/_dirty_at/_remote_updated_at) + a _sync_queue
 * table back the Phase 2 push-sync engine.
 */
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type QueryOp = "select" | "insert" | "update" | "upsert" | "delete";

export interface Filter {
  col: string;
  op: string; // eq | neq | in | gt | gte | lt | lte | like | ilike | is
  val: unknown;
}

export interface QueryIntent {
  op: QueryOp;
  schema: string;
  table: string;
  columns?: string; // select projection: "*" or "a, b, c"
  filters: Filter[];
  modifier?: "single" | "maybeSingle" | null;
  order?: { col: string; ascending: boolean } | null;
  limit?: number | null;
  range?: { from: number; to: number } | null;
  payload?: Record<string, unknown> | Record<string, unknown>[];
  returning?: boolean; // whether .select() was chained onto a write
  onConflict?: string;
}

export interface QueryResult<T = unknown> {
  data: T | T[] | null;
  error: { message: string; code?: string } | null;
}

const SCALAR_COLS = [
  "id",
  "job_id",
  "user_id",
  "asset_id",
  "report_id",
  "file_url",
  "status",
  "created_at",
  "updated_at",
] as const;

let db: Database.Database;

export function initStore(filePath: string): void {
  db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _sync_queue (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      op TEXT NOT NULL,
      tbl TEXT NOT NULL,
      pk TEXT,
      payload TEXT,
      client_ts TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT);
  `);
}

function fullName(intent: { schema: string; table: string }): string {
  // A table string may already be schema-qualified ("neta_ops.jobs").
  const t = intent.table.includes(".") ? intent.table : `${intent.schema}.${intent.table}`;
  return t;
}

const ensured = new Set<string>();
function ensureTable(name: string): void {
  if (ensured.has(name)) return;
  const cols = SCALAR_COLS.map((c) =>
    c === "id" ? `"id" TEXT PRIMARY KEY` : `"${c}" TEXT`
  ).join(",\n    ");
  db.exec(`
    CREATE TABLE IF NOT EXISTS "${name}" (
    ${cols},
    "_raw" TEXT NOT NULL DEFAULT '{}',
    "_sync_status" TEXT NOT NULL DEFAULT 'clean',
    "_dirty_at" TEXT,
    "_remote_updated_at" TEXT
    );
    CREATE INDEX IF NOT EXISTS "idx_${name.replace(/[^a-z0-9]/gi, "_")}_job"
      ON "${name}" ("job_id");
  `);
  ensured.add(name);
}

function nowIso(): string {
  return new Date().toISOString();
}

// Build a WHERE clause from filters that reference scalar columns. Filters on
// non-scalar columns are returned separately to apply in JS against _raw.
function buildWhere(filters: Filter[]): {
  sql: string;
  params: unknown[];
  jsFilters: Filter[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const jsFilters: Filter[] = [];
  for (const f of filters) {
    if (!(SCALAR_COLS as readonly string[]).includes(f.col)) {
      jsFilters.push(f);
      continue;
    }
    const col = `"${f.col}"`;
    switch (f.op) {
      case "eq":
        clauses.push(`${col} = ?`);
        params.push(f.val);
        break;
      case "neq":
        clauses.push(`${col} != ?`);
        params.push(f.val);
        break;
      case "in": {
        const arr = (f.val as unknown[]) ?? [];
        if (arr.length === 0) {
          clauses.push("0 = 1");
        } else {
          clauses.push(`${col} IN (${arr.map(() => "?").join(",")})`);
          params.push(...arr);
        }
        break;
      }
      case "gt":
        clauses.push(`${col} > ?`);
        params.push(f.val);
        break;
      case "gte":
        clauses.push(`${col} >= ?`);
        params.push(f.val);
        break;
      case "lt":
        clauses.push(`${col} < ?`);
        params.push(f.val);
        break;
      case "lte":
        clauses.push(`${col} <= ?`);
        params.push(f.val);
        break;
      case "like":
        clauses.push(`${col} LIKE ?`);
        params.push(f.val);
        break;
      case "ilike":
        clauses.push(`${col} LIKE ? COLLATE NOCASE`);
        params.push(f.val);
        break;
      case "is":
        clauses.push(f.val === null ? `${col} IS NULL` : `${col} = ?`);
        if (f.val !== null) params.push(f.val);
        break;
      default:
        jsFilters.push(f);
    }
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    jsFilters,
  };
}

function materialize(row: Record<string, unknown>): Record<string, unknown> {
  // _raw is the authoritative full row.
  try {
    return JSON.parse((row._raw as string) || "{}");
  } catch {
    return {};
  }
}

function applyJsFilters(
  rows: Record<string, unknown>[],
  jsFilters: Filter[]
): Record<string, unknown>[] {
  if (!jsFilters.length) return rows;
  return rows.filter((r) =>
    jsFilters.every((f) => {
      const v = r[f.col];
      switch (f.op) {
        case "eq":
          return v === f.val;
        case "neq":
          return v !== f.val;
        case "in":
          return (f.val as unknown[]).includes(v);
        case "is":
          return v === f.val;
        default:
          return true;
      }
    })
  );
}

function project(
  row: Record<string, unknown>,
  columns?: string
): Record<string, unknown> {
  if (!columns || columns.trim() === "*") return row;
  const keys = columns.split(",").map((k) => k.trim()).filter(Boolean);
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = row[k] ?? null;
  return out;
}

function scalarsFrom(payload: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const c of SCALAR_COLS) {
    const v = payload[c];
    out[c] = v === undefined || v === null ? null : String(v);
  }
  return out;
}

function enqueue(op: QueryOp, tbl: string, pk: string | null, payload: unknown): void {
  db.prepare(
    `INSERT INTO _sync_queue (op, tbl, pk, payload, client_ts) VALUES (?,?,?,?,?)`
  ).run(op, tbl, pk, JSON.stringify(payload ?? null), nowIso());
}

function doSelect(name: string, intent: QueryIntent): QueryResult {
  const { sql, params, jsFilters } = buildWhere(intent.filters);
  let q = `SELECT * FROM "${name}" ${sql}`;
  if (intent.order && (SCALAR_COLS as readonly string[]).includes(intent.order.col)) {
    q += ` ORDER BY "${intent.order.col}" ${intent.order.ascending ? "ASC" : "DESC"}`;
  }
  if (intent.range) {
    q += ` LIMIT ${intent.range.to - intent.range.from + 1} OFFSET ${intent.range.from}`;
  } else if (intent.limit != null) {
    q += ` LIMIT ${intent.limit}`;
  }
  const raw = db.prepare(q).all(...params) as Record<string, unknown>[];
  let rows = raw.map(materialize);
  rows = applyJsFilters(rows, jsFilters);
  const projected = rows.map((r) => project(r, intent.columns));

  if (intent.modifier === "single") {
    if (projected.length !== 1) {
      return {
        data: null,
        error: {
          message:
            projected.length === 0
              ? "JSON object requested, multiple (or no) rows returned"
              : "Results contain more than one row",
          code: "PGRST116",
        },
      };
    }
    return { data: projected[0], error: null };
  }
  if (intent.modifier === "maybeSingle") {
    return { data: projected[0] ?? null, error: null };
  }
  return { data: projected, error: null };
}

function insertOne(
  name: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const row = { ...payload };
  if (!row.id) row.id = randomUUID();
  if (!row.created_at) row.created_at = nowIso();
  if (!row.updated_at) row.updated_at = nowIso();
  const scalars = scalarsFrom(row);
  const cols = [...SCALAR_COLS, "_raw", "_sync_status", "_dirty_at"];
  const placeholders = cols.map(() => "?").join(",");
  const vals = [
    ...SCALAR_COLS.map((c) => scalars[c]),
    JSON.stringify(row),
    "pending",
    nowIso(),
  ];
  db.prepare(
    `INSERT OR REPLACE INTO "${name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders})`
  ).run(...vals);
  enqueue("insert", name, String(row.id), row);
  return row;
}

function doInsert(name: string, intent: QueryIntent): QueryResult {
  const payloads = Array.isArray(intent.payload)
    ? intent.payload
    : [intent.payload ?? {}];
  const inserted = payloads.map((p) => insertOne(name, p as Record<string, unknown>));
  if (!intent.returning) return { data: null, error: null };
  const projected = inserted.map((r) => project(r, intent.columns));
  if (intent.modifier === "single") return { data: projected[0], error: null };
  if (intent.modifier === "maybeSingle") return { data: projected[0] ?? null, error: null };
  return { data: projected, error: null };
}

function doUpdate(name: string, intent: QueryIntent): QueryResult {
  const { sql, params, jsFilters } = buildWhere(intent.filters);
  const existing = db.prepare(`SELECT * FROM "${name}" ${sql}`).all(...params) as Record<
    string,
    unknown
  >[];
  const patch = (intent.payload ?? {}) as Record<string, unknown>;
  const updated: Record<string, unknown>[] = [];
  for (const dbRow of existing) {
    const current = materialize(dbRow);
    if (applyJsFilters([current], jsFilters).length === 0) continue;
    const merged: Record<string, unknown> = { ...current, ...patch, updated_at: nowIso() };
    const scalars = scalarsFrom(merged);
    db.prepare(
      `UPDATE "${name}" SET ${SCALAR_COLS.map((c) => `"${c}" = ?`).join(", ")},
       "_raw" = ?, "_sync_status" = 'pending', "_dirty_at" = ? WHERE "id" = ?`
    ).run(...SCALAR_COLS.map((c) => scalars[c]), JSON.stringify(merged), nowIso(), merged.id);
    enqueue("update", name, String(merged.id), merged);
    updated.push(merged);
  }
  if (!intent.returning) return { data: null, error: null };
  const projected = updated.map((r) => project(r, intent.columns));
  if (intent.modifier === "single") return { data: projected[0] ?? null, error: null };
  if (intent.modifier === "maybeSingle") return { data: projected[0] ?? null, error: null };
  return { data: projected, error: null };
}

function doUpsert(name: string, intent: QueryIntent): QueryResult {
  const payloads = Array.isArray(intent.payload)
    ? intent.payload
    : [intent.payload ?? {}];
  const result: Record<string, unknown>[] = [];
  for (const p of payloads) {
    const row = p as Record<string, unknown>;
    const id = row.id;
    let exists = false;
    if (id) {
      exists =
        (db.prepare(`SELECT 1 FROM "${name}" WHERE "id" = ?`).get(id) as unknown) !=
        null;
    }
    if (exists) {
      const cur = materialize(
        db.prepare(`SELECT * FROM "${name}" WHERE "id" = ?`).get(id) as Record<
          string,
          unknown
        >
      );
      const merged: Record<string, unknown> = { ...cur, ...row, updated_at: nowIso() };
      const scalars = scalarsFrom(merged);
      db.prepare(
        `UPDATE "${name}" SET ${SCALAR_COLS.map((c) => `"${c}" = ?`).join(", ")},
         "_raw" = ?, "_sync_status" = 'pending', "_dirty_at" = ? WHERE "id" = ?`
      ).run(...SCALAR_COLS.map((c) => scalars[c]), JSON.stringify(merged), nowIso(), merged.id);
      enqueue("update", name, String(merged.id), merged);
      result.push(merged);
    } else {
      result.push(insertOne(name, row));
    }
  }
  if (!intent.returning) return { data: null, error: null };
  const projected = result.map((r) => project(r, intent.columns));
  if (intent.modifier === "single") return { data: projected[0] ?? null, error: null };
  return { data: projected, error: null };
}

function doDelete(name: string, intent: QueryIntent): QueryResult {
  const { sql, params } = buildWhere(intent.filters);
  const victims = db.prepare(`SELECT "id" FROM "${name}" ${sql}`).all(...params) as {
    id: string;
  }[];
  db.prepare(`DELETE FROM "${name}" ${sql}`).run(...params);
  for (const v of victims) enqueue("delete", name, v.id, null);
  return { data: null, error: null };
}

export function runQuery(intent: QueryIntent): QueryResult {
  try {
    const name = fullName(intent);
    ensureTable(name);
    switch (intent.op) {
      case "select":
        return doSelect(name, intent);
      case "insert":
        return doInsert(name, intent);
      case "update":
        return doUpdate(name, intent);
      case "upsert":
        return doUpsert(name, intent);
      case "delete":
        return doDelete(name, intent);
      default:
        return { data: null, error: { message: `Unsupported op: ${intent.op}` } };
    }
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}

/** Bulk-load rows into a table from a sync pull or seed (does not enqueue). */
export function seedRows(
  schema: string,
  table: string,
  rows: Record<string, unknown>[]
): void {
  const name = fullName({ schema, table });
  ensureTable(name);
  const cols = [...SCALAR_COLS, "_raw", "_sync_status"];
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO "${name}" (${cols.map((c) => `"${c}"`).join(",")})
     VALUES (${cols.map(() => "?").join(",")})`
  );
  const tx = db.transaction((rs: Record<string, unknown>[]) => {
    for (const r of rs) {
      const scalars = scalarsFrom(r);
      stmt.run(...SCALAR_COLS.map((c) => scalars[c]), JSON.stringify(r), "clean");
    }
  });
  tx(rows);
}
