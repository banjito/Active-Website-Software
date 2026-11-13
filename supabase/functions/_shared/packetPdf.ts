import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'

// Builds a delivered Report Packet's single "full packet" PDF for ampOS ACCESS:
// the published cover letter, then each published report in the cover letter's
// order, stitched into one file. No rendering happens here; it only merges PDFs
// that publish-deliverable-pdf / publish-report-pdf already put in storage.
//
// Fail-safe: if a rebuild fails, the old merged file is removed so a customer
// never downloads a stale copy (e.g. one still holding an unpublished report).

const BUCKET = 'customer-reports'

// deno-lint-ignore no-explicit-any
type Admin = any

/** Remove a packet's merged PDF and clear its pointer. Best-effort. */
export async function clearPacketPdf(admin: Admin, deliverableId: string, path?: string | null) {
  if (path) {
    const { error } = await admin.storage.from(BUCKET).remove([path])
    if (error) console.warn(`packet pdf remove failed (${deliverableId}): ${error.message}`)
  }
  const { error } = await admin
    .schema('neta_ops')
    .from('deliverables')
    .update({ published_packet_pdf_path: null })
    .eq('id', deliverableId)
  if (error) console.warn(`packet pdf pointer clear failed (${deliverableId}): ${error.message}`)
}

/**
 * Merge and upload one packet's full PDF. Returns the storage path, or null
 * when the packet isn't delivered or has no published reports (any old merged
 * file is removed in that case).
 */
export async function rebuildPacketPdf(admin: Admin, deliverableId: string): Promise<string | null> {
  const { data: d, error: dErr } = await admin
    .schema('neta_ops')
    .from('deliverables')
    .select('id, job_id, cover_letter_id, status, published_cover_pdf_path, published_packet_pdf_path')
    .eq('id', deliverableId)
    .maybeSingle()
  if (dErr) throw new Error(`deliverable lookup failed: ${dErr.message}`)
  if (!d) throw new Error('Deliverable not found')

  const oldPath: string | null = d.published_packet_pdf_path ?? null

  try {
    if (String(d.status || '').toLowerCase() !== 'delivered') {
      await clearPacketPdf(admin, deliverableId, oldPath)
      return null
    }

    const { data: job } = await admin
      .schema('neta_ops')
      .from('jobs')
      .select('customer_id')
      .eq('id', d.job_id)
      .maybeSingle()
    const customerId = job?.customer_id
    if (!customerId) throw new Error('Job has no linked customer')

    let reportIds: string[] = []
    if (d.cover_letter_id) {
      const { data: doc } = await admin
        .schema('neta_ops')
        .from('generated_documents')
        .select('selected_report_ids')
        .eq('id', d.cover_letter_id)
        .maybeSingle()
      reportIds = (doc?.selected_report_ids as string[] | null) ?? []
    }

    // Same rule ACCESS uses for single reports: approved/sent with a published
    // PDF. The folder check keeps the merge from ever pulling in another
    // customer's file.
    const reportPaths: string[] = []
    if (reportIds.length > 0) {
      const { data: assets, error: aErr } = await admin
        .schema('neta_ops')
        .from('assets')
        .select('id, status, published_pdf_path')
        .in('id', reportIds)
      if (aErr) throw new Error(`report lookup failed: ${aErr.message}`)
      for (const id of reportIds) {
        const a = (assets ?? []).find((x: { id: string }) => x.id === id)
        const p = String(a?.published_pdf_path || '')
        const ok = ['approved', 'sent'].includes(String(a?.status || '').toLowerCase())
        if (ok && p.startsWith(`${customerId}/`)) reportPaths.push(p)
      }
    }

    // A "full packet" with no reports in it is just the cover letter, which
    // already has its own row in ACCESS.
    if (reportPaths.length === 0) {
      await clearPacketPdf(admin, deliverableId, oldPath)
      return null
    }

    const coverPath = String(d.published_cover_pdf_path || '')
    const parts = coverPath ? [coverPath, ...reportPaths] : reportPaths

    // One file at a time so only the output plus one source sit in memory.
    const out = await PDFDocument.create()
    for (const p of parts) {
      const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(p)
      if (dlErr || !blob) throw new Error(`download failed (${p}): ${dlErr?.message ?? 'empty'}`)
      const src = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), {
        ignoreEncryption: true,
      })
      const pages = await out.copyPages(src, src.getPageIndices())
      for (const page of pages) out.addPage(page)
    }
    const bytes = await out.save()

    const path = `${customerId}/${d.job_id}/packets/${deliverableId}-full-packet.pdf`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, new Blob([bytes], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '60',
      })
    if (upErr) throw new Error(`upload failed: ${upErr.message}`)

    const { error: dbErr } = await admin
      .schema('neta_ops')
      .from('deliverables')
      .update({ published_packet_pdf_path: path })
      .eq('id', deliverableId)
    if (dbErr) throw new Error(`db update failed: ${dbErr.message}`)

    return path
  } catch (e) {
    await clearPacketPdf(admin, deliverableId, oldPath)
    throw e
  }
}

/**
 * Rebuild every delivered packet that includes this report. Called after a
 * report is republished (so the full packet has the corrected copy) or
 * unpublished (so the full packet drops it). Never throws; returns errors.
 */
export async function rebuildPacketsContaining(admin: Admin, assetId: string): Promise<string[]> {
  const errors: string[] = []
  try {
    const { data: docs, error: docErr } = await admin
      .schema('neta_ops')
      .from('generated_documents')
      .select('id')
      .contains('selected_report_ids', [assetId])
    if (docErr) throw new Error(`cover letter lookup failed: ${docErr.message}`)
    const docIds = (docs ?? []).map((x: { id: string }) => x.id)
    if (docIds.length === 0) return errors

    const { data: packets, error: pErr } = await admin
      .schema('neta_ops')
      .from('deliverables')
      .select('id')
      .in('cover_letter_id', docIds)
      .ilike('status', 'delivered')
    if (pErr) throw new Error(`packet lookup failed: ${pErr.message}`)

    for (const p of packets ?? []) {
      try {
        await rebuildPacketPdf(admin, p.id)
      } catch (e) {
        errors.push(`${p.id}: ${e instanceof Error ? e.message : e}`)
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  if (errors.length > 0) console.warn('packet rebuild errors:', errors)
  return errors
}
