// "Email me a sign-in link" for invited subcontractors (Roles scope item 8).
//
// POST { email }. No login needed (deploy with --no-verify-jwt).
// Only active subcontractors get an email, at most one a minute. The answer is the
// same either way, so this can't be used to find out who is invited.
// The link always points at ampOS itself (APP_URL), never at an address the request
// supplies, and opens their jobs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { appBaseUrl, COMPANY_NAME, emailSignInLink, signInLink } from '../_shared/subcontractorLink.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

const ONE_MINUTE = 60 * 1000

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const sameAnswer = json({ ok: true })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase server credentials')
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = await req.json().catch(() => ({}))
    const email = String(body?.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return sameAnswer

    const { data: userId, error: lookupError } = await supabase
      .schema('common')
      .rpc('subcontractor_for_email', { p_email: email })
    if (lookupError) throw lookupError
    if (!userId) return sameAnswer

    const db = supabase.schema('common')
    const { data: ext } = await db.from('external_users').select('last_link_sent_at').eq('user_id', userId).maybeSingle()
    const last = ext?.last_link_sent_at ? new Date(ext.last_link_sent_at).getTime() : 0
    if (Date.now() - last < ONE_MINUTE) return sameAnswer

    // Claim the minute first, so two quick requests send one email
    const now = new Date().toISOString()
    await db.from('external_users').update({ last_link_sent_at: now }).eq('user_id', userId)

    const { data: who } = await supabase.auth.admin.getUserById(userId)
    const name = String(who?.user?.user_metadata?.name ?? '')
    const link = await signInLink(supabase, email, appBaseUrl(req), '/all-jobs')
    await emailSignInLink({
      to: email,
      name,
      link,
      subject: `Your ${COMPANY_NAME} ampOS sign-in link`,
      intro: `Here's your link to sign in to ampOS and open the ${COMPANY_NAME} jobs you're invited to.`,
    })
    return sameAnswer
  } catch (error) {
    console.error('subcontractor-sign-in-link failed', error)
    return sameAnswer
  }
})
