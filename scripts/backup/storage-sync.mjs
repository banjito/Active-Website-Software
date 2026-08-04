/**
 * Incremental mirror of Supabase Storage buckets to local disk.
 *
 * Driven by a CSV manifest exported from storage.objects (bucket, name,
 * updated_at, size). Only objects whose updated_at or size differs from the
 * last successful sync are downloaded, so a nightly run after the first one
 * transfers just what changed.
 *
 * Invoked by ampos-backup.sh; expects SUPABASE_URL, SERVICE_ROLE_KEY,
 * MANIFEST, DEST and TRASH in the environment.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const MANIFEST = process.env.MANIFEST;
const DEST = process.env.DEST;
const TRASH = process.env.TRASH;

const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 8);
const MAX_RETRIES = 3;
const STATE_FILE = path.join(DEST, '.sync-state.json');

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_ROLE_KEY, MANIFEST, DEST, TRASH })) {
  if (!v) {
    console.error(`storage-sync: missing required env var ${k}`);
    process.exit(1);
  }
}

const log = (msg) => console.log(`${new Date().toISOString().slice(11, 19)}  [storage] ${msg}`);

/** Minimal RFC-4180 parser: fields may be quoted and contain commas/newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length >= 4 && r[0] !== '');
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function download(bucket, name, destPath) {
  // Each path segment is encoded separately so that "/" keeps its meaning.
  const encoded = name.split('/').map(encodeURIComponent).join('/');
  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`;

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      });

      if (!res.ok) {
        // A missing object means the row was deleted mid-run; not retryable.
        if (res.status === 404 || res.status === 400) {
          return { skipped: true, reason: `HTTP ${res.status}` };
        }
        throw new Error(`HTTP ${res.status}`);
      }

      await mkdir(path.dirname(destPath), { recursive: true });
      const tmp = `${destPath}.part`;
      // Stream to a temp file and rename, so an interrupted run can never leave
      // a truncated file that looks complete to the next sync.
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      await rename(tmp, destPath);

      const { size } = await stat(destPath);
      return { bytes: size };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const raw = await readFile(MANIFEST, 'utf8');
  const rows = parseCsv(raw);
  const state = await loadState();
  const nextState = {};

  const queue = [];
  for (const [bucket, name, updatedAt, size] of rows) {
    const key = `${bucket}/${name}`;
    nextState[key] = { updatedAt, size };

    const prev = state[key];
    const destPath = path.join(DEST, bucket, name);

    if (prev && prev.updatedAt === updatedAt && prev.size === size) {
      // Trust state only if the file is actually still on disk.
      try {
        await stat(destPath);
        continue;
      } catch { /* fall through and re-download */ }
    }
    queue.push({ bucket, name, key, destPath });
  }

  log(`${rows.length} objects in manifest, ${queue.length} to download`);

  let synced = 0;
  let bytes = 0;
  let skipped = 0;
  const failures = [];
  const failed = new Set();
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      try {
        const r = await download(item.bucket, item.name, item.destPath);
        if (r.skipped) {
          skipped++;
          delete nextState[item.key];
        } else {
          synced++;
          bytes += r.bytes;
          if (synced % 100 === 0) log(`${synced}/${queue.length} downloaded`);
        }
      } catch (err) {
        failures.push({ key: item.key, error: String(err.message || err) });
        failed.add(item.key);
        // Fall back to the previous state entry rather than dropping the key:
        // dropping it would make the sweep below treat an existing, healthy
        // local file as deleted upstream and move it to trash. Keeping the old
        // (stale) entry still mismatches the manifest, so the next run retries.
        if (state[item.key]) nextState[item.key] = state[item.key];
        else delete nextState[item.key];
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, worker)
  );

  // Objects that vanished upstream: park them in trash rather than deleting, so
  // an accidental deletion in the app is still recoverable for a while.
  let trashed = 0;
  for (const key of Object.keys(state)) {
    if (nextState[key] || failed.has(key)) continue;
    const src = path.join(DEST, key);
    try {
      await stat(src);
      const dst = path.join(TRASH, key);
      await mkdir(path.dirname(dst), { recursive: true });
      await rename(src, dst).catch(async () => { await rm(src, { force: true }); });
      trashed++;
    } catch { /* already gone */ }
  }

  await writeFile(STATE_FILE, JSON.stringify(nextState, null, 0));

  if (skipped) log(`${skipped} object(s) skipped (deleted mid-run)`);
  if (trashed) log(`${trashed} removed object(s) moved to trash`);
  if (failures.length) {
    log(`${failures.length} download failure(s):`);
    for (const f of failures.slice(0, 10)) log(`  ${f.key}: ${f.error}`);
  }

  log(`done: ${synced} downloaded, ${(bytes / 1048576).toFixed(1)} MB`);

  // Counters go to a side file so the caller can stream stdout straight to the
  // log (live progress) instead of buffering it to scrape these values out.
  if (process.env.RESULT_FILE) {
    await writeFile(process.env.RESULT_FILE, `SYNCED=${synced}\nBYTES=${bytes}\n`);
  }
  console.log(`SYNCED=${synced}`);
  console.log(`BYTES=${bytes}`);

  // A handful of transient failures should not void an otherwise good night;
  // anything worse is treated as a failed run.
  if (failures.length > Math.max(10, rows.length * 0.02)) {
    console.error(`storage-sync: too many failures (${failures.length})`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`storage-sync: ${err.stack || err}`);
  process.exit(1);
});
