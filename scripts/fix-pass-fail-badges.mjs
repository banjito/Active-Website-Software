#!/usr/bin/env node
/**
 * One-time batch fix: add pass/fail/limited badge classes + fix polluting print CSS.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_DIR = path.join(ROOT, 'src/components/reports');

function walkReports(dir = REPORTS_DIR) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkReports(full));
    else if (/\.(tsx|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function filesMatching(reports, pattern) {
  return reports.filter((file) => pattern.test(fs.readFileSync(file, 'utf8')));
}

const IMPORT_LINE = "import { getPassFailBadgeClass } from '@/lib/reportPassFailStatus';";

const BADGE_VARIANT_RULES = `
      .pass-fail-status-box.pass {
        background-color: #22c55e !important;
        border-color: #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.fail {
        background-color: #ef4444 !important;
        border-color: #dc2626 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.limited {
        background-color: #eab308 !important;
        border-color: #ca8a04 !important;
        color: #111827 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }`;

function detectStatusExpr(snippet) {
  if (/formData\.status/.test(snippet)) return 'formData.status';
  if (/\bstatus === ['"]PASS['"]/.test(snippet) || /\{status\b/.test(snippet)) return 'status';
  return 'formData.status';
}

function ensureImport(content) {
  if (content.includes('reportPassFailStatus')) return content;
  const lines = content.split('\n');
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import .+ from ['"]/.test(lines[i])) lastImport = i;
  }
  if (lastImport >= 0) {
    lines.splice(lastImport + 1, 0, IMPORT_LINE);
    return lines.join('\n');
  }
  return IMPORT_LINE + '\n' + content;
}

function fixBadgeClassNames(content) {
  let updated = content;
  const patterns = [
    /className="pass-fail-status-box"/g,
    /className="mt-1 inline-block pass-fail-status-box"/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(updated)) !== null) {
      const idx = match.index;
      const snippet = updated.slice(idx, idx + 900);
      const statusExpr = detectStatusExpr(snippet);
      const replacement =
        match[0] === 'className="pass-fail-status-box"'
          ? `className={\`pass-fail-status-box \${getPassFailBadgeClass(${statusExpr})}\`}`
          : `className={\`mt-1 inline-block pass-fail-status-box \${getPassFailBadgeClass(${statusExpr})}\`}`;
      updated = updated.slice(0, idx) + replacement + updated.slice(idx + match[0].length);
      pattern.lastIndex = idx + replacement.length;
    }
  }
  return updated;
}

function fixPollutingPrintCss(content) {
  // Remove forced green from base .pass-fail-status-box when background is hardcoded green
  const pollutingBlock = /\.pass-fail-status-box\s*\{[^}]*background-color:\s*#22c55e\s*!important;[^}]*\}/gs;
  if (!pollutingBlock.test(content)) return content;

  return content.replace(pollutingBlock, (block) => {
    const layoutOnly = block
      .replace(/\s*background-color:\s*#22c55e\s*!important;\s*/g, '\n        ')
      .replace(/\s*border:\s*2px solid #16a34a\s*!important;\s*/g, '\n        ')
      .replace(/\s*color:\s*white\s*!important;\s*/g, '\n        ');

    if (content.includes('.pass-fail-status-box.pass')) {
      return layoutOnly;
    }
    return layoutOnly + BADGE_VARIANT_RULES;
  });
}

const allReports = walkReports();

const badgeFiles = [
  ...new Set([
    ...filesMatching(allReports, /className="pass-fail-status-box"/),
    ...filesMatching(allReports, /className="mt-1 inline-block pass-fail-status-box"/),
  ]),
];
const polluterFiles = filesMatching(
  allReports,
  /\.pass-fail-status-box\s*\{[^}]*background-color:\s*#22c55e\s*!important;/s
);

let badgeFixed = 0;
for (const file of badgeFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  const before = content;
  content = fixBadgeClassNames(content);
  if (content !== before) {
    content = ensureImport(content);
    fs.writeFileSync(file, content);
    badgeFixed++;
    console.log('badge:', path.relative(ROOT, file));
  }
}

let cssFixed = 0;
for (const file of polluterFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  const before = content;
  content = fixPollutingPrintCss(content);
  if (content !== before) {
    fs.writeFileSync(file, content);
    cssFixed++;
    console.log('css:', path.relative(ROOT, file));
  }
}

// Remove duplicate print CSS block from Thermal Magnetic MTS (now in util / ReportWrapper)
const mtsFile = path.join(REPORTS_DIR, 'LowVoltageCircuitBreakerThermalMagneticMTSReport.tsx');
if (fs.existsSync(mtsFile)) {
  let mts = fs.readFileSync(mtsFile, 'utf8');
  const dupBlock = /\n\s*\/\* PASS\/FAIL badge — must beat global[\s\S]*?\.pass-fail-status-box\.limited \{[\s\S]*?\}\n/;
  if (dupBlock.test(mts)) {
    mts = mts.replace(dupBlock, '\n');
    if (!mts.includes('getPassFailBadgeClass')) {
      mts = ensureImport(mts);
    }
    mts = mts.replace(
      /className=\{`pass-fail-status-box \$\{formData\.status === 'FAIL' \? 'fail' : formData\.status === 'LIMITED SERVICE' \? 'limited' : 'pass'\}`\}/,
      'className={`pass-fail-status-box ${getPassFailBadgeClass(formData.status)}`}'
    );
    fs.writeFileSync(mtsFile, mts);
    console.log('mts: deduped local print CSS');
  }
}

// Normalize already-fixed reports to use helper (optional cleanup)
const alreadyFixed = allReports.filter((file) =>
  /pass-fail-status-box \$\{formData\.status === 'FAIL' \? 'fail'/.test(fs.readFileSync(file, 'utf8'))
);

for (const file of alreadyFixed) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;
  content = content.replace(
    /className=\{`([^`]*pass-fail-status-box)\s*\$\{formData\.status === 'FAIL' \? 'fail' : formData\.status === 'LIMITED SERVICE' \? 'limited' : 'pass'\}`\}/g,
    'className={`$1 ${getPassFailBadgeClass(formData.status)}`}'
  );
  content = content.replace(
    /className=\{`([^`]*pass-fail-status-box)\s*\$\{status === 'FAIL' \? 'fail' : 'pass'\}`\}/g,
    'className={`$1 ${getPassFailBadgeClass(status)}`}'
  );
  if (content !== before) {
    content = ensureImport(content);
    fs.writeFileSync(file, content);
    console.log('normalize:', path.relative(ROOT, file));
  }
}

console.log(`Done. badge files: ${badgeFixed}, css files: ${cssFixed}`);
