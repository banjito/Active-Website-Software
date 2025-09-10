#!/usr/bin/env node

// Safe, idempotent updater: applies quoted_amount from a CSV export to existing
// opportunities created before a cutoff date. Only updates business.opportunities.quoted_amount.
// - Dry run by default (prints a report and writes CSV). Use --apply to commit.
// - Matches by opportunities.quote_number ⇄ CSV "Letter #" ONLY (no fuzzy writes).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parse as parseCsvSync } from 'csv-parse/sync';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) or VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_FILE = path.resolve(process.cwd(), 'imports', 'opportunities_export.csv');
const filePath = getArg('--file', DEFAULT_FILE);
const cutoff = new Date(getArg('--cutoff', '2025-08-19T00:00:00.000Z')); // filter based on CSV dates
const applyChanges = hasFlag('--apply');
const allowZero = hasFlag('--include-zero');

const COL_LETTER = getArg('--col-letter', 'Letter #');
const COL_QUOTED = getArg('--col-quoted', 'Quoted Amount');

function readCsv(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`CSV not found: ${file}`);
  }
  const content = fs.readFileSync(file, 'utf8');
  return parseCsvSync(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true
  });
}

function parseMoney(val) {
  if (val == null || val === '') return null;
  const n = Number(String(val).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseDateFlexible(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  // Native parse often works for formats like "Feb 02, 2024 11:29:36 AM"
  const t = Date.parse(str);
  if (!Number.isNaN(t)) return new Date(t);
  // Try MM/DD/YYYY
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return null;
}

async function fetchAllOpportunities() {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await supabase
      .schema('business')
      .from('opportunities')
      .select('id, title, quote_number, created_at, quoted_amount')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function extractLetterNumberFromHtml(html) {
  if (!html) return null;
  const patterns = [
    /Letter\s*#\s*(\d{2,6})/i,
    /Quote\s*#\s*(\d{2,6})/i,
    /Proposal\s*#\s*(\d{2,6})/i
  ];
  for (const re of patterns) {
    const m = String(html).match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function fetchLetterToOpportunityMapBeforeCutoff() {
  const pageSize = 1000;
  let from = 0;
  const letterToOpp = new Map();
  while (true) {
    const { data, error } = await supabase
      .schema('business')
      .from('letter_proposals')
      .select('opportunity_id, html, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data || []).filter(r => r.created_at && new Date(r.created_at) < cutoff);
    for (const row of batch) {
      const letter = extractLetterNumberFromHtml(row.html);
      if (!letter) continue;
      if (!letterToOpp.has(letter)) letterToOpp.set(letter, row.opportunity_id);
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return letterToOpp;
}

async function main() {
  console.log('Quoted Amount Updater - DRY RUN by default');
  console.log('CSV file:', filePath);
  console.log('Cutoff  :', cutoff.toISOString());
  console.log('Mode    :', applyChanges ? 'APPLY (will write changes)' : 'DRY RUN (no writes)');

  const csvRows = readCsv(filePath);
  console.log(`CSV rows loaded: ${csvRows.length}`);

  // Build map from letter number -> { amount, date }
  const csvByLetter = new Map();
  for (const row of csvRows) {
    const letter = (row[COL_LETTER] || '').toString().trim();
    const amt = parseMoney(row[COL_QUOTED]);
    if (!letter) continue;
    if (amt == null) continue;
    if (!allowZero && amt === 0) continue; // avoid overwriting with zero by default
    // Determine the CSV-based date for cutoff
    const proposalDate = parseDateFlexible(row['Proposal Date']);
    const opportunityDate = parseDateFlexible(row['Opportunity Date']);
    const createdOn = parseDateFlexible(row['Created on']);
    const candidateDate = proposalDate || opportunityDate || createdOn;
    if (!candidateDate || !(candidateDate < cutoff)) continue; // only pre-cutoff
    const prev = csvByLetter.get(letter);
    if (!prev || (prev.date && candidateDate > prev.date)) {
      csvByLetter.set(letter, { amount: amt, date: candidateDate });
    }
  }
  console.log(`CSV unique letters with amounts before cutoff: ${csvByLetter.size}`);

  const opps = await fetchAllOpportunities();
  console.log(`DB opportunities scanned: ${opps.length}`);

  // Map existing opportunities by quote_number for matching
  const byQuoteNumber = new Map();
  for (const o of opps) {
    const qn = (o.quote_number || '').toString().trim();
    if (!qn) continue;
    // Prefer first seen; we only update exact match
    if (!byQuoteNumber.has(qn)) byQuoteNumber.set(qn, o);
  }

  // Build fallback map via letter_proposals HTML parsing
  const letterToOppId = await fetchLetterToOpportunityMapBeforeCutoff();
  // Cache opportunities by id for quick lookup
  const oppById = new Map(opps.map(o => [o.id, o]));

  const changes = [];
  const unmatched = [];
  for (const [letter, info] of csvByLetter.entries()) {
    const amount = typeof info === 'object' && info !== null ? info.amount : info;
    let opp = byQuoteNumber.get(letter);
    if (!opp) {
      const oppId = letterToOppId.get(letter);
      if (oppId && oppById.has(oppId)) opp = oppById.get(oppId);
    }
    if (!opp) { unmatched.push({ letter, amount }); continue; }
    const oldVal = Number(opp.quoted_amount || 0);
    // Update only if different
    if (!Number.isFinite(oldVal) || Math.abs(oldVal - amount) > 0.009) {
      changes.push({ id: opp.id, title: opp.title, quote_number: letter, old: oldVal, new: amount, created_at: opp.created_at });
    }
  }

  // Report
  console.log(`Proposed updates: ${changes.length}`);
  console.log(`Unmatched (by Letter #): ${unmatched.length}`);
  const reportPath = path.resolve(process.cwd(), 'imports', 'quoted_amount_update_report.csv');
  const header = 'id,title,quote_number,created_at,old_quoted_amount,new_quoted_amount\n';
  const body = changes.map(c => [c.id, JSON.stringify(c.title || ''), JSON.stringify(c.quote_number || ''), c.created_at, c.old, c.new].join(','));
  fs.writeFileSync(reportPath, header + body.join('\n'));
  console.log('Report written:', reportPath);
  if (unmatched.length) {
    const unmatchedPath = path.resolve(process.cwd(), 'imports', 'quoted_amount_unmatched.csv');
    const uh = 'letter_number,amount\n';
    const ub = unmatched.map(u => [JSON.stringify(u.letter), u.amount].join(','));
    fs.writeFileSync(unmatchedPath, uh + ub.join('\n'));
    console.log('Unmatched written:', unmatchedPath);
  }

  if (!applyChanges) {
    console.log('DRY RUN complete. Re-run with --apply to commit changes.');
    return;
  }

  // Apply updates in small batches
  const batchSize = 200;
  let success = 0, failed = 0;
  for (let i = 0; i < changes.length; i += batchSize) {
    const batch = changes.slice(i, i + batchSize);
    for (const row of batch) {
      const { error } = await supabase
        .schema('business')
        .from('opportunities')
        .update({ quoted_amount: row.new })
        .eq('id', row.id);
      if (error) {
        failed++;
        console.warn('Update failed:', row.id, error.message);
      } else {
        success++;
      }
    }
  }
  console.log(`APPLY complete. Success: ${success}, Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


