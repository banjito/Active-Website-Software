#!/usr/bin/env node
/**
 * Load the parsed PTW device library into common.device_catalog.
 *
 * Pipeline:
 *   1. python3 scripts/parse_ptw_lib.py PTW.LIB > device_catalog.ndjson
 *   2. node scripts/load-device-catalog.mjs device_catalog.ndjson
 *
 * Requires the table (database/migrations/create_device_catalog_table.sql) to exist first.
 * Idempotent: upserts on dedup_key, so re-running with a newer PTW.LIB refreshes in place.
 * Reads Supabase creds from .env (VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY,
 * or plain SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Use --dry-run to validate without writing.
 */
import 'dotenv/config';
import fs from 'node:fs';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) {
  console.error('usage: node scripts/load-device-catalog.mjs <device_catalog.ndjson> [--dry-run]');
  process.exit(1);
}

const URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!URL || !KEY)) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const rows = [];
const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  const t = line.trim();
  if (t) rows.push(JSON.parse(t));
}
console.log(`read ${rows.length} rows from ${file}`);

if (dryRun) {
  console.log('dry run — sample:', JSON.stringify(rows.slice(0, 2), null, 2));
  const manu = new Set(rows.map((r) => r.manufacturer));
  console.log(`distinct manufacturers: ${manu.size}`);
  process.exit(0);
}

const supabase = createClient(URL, KEY, {
  db: { schema: 'common' },
  auth: { persistSession: false },
});

const BATCH = 500;
let done = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase
    .from('device_catalog')
    .upsert(batch, { onConflict: 'dedup_key', ignoreDuplicates: false });
  if (error) {
    console.error(`batch ${i}-${i + batch.length} failed:`, error.message);
    process.exit(1);
  }
  done += batch.length;
  process.stdout.write(`\rupserted ${done}/${rows.length}`);
}
console.log(`\ndone — ${done} devices in common.device_catalog`);
