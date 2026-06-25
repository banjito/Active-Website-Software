"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initStore = initStore;
exports.runQuery = runQuery;
exports.seedRows = seedRows;
/**
 * Offline SQLite store for AmpOfflineReports (main process).
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
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_crypto_1 = require("node:crypto");
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
];
let db;
function initStore(filePath) {
    db = new better_sqlite3_1.default(filePath);
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
function fullName(intent) {
    // A table string may already be schema-qualified ("neta_ops.jobs").
    const t = intent.table.includes(".") ? intent.table : `${intent.schema}.${intent.table}`;
    return t;
}
const ensured = new Set();
function ensureTable(name) {
    if (ensured.has(name))
        return;
    const cols = SCALAR_COLS.map((c) => c === "id" ? `"id" TEXT PRIMARY KEY` : `"${c}" TEXT`).join(",\n    ");
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
function nowIso() {
    return new Date().toISOString();
}
// Build a WHERE clause from filters that reference scalar columns. Filters on
// non-scalar columns are returned separately to apply in JS against _raw.
function buildWhere(filters) {
    const clauses = [];
    const params = [];
    const jsFilters = [];
    for (const f of filters) {
        if (!SCALAR_COLS.includes(f.col)) {
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
                const arr = f.val ?? [];
                if (arr.length === 0) {
                    clauses.push("0 = 1");
                }
                else {
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
                if (f.val !== null)
                    params.push(f.val);
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
function materialize(row) {
    // _raw is the authoritative full row.
    try {
        return JSON.parse(row._raw || "{}");
    }
    catch {
        return {};
    }
}
function applyJsFilters(rows, jsFilters) {
    if (!jsFilters.length)
        return rows;
    return rows.filter((r) => jsFilters.every((f) => {
        const v = r[f.col];
        switch (f.op) {
            case "eq":
                return v === f.val;
            case "neq":
                return v !== f.val;
            case "in":
                return f.val.includes(v);
            case "is":
                return v === f.val;
            default:
                return true;
        }
    }));
}
function project(row, columns) {
    if (!columns || columns.trim() === "*")
        return row;
    const keys = columns.split(",").map((k) => k.trim()).filter(Boolean);
    const out = {};
    for (const k of keys)
        out[k] = row[k] ?? null;
    return out;
}
function scalarsFrom(payload) {
    const out = {};
    for (const c of SCALAR_COLS) {
        const v = payload[c];
        out[c] = v === undefined || v === null ? null : String(v);
    }
    return out;
}
function enqueue(op, tbl, pk, payload) {
    db.prepare(`INSERT INTO _sync_queue (op, tbl, pk, payload, client_ts) VALUES (?,?,?,?,?)`).run(op, tbl, pk, JSON.stringify(payload ?? null), nowIso());
}
function doSelect(name, intent) {
    const { sql, params, jsFilters } = buildWhere(intent.filters);
    let q = `SELECT * FROM "${name}" ${sql}`;
    if (intent.order && SCALAR_COLS.includes(intent.order.col)) {
        q += ` ORDER BY "${intent.order.col}" ${intent.order.ascending ? "ASC" : "DESC"}`;
    }
    if (intent.range) {
        q += ` LIMIT ${intent.range.to - intent.range.from + 1} OFFSET ${intent.range.from}`;
    }
    else if (intent.limit != null) {
        q += ` LIMIT ${intent.limit}`;
    }
    const raw = db.prepare(q).all(...params);
    let rows = raw.map(materialize);
    rows = applyJsFilters(rows, jsFilters);
    const projected = rows.map((r) => project(r, intent.columns));
    if (intent.modifier === "single") {
        if (projected.length !== 1) {
            return {
                data: null,
                error: {
                    message: projected.length === 0
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
function insertOne(name, payload) {
    const row = { ...payload };
    if (!row.id)
        row.id = (0, node_crypto_1.randomUUID)();
    if (!row.created_at)
        row.created_at = nowIso();
    if (!row.updated_at)
        row.updated_at = nowIso();
    const scalars = scalarsFrom(row);
    const cols = [...SCALAR_COLS, "_raw", "_sync_status", "_dirty_at"];
    const placeholders = cols.map(() => "?").join(",");
    const vals = [
        ...SCALAR_COLS.map((c) => scalars[c]),
        JSON.stringify(row),
        "pending",
        nowIso(),
    ];
    db.prepare(`INSERT OR REPLACE INTO "${name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders})`).run(...vals);
    enqueue("insert", name, String(row.id), row);
    return row;
}
function doInsert(name, intent) {
    const payloads = Array.isArray(intent.payload)
        ? intent.payload
        : [intent.payload ?? {}];
    const inserted = payloads.map((p) => insertOne(name, p));
    if (!intent.returning)
        return { data: null, error: null };
    const projected = inserted.map((r) => project(r, intent.columns));
    if (intent.modifier === "single")
        return { data: projected[0], error: null };
    if (intent.modifier === "maybeSingle")
        return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
}
function doUpdate(name, intent) {
    const { sql, params, jsFilters } = buildWhere(intent.filters);
    const existing = db.prepare(`SELECT * FROM "${name}" ${sql}`).all(...params);
    const patch = (intent.payload ?? {});
    const updated = [];
    for (const dbRow of existing) {
        const current = materialize(dbRow);
        if (applyJsFilters([current], jsFilters).length === 0)
            continue;
        const merged = { ...current, ...patch, updated_at: nowIso() };
        const scalars = scalarsFrom(merged);
        db.prepare(`UPDATE "${name}" SET ${SCALAR_COLS.map((c) => `"${c}" = ?`).join(", ")},
       "_raw" = ?, "_sync_status" = 'pending', "_dirty_at" = ? WHERE "id" = ?`).run(...SCALAR_COLS.map((c) => scalars[c]), JSON.stringify(merged), nowIso(), merged.id);
        enqueue("update", name, String(merged.id), merged);
        updated.push(merged);
    }
    if (!intent.returning)
        return { data: null, error: null };
    const projected = updated.map((r) => project(r, intent.columns));
    if (intent.modifier === "single")
        return { data: projected[0] ?? null, error: null };
    if (intent.modifier === "maybeSingle")
        return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
}
function doUpsert(name, intent) {
    const payloads = Array.isArray(intent.payload)
        ? intent.payload
        : [intent.payload ?? {}];
    const result = [];
    for (const p of payloads) {
        const row = p;
        const id = row.id;
        let exists = false;
        if (id) {
            exists =
                db.prepare(`SELECT 1 FROM "${name}" WHERE "id" = ?`).get(id) !=
                    null;
        }
        if (exists) {
            const cur = materialize(db.prepare(`SELECT * FROM "${name}" WHERE "id" = ?`).get(id));
            const merged = { ...cur, ...row, updated_at: nowIso() };
            const scalars = scalarsFrom(merged);
            db.prepare(`UPDATE "${name}" SET ${SCALAR_COLS.map((c) => `"${c}" = ?`).join(", ")},
         "_raw" = ?, "_sync_status" = 'pending', "_dirty_at" = ? WHERE "id" = ?`).run(...SCALAR_COLS.map((c) => scalars[c]), JSON.stringify(merged), nowIso(), merged.id);
            enqueue("update", name, String(merged.id), merged);
            result.push(merged);
        }
        else {
            result.push(insertOne(name, row));
        }
    }
    if (!intent.returning)
        return { data: null, error: null };
    const projected = result.map((r) => project(r, intent.columns));
    if (intent.modifier === "single")
        return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
}
function doDelete(name, intent) {
    const { sql, params } = buildWhere(intent.filters);
    const victims = db.prepare(`SELECT "id" FROM "${name}" ${sql}`).all(...params);
    db.prepare(`DELETE FROM "${name}" ${sql}`).run(...params);
    for (const v of victims)
        enqueue("delete", name, v.id, null);
    return { data: null, error: null };
}
function runQuery(intent) {
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
    }
    catch (err) {
        return {
            data: null,
            error: { message: err instanceof Error ? err.message : String(err) },
        };
    }
}
/** Bulk-load rows into a table from a sync pull or seed (does not enqueue). */
function seedRows(schema, table, rows) {
    const name = fullName({ schema, table });
    ensureTable(name);
    const cols = [...SCALAR_COLS, "_raw", "_sync_status"];
    const stmt = db.prepare(`INSERT OR REPLACE INTO "${name}" (${cols.map((c) => `"${c}"`).join(",")})
     VALUES (${cols.map(() => "?").join(",")})`);
    const tx = db.transaction((rs) => {
        for (const r of rs) {
            const scalars = scalarsFrom(r);
            stmt.run(...SCALAR_COLS.map((c) => scalars[c]), JSON.stringify(r), "clean");
        }
    });
    tx(rows);
}
//# sourceMappingURL=store.cjs.map