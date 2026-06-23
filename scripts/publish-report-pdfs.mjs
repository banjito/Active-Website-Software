/**
 * Backfill: render approved/sent report-assets to REAL PDFs and publish them to
 * the customer portal.
 *
 * Uses local headless Chromium (puppeteer) against the running staff dev server.
 * For each report-asset it mints a short-lived HMAC print token, loads the
 * report's ?print=true page (RequireAuth exchanges the token for a renderer
 * session via the report-print-auth edge function), runs Chromium's page.pdf(),
 * uploads to the private customer-reports bucket, and sets assets.published_pdf_path.
 *
 * Requires the staff dev server running (default http://localhost:5173) and the
 * report-print-auth edge function deployed with the same PRINT_TOKEN_SECRET.
 *
 * Usage:
 *   node scripts/publish-report-pdfs.mjs                 # all approved/sent report-assets
 *   node scripts/publish-report-pdfs.mjs --job <jobId>   # one job
 *   node scripts/publish-report-pdfs.mjs --asset <assetId>
 *   node scripts/publish-report-pdfs.mjs --app http://localhost:5174
 */
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { setGlobalDispatcher, Agent } from 'undici';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

// Node's built-in fetch (undici) can negotiate HTTP/2 to Supabase and hit a
// "frameError" on some Node versions. Force HTTP/1.1 to avoid it.
setGlobalDispatcher(new Agent({ allowH2: false }));

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;
const printSecret = process.env.PRINT_TOKEN_SECRET;

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const APP_URL = (getArg('--app') || process.env.STAFF_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const onlyJob = getArg('--job');
const onlyAsset = getArg('--asset');
const onlyCustomer = getArg('--customer');
const limit = getArg('--limit') ? parseInt(getArg('--limit'), 10) : undefined;
const force = args.includes('--force'); // re-render even if already published

const BUCKET = 'customer-reports';
const TOKEN_TTL_SECONDS = 600;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase config. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
  process.exit(1);
}
if (!printSecret) {
  console.error('Missing PRINT_TOKEN_SECRET in .env (must match the report-print-auth edge function secret).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Mint a token that report-print-auth (Deno) validates byte-for-byte. */
function mintPrintToken(assetId) {
  const payload = JSON.stringify({ aid: assetId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
  const payloadB64 = base64url(Buffer.from(payload, 'utf8'));
  const sig = crypto.createHmac('sha256', printSecret).update(payloadB64).digest();
  return `${payloadB64}.${base64url(sig)}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a `.in(col, ids)` query in batches. A single huge id list overflows the
 * request URL/headers and the server rejects it (empty/garbled error).
 */
async function selectIn(table, selectCols, col, ids, chunk = 100) {
  const out = [];
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await supabase
      .schema('neta_ops')
      .from(table)
      .select(selectCols)
      .in(col, slice);
    if (error) throw new Error(`${table} query failed: ${describeError(error)}`);
    out.push(...(data || []));
  }
  return out;
}

/** Supabase/Postgrest errors are plain objects; surface every field. */
function describeError(e) {
  if (!e) return 'unknown';
  if (e instanceof Error) return e.stack || e.message;
  const parts = ['message', 'code', 'details', 'hint']
    .map((k) => (e[k] ? `${k}=${e[k]}` : null))
    .filter(Boolean);
  return parts.length ? parts.join(' | ') : JSON.stringify(e);
}

async function loadTargets() {
  // Service role bypasses RLS, so we read across schemas directly.
  let assetQuery = supabase
    .schema('neta_ops')
    .from('assets')
    .select('id, name, file_url, status')
    .in('status', ['approved', 'sent'])
    .like('file_url', 'report:%');
  if (onlyAsset) assetQuery = assetQuery.eq('id', onlyAsset);
  if (!force) assetQuery = assetQuery.is('published_pdf_path', null); // resumable: skip done

  const { data: assets, error: assetErr } = await assetQuery;
  if (assetErr) throw new Error(`assets query failed: ${describeError(assetErr)}`);
  if (!assets?.length) return [];

  const assetIds = assets.map((a) => a.id);
  const links = await selectIn('job_assets', 'asset_id, job_id', 'asset_id', assetIds);

  const jobIds = [...new Set(links.map((l) => l.job_id))];
  const jobs = await selectIn('jobs', 'id, customer_id', 'id', jobIds);

  const jobById = new Map((jobs || []).map((j) => [j.id, j]));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const targets = [];
  for (const link of links || []) {
    if (onlyJob && link.job_id !== onlyJob) continue;
    const job = jobById.get(link.job_id);
    const asset = assetById.get(link.asset_id);
    if (!job?.customer_id || !asset) continue;
    if (onlyCustomer && job.customer_id !== onlyCustomer) continue;
    targets.push({
      assetId: asset.id,
      name: asset.name,
      fileUrl: asset.file_url,
      jobId: job.id,
      customerId: job.customer_id,
    });
  }
  // De-dupe by asset (an asset can be linked to a job once, but be safe).
  let unique = [...new Map(targets.map((t) => [t.assetId, t])).values()];
  if (limit && limit > 0) unique = unique.slice(0, limit);
  return unique;
}

async function publishOne(browser, t) {
  const reportPath = t.fileUrl.replace('report:', '');
  const token = mintPrintToken(t.assetId);
  const url = `${APP_URL}${reportPath}?print=true&token=${encodeURIComponent(token)}`;

  const page = await browser.newPage();
  try {
    // Don't gate navigation on network idle: this is a SPA on the vite dev
    // server, which streams hundreds of modules on demand, so heavy reports
    // (e.g. Grounding Fall of Potential) never go quiet enough for networkidle
    // to fire before the timeout. Wait for the DOM, then for the report body to
    // actually render — that selector is the real "ready" signal here.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#report-container', { timeout: 90000 });
    // Let charts/async content settle before printing.
    await sleep(4000);

    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '0.4in', bottom: '0.4in', left: '0.3in', right: '0.3in' },
      // Chart-heavy reports (e.g. Grounding Fall of Potential) can exceed the
      // default 30s printToPDF timeout.
      timeout: 120000,
    });

    const path = `${t.customerId}/${t.jobId}/${t.assetId}.pdf`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true, cacheControl: '60' });
    if (upErr) throw upErr;

    const { error: dbErr } = await supabase
      .schema('neta_ops')
      .from('assets')
      .update({ published_pdf_path: path })
      .eq('id', t.assetId);
    if (dbErr) throw dbErr;

    return path;
  } finally {
    await page.close();
  }
}

async function main() {
  console.log(`Staff app: ${APP_URL}`);
  const targets = await loadTargets();
  if (targets.length === 0) {
    console.log('No approved/sent report-assets to publish.');
    return;
  }
  console.log(`Publishing ${targets.length} report(s)…`);

  const browser = await puppeteer.launch({ headless: 'new' });
  let done = 0;
  let failed = 0;
  try {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const label = t.name || t.assetId;
      process.stdout.write(`  [${i + 1}/${targets.length}] ${label} … `);
      try {
        const path = await publishOne(browser, t);
        done++;
        console.log(`ok → ${path}`);
      } catch (e) {
        failed++;
        console.log(`FAILED: ${describeError(e)}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\nDone. Published ${done}, failed ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Error:', describeError(e));
  process.exit(1);
});
