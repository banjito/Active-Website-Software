import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { COMPANY_SUPERUSER_EMAILS } from '../_shared/companyConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Keep this list in sync with src/lib/roles.ts and common.is_superuser_email.
const SUPERUSER_EMAILS = COMPANY_SUPERUSER_EMAILS

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

    if (!SUPERUSER_EMAILS.includes((caller.email || '').toLowerCase())) {
      return new Response(
        JSON.stringify({ error: 'Access denied. Super admin required.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      )
    }

    const body = await req.json().catch(() => ({}))
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    const newPassword =
      typeof body?.newPassword === 'string' ? body.newPassword : ''

    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({ error: 'userId and newPassword are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPassword },
    )

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
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
