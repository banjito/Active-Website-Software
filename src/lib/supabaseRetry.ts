/**
 * Retry and error-reporting helpers for Supabase writes.
 *
 * postgrest-js retries a request that never reached the server, but only for
 * GET/HEAD/OPTIONS — see RETRYABLE_METHODS in @supabase/postgrest-js. Anything
 * that changes data (PATCH/POST/DELETE) fails on the first blip. That asymmetry
 * is why a flaky moment reads as "the app is slow" (reads quietly retry with
 * backoff) right up until a save fails outright with "TypeError: Failed to
 * fetch". These helpers give writes the same courtesy.
 */

export interface PostgrestLikeError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

export interface PostgrestLikeResult<T> {
  data: T;
  error: PostgrestLikeError | null;
  status?: number;
}

/**
 * True when the request never got an answer from the server: DNS/TLS failure,
 * a dropped connection, a gateway error stripped of its CORS headers, or the
 * browser refusing the request outright. postgrest-js reports these as
 * `{ status: 0, message: "<ErrorName>: <message>" }` rather than as a
 * PostgrestError with a `code`.
 */
export function isTransportError(
  error: PostgrestLikeError | null | undefined,
  status?: number,
): boolean {
  if (!error) return false;
  if (status === 0) return true;
  if (error.code) return false; // a real PostgREST/Postgres error, not transport
  const message = `${error.message ?? ''} ${error.details ?? ''}`;
  return /failed to fetch|networkerror|network error|load failed|fetcherror|connection (closed|reset|refused)|econnreset/i.test(
    message,
  );
}

/** A message worth showing a user, from either error shape. */
export function describeSupabaseError(
  error: PostgrestLikeError | null | undefined,
  status?: number,
): string {
  if (!error) return 'Unknown error';
  if (isTransportError(error, status)) {
    return `The request never reached the server (${error.message || 'network error'}). Check your connection and try again.`;
  }
  const parts = [error.message, error.hint].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  const base = parts.join(' — ') || 'Unknown error';
  return error.code ? `${base} (${error.code})` : base;
}

const DEFAULT_DELAYS_MS = [600, 1800];

/**
 * Runs a Supabase write and retries it when the failure was transport-level.
 *
 * `run` has to build the query afresh each time: a PostgREST query builder is a
 * one-shot thenable and cannot be awaited twice.
 *
 * Only use this for writes that are safe to repeat. Setting a column to a known
 * value is; inserting a row without a client-supplied id is not.
 */
export async function withWriteRetry<T>(
  run: () => PromiseLike<PostgrestLikeResult<T>>,
  { delaysMs = DEFAULT_DELAYS_MS, label }: { delaysMs?: number[]; label?: string } = {},
): Promise<PostgrestLikeResult<T>> {
  let result = await run();

  for (const delay of delaysMs) {
    if (!isTransportError(result.error, result.status)) return result;
    console.warn(
      `[supabaseRetry] ${label ?? 'write'} did not reach the server (${result.error?.message}); retrying in ${delay}ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await run();
  }

  return result;
}
