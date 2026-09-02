// Monthly Calibration Due Report
//
// Every piece of field equipment whose calibration is due inside the next 60 days,
// plus everything already past due, grouped by where it is: site, truck, or person.
//
// Scheduled for the 1st of the month at 8:00 AM CST. Unlike the other digests this one
// sends even when there is nothing to report: "nothing due in the next 60 days" is the
// answer the recipients want on the first of the month, and silence is indistinguishable
// from a broken cron job.
//
// Recipients come from an admin-managed list (common.app_settings key below) unioned with
// individual opt-ins. See _shared/digestRecipients.ts.

// @ts-ignore deno: remote module types resolved at runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getTargetedRecipientEmails } from '../_shared/digestRecipients.ts'
import { BRAND_COLOR, COMPANY_FULL_NAME, DEFAULT_FROM_EMAIL } from '../_shared/companyConfig.ts'
import { buildFromHeader, getEmailApiKey, sendEmail } from '../_shared/email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Matches CALIBRATION_DUE_SOON_DAYS in FieldEquipmentList.tsx. Keep the two in step. */
const DEFAULT_WINDOW_DAYS = 60

const RECIPIENTS_SETTING_KEY = 'calibration_report_recipients'

interface EquipmentRow {
  id: string
  equipment_name: string
  amp_id: string | null
  serial_number: string | null
  category: string | null
  calibration_date: string | null
  calibration_due_date: string
  assigned_type: 'user' | 'job_site' | 'truck' | null
  assigned_to: string | null
  assigned_site_id: string | null
  assigned_truck_id: string | null
  assigned_user_id: string | null
}

interface DecoratedRow extends EquipmentRow {
  holderLabel: string
  holderKind: string
  daysLeft: number
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Parse a date-only column as local midnight, not UTC, so days-left never lands a day off. */
const parseDateOnly = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const formatDate = (value: string): string =>
  parseDateOnly(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not set')

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

    // Callers may narrow the window (the admin "send now" button passes nothing, so the
    // test mail matches exactly what the scheduled one will look like).
    let windowDays = DEFAULT_WINDOW_DAYS
    let previewOnly = false
    try {
      const body = await req.json()
      if (typeof body?.windowDays === 'number' && body.windowDays > 0) {
        windowDays = Math.min(Math.round(body.windowDays), 365)
      }
      previewOnly = body?.previewOnly === true
    } catch {
      // No body: scheduled invocation.
    }

    // @ts-ignore deno: remote module types resolved at runtime
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2?target=deno')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const horizon = new Date(today)
    horizon.setDate(horizon.getDate() + windowDays)
    const horizonIso = horizon.toISOString().split('T')[0]

    const { data: equipmentData, error: equipmentError } = await supabase
      .schema('neta_ops')
      .from('field_equipment')
      .select(
        'id, equipment_name, amp_id, serial_number, category, calibration_date, ' +
        'calibration_due_date, assigned_type, assigned_to, assigned_site_id, ' +
        'assigned_truck_id, assigned_user_id'
      )
      .not('calibration_due_date', 'is', null)
      .lte('calibration_due_date', horizonIso)
      // Matches the page's `in_service !== false`: rows predating the column are NULL, and
      // `neq` would drop them, quietly leaving real equipment off the report.
      .or('in_service.is.null,in_service.eq.true')
      .order('calibration_due_date', { ascending: true })

    if (equipmentError) throw equipmentError
    const rows = (equipmentData || []) as EquipmentRow[]

    // Resolve where each item is. Three lookups rather than one join, because the three
    // targets live in different tables and only one applies per row.
    const siteIds = [...new Set(rows.map((r) => r.assigned_site_id).filter(Boolean))]
    const truckIds = [...new Set(rows.map((r) => r.assigned_truck_id).filter(Boolean))]
    const userIds = [...new Set(rows.map((r) => r.assigned_user_id).filter(Boolean))]

    const siteNames = new Map<string, string>()
    if (siteIds.length > 0) {
      const { data } = await supabase
        .schema('common')
        .from('sites')
        .select('id, name, city, state')
        .in('id', siteIds)
      for (const s of data ?? []) {
        const where = [s.city, s.state].filter(Boolean).join(', ')
        siteNames.set(s.id, where ? `${s.name} (${where})` : s.name)
      }
    }

    const truckNames = new Map<string, string>()
    if (truckIds.length > 0) {
      const { data } = await supabase
        .schema('neta_ops')
        .from('equipment_trucks')
        .select('id, name')
        .in('id', truckIds)
      for (const t of data ?? []) truckNames.set(t.id, t.name)
    }

    const userNames = new Map<string, string>()
    if (userIds.length > 0) {
      const { data } = await supabase
        .schema('common')
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      for (const u of data ?? []) userNames.set(u.id, u.full_name || u.email || 'Unknown user')
    }

    const decorate = (row: EquipmentRow): DecoratedRow => {
      let holderLabel = 'Unassigned'
      let holderKind = 'Unassigned'

      if (row.assigned_type === 'job_site') {
        holderKind = 'Site'
        holderLabel = (row.assigned_site_id && siteNames.get(row.assigned_site_id)) ||
          row.assigned_to || 'Unknown site'
      } else if (row.assigned_type === 'truck') {
        holderKind = 'Truck'
        holderLabel = (row.assigned_truck_id && truckNames.get(row.assigned_truck_id)) ||
          row.assigned_to || 'Unknown truck'
      } else if (row.assigned_type === 'user') {
        holderKind = 'Person'
        holderLabel = (row.assigned_user_id && userNames.get(row.assigned_user_id)) ||
          'Unknown user'
      }

      const due = parseDateOnly(row.calibration_due_date)
      due.setHours(0, 0, 0, 0)
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000)

      return { ...row, holderLabel, holderKind, daysLeft }
    }

    const decorated = rows.map(decorate)
    const overdue = decorated.filter((r) => r.daysLeft < 0)
    const dueSoon = decorated.filter((r) => r.daysLeft >= 0)

    // Group by where it is. Sites first, then trucks, then people, then unassigned, so the
    // sections a site manager cares about are at the top of each block.
    const kindOrder: Record<string, number> = { Site: 0, Truck: 1, Person: 2, Unassigned: 3 }
    const groupByHolder = (items: DecoratedRow[]) => {
      const groups = new Map<string, DecoratedRow[]>()
      for (const item of items) {
        const key = `${item.holderKind}||${item.holderLabel}`
        const existing = groups.get(key)
        if (existing) existing.push(item)
        else groups.set(key, [item])
      }
      return [...groups.entries()]
        .map(([key, items]) => {
          const [kind, label] = key.split('||')
          return { kind, label, items }
        })
        .sort((a, b) =>
          kindOrder[a.kind] - kindOrder[b.kind] || a.label.localeCompare(b.label)
        )
    }

    const dueLabel = (days: number): string => {
      if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
      if (days === 0) return 'due today'
      return `${days} day${days === 1 ? '' : 's'} left`
    }

    const renderSection = (
      title: string,
      items: DecoratedRow[],
      accent: string,
      emptyNote: string
    ) => {
      if (items.length === 0) {
        return `<div class="section">
          <div class="section-title" style="border-bottom-color: ${accent};">${title} (0)</div>
          <p class="empty">${emptyNote}</p>
        </div>`
      }

      const groups = groupByHolder(items).map((group) => `
        <div class="group">
          <div class="group-title">
            <span class="kind" style="background: ${accent};">${escapeHtml(group.kind)}</span>
            ${escapeHtml(group.label)}
            <span class="group-count">${group.items.length} item${group.items.length === 1 ? '' : 's'}</span>
          </div>
          <table class="items">
            <tr>
              <th>Equipment</th><th>AMP ID</th><th>Serial</th><th>Due</th><th>Status</th>
            </tr>
            ${group.items.map((item) => `
              <tr>
                <td><strong>${escapeHtml(item.equipment_name)}</strong>${
                  item.category ? `<br><span class="muted">${escapeHtml(item.category)}</span>` : ''
                }</td>
                <td>${escapeHtml(item.amp_id || '-')}</td>
                <td>${escapeHtml(item.serial_number || '-')}</td>
                <td>${formatDate(item.calibration_due_date)}</td>
                <td style="color: ${accent}; font-weight: bold;">${dueLabel(item.daysLeft)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `).join('')

      return `<div class="section">
        <div class="section-title" style="border-bottom-color: ${accent};">${title} (${items.length})</div>
        ${groups}
      </div>`
    }

    const OVERDUE_COLOR = '#c62828'
    const SOON_COLOR = '#e08800'

    const emailSubject = overdue.length > 0
      ? `Calibration Due Report - ${overdue.length} overdue, ${dueSoon.length} due within ${windowDays} days`
      : `Calibration Due Report - ${dueSoon.length} due within ${windowDays} days`

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 900px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #e55611 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #ddd; border-top: none; }
          .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 0 0 20px 0; }
          .summary-stat { display: inline-block; margin: 10px 30px 10px 0; }
          .summary-label { font-size: 14px; color: #666; }
          .summary-value { font-size: 28px; font-weight: bold; color: ${BRAND_COLOR}; }
          .section { margin: 30px 0; }
          .section-title { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid ${BRAND_COLOR}; }
          .group { margin: 18px 0 26px 0; }
          .group-title { font-size: 15px; font-weight: bold; color: #333; margin-bottom: 8px; }
          .kind { display: inline-block; color: white; font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 10px; margin-right: 8px; vertical-align: middle; }
          .group-count { color: #888; font-weight: normal; font-size: 13px; margin-left: 8px; }
          table.items { width: 100%; border-collapse: collapse; font-size: 13px; }
          table.items th { text-align: left; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 10px; border-bottom: 1px solid #ddd; }
          table.items td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
          .muted { color: #888; font-size: 12px; }
          .empty { color: #666; font-style: italic; }
          .footer { text-align: center; color: #777; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Calibration Due Report</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Everything due within ${windowDays} days, as of ${today.toLocaleDateString()}</p>
          </div>
          <div class="content">
            <div class="summary">
              <div class="summary-stat">
                <div class="summary-label">Already overdue</div>
                <div class="summary-value" style="color: ${OVERDUE_COLOR};">${overdue.length}</div>
              </div>
              <div class="summary-stat">
                <div class="summary-label">Due within ${windowDays} days</div>
                <div class="summary-value" style="color: ${SOON_COLOR};">${dueSoon.length}</div>
              </div>
            </div>

            ${renderSection('Past due', overdue, OVERDUE_COLOR, 'Nothing is past due. Good.')}
            ${renderSection(`Due within ${windowDays} days`, dueSoon, SOON_COLOR, `Nothing falls due in the next ${windowDays} days.`)}
          </div>
          <div class="footer">
            <p>Automated monthly report from ${COMPANY_FULL_NAME}</p>
            <p>Generated ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `

    const renderTextGroup = (items: DecoratedRow[]) =>
      groupByHolder(items).map((group) => `
${group.kind}: ${group.label} (${group.items.length})
${group.items.map((item) =>
  `  - ${item.equipment_name} | AMP ID ${item.amp_id || '-'} | serial ${item.serial_number || '-'} | due ${formatDate(item.calibration_due_date)} | ${dueLabel(item.daysLeft)}`
).join('\n')}`).join('\n')

    const emailText = `Calibration Due Report
As of ${today.toLocaleDateString()}

Already overdue: ${overdue.length}
Due within ${windowDays} days: ${dueSoon.length}

PAST DUE (${overdue.length})
${overdue.length ? renderTextGroup(overdue) : '  Nothing is past due.'}

DUE WITHIN ${windowDays} DAYS (${dueSoon.length})
${dueSoon.length ? renderTextGroup(dueSoon) : `  Nothing falls due in the next ${windowDays} days.`}

Automated monthly report from ${COMPANY_FULL_NAME}
Generated ${new Date().toLocaleString()}
`

    const recipientEmails = await getTargetedRecipientEmails(
      supabase,
      'monthlyCalibration',
      RECIPIENTS_SETTING_KEY,
      { includeDivisionLeads: true }
    )

    if (previewOnly) {
      return new Response(
        JSON.stringify({
          success: true,
          previewOnly: true,
          overdueCount: overdue.length,
          dueSoonCount: dueSoon.length,
          recipients: recipientEmails,
          subject: emailSubject,
          emailSent: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (recipientEmails.length === 0) {
      console.log('No recipients configured for the calibration due report; skipping send')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No recipients configured. Add them in Admin > Calibration report recipients.',
          overdueCount: overdue.length,
          dueSoonCount: dueSoon.length,
          emailSent: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (!getEmailApiKey()) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email not sent: RESEND_API_KEY not configured',
          overdueCount: overdue.length,
          dueSoonCount: dueSoon.length,
          emailSent: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const sendRes = await sendEmail({
      from: buildFromHeader(DEFAULT_FROM_EMAIL),
      to: recipientEmails,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
    })

    if (!sendRes.ok) {
      throw new Error(`Resend API failed: ${sendRes.status} - ${sendRes.body}`)
    }

    console.log(
      `Calibration due report sent to ${recipientEmails.length} recipient(s): ` +
      `${overdue.length} overdue, ${dueSoon.length} due within ${windowDays} days`
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Calibration due report sent',
        overdueCount: overdue.length,
        dueSoonCount: dueSoon.length,
        recipientCount: recipientEmails.length,
        emailSent: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Calibration due report failed:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
