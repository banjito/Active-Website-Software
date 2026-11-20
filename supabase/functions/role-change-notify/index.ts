import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { BRAND_COLOR, COMPANY_NAME, COMPANY_SUPPRESSED_EMAILS, DEFAULT_FROM_EMAIL } from '../_shared/companyConfig.ts'
import { buildFromHeader, sendEmail } from '../_shared/email.ts'

console.log('role-change-notify: function loaded')

/**
 * Emails every Super Admin when someone's role changes (Roles scope item 5).
 *
 * Called by the Roles & permissions screen right after a change, with the
 * signed-in person's token and { user_ids }. It only reports changes that
 * person really made in the last 10 minutes (from common.access_changes,
 * which only the checked database functions can write), so it can't be used
 * to send made-up emails. The History tab stays the full record.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const UUID = /^[0-9a-f-]{36}$/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
    if (!token) return json({ error: 'Not signed in' }, 401)

    // @ts-ignore deno: remote module types resolved at runtime
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2?target=deno')
    const supabase = createClient(url, key, { auth: { persistSession: false } })

    const { data: auth, error: authError } = await supabase.auth.getUser(token)
    const caller = auth?.user
    if (authError || !caller) return json({ error: 'Not signed in' }, 401)

    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.user_ids)
      ? body.user_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)).slice(0, 500)
      : []
    if (ids.length === 0) return json({ sent: 0, reason: 'no user_ids' })

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: rows, error: rowsError } = await supabase
      .schema('common')
      .from('access_changes')
      .select('user_id, role_key, detail, changed_at')
      .eq('action', 'person_role')
      .eq('changed_by', caller.id)
      .in('user_id', ids)
      .gte('changed_at', since)
      .order('changed_at', { ascending: false })
    if (rowsError) throw rowsError

    // Latest change per person.
    const latest = new Map<string, { role_key: string | null; detail: Record<string, unknown> }>()
    for (const r of rows ?? []) if (!latest.has(r.user_id)) latest.set(r.user_id, r)
    if (latest.size === 0) return json({ sent: 0, reason: 'no recent changes by caller' })

    const [rolesRes, peopleRes, recipientsRes] = await Promise.all([
      supabase.schema('common').from('roles').select('key, label'),
      supabase.schema('common').from('profiles').select('id, full_name, email').in('id', [...latest.keys(), caller.id]),
      supabase.schema('common').rpc('super_admin_emails'),
    ])
    if (rolesRes.error) throw rolesRes.error
    if (peopleRes.error) throw peopleRes.error
    if (recipientsRes.error) throw recipientsRes.error

    const roleLabel = new Map<string, string>((rolesRes.data ?? []).map((r: { key: string; label: string }) => [r.key, r.label]))
    const label = (k: unknown) => (typeof k === 'string' && roleLabel.get(k)) || 'no role'
    const names = new Map<string, string>(
      (peopleRes.data ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || 'Someone',
      ]),
    )
    const name = (id: string) => names.get(id) || 'Someone'

    const lines = [...latest.entries()].map(([id, r]) =>
      r.detail?.cleared
        ? `${name(id)}: back to same as today (${label(r.detail?.to)})`
        : `${name(id)}: ${label(r.detail?.from)} → ${label(r.role_key)}`,
    )

    const suppressed = new Set(COMPANY_SUPPRESSED_EMAILS)
    const to = ((recipientsRes.data ?? []) as string[]).filter((e) => !suppressed.has(e.toLowerCase()))
    if (to.length === 0) return json({ sent: 0, reason: 'no Super Admins to email' })

    const who = name(caller.id)
    const n = lines.length
    const subject = `${COMPANY_NAME} ampOS: ${who} changed ${n === 1 ? 'a role' : `${n} roles`}`
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#1b1b1b;line-height:1.5">
        <p><b>${esc(who)}</b> changed ${n === 1 ? 'this role' : `these ${n} roles`} in ampOS:</p>
        <ul style="padding-left:18px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <p style="color:#5d5d5b">Every change is listed in Admin → Roles &amp; permissions → History.
        You get this because you're a Super Admin.</p>
        <div style="height:3px;background:${BRAND_COLOR};width:48px"></div>
      </div>`
    const text = `${who} changed ${n === 1 ? 'this role' : `these ${n} roles`} in ampOS:\n\n${lines
      .map((l) => `- ${l}`)
      .join('\n')}\n\nEvery change is listed in Admin → Roles & permissions → History.`

    const res = await sendEmail({ from: buildFromHeader(DEFAULT_FROM_EMAIL), to, subject, html, text })
    if (!res.ok) {
      console.error('role-change-notify: send failed', res.status, res.body)
      return json({ sent: 0, error: 'send failed' }, 502)
    }
    return json({ sent: to.length, changes: n })
  } catch (err) {
    console.error('role-change-notify error', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
