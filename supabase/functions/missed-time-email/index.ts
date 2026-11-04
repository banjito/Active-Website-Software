import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { BRAND_COLOR, COMPANY_SUPPRESSED_EMAILS, DEFAULT_FROM_EMAIL } from '../_shared/companyConfig.ts'
import { buildFromHeader, getEmailApiKey, sendEmail } from '../_shared/email.ts'

console.log('missed-time-email: function loaded')

/**
 * Morning email to anyone who logged no time on a work day.
 *
 * Runs on weekdays from pg_cron (see database/migrations/timestamp_03_missed_time.sql).
 * The database decides who missed what: common.time_missed_days() skips holidays,
 * approved time off, people who don't clock in, deactivated accounts, and returns
 * nobody while payroll's switch is off.
 *
 * Body (all optional):
 *   { "dryRun": true }          list who would get it, send nothing, ignore the switch
 *   { "today": "2026-11-10" }   pretend it is that day (company date)
 *
 * Wording stays neutral on purpose. Hourly staff are paid for hours worked, so the
 * email asks for missing hours; it never says pay is withheld.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// 2026-10-31 -> "Friday, Oct 31". Built at noon UTC so no time zone can shift the day.
const dayLabel = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

const listDays = (days: string[]) => {
  const labels = days.map(dayLabel)
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function buildEmail(firstName: string, days: string[]) {
  const when = listDays(days)
  const plural = days.length > 1
  const subject = plural ? `No time logged for ${days.length} days` : `No time logged for ${dayLabel(days[0])}`
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,'

  const text = [
    greeting,
    '',
    `TimeStAMP has no time from you for ${when}.`,
    '',
    `If you worked, open TimeStAMP and add your hours for ${plural ? 'those days' : 'that day'} so your week is ready for approval.`,
    '',
    `If you were off, you can ignore this. If it was planned time off, ask your manager to make sure it's recorded.`,
  ].join('\n')

  const html = `
<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #171717; max-width: 560px;">
  <div style="border-top: 4px solid ${BRAND_COLOR}; padding-top: 16px;">
    <p>${escapeHtml(greeting)}</p>
    <p>TimeStAMP has no time from you for <strong>${escapeHtml(when)}</strong>.</p>
    <p>If you worked, open TimeStAMP and add your hours for ${plural ? 'those days' : 'that day'} so your week is ready for approval.</p>
    <p style="color: #525252;">If you were off, you can ignore this. If it was planned time off, ask your manager to make sure it's recorded.</p>
  </div>
</div>`

  return { subject, text, html }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

    // Only the schedule (or someone holding the service key) may run this. A signed-in
    // user could otherwise send emails or list who missed time.
    if (req.headers.get('Authorization') !== `Bearer ${key}`) {
      return json({ error: 'Not allowed' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const dryRun = body?.dryRun === true
    const today = typeof body?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null

    // @ts-ignore deno: remote module types resolved at runtime
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2?target=deno')
    const supabase = createClient(url, key, { auth: { persistSession: false } })

    const { data, error } = await supabase
      .schema('common')
      .rpc('time_missed_days', { p_today: today, p_ignore_switch: dryRun })
    if (error) throw error

    const suppressed = new Set(COMPANY_SUPPRESSED_EMAILS)
    const people = ((data ?? []) as Array<{ email: string | null; full_name: string | null; missed_days: string[] }>)
      .filter((p) => p.email && !suppressed.has(p.email.toLowerCase()))

    if (dryRun) {
      return json({
        dryRun: true,
        count: people.length,
        people: people.map((p) => ({ name: p.full_name, email: p.email, days: p.missed_days })),
      })
    }

    if (people.length === 0) return json({ sent: 0, failed: 0, message: 'Nobody to email (or the switch is off)' })
    if (!getEmailApiKey()) return json({ sent: 0, failed: 0, message: 'Email not sent: RESEND_API_KEY not configured' })

    const from = buildFromHeader(DEFAULT_FROM_EMAIL)
    let sent = 0
    let failed = 0
    for (const person of people) {
      const firstName = (person.full_name ?? '').trim().split(/\s+/)[0] ?? ''
      const email = buildEmail(firstName, person.missed_days)
      const res = await sendEmail({ from, to: person.email!, ...email })
      if (res.ok) {
        sent += 1
      } else {
        failed += 1
        console.warn(`missed-time-email: send to ${person.email} failed`, res.status, res.body.slice(0, 200))
      }
    }

    console.log(`missed-time-email: sent ${sent}, failed ${failed}`)
    return json({ sent, failed })
  } catch (error: unknown) {
    console.error('missed-time-email failed:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
