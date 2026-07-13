import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { parse as parseCsv } from 'https://deno.land/std@0.224.0/csv/parse.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// AMP Phone List sheet in Google Drive. Override with the AMP_CONTACTS_SHEET_ID secret.
const DEFAULT_SHEET_ID = '144b4eGWT8swytrbhq7IjmOPUluHF6xey'

type ContactRow = {
  name: string
  work_phone: string
  email: string
  role: string
  display_order: number
}

const normalizeName = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim()

// The sheet lists people as "Last, First"; the app displays "First Last".
function toDisplayName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  const m = trimmed.match(/^([^,]+),\s*(.+)$/)
  return m ? `${m[2].trim()} ${m[1].trim()}` : trimmed
}

async function parseXlsx(buf: Uint8Array): Promise<string[][]> {
  // @ts-ignore deno: remote module types resolved at runtime
  const XLSX = await import('npm:xlsx@0.18.5')
  const workbook = XLSX.read(buf, { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as string[][]
}

// Exchange the service account key for a short-lived Drive API access token.
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  // @ts-ignore deno: remote module types resolved at runtime
  const { SignJWT, importPKCS8 } = await import('https://esm.sh/jose@5')
  const sa = JSON.parse(serviceAccountJson)
  if (!sa.client_email || !sa.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not a valid service account JSON key')
  }
  const key = await importPKCS8(sa.private_key, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/drive.readonly' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token exchange failed: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

async function fetchSheetRowsViaServiceAccount(sheetId: string, serviceAccountJson: string): Promise<string[][]> {
  const token = await getGoogleAccessToken(serviceAccountJson)
  const authHeaders = { Authorization: `Bearer ${token}` }
  const saEmail = JSON.parse(serviceAccountJson).client_email

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${sheetId}?fields=mimeType,name&supportsAllDrives=true`,
    { headers: authHeaders }
  )
  if (!metaRes.ok) {
    await metaRes.body?.cancel()
    throw new Error(
      `Drive API returned HTTP ${metaRes.status} for the sheet. ` +
        `Make sure the sheet is shared (Viewer) with the service account: ${saEmail}`
    )
  }
  const meta = await metaRes.json()

  if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=text/csv`,
      { headers: authHeaders }
    )
    if (!res.ok) {
      await res.body?.cancel()
      throw new Error(`Drive API CSV export failed: HTTP ${res.status}`)
    }
    return parseCsv(await res.text()) as string[][]
  }

  // Not a native Google Sheet (e.g. .xlsx stored in Drive): download raw bytes.
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${sheetId}?alt=media&supportsAllDrives=true`,
    { headers: authHeaders }
  )
  if (!res.ok) {
    await res.body?.cancel()
    throw new Error(`Drive API file download failed: HTTP ${res.status}`)
  }
  return parseXlsx(new Uint8Array(await res.arrayBuffer()))
}

// Unauthenticated path, only works if the sheet is shared "anyone with the link".
async function fetchSheetRows(sheetId: string, gid: string | undefined): Promise<string[][]> {
  // Native Google Sheets (and xlsx files opened via Sheets) support the CSV export
  // endpoint when the file is shared as "anyone with the link can view".
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`
  const csvRes = await fetch(csvUrl, { redirect: 'follow' })
  const csvType = csvRes.headers.get('content-type') ?? ''
  if (csvRes.ok && !csvType.includes('text/html')) {
    return parseCsv(await csvRes.text()) as string[][]
  }
  await csvRes.body?.cancel()

  // The phone list is an .xlsx stored in Drive, so fall back to downloading the raw
  // file and parsing it with SheetJS.
  const fileUrl = `https://drive.google.com/uc?export=download&id=${sheetId}`
  const fileRes = await fetch(fileUrl, { redirect: 'follow' })
  const fileType = fileRes.headers.get('content-type') ?? ''
  if (!fileRes.ok || fileType.includes('text/html')) {
    await fileRes.body?.cancel()
    throw new Error(
      `Could not download the Google Sheet (CSV export: HTTP ${csvRes.status}, file download: HTTP ${fileRes.status}). ` +
        'Make sure the sheet is shared as "Anyone with the link – Viewer".'
    )
  }
  return parseXlsx(new Uint8Array(await fileRes.arrayBuffer()))
}

function parseContacts(rows: string[][]): ContactRow[] {
  // The first row is a title ("AMP Phone List Revised ..."); find the real header row.
  const headerIdx = rows.findIndex((row) => {
    const cells = row.map((c) => String(c ?? '').toLowerCase())
    return cells.some((c) => c.trim() === 'name') && cells.some((c) => c.includes('phone'))
  })
  if (headerIdx === -1) {
    throw new Error('Could not find a header row containing "Name" and a phone column in the sheet.')
  }

  const header = rows[headerIdx].map((c) => String(c ?? '').toLowerCase())
  const nameCol = header.findIndex((c) => c.trim() === 'name')
  const phoneCol = header.findIndex((c) => c.includes('phone'))
  const emailCol = header.findIndex((c) => c.includes('email') || c.includes('e-mail'))
  const roleCol = header.findIndex((c) => c.includes('role') || c.includes('title'))

  const contacts: ContactRow[] = []
  const seen = new Set<string>()
  for (const row of rows.slice(headerIdx + 1)) {
    const cell = (idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '')
    const name = toDisplayName(cell(nameCol))
    if (!name) continue
    const key = normalizeName(name)
    if (seen.has(key)) {
      console.warn(`Duplicate name in sheet, keeping first occurrence: ${name}`)
      continue
    }
    seen.add(key)
    contacts.push({
      name,
      work_phone: cell(phoneCol),
      email: cell(emailCol),
      role: cell(roleCol),
      display_order: contacts.length + 1,
    })
  }
  return contacts
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not set')

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

    // @ts-ignore deno: remote module types resolved at runtime
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2?target=deno')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let force = false
    try {
      const body = await req.json()
      force = body?.force === true
    } catch {
      // no body / not JSON — fine
    }

    const sheetId = Deno.env.get('AMP_CONTACTS_SHEET_ID') || DEFAULT_SHEET_ID
    const gid = Deno.env.get('AMP_CONTACTS_SHEET_GID') || undefined
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')

    console.log(`Fetching AMP phone list from sheet ${sheetId} (${serviceAccountJson ? 'service account' : 'public link'})...`)
    const rows = serviceAccountJson
      ? await fetchSheetRowsViaServiceAccount(sheetId, serviceAccountJson)
      : await fetchSheetRows(sheetId, gid)
    const sheetContacts = parseContacts(rows)
    if (sheetContacts.length === 0) {
      throw new Error('The sheet parsed to zero contacts; refusing to wipe the phone list.')
    }

    const { data: existing, error: fetchError } = await supabase
      .schema('common')
      .from('amp_contacts')
      .select('id, work_phone, name, email, role, display_order')
    if (fetchError) throw fetchError

    // Safety net for a mis-shared or half-cleared sheet: bail out rather than mass-delete.
    if (!force && (existing?.length ?? 0) >= 10 && sheetContacts.length < existing.length / 2) {
      throw new Error(
        `Sheet has ${sheetContacts.length} contacts but ampOS has ${existing.length}; ` +
          'aborting to avoid a mass delete. Re-run with {"force": true} to override.'
      )
    }

    const existingByName = new Map<string, (typeof existing)[number]>()
    const extraDuplicateIds: string[] = []
    for (const contact of existing ?? []) {
      const key = normalizeName(contact.name)
      if (existingByName.has(key)) {
        extraDuplicateIds.push(contact.id)
      } else {
        existingByName.set(key, contact)
      }
    }

    const toInsert: Omit<ContactRow, never>[] = []
    const toUpdate: (ContactRow & { id: string })[] = []
    let unchanged = 0
    for (const contact of sheetContacts) {
      const match = existingByName.get(normalizeName(contact.name))
      if (!match) {
        toInsert.push(contact)
      } else {
        existingByName.delete(normalizeName(contact.name))
        if (
          match.work_phone !== contact.work_phone ||
          match.email !== contact.email ||
          match.role !== contact.role ||
          match.display_order !== contact.display_order ||
          match.name !== contact.name
        ) {
          toUpdate.push({ ...contact, id: match.id })
        } else {
          unchanged++
        }
      }
    }
    const toDeleteIds = [...extraDuplicateIds, ...[...existingByName.values()].map((c) => c.id)]

    if (toInsert.length > 0) {
      const { error } = await supabase.schema('common').from('amp_contacts').insert(toInsert)
      if (error) throw error
    }
    if (toUpdate.length > 0) {
      const { error } = await supabase.schema('common').from('amp_contacts').upsert(toUpdate, { onConflict: 'id' })
      if (error) throw error
    }
    if (toDeleteIds.length > 0) {
      const { error } = await supabase.schema('common').from('amp_contacts').delete().in('id', toDeleteIds)
      if (error) throw error
    }

    const summary = {
      success: true,
      total: sheetContacts.length,
      inserted: toInsert.length,
      updated: toUpdate.length,
      deleted: toDeleteIds.length,
      unchanged,
    }
    console.log('Sync complete:', JSON.stringify(summary))
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('sync-amp-contacts failed:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : (error as { message?: string })?.message ?? JSON.stringify(error),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
