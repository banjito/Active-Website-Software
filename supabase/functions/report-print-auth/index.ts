import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Validates a short-lived, HMAC-signed "print token" and, if valid, returns a
// session for a dedicated renderer account so a headless browser can render the
// report's ?print=true page (which fetches RLS-protected data client-side).
//
// The headless driver (local puppeteer for backfill, Browserless for on-send)
// only ever loads a URL carrying this token — it never handles a Supabase
// session itself. Token minting requires PRINT_TOKEN_SECRET (server-only), the
// token is short-lived, and we refuse unless the asset is approved/sent.

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

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((b64url.length + 3) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Token format: base64url(payloadJson) + "." + base64url(HMAC_SHA256(payloadB64, secret)).
 * The signature covers the base64url payload string exactly as transmitted, so
 * the Node minter (crypto.createHmac) and this Deno validator agree byte-for-byte.
 */
async function verifyPrintToken(
  token: string,
  secret: string,
): Promise<{ aid: string; exp: number } | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = bytesToBase64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))),
  )
  if (expected !== sigB64) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)))
    if (!payload?.aid || typeof payload.exp !== 'number') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return { aid: String(payload.aid), exp: payload.exp }
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const secret = Deno.env.get('PRINT_TOKEN_SECRET')
    const rendererEmail = Deno.env.get('RENDERER_EMAIL')
    const rendererPassword = Deno.env.get('RENDERER_PASSWORD')
    if (!supabaseUrl || !anonKey || !serviceKey || !secret || !rendererEmail || !rendererPassword) {
      throw new Error('Missing required server credentials')
    }

    const body = await req.json().catch(() => ({}))
    const token = String(body?.token || '').trim()
    if (!token) return json({ error: 'token is required' }, 400)

    const claims = await verifyPrintToken(token, secret)
    if (!claims) return json({ error: 'Invalid or expired print token' }, 401)

    // Refuse unless the asset is actually published (approved/sent).
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: asset, error: assetError } = await adminClient
      .schema('neta_ops')
      .from('assets')
      .select('id, status')
      .eq('id', claims.aid)
      .maybeSingle()
    if (assetError) return json({ error: assetError.message }, 400)
    if (!asset || !['approved', 'sent'].includes(String(asset.status || '').toLowerCase())) {
      return json({ error: 'Report is not available for printing' }, 403)
    }

    // Sign in as the renderer account; its session satisfies RLS for the report.
    const authClient = createClient(supabaseUrl, anonKey)
    const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
      email: rendererEmail,
      password: rendererPassword,
    })
    if (signInError || !signIn?.session) {
      return json({ error: signInError?.message || 'Renderer sign-in failed' }, 500)
    }

    return json({
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
