import { supabase } from '@/lib/supabase';
import { isTransportError } from '@/lib/supabaseRetry';
import { sleep } from '@/lib/retryPgTimeout';

/**
 * Looks rows up by id a hundred at a time instead of one request each.
 *
 * A job page needs one row per report to know its substation and identifier. Asking for
 * them one by one is fine at 50 reports and falls over at 2,000: the requests queue up
 * behind each other, the slowest are answered with a gateway timeout, and a lookup that
 * gets no answer leaves its report with no substation at all, so it is filed under
 * 'Other' with whatever name it was first saved under. Nothing was wrong with the report.
 *
 * Callers still ask for one row at a time. Every `load` made in the same tick is
 * collected, grouped by table and sent as a handful of `id in (...)` queries.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 100 uuids is a ~3.8k character URL, under half of what the gateway accepts. */
const CHUNK_SIZE = 100;
const MAX_IN_FLIGHT = 4;
const RETRY_DELAYS_MS = [800, 2400];

type Waiter = { resolve: (row: any | null) => void; reject: (error: Error) => void };

/**
 * True when asking again might work: no answer, a timeout, an overloaded server, or a
 * token that was mid-refresh. A server that answers and says no (missing table, bad id,
 * no permission) will say no again, so that is treated as "no such row" instead.
 */
function mightSucceedLater(error: any, status?: number): boolean {
  if (isTransportError(error, status)) return true;
  return status === 401 || status === 408 || status === 429 || (status ?? 0) >= 500;
}

/** uuids compare case-insensitively in Postgres; anything else is matched as written. */
const idKey = (id: string) => (UUID_RE.test(id) ? id.toLowerCase() : id);

export function createBatchedRowLookup() {
  // "<table>|<columns>" -> id -> everyone waiting on that row
  let queued = new Map<string, Map<string, Waiter[]>>();
  let flushScheduled = false;
  let inFlight = 0;
  const waitingForSlot: Array<() => void> = [];
  let failed = 0;

  const acquire = (): Promise<void> => {
    if (inFlight < MAX_IN_FLIGHT) {
      inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waitingForSlot.push(resolve));
  };
  const release = () => {
    // The slot is handed straight to the next request rather than freed and re-taken.
    const next = waitingForSlot.shift();
    if (next) next();
    else inFlight -= 1;
  };

  /** Rows for these ids, or null when the lookup never got a usable answer. */
  const fetchChunk = async (
    table: string,
    columns: string,
    ids: string[],
  ): Promise<any[] | null> => {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      const { data, error, status } = await supabase
        .schema('neta_ops')
        .from(table)
        .select(columns)
        .in('id', ids);
      if (!error) return data ?? [];
      if (!mightSucceedLater(error, status)) return [];
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
    return null;
  };

  const runChunk = async (
    table: string,
    columns: string,
    ids: string[],
    waitersById: Map<string, Waiter[]>,
  ) => {
    await acquire();
    let rows: any[] | null = null;
    try {
      rows = await fetchChunk(table, columns, ids);
    } catch {
      rows = null;
    } finally {
      release();
    }

    if (!rows) {
      failed += ids.length;
      const error = new Error(`Lookup failed for ${ids.length} row(s) in ${table}`);
      ids.forEach((id) => waitersById.get(id)?.forEach((w) => w.reject(error)));
      return;
    }
    const byId = new Map<string, any>(
      rows.map((row): [string, any] => [idKey(String(row.id)), row]),
    );
    ids.forEach((id) =>
      waitersById.get(id)?.forEach((w) => w.resolve(byId.get(id) ?? null)),
    );
  };

  const flush = () => {
    flushScheduled = false;
    const batch = queued;
    queued = new Map();

    batch.forEach((waitersById, key) => {
      const separator = key.indexOf('|');
      const table = key.slice(0, separator);
      const columns = key.slice(separator + 1);
      const ids = [...waitersById.keys()];
      // An id that is not a uuid would make Postgres reject the whole batch it is in, so
      // those go alone, exactly as they did before.
      const batchable = ids.filter((id) => UUID_RE.test(id));
      const alone = ids.filter((id) => !UUID_RE.test(id));

      for (let i = 0; i < batchable.length; i += CHUNK_SIZE) {
        void runChunk(table, columns, batchable.slice(i, i + CHUNK_SIZE), waitersById);
      }
      alone.forEach((id) => void runChunk(table, columns, [id], waitersById));
    });
  };

  return {
    /**
     * One row by id, or null when there is no such row. Rejects when the lookup could not
     * be completed, which is a different thing and must not be mistaken for "no row".
     * `columns` has to include `id`.
     */
    load(table: string, id: string, columns = '*'): Promise<any | null> {
      return new Promise((resolve, reject) => {
        const key = `${table}|${columns}`;
        let waitersById = queued.get(key);
        if (!waitersById) {
          waitersById = new Map();
          queued.set(key, waitersById);
        }
        const rowId = idKey(id);
        const waiters = waitersById.get(rowId);
        if (waiters) waiters.push({ resolve, reject });
        else waitersById.set(rowId, [{ resolve, reject }]);

        if (!flushScheduled) {
          flushScheduled = true;
          setTimeout(flush, 0);
        }
      });
    },
    /** How many rows could not be looked up, so the caller knows its results are partial. */
    failedCount: () => failed,
  };
}
