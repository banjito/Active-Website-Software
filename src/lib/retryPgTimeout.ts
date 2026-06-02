/**
 * Retry helpers for PostgreSQL error 57014 (statement timeout).
 * Heavy triggers/RLS on large tables can occasionally exceed the server timeout.
 */

export const PG_STATEMENT_TIMEOUT = '57014';

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

type SupabaseResult<T> = { data: T | null; error: { code?: string; message?: string } | null };

/**
 * Re-runs a Supabase-style call when the error is 57014, with backoff.
 */
export async function withPgTimeoutRetry<T>(
  run: () => PromiseLike<SupabaseResult<T>>,
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<SupabaseResult<T>> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 700;
  let last: SupabaseResult<T> | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await run();
    if (!last.error) return last;
    if (last.error.code !== PG_STATEMENT_TIMEOUT || attempt === maxAttempts - 1) {
      return last;
    }
    await sleep(baseDelayMs * (attempt + 1));
  }

  return last!;
}
