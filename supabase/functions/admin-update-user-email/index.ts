import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { COMPANY_SUPERUSER_EMAILS } from '../_shared/companyConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Keep this list in sync with src/lib/roles.ts and common.is_superuser_email.
const SUPERUSER_EMAILS = COMPANY_SUPERUSER_EMAILS

// Basic RFC-ish email sanity check. The Auth API does its own validation too;
// this just gives a friendlier early error.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      },
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase server credentials')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        },
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user: caller },
      error: callerError,
    } = await supabase.auth.getUser(token)

    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        },
      )
    }

    const body = await req.json().catch(() => ({}))
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    const newEmail =
      typeof body?.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : ''

    if (!userId || !newEmail) {
      return new Response(
        JSON.stringify({ error: 'userId and newEmail are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    if (!EMAIL_RE.test(newEmail)) {
      return new Response(
        JSON.stringify({ error: 'Please provide a valid email address' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Authorization: super admins may change anyone's email; anyone else may
    // only change their OWN email (self-service on the profile page).
    const isSuperAdmin = SUPERUSER_EMAILS.includes(
      (caller.email || '').toLowerCase(),
    )
    const isSelf = caller.id === userId
    if (!isSuperAdmin && !isSelf) {
      return new Response(
        JSON.stringify({
          error: 'Access denied. You can only change your own email.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      )
    }

    // Immediate change, no confirmation flow: email_confirm marks the new
    // address as already verified so the user isn't locked out awaiting a link.
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { email: newEmail, email_confirm: true },
    )

    if (updateError) {
      // Surface the most common failure (address already in use) clearly.
      const msg = /already|registered|exists/i.test(updateError.message)
        ? 'That email address is already in use by another account.'
        : updateError.message
      return new Response(
        JSON.stringify({ error: msg }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Keep the common.profiles mirror in sync so displayed emails don't drift
    // from the auth source of truth.
    const { error: profileError } = await supabase
      .schema('common')
      .from('profiles')
      .update({ email: newEmail })
      .eq('id', userId)
    if (profileError) {
      // Non-fatal: auth email is the source of truth and has already changed.
      console.warn('profiles.email mirror update failed:', profileError.message)
    }

    return new Response(
      JSON.stringify({ success: true, email: newEmail }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
