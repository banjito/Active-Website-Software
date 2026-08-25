import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

console.log("approval-reminders: function loaded")

/**
 * Nudges approvers about requisitions and offers that have been sitting
 * unactioned.
 *
 * Runs on a schedule (pg_cron -> net.http_post). For each item still in
 * pending_approval whose last update is older than the threshold, it re-sends
 * the "your turn" mail to whoever the current step belongs to, as action
 * 'reminder'. The per-item email bodies live in the two existing notification
 * functions, so there is one place that knows what these emails look like.
 *
 * Idempotent enough to run daily: it re-reads state every time and never
 * writes, so a duplicate run just re-sends. It deliberately does not track
 * "already reminded" — a daily nudge on something genuinely stuck is the
 * intent, and skipping requires a state column nobody has asked for.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
    })
  }

  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

    const body = await req.json().catch(() => ({}))
    // Days an item may sit before it earns a nudge. Overridable per-call so a
    // manual run can use a different window than the nightly schedule.
    const afterDays = Number(body?.afterDays ?? Deno.env.get('APPROVAL_REMINDER_DAYS') ?? 3)
    const cutoff = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000).toISOString()
    console.log(`Reminding on items not updated since ${cutoff} (${afterDays} days)`)

    const restHeaders = {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Accept': 'application/json',
      'Accept-Profile': 'common'
    }

    /** Invoke one of the per-item notification functions. */
    const notify = async (fn: string, payload: Record<string, unknown>) => {
      const res = await fetch(`${url}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(payload)
      })
      const text = await res.text()
      if (!res.ok) console.warn(`${fn} reminder failed:`, res.status, text.slice(0, 200))
      return res.ok
    }

    const results = { requisitions: 0, offers: 0, failed: 0, skipped: 0 }

    // --- Requisitions ---------------------------------------------------
    const reqRes = await fetch(
      `${url}/rest/v1/job_requisitions?status=eq.pending_approval&updated_at=lt.${cutoff}&select=id,title,current_approval_step`,
      { headers: restHeaders }
    )
    const staleReqs = reqRes.ok ? await reqRes.json() : []
    console.log(`Stale requisitions: ${Array.isArray(staleReqs) ? staleReqs.length : 0}`)

    for (const r of Array.isArray(staleReqs) ? staleReqs : []) {
      const appRes = await fetch(
        `${url}/rest/v1/requisition_approvers?requisition_id=eq.${r.id}&select=approver_user_id,step_order,status&order=step_order`,
        { headers: restHeaders }
      )
      const approvers = appRes.ok ? await appRes.json() : []
      if (!Array.isArray(approvers) || approvers.length === 0) { results.skipped++; continue }

      const step = r.current_approval_step || 1
      const current = approvers.find((a: any) => a.step_order === step && a.status === 'pending')
      if (!current) { results.skipped++; continue }

      const ok = await notify('requisition-approval-notification', {
        requisitionId: r.id,
        approverUserId: current.approver_user_id,
        stepNumber: step,
        totalSteps: approvers.length,
        action: 'reminder'
      })
      ok ? results.requisitions++ : results.failed++
    }

    // --- Offers ---------------------------------------------------------
    const offRes = await fetch(
      `${url}/rest/v1/offers?status=eq.pending_approval&updated_at=lt.${cutoff}&select=id,position_title,current_approval_step`,
      { headers: restHeaders }
    )
    const staleOffers = offRes.ok ? await offRes.json() : []
    console.log(`Stale offers: ${Array.isArray(staleOffers) ? staleOffers.length : 0}`)

    for (const o of Array.isArray(staleOffers) ? staleOffers : []) {
      const appRes = await fetch(
        `${url}/rest/v1/offer_approvals?offer_id=eq.${o.id}&select=approver_id,approval_order,status&order=approval_order`,
        { headers: restHeaders }
      )
      const approvals = appRes.ok ? await appRes.json() : []
      if (!Array.isArray(approvals) || approvals.length === 0) { results.skipped++; continue }

      const step = o.current_approval_step || 1
      const current = approvals.find((a: any) => a.approval_order === step && a.status === 'pending')
      if (!current) { results.skipped++; continue }

      const ok = await notify('offer-approval-notification', {
        offerId: o.id,
        approverUserId: current.approver_id,
        stepNumber: step,
        totalSteps: approvals.length,
        action: 'reminder'
      })
      ok ? results.offers++ : results.failed++
    }

    console.log("Reminder run complete:", JSON.stringify(results))
    return new Response(JSON.stringify({ ok: true, afterDays, cutoff, ...results }), { headers })
  } catch (e) {
    console.error("ERROR:", e)
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), { headers, status: 500 })
  }
})
