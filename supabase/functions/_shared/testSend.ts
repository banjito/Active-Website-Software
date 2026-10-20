/**
 * Test sends for notification emails.
 *
 * A caller holding the service role key can pass `testTo` to send one email to
 * that address only. Without the key the request is refused outright: a failed
 * test must never fall through to a real send to real recipients.
 */

/**
 * True when the request carries a genuine service role key.
 *
 * The platform's own SUPABASE_SERVICE_ROLE_KEY can be stored in a different format
 * from the caller's copy, so a plain string match is not enough. Auth settles it:
 * only a service role key may list users.
 */
async function isServiceRoleCaller(req: Request): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL')
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!url || !token) return false
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': token }
    })
    return res.ok
  } catch {
    return false
  }
}

/** The test address, or undefined for a normal send. Throws when testTo is not allowed. */
export async function getTestRecipient(req: Request, requested: unknown): Promise<string | undefined> {
  if (typeof requested !== 'string' || !requested.trim()) return undefined
  if (!(await isServiceRoleCaller(req))) {
    throw new Error('testTo requires the service role key; nothing was sent')
  }
  return requested.trim()
}
