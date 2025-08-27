/*
  Importer + Component Regression (Dry-Run)
  - Runs selected JSON fixtures through ReportImportService
  - Monkey-patches BaseImporter.insertReport to avoid DB writes and capture prepared payloads
  - Validates presence/shape of key fields expected by corresponding components

  Run:
    npm run regression
*/

import path from 'node:path';
import fs from 'node:fs/promises';

type AnyObject = Record<string, any>;

const ROOT = path.resolve(process.cwd());
const FIXTURES_DIR = path.join(ROOT, 'json imports');

// Helper: safe deep-get
const get = (obj: AnyObject, p: string): any => p.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), obj);

// Load modules dynamically via tsx loader (npm script uses npx tsx)
const importModules = async () => {
  const baseImporterMod = await import(path.join(ROOT, 'src/services/reportImport/BaseImporter.ts'));
  const serviceMod = await import(path.join(ROOT, 'src/services/reportImport/index.ts'));
  return { BaseImporter: baseImporterMod.BaseImporter, reportImportService: serviceMod.reportImportService };
};

// Monkey-patch insertReport to dry-run prepareData and return payload instead of writing to DB
const enableDryRun = (BaseImporter: any) => {
  const original = BaseImporter.prototype.insertReport;
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  BaseImporter.prototype.insertReport = async function (data: AnyObject, jobId: string, userId: string) {
    // Use fallback schema to avoid live DB schema calls
    const schema = (this as any).getFallbackSchema ? (this as any).getFallbackSchema() : await (this as any).getSchema();
    const prepared = (this as any).prepareData(data, jobId, userId, schema);
    let routeSlug: string;
    try {
      routeSlug = (this as any).getReportType.length > 0 ? (this as any).getReportType(data) : (this as any).getReportType();
    } catch {
      routeSlug = (this as any).getReportType();
    }
    return { success: true, reportId: 'dry-run', reportType: routeSlug, prepared };
  };
  return () => {
    BaseImporter.prototype.insertReport = original;
  };
};

// Validators per fixture (loosely assert critical fields we recently fixed)
type Validator = (prepared: AnyObject) => { pass: boolean; details?: string };

const anyOfPaths = (obj: AnyObject, paths: string[]): boolean => paths.some(p => get(obj, p) !== undefined);

const validators: Record<string, Validator> = {
  'LowVoltageCircuitBreakerThermalMagneticMTSReport-2345234.amp-report.json': (p) => {
    const okVM = anyOfPaths(p, ['report_info.visualInspectionItems', 'visual_inspection.items']);
    const okIR = anyOfPaths(p, ['report_info.insulationResistance', 'electrical_tests.insulationResistance']);
    const okPI = anyOfPaths(p, ['report_info.primaryInjection', 'electrical_tests.primaryInjection']);
    const pass = !!(okVM && okIR && okPI);
    return { pass, details: `VM:${okVM} IR:${okIR} PI:${okPI}` };
  },
  'LowVoltageCircuitBreakerThermalMagneticATSReport-23452345.amp-report.json': (p) => {
    const okPI = anyOfPaths(p, ['electrical_tests.primaryInjection', 'report_info.primaryInjection']);
    return { pass: okPI, details: `PI:${okPI}` };
  },
  '3-LowVoltageCableMTS-5322.amp-report.json': (p) => {
    const okSizeNorm = JSON.stringify(p).includes('#14') || JSON.stringify(p).includes('AWG');
    const okReadings = anyOfPaths(p, ['data.testSets', 'electrical_tests.testSets']);
    return { pass: okSizeNorm && okReadings, details: `size:${okSizeNorm} sets:${okReadings}` };
  },
  '3-LowVoltageCableATS-3.amp-report.json': (p) => {
    const okSizeNorm = JSON.stringify(p).includes('#14') || JSON.stringify(p).includes('AWG');
    const okSets = anyOfPaths(p, ['data.testSets', 'electrical_tests.testSets']);
    return { pass: okSizeNorm && okSets, details: `size:${okSizeNorm} sets:${okSets}` };
  },
  'LowVoltageSwitchMultiDeviceTest-980.amp-report.json': (p) => {
    const rows = get(p, 'data.contactResistance.rows') || get(p, 'electrical_tests.contactResistance.rows') || [];
    const hasPhaseTriplets = Array.isArray(rows) && rows.some((r: AnyObject) => 'sw_p1' in r && 'fu_p2' in r && 'sf_p3' in r);
    return { pass: hasPhaseTriplets, details: `rows:${rows.length}` };
  },
  'Medium Voltage Cable VLF Test With Tan Delta MTS-7.amp-report.json': (p) => {
    const okConclusion = JSON.stringify(p).toLowerCase().includes('conclusion');
    const okRecs = JSON.stringify(p).toLowerCase().includes('recommend');
    const okAmpIds = JSON.stringify(p).toLowerCase().includes('ampid');
    return { pass: okConclusion && okRecs && okAmpIds, details: `conclusion:${okConclusion} recs:${okRecs} ampIds:${okAmpIds}` };
  },
  'PanelboardReport-UNSET.amp-report.json': (p) => {
    const hasSplit = anyOfPaths(p, ['report_info', 'visual_mechanical', 'insulation_resistance', 'contact_resistance']);
    return { pass: hasSplit, details: `splitCols:${hasSplit}` };
  },
  'SwitchgearReport-45234.amp-report.json': (p) => {
    const te = JSON.stringify(p).toLowerCase();
    const hasSerial = te.includes('serial');
    const hasAmpId = te.includes('ampid');
    return { pass: hasSerial && hasAmpId, details: `serial:${hasSerial} ampId:${hasAmpId}` };
  },
  'SwitchgearPanelboardMTSReport-34252345.amp-report.json': (p) => {
    const te = JSON.stringify(p).toLowerCase();
    const hasSerial = te.includes('serial');
    const hasAmpId = te.includes('ampid');
    return { pass: hasSerial && hasAmpId, details: `serial:${hasSerial} ampId:${hasAmpId}` };
  },
};

const TARGETS = Object.keys(validators);

const readJSON = async (file: string) => {
  const full = path.join(FIXTURES_DIR, file);
  const txt = await fs.readFile(full, 'utf-8');
  return JSON.parse(txt);
};

const run = async () => {
  const { BaseImporter, reportImportService } = await importModules();
  const restore = enableDryRun(BaseImporter);
  try {
    const results: { file: string; pass: boolean; details?: string }[] = [];
    for (const file of TARGETS) {
      try {
        const data = await readJSON(file);
        const res: AnyObject = await reportImportService.importReport(data, '00000000-0000-0000-0000-000000000000', 'dry-run-user');
        if (!res?.success) {
          results.push({ file, pass: false, details: res?.error || 'import failed' });
          continue;
        }
        const prepared = res.prepared || {};
        const { pass, details } = validators[file](prepared);
        results.push({ file, pass, details });
      } catch (e: any) {
        results.push({ file, pass: false, details: e?.message || String(e) });
      }
    }

    const passed = results.filter(r => r.pass).length;
    const failed = results.length - passed;
    // Pretty print
    console.log('\nImporter Regression (dry-run)');
    console.log('================================');
    results.forEach(r => {
      console.log(`${r.pass ? '✅' : '❌'} ${r.file} ${r.details ? `- ${r.details}` : ''}`);
    });
    console.log('--------------------------------');
    console.log(`Passed: ${passed} / ${results.length}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    restore();
  }
};

run().catch(err => {
  console.error('Regression run failed:', err);
  process.exitCode = 1;
});



