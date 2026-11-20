// Shared QuickBooks connections, one per company (AMP, Armadillo, Scavenger).
//
// QuickBooks allows a single ampOS connection per company. Whoever connects last
// owns it, and every older login for that company stops working. So ampOS keeps
// one shared row per company (realm_id) in common.quickbooks_integrations and
// every employee uses them. The row marked is_primary (AMP) is the default for
// job linking, billing and change orders. Only admins may connect or disconnect.

import { encode as base64Encode, decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { isEmployeeEmailDomain } from './companyConfig.ts'
import { isSuperAdminByRoleName } from './superAdmin.ts'

// deno-lint-ignore no-explicit-any
type Db = any
// deno-lint-ignore no-explicit-any
export type AuthUser = { id: string; email?: string | null; user_metadata?: Record<string, any> }
// deno-lint-ignore no-explicit-any
export type Connection = Record<string, any>

export const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

/** 'production' for the real books. */
export const liveEnvironment = () => Deno.env.get('QB_ENVIRONMENT') || 'sandbox'

/**
 * Intuit app keys. Real companies use QB_CLIENT_*. Intuit test companies use the
 * separate QB_SANDBOX_CLIENT_* keys, so billing can be tried without the real books.
 */
export function appKeys(test = false): { clientId: string; clientSecret: string; environment: string } {
  const prefix = test ? 'QB_SANDBOX_' : 'QB_'
  const clientId = Deno.env.get(`${prefix}CLIENT_ID`)
  const clientSecret = Deno.env.get(`${prefix}CLIENT_SECRET`)
  if (!clientId || !clientSecret) {
    throw new Error(
      test
        ? 'Test QuickBooks keys are missing. Add QB_SANDBOX_CLIENT_ID and QB_SANDBOX_CLIENT_SECRET as Supabase secrets.'
        : 'QuickBooks credentials not configured. Set QB_CLIENT_ID and QB_CLIENT_SECRET as Supabase secrets.',
    )
  }
  return { clientId, clientSecret, environment: test ? 'sandbox' : liveEnvironment() }
}

/** A test company: a sandbox row while the real ones are live. Never true when live is sandbox too. */
export const isTestConnection = (row: Connection) =>
  row.environment === 'sandbox' && liveEnvironment() === 'production'

const ADMIN_ROLES = ['Admin', 'Super Admin']
const REFRESH_EARLY_MS = 5 * 60 * 1000
// While one request renews the login, token_expires_at holds this marker so other
// requests wait for it instead of renewing with the same key at the same moment.
const RENEWING_MARKER = '1970-01-01T00:00:00+00:00'
const RENEWING_GIVE_UP_MS = 20 * 1000

export class QuickBooksReconnectError extends Error {
  constructor(message = 'QuickBooks is not connected. An admin needs to connect it in Admin → Integrations.') {
    super(message)
  }
}

const isSuperUser = (user: AuthUser) => isSuperAdminByRoleName(user)

/** Employees use the shared connection. Customer portal logins never do. */
export const canUseQuickBooks = (user: AuthUser) =>
  isSuperUser(user) || isEmployeeEmailDomain(user.email ?? '')

/** Connecting replaces the connection for everyone, so only admins may do it. */
export const canManageQuickBooks = (user: AuthUser) =>
  canUseQuickBooks(user) && (isSuperUser(user) || ADMIN_ROLES.includes(String(user.user_metadata?.role ?? '')))

// AES-256-GCM encryption for OAuth tokens (Intuit security requirement)
async function getEncryptionKey(keyString: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(keyString.padEnd(32, '0').slice(0, 32))
  return await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptToken(token: string, encryptionKey: string): Promise<string> {
  const key = await getEncryptionKey(encryptionKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)))
  const combined = new Uint8Array(iv.length + encrypted.length)
  combined.set(iv)
  combined.set(encrypted, iv.length)
  return base64Encode(combined)
}

export async function decryptToken(encryptedToken: string, encryptionKey: string): Promise<string> {
  const key = await getEncryptionKey(encryptionKey)
  const combined = base64Decode(encryptedToken)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12))
  return new TextDecoder().decode(decrypted)
}

const table = (db: Db) => db.schema('common').from('quickbooks_integrations')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Every connected company, main one first. */
export async function listConnections(db: Db): Promise<Connection[]> {
  const { data, error } = await table(db)
    .select('*')
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Could not read the QuickBooks connections: ${error.message}`)
  return data ?? []
}

/**
 * One company's connection: the one for `realmId`, or the main company when no
 * realm is given. Null when it isn't connected. Never falls back to a different
 * company, so AMP work can't land in another company's books.
 */
export async function getCompanyConnection(db: Db, realmId?: string | null): Promise<Connection | null> {
  const rows = await listConnections(db)
  if (realmId) return rows.find((r) => r.realm_id === realmId) ?? null
  return rows.find((r) => r.is_primary) ?? null
}

/**
 * A working access token for one company's connection (the main one by default).
 * Renews it when it is about to expire, or when QuickBooks just turned down
 * `rejected` (the stored, encrypted token that was used). Only one request
 * renews at a time.
 */
export async function getAccessToken(
  db: Db,
  encryptionKey: string,
  rejected?: string,
  realmId?: string | null,
): Promise<{ token: string; connection: Connection }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const row = await getCompanyConnection(db, realmId)
    if (!row) {
      throw new QuickBooksReconnectError(
        realmId
          ? 'That QuickBooks company is not connected. An admin can connect it in Admin → Integrations.'
          : undefined,
      )
    }

    const expiresAt = Date.parse(row.token_expires_at)
    const renewing = expiresAt <= 0
    if (renewing && Date.now() - Date.parse(row.updated_at) < RENEWING_GIVE_UP_MS) {
      await sleep(700)
      continue
    }

    const expiring = expiresAt - Date.now() < REFRESH_EARLY_MS
    if (!renewing && !expiring && row.access_token !== rejected) {
      return { token: await decryptToken(row.access_token, encryptionKey), connection: row }
    }

    // Claim the renewal. Only one request can match this exact updated_at.
    let claim = table(db)
      .update({ token_expires_at: RENEWING_MARKER, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    claim = row.updated_at ? claim.eq('updated_at', row.updated_at) : claim.is('updated_at', null)
    const { data: claimed } = await claim.select('id')
    if (!claimed?.length) {
      await sleep(300)
      continue
    }

    const token = await renewClaimed(db, row, encryptionKey)
    // null = that login is dead and was removed; the next pass reports it
    if (token) return { token, connection: row }
  }
  throw new Error('QuickBooks is busy renewing its login. Try again in a moment.')
}

async function renewClaimed(db: Db, row: Connection, encryptionKey: string): Promise<string | null> {
  try {
    const { clientId, clientSecret } = appKeys(isTestConnection(row))

    const refreshToken = await decryptToken(row.refresh_token, encryptionKey)
    const response = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('QuickBooks token refresh failed:', response.status, text)
      if (text.includes('invalid_grant')) {
        // Dead for good: someone connected since, or it was revoked in QuickBooks.
        console.error(`Removing dead QuickBooks connection ${row.id} (connected by user ${row.user_id})`)
        await table(db).delete().eq('id', row.id)
        return null
      }
      throw new Error(`QuickBooks login could not be renewed (status ${response.status}).`)
    }

    const fresh = await response.json()
    const { error } = await table(db)
      .update({
        access_token: await encryptToken(fresh.access_token, encryptionKey),
        refresh_token: await encryptToken(fresh.refresh_token || refreshToken, encryptionKey),
        token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (error) throw new Error(`Renewed the QuickBooks login but could not save it: ${error.message}`)
    return fresh.access_token
  } catch (error) {
    // Put the real expiry back so the next request can try again
    await table(db).update({ token_expires_at: row.token_expires_at }).eq('id', row.id).eq('token_expires_at', RENEWING_MARKER)
    throw error
  }
}
