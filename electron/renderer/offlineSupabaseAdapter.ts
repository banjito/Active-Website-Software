/**
 * Offline Supabase adapter (renderer).
 *
 * Drop-in replacement for `src/lib/supabase.ts` inside the Electron app. The
 * Vite resolveId plugin (vite.config.electron.ts) redirects every import of
 * that module to this file, so all ~60 report components run UNCHANGED against
 * a local SQLite store instead of the cloud.
 *
 * It reproduces the slice of the supabase-js / PostgREST surface the audit
 * found in use: schema().from().select/insert/update/upsert/delete with
 * eq/neq/in/match/filter/like/ilike/is/gt/gte/lt/lte, order/limit/range, and
 * single/maybeSingle. Each builder is thenable and resolves to {data,error}
 * by dispatching a serialized "intent" to the main-process executor over IPC.
 *
 * The same module also re-exports the error-classifier helpers the rest of the
 * app imports from src/lib/supabase.ts.
 */

type Json = Record<string, unknown>;

interface Filter {
  col: string;
  op: string;
  val: unknown;
}

interface Intent {
  op: "select" | "insert" | "update" | "upsert" | "delete";
  schema: string;
  table: string;
  columns?: string;
  filters: Filter[];
  modifier?: "single" | "maybeSingle" | null;
  order?: { col: string; ascending: boolean } | null;
  limit?: number | null;
  range?: { from: number; to: number } | null;
  payload?: Json | Json[];
  returning?: boolean;
  onConflict?: string;
}

interface Result<T = unknown> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

// Bridge exposed by electron/preload/preload.cts.
const bridge = (window as unknown as {
  electronAPI?: { db: { query: (i: Intent) => Promise<Result> } };
}).electronAPI;

const DEFAULT_SCHEMA = "neta_ops";

class QueryBuilder implements PromiseLike<Result> {
  private intent: Intent;

  constructor(schema: string, table: string) {
    this.intent = { op: "select", schema, table, filters: [], columns: "*" };
  }

  // ---- operations ----
  select(columns = "*"): this {
    if (this.intent.op === "select") {
      this.intent.columns = columns;
    } else {
      // .select() chained onto a write means "return the affected rows".
      this.intent.returning = true;
      this.intent.columns = columns;
    }
    return this;
  }
  insert(payload: Json | Json[]): this {
    this.intent.op = "insert";
    this.intent.payload = payload;
    return this;
  }
  update(payload: Json): this {
    this.intent.op = "update";
    this.intent.payload = payload;
    return this;
  }
  upsert(payload: Json | Json[], opts?: { onConflict?: string }): this {
    this.intent.op = "upsert";
    this.intent.payload = payload;
    this.intent.onConflict = opts?.onConflict;
    return this;
  }
  delete(): this {
    this.intent.op = "delete";
    return this;
  }

  // ---- filters ----
  private push(col: string, op: string, val: unknown): this {
    this.intent.filters.push({ col, op, val });
    return this;
  }
  eq(col: string, val: unknown) {
    return this.push(col, "eq", val);
  }
  neq(col: string, val: unknown) {
    return this.push(col, "neq", val);
  }
  gt(col: string, val: unknown) {
    return this.push(col, "gt", val);
  }
  gte(col: string, val: unknown) {
    return this.push(col, "gte", val);
  }
  lt(col: string, val: unknown) {
    return this.push(col, "lt", val);
  }
  lte(col: string, val: unknown) {
    return this.push(col, "lte", val);
  }
  like(col: string, val: string) {
    return this.push(col, "like", val);
  }
  ilike(col: string, val: string) {
    return this.push(col, "ilike", val);
  }
  is(col: string, val: unknown) {
    return this.push(col, "is", val);
  }
  in(col: string, vals: unknown[]) {
    return this.push(col, "in", vals);
  }
  contains(col: string, val: unknown) {
    return this.push(col, "contains", val);
  }
  match(obj: Json): this {
    for (const [k, v] of Object.entries(obj)) this.push(k, "eq", v);
    return this;
  }
  filter(col: string, op: string, val: unknown): this {
    // PostgREST passes operators like "eq", "gte", "ilike", "in"…
    return this.push(col, op, val);
  }

  // ---- modifiers ----
  order(col: string, opts?: { ascending?: boolean }): this {
    this.intent.order = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this {
    this.intent.limit = n;
    return this;
  }
  range(from: number, to: number): this {
    this.intent.range = { from, to };
    return this;
  }
  single(): this {
    this.intent.modifier = "single";
    return this;
  }
  maybeSingle(): this {
    this.intent.modifier = "maybeSingle";
    return this;
  }

  // ---- thenable ----
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const exec = bridge
      ? bridge.db.query(this.intent)
      : Promise.resolve<Result>({
          data: null,
          error: { message: "offline bridge unavailable" },
        });
    return exec.then(onfulfilled, onrejected);
  }
}

class SchemaScope {
  constructor(private schema: string) {}
  from(table: string): QueryBuilder {
    return new QueryBuilder(this.schema, table);
  }
}

// ---- offline auth (Phase 2 swaps this for a safeStorage-backed cache) ----
const OFFLINE_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "offline@ampreports.local",
  user_metadata: { name: "Offline User" },
  app_metadata: {},
};
const OFFLINE_SESSION = {
  access_token: "offline",
  refresh_token: "offline",
  expires_in: 3600,
  token_type: "bearer",
  user: OFFLINE_USER,
};

const auth = {
  async getUser() {
    return { data: { user: OFFLINE_USER }, error: null };
  },
  async getSession() {
    return { data: { session: OFFLINE_SESSION }, error: null };
  },
  async signInWithPassword() {
    return { data: { user: OFFLINE_USER, session: OFFLINE_SESSION }, error: null };
  },
  async signOut() {
    return { error: null };
  },
  async refreshSession() {
    return { data: { session: OFFLINE_SESSION, user: OFFLINE_USER }, error: null };
  },
  onAuthStateChange(_cb: unknown) {
    return { data: { subscription: { unsubscribe() {} } } };
  },
};

const noopChannel = {
  on() {
    return this;
  },
  subscribe() {
    return this;
  },
  unsubscribe() {
    return Promise.resolve("ok");
  },
};

export const supabase = {
  schema(name: string) {
    return new SchemaScope(name);
  },
  from(table: string) {
    return new QueryBuilder(DEFAULT_SCHEMA, table);
  },
  rpc(_fn: string, _args?: unknown): Promise<Result> {
    // RPCs (e.g. resolve_report_flag) are approval-workflow actions; online only.
    return Promise.resolve({
      data: null,
      error: { message: "RPC unavailable offline" },
    });
  },
  auth,
  storage: {
    from() {
      return {
        async upload() {
          return { data: null, error: { message: "storage unavailable offline" } };
        },
        async download() {
          return { data: null, error: { message: "storage unavailable offline" } };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: path } };
        },
        async createSignedUrl() {
          return { data: null, error: { message: "storage unavailable offline" } };
        },
      };
    },
  },
  channel() {
    return noopChannel;
  },
  removeChannel() {
    return Promise.resolve("ok");
  },
};

// ---- error-classifier helpers (offline-appropriate reimplementations of the
// originals in src/lib/supabase.ts, which other modules import) ----
export function isCookieAuthError(_error: unknown): boolean {
  return false;
}
export function isAuthError(_error: unknown): boolean {
  return false;
}
export function isConnectionError(error: unknown): boolean {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? "";
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("offline")
  );
}
export function isSchemaError(_error: unknown): boolean {
  return false;
}
export async function ensureValidSession(): Promise<boolean> {
  return true;
}
export async function performSoftSessionRefresh(): Promise<boolean> {
  return true;
}
export async function tryWithFallbackSchema<T>(
  fn: () => Promise<T>
): Promise<T> {
  // No PostgREST schema-cache fallbacks needed against local SQLite.
  return fn();
}

export default supabase;
