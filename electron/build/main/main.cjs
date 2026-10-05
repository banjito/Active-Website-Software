"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Electron main process for ampOS Offline.
 *
 * Phase 0: boot a BrowserWindow that loads the existing Vite renderer
 * (the full ampOS React app) so we can confirm the ~60 report components
 * render unchanged inside Electron/Chromium. In dev it loads the running
 * Vite dev server; in a packaged build it loads the bundled dist/index.html.
 *
 * Later phases add: IPC for the SQLite query executor, the sync engine,
 * offline auth via safeStorage, and printToPDF report export.
 */
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const store_cjs_1 = require("../db/store.cjs");
// Vite dev server URL (see `npm run electron:dev`). When unset we load the
// packaged renderer from disk.
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;
electron_1.app.setName("ampOS Offline");
let mainWindow = null;
function getBuildResourcePath(fileName) {
    return [
        path.join(__dirname, "../../../build-resources", fileName),
        path.join(process.resourcesPath, "build-resources", fileName),
    ].find((candidate) => fs.existsSync(candidate));
}
function updateDockIcon() {
    if (process.platform !== "darwin")
        return;
    const preferredIcon = electron_1.nativeTheme.shouldUseDarkColors
        ? "icon-dark.png"
        : "icon.png";
    const iconPath = getBuildResourcePath(preferredIcon) ?? getBuildResourcePath("icon.png");
    if (!iconPath)
        return;
    electron_1.app.dock?.setIcon(electron_1.nativeImage.createFromPath(iconPath).resize({ width: 256, height: 256 }));
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: "#f5f5f5", // neutral-100, the app's (light-only) page color
        show: false,
        title: "ampOS Offline",
        webPreferences: {
            preload: path.join(__dirname, "../preload/preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    // Show only once the renderer has painted to avoid a white flash.
    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
        // CI/headless smoke test: confirm the window booted, then exit cleanly.
        if (process.env.ELECTRON_SMOKE_TEST) {
            console.log("[smoke] window ready-to-show; exiting OK");
            setTimeout(() => electron_1.app.quit(), 800);
        }
    });
    // Open target=_blank / external links in the user's browser, not a new window.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            void electron_1.shell.openExternal(url);
        }
        return { action: "deny" };
    });
    if (DEV_SERVER_URL) {
        void mainWindow.loadURL(DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    else {
        // Packaged build: renderer is emitted to electron/renderer-dist by
        // `vite build --config vite.config.electron.ts`. __dirname here is
        // electron/build/main, so step up two levels.
        void mainWindow.loadFile(path.join(__dirname, "../../renderer-dist/index.html"));
    }
    // Surface renderer console + load failures during tests/dev.
    if (process.env.ELECTRON_SHELL_TEST || process.env.ELECTRON_DEBUG) {
        mainWindow.webContents.on("console-message", (_e, _lvl, msg) => console.log("[renderer]", msg));
        mainWindow.webContents.on("did-fail-load", (_e, code, desc) => console.log("[did-fail-load]", code, desc));
    }
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(() => {
    updateDockIcon();
    electron_1.nativeTheme.on("updated", updateDockIcon);
    // Open the offline SQLite store under the OS app-data dir and expose the
    // query executor to the renderer's offline Supabase adapter over IPC.
    // The workflow test writes reports, so it gets a throwaway database instead
    // of the real one in userData.
    const dbPath = process.env.ELECTRON_WORKFLOW_TEST
        ? path.join(electron_1.app.getPath("temp"), `ampreports-workflow-test-${Date.now()}.sqlite`)
        : path.join(electron_1.app.getPath("userData"), "ampreports.sqlite");
    (0, store_cjs_1.initStore)(dbPath);
    electron_1.ipcMain.handle("db:query", (_evt, intent) => (0, store_cjs_1.runQuery)(intent));
    // PDF export over IPC (renderer can trigger export of its own report).
    electron_1.ipcMain.handle("pdf:export", (evt, opts) => {
        const win = electron_1.BrowserWindow.fromWebContents(evt.sender);
        if (!win)
            return { ok: false, error: "no window" };
        return exportReportPdf(win, opts);
    });
    // Export saved reports as one .amp-report file for the main app's importer.
    electron_1.ipcMain.handle("reports:export", (evt, opts) => {
        const win = electron_1.BrowserWindow.fromWebContents(evt.sender);
        if (!win)
            return { ok: false, error: "no window" };
        return exportReportsBundle(win, opts?.assetIds ?? []);
    });
    buildMenu();
    // Headless data-layer test: round-trip the executor, then exit. No window.
    if (process.env.ELECTRON_DB_TEST) {
        runDbSelfTest();
        return;
    }
    // Headless export test: bundle EVERY saved report into the given file
    // without marking anything exported, check the file, then exit.
    if (process.env.ELECTRON_EXPORT_TEST) {
        void runExportSelfTest(process.env.ELECTRON_EXPORT_TEST);
        return;
    }
    createWindow();
    // Headless shell test: boot the offline shell, confirm the report list
    // renders, then navigate into a report and confirm it mounts.
    if (process.env.ELECTRON_SHELL_TEST) {
        const win = electron_1.BrowserWindow.getAllWindows()[0];
        win.webContents.once("did-finish-load", () => {
            void runShellSelfTest(win);
        });
    }
    // Headless all-reports sweep: open every registered report and confirm it
    // mounts without a render crash (see runAllReportsTest).
    // Headless end-to-end test of what a tech actually does: start a report,
    // type, autosave, find it on the home screen, reopen it, export the PDF and
    // the .amp-report file (see runWorkflowTest).
    if (process.env.ELECTRON_WORKFLOW_TEST) {
        const win = electron_1.BrowserWindow.getAllWindows()[0];
        win.webContents.once("did-finish-load", () => {
            void runWorkflowTest(win, dbPath);
        });
    }
    if (process.env.ELECTRON_ALL_REPORTS_TEST) {
        const win = electron_1.BrowserWindow.getAllWindows()[0];
        win.webContents.once("did-finish-load", () => {
            void runAllReportsTest(win);
        });
    }
    // Headless PDF test: render the loaded renderer to a PDF file and verify.
    if (process.env.ELECTRON_PDF_TEST) {
        const win = electron_1.BrowserWindow.getAllWindows()[0];
        win.webContents.once("did-finish-load", async () => {
            // ELECTRON_PDF_TEST_HASH exports a specific report, e.g.
            // "#/jobs/offline/<slug>/<id>"; ELECTRON_PDF_TEST_OUT sets the file.
            const out = process.env.ELECTRON_PDF_TEST_OUT ||
                path.join(electron_1.app.getPath("temp"), "ampreports-pdf-test.pdf");
            const res = await exportReportPdf(win, {
                toPath: out,
                hash: process.env.ELECTRON_PDF_TEST_HASH,
            });
            const bytes = res.ok && fs.existsSync(out) ? fs.readFileSync(out) : Buffer.alloc(0);
            const isPdf = bytes.length > 0 && bytes.subarray(0, 5).toString() === "%PDF-";
            console.log(`${isPdf ? "PASS" : "FAIL"}: printToPDF wrote a valid PDF (${bytes.length} bytes)`);
            if (!isPdf)
                process.exitCode = 1;
            console.log("[pdf-test] complete");
            electron_1.app.quit();
        });
    }
    electron_1.app.on("activate", () => {
        // macOS: re-create a window when the dock icon is clicked and none are open.
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
/**
 * Render the given window's current report to a PDF file. Electron's
 * printToPDF applies print-media emulation, so the reports' existing
 * `print:hidden`/`print:block` Tailwind classes yield a clean print layout
 * without any per-report changes. `landscape` is passed for wide-table reports.
 */
async function exportReportPdf(win, opts = {}) {
    let probeResult;
    try {
        let target = opts.toPath;
        if (!target) {
            const res = await electron_1.dialog.showSaveDialog(win, {
                title: "Export Report to PDF",
                defaultPath: `${opts.defaultName || "report"}.pdf`,
                filters: [{ name: "PDF", extensions: ["pdf"] }],
            });
            if (res.canceled || !res.filePath)
                return { ok: false, error: "canceled" };
            target = res.filePath;
        }
        const exportWindow = new electron_1.BrowserWindow({
            width: 1024,
            height: 1325,
            show: false,
            backgroundColor: "#ffffff",
            webPreferences: {
                preload: path.join(__dirname, "../preload/preload.cjs"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
            },
        });
        try {
            const currentUrl = new URL(win.webContents.getURL());
            const exportSearch = opts.search || "export=pdf&print=true";
            const hashSource = opts.hash || currentUrl.hash || "#/";
            const hashWithoutMarker = hashSource.startsWith("#")
                ? hashSource.slice(1)
                : hashSource;
            const hashPath = hashWithoutMarker.split("?")[0] || "/";
            currentUrl.hash = `${hashPath}?${exportSearch}`;
            await exportWindow.loadURL(currentUrl.toString());
            // The page "loads" long before the report does: it still has to fetch
            // its saved data and lay itself out. Printing right away caught reports
            // half-drawn. Wait for the report container, then for the page to stop
            // changing for a moment (capped), then for fonts.
            await exportWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          document.documentElement.style.background = '#ffffff';
          document.body.style.background = '#ffffff';
          const started = Date.now();
          const settle = () => {
            let quiet;
            const done = () => { observer.disconnect(); resolve(); };
            const observer = new MutationObserver(() => {
              clearTimeout(quiet);
              quiet = setTimeout(done, 800);
            });
            observer.observe(document.body, {
              subtree: true, childList: true, attributes: true, characterData: true,
            });
            quiet = setTimeout(done, 800);
            setTimeout(done, 10000);
          };
          const waitForReport = () => {
            if (document.getElementById('report-container')) settle();
            else if (Date.now() - started > 15000) resolve();
            else setTimeout(waitForReport, 100);
          };
          waitForReport();
        }).then(() => document.fonts.ready).then(() => true);
      `);
            if (opts.probe) {
                probeResult = await exportWindow.webContents.executeJavaScript(opts.probe);
            }
            const data = await exportWindow.webContents.printToPDF({
                printBackground: true,
                pageSize: "Letter",
                landscape: !!opts.landscape,
                // Reports set their own page (ReportWrapper's @page: Letter, 0.25in
                // sides/top, 0.35in bottom), the same one the main app prints with.
                // Electron ignores it unless told to, and its 1cm default margins
                // narrowed every page and squeezed wide tables.
                preferCSSPageSize: true,
                margins: { top: 0.25, bottom: 0.35, left: 0.25, right: 0.25 },
            });
            fs.writeFileSync(target, data);
        }
        finally {
            exportWindow.destroy();
        }
        return { ok: true, path: target, probe: probeResult };
    }
    catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
/** Must match OFFLINE_BUNDLE_FORMAT in src/services/reportImport/offlineBundle.ts. */
const BUNDLE_FORMAT = "amp-report-bundle";
const BUNDLE_VERSION = 1;
/**
 * Writes the chosen saved reports to one .amp-report file. Each report carries
 * its own stored rows exactly as the report components saved them (they are
 * the same rows the main app saves), plus its name/status. The main app's job
 * page imports the file and re-files the rows under that job. The shape is a
 * batch of row changes on purpose, so a future live sync can reuse it.
 */
async function exportReportsBundle(win, assetIds, opts = {}) {
    try {
        const found = (0, store_cjs_1.runQuery)({
            op: "select",
            schema: "neta_ops",
            table: "assets",
            columns: "*",
            filters: [{ col: "id", op: "in", val: assetIds }],
        });
        if (found.error)
            throw new Error(found.error.message);
        const assets = (found.data ?? []);
        const picked = assets.flatMap((asset) => {
            const m = /^report:\/jobs\/[^/]+\/([^/]+)\/([^/?#]+)/.exec(String(asset.file_url ?? ""));
            return m ? [{ asset, slug: m[1], reportId: m[2] }] : [];
        });
        const rows = (0, store_cjs_1.rowsForReports)(picked.map((p) => p.reportId));
        const skipped = [];
        const exportedAssetIds = [];
        const reports = picked.flatMap(({ asset, slug, reportId }) => {
            const own = rows.get(reportId) ?? [];
            if (!own.some((r) => r.row.id === reportId)) {
                // Opened but never saved: there is no report data to send.
                skipped.push(String(asset.name ?? reportId));
                return [];
            }
            exportedAssetIds.push(String(asset.id));
            return [
                {
                    reportId,
                    slug,
                    asset: {
                        name: asset.name ?? null,
                        status: asset.status ?? null,
                        template_type: asset.template_type ?? null,
                        created_at: asset.created_at ?? null,
                        updated_at: asset.updated_at ?? null,
                    },
                    // The report's own row first, then any child rows.
                    rows: [...own].sort((a, b) => Number(b.row.id === reportId) - Number(a.row.id === reportId)),
                },
            ];
        });
        if (!reports.length) {
            return { ok: false, error: "None of the selected reports have saved data yet.", skipped };
        }
        let target = opts.toPath;
        if (!target) {
            const date = new Date().toISOString().slice(0, 10);
            const base = reports.length === 1
                ? String(reports[0].asset.name || reports[0].slug)
                : `ampOS Offline - ${reports.length} reports - ${date}`;
            const dialogOpts = {
                title: "Export reports",
                defaultPath: `${base.replace(/[\\/:*?"<>|]+/g, "-")}.amp-report`,
                filters: [{ name: "ampOS report file", extensions: ["amp-report"] }],
            };
            const res = win
                ? await electron_1.dialog.showSaveDialog(win, dialogOpts)
                : await electron_1.dialog.showSaveDialog(dialogOpts);
            if (res.canceled || !res.filePath)
                return { ok: false, error: "canceled" };
            target = res.filePath;
        }
        const bundle = {
            format: BUNDLE_FORMAT,
            version: BUNDLE_VERSION,
            exportedAt: new Date().toISOString(),
            source: {
                app: "ampOS Offline",
                appVersion: electron_1.app.getVersion(),
                computer: os.hostname(),
            },
            reports,
        };
        fs.writeFileSync(target, JSON.stringify(bundle, null, 2));
        if (opts.markExported !== false) {
            (0, store_cjs_1.runQuery)({
                op: "update",
                schema: "neta_ops",
                table: "assets",
                filters: [{ col: "id", op: "in", val: exportedAssetIds }],
                payload: { exported_at: bundle.exportedAt },
            });
        }
        return { ok: true, path: target, count: reports.length, skipped };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
/** Application menu with a non-invasive "Export Report to PDF" action. */
function buildMenu() {
    const isMac = process.platform === "darwin";
    const template = [
        ...(isMac ? [{ role: "appMenu" }] : []),
        {
            label: "File",
            submenu: [
                {
                    label: "Export Report to PDF…",
                    accelerator: "CmdOrCtrl+Shift+E",
                    click: (_item, win) => {
                        if (win)
                            void exportReportPdf(win);
                    },
                },
                { type: "separator" },
                isMac ? { role: "close" } : { role: "quit" },
            ],
        },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
/** Poll the renderer DOM until `expr` is truthy (or timeout). */
async function waitForDom(win, expr, timeoutMs = 15000) {
    const start = Date.now();
    for (;;) {
        const val = await win.webContents.executeJavaScript(`(()=>{try{return ${expr}}catch(e){return null}})()`);
        if (val)
            return val;
        if (Date.now() - start > timeoutMs)
            return val;
        await new Promise((r) => setTimeout(r, 250));
    }
}
/** Boots the offline shell, checks the list page, then opens a report. */
async function runShellSelfTest(win) {
    const assert = (cond, msg) => {
        console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
        if (!cond)
            process.exitCode = 1;
    };
    // 1. Report list renders with report buttons.
    const title = await waitForDom(win, `document.querySelector('h1')?.textContent`);
    assert(title === "ampOS Offline", "list page heading renders");
    await win.webContents.executeJavaScript(`location.hash = '#/new'`);
    const count = (await waitForDom(win, `document.querySelectorAll('main button').length > 30 && document.querySelectorAll('main button').length`));
    assert(count > 30, `report picker shows many reports (${count})`);
    // 2. Navigate into a report and confirm it mounts without an error overlay.
    await win.webContents.executeJavaScript(`location.hash = '#/jobs/offline/switchgear-report'`);
    const opened = await waitForDom(win, `!!document.querySelector('.electron-report-toolbar')`);
    assert(!!opened, "report page mounts (toolbar present)");
    const crashed = (await win.webContents.executeJavaScript(`document.body.innerText.toLowerCase().includes('cannot read') || document.body.innerText.includes('Unknown report')`));
    assert(!crashed, "report mounted without a render crash");
    console.log("[shell-test] complete");
    electron_1.app.quit();
}
/**
 * Opens EVERY registered report in turn and confirms it mounts without a render
 * crash. Slugs are read from the generated registry source so the sweep always
 * covers the full set. A crash surfaces as the ReportHost error boundary's
 * `[data-report-error]` marker; we also fail on a gone render process.
 */
async function runAllReportsTest(win) {
    const registryPath = path.join(process.cwd(), "electron/renderer/reportRegistry.tsx");
    const slugs = Array.from(fs.readFileSync(registryPath, "utf8").matchAll(/slug:\s*"([^"]+)"/g), (m) => m[1]);
    let processGone = false;
    win.webContents.once("render-process-gone", () => {
        processGone = true;
    });
    const failures = [];
    const empty = [];
    const stubs = [];
    for (const slug of slugs) {
        if (processGone)
            break;
        // Route through the list first so each report gets a clean remount.
        await win.webContents.executeJavaScript(`location.hash = '#/'`);
        await waitForDom(win, `!document.querySelector('.electron-report-toolbar')`);
        await win.webContents.executeJavaScript(`location.hash = '#/jobs/offline/${slug}'`);
        // Wait until the report host has rendered (toolbar present), then give
        // effects/data fetches a beat to run so a late throw still trips the boundary.
        await waitForDom(win, `!!document.querySelector('.electron-report-toolbar') || !!document.querySelector('[data-report-error]')`);
        await new Promise((r) => setTimeout(r, 200));
        const crashed = (await win.webContents.executeJavaScript(`!!document.querySelector('[data-report-error]') || document.body.innerText.includes('Unknown report')`));
        if (crashed) {
            failures.push(slug);
            continue;
        }
        // Guard against a report that mounts but renders nothing (blank form). The
        // toolbar alone is tiny; a real report form has substantial text/fields.
        // "coming soon" placeholders are intentional stubs (same in the web app),
        // so classify those separately rather than failing on them.
        const bodyLen = (await win.webContents.executeJavaScript(`document.body.innerText.trim().length`));
        const fields = (await win.webContents.executeJavaScript(`document.querySelectorAll('input, select, textarea, table').length`));
        const isStub = (await win.webContents.executeJavaScript(`document.body.innerText.toLowerCase().includes('coming soon')`));
        if (isStub)
            stubs.push(slug);
        else if (bodyLen < 200 && fields === 0)
            empty.push(`${slug}(len=${bodyLen})`);
    }
    const ok = !processGone && failures.length === 0 && empty.length === 0;
    console.log(`${failures.length === 0 ? "PASS" : "FAIL"}: ${slugs.length - failures.length}/${slugs.length} reports mounted without a crash`);
    console.log(`${empty.length === 0 ? "PASS" : "FAIL"}: ${slugs.length - empty.length - stubs.length}/${slugs.length - stubs.length} implemented reports rendered visible content (${stubs.length} 'coming soon' stubs skipped)`);
    if (empty.length)
        console.log(`FAIL: empty reports -> ${empty.join(", ")}`);
    if (stubs.length)
        console.log(`INFO: unimplemented stubs -> ${stubs.join(", ")}`);
    if (processGone)
        console.log("FAIL: render process gone during sweep");
    if (failures.length)
        console.log(`FAIL: crashed reports -> ${failures.join(", ")}`);
    if (!ok)
        process.exitCode = 1;
    console.log("[all-reports-test] complete");
    electron_1.app.quit();
}
/**
 * Walks the real field workflow on a throwaway database, typing with real
 * input events: new LV Breaker ATS 25 report, type Customer / Job # /
 * Comments, autosave, home list, reopen, PDF (checking the page the PDF is
 * printed from shows the data) and the .amp-report export.
 * Run with ELECTRON_WORKFLOW_TEST=1, plus ELECTRON_RENDERER_URL for the dev
 * server, or against a fresh electron:build:renderer output.
 */
async function runWorkflowTest(win, dbPath) {
    const assert = (cond, msg) => {
        console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
        if (!cond)
            process.exitCode = 1;
        return !!cond;
    };
    const finish = () => {
        console.log(`[workflow-test] database: ${dbPath}`);
        console.log("[workflow-test] complete");
        electron_1.app.quit();
    };
    const js = (code) => win.webContents.executeJavaScript(code);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const SLUG = "lv-molded-case-circuit-breaker-ats25";
    const CUSTOMER = `Workflow Test Co ${Date.now() % 100000}`;
    const JOB_NUMBER = "WF-1234";
    const COMMENT = "Typed by the workflow self-test.";
    const COMMENTS_BOX = `document.querySelector('textarea[placeholder^="Enter any comments"]')`;
    const byLabel = (label) => `[...document.querySelectorAll('label')].find((l) => l.textContent.trim().replace(/:$/, '') === ${JSON.stringify(label)})?.parentElement?.querySelector('input')`;
    // Focus the field, then type with real input events, the way a person would.
    const typeInto = async (target, text) => {
        const editable = await js(`(()=>{const el=${target}; if(!el||el.readOnly||el.disabled) return false; el.scrollIntoView({block:'center'}); el.focus(); return true;})()`);
        if (!editable)
            return false;
        await win.webContents.insertText(text);
        return js(`(${target})?.value === ${JSON.stringify(text)}`);
    };
    // 1. Fresh database: empty home screen.
    assert(
    // textContent, not innerText: the list may be folded shut (hidden) if the
    // tech collapsed it last time.
    await waitForDom(win, `document.getElementById('saved-reports-panel')?.textContent.includes('Nothing saved yet')`), "home shows an empty saved-reports list");
    // 2. New report.
    await js(`location.hash = '#/jobs/offline/${SLUG}'`);
    if (!assert(await waitForDom(win, `!!${COMMENTS_BOX}`, 30000), "new LV Breaker ATS 25 report opens ready to edit")) {
        return finish();
    }
    // 3. Type.
    assert(await typeInto(byLabel("Customer"), CUSTOMER), "Customer is typeable offline");
    assert(await typeInto(byLabel("Job #"), JOB_NUMBER), "Job # is typeable offline");
    assert(await typeInto(COMMENTS_BOX, COMMENT), "Comments is typeable");
    // 4. Autosave puts the new report's id in the address.
    const hash = (await waitForDom(win, `/^#\\/jobs\\/offline\\/${SLUG}\\/[0-9a-f-]{36}/.test(location.hash) && location.hash`, 20000));
    if (!assert(hash, "autosave saved the report and put its id in the address"))
        return finish();
    const reportId = hash.split("?")[0].split("/")[4];
    await sleep(3500); // let the debounced follow-up save catch everything typed
    // 5. It is really in the database.
    const saved = (0, store_cjs_1.runQuery)({
        op: "select",
        schema: "neta_ops",
        table: "lv_molded_case_circuit_breaker_ats25",
        columns: "*",
        filters: [{ col: "id", op: "eq", val: reportId }],
        modifier: "maybeSingle",
    }).data;
    assert(saved?.report_data?.customer === CUSTOMER, "Customer saved to the database");
    assert(saved?.report_data?.jobNumber === JOB_NUMBER, "Job # saved to the database");
    assert(saved?.report_data?.comments === COMMENT, "Comments saved to the database");
    // 6. Home lists it.
    await js(`location.hash = '#/'`);
    assert(await waitForDom(win, `document.querySelectorAll('#saved-reports-panel li').length === 1`), "home lists the saved report");
    // 7. Reopen: values come back from the database.
    await js(`location.hash = '#/jobs/offline/${SLUG}/${reportId}'`);
    assert(await waitForDom(win, `(${byLabel("Customer")})?.value === ${JSON.stringify(CUSTOMER)}`, 30000), "reopened report shows the saved Customer");
    // 8. PDF, checking the page it is printed from actually shows the data.
    const pdfPath = path.join(electron_1.app.getPath("temp"), "ampreports-workflow-test.pdf");
    const pdf = await exportReportPdf(win, {
        toPath: pdfPath,
        hash: `#/jobs/offline/${SLUG}/${reportId}`,
        probe: `[...document.querySelectorAll('input, textarea')].some((el) => el.value === ${JSON.stringify(CUSTOMER)}) || document.body.innerText.includes(${JSON.stringify(CUSTOMER)})`,
    });
    const bytes = pdf.ok && fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : Buffer.alloc(0);
    assert(bytes.subarray(0, 5).toString() === "%PDF-", `PDF exported (${pdfPath})`);
    assert(pdf.probe === true, "the page the PDF was printed from shows the saved data");
    // 9. .amp-report export.
    const fileUrl = `report:/jobs/offline/${SLUG}/${reportId}`;
    const assetOf = () => (0, store_cjs_1.runQuery)({
        op: "select",
        schema: "neta_ops",
        table: "assets",
        columns: "*",
        filters: [{ col: "file_url", op: "eq", val: fileUrl }],
        modifier: "maybeSingle",
    }).data;
    const asset = assetOf();
    if (!assert(asset?.id, "report is linked (has its asset row)"))
        return finish();
    const bundlePath = path.join(electron_1.app.getPath("temp"), "ampreports-workflow-test.amp-report");
    const exported = await exportReportsBundle(null, [asset.id], { toPath: bundlePath });
    assert(exported.ok && exported.count === 1, `.amp-report written (${bundlePath})`);
    if (exported.ok) {
        const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
        assert(bundle.reports?.[0]?.rows?.[0]?.row?.report_data?.customer === CUSTOMER, "export file carries the saved data");
        assert(assetOf()?.exported_at, "report is marked exported");
    }
    finish();
}
/** Bundles every saved report to `outPath` and checks the file's shape. */
async function runExportSelfTest(outPath) {
    const assert = (cond, msg) => {
        console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
        if (!cond)
            process.exitCode = 1;
    };
    const all = (0, store_cjs_1.runQuery)({
        op: "select",
        schema: "neta_ops",
        table: "assets",
        columns: "id",
        filters: [],
    });
    const ids = (all.data ?? []).map((a) => a.id);
    const res = await exportReportsBundle(null, ids, { toPath: outPath, markExported: false });
    assert(res.ok, `export wrote a file (${res.error ?? res.path})`);
    if (res.ok) {
        const bundle = JSON.parse(fs.readFileSync(outPath, "utf8"));
        assert(bundle.format === BUNDLE_FORMAT, "file has the bundle format marker");
        assert(bundle.reports.length === res.count, `${res.count} reports in file`);
        assert(bundle.reports.every((r) => r.rows[0]?.row?.id === r.reportId), "every report's own row comes first");
        if (res.skipped?.length)
            console.log(`INFO: skipped (no saved data) -> ${res.skipped.join(", ")}`);
    }
    console.log("[export-test] complete");
    electron_1.app.quit();
}
/** Round-trips the offline executor to verify the data layer end-to-end. */
function runDbSelfTest() {
    const assert = (cond, msg) => {
        console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
        if (!cond)
            process.exitCode = 1;
    };
    // 1. Insert a report (JSONB-blob style) and return the new row.
    const ins = (0, store_cjs_1.runQuery)({
        op: "insert",
        schema: "neta_ops",
        table: "switchgear_reports",
        filters: [],
        returning: true,
        modifier: "single",
        columns: "*",
        payload: {
            job_id: "job-1",
            user_id: "user-1",
            data: { foo: "bar", n: 42 },
        },
    });
    const inserted = ins.data;
    assert(!!inserted?.id, "insert returns generated id");
    assert(inserted?.data?.foo === "bar", "insert preserves nested JSON payload");
    // 2. Read it back by id with .single().
    const sel = (0, store_cjs_1.runQuery)({
        op: "select",
        schema: "neta_ops",
        table: "switchgear_reports",
        columns: "*",
        filters: [{ col: "id", op: "eq", val: inserted.id }],
        modifier: "single",
    });
    const got = sel.data;
    assert(got?.data?.n === 42, "select by id round-trips nested JSON");
    // 3. Update merges into the JSON blob.
    (0, store_cjs_1.runQuery)({
        op: "update",
        schema: "neta_ops",
        table: "switchgear_reports",
        filters: [{ col: "id", op: "eq", val: inserted.id }],
        payload: { status: "approved", data: { foo: "baz", n: 42 } },
    });
    const sel2 = (0, store_cjs_1.runQuery)({
        op: "select",
        schema: "neta_ops",
        table: "switchgear_reports",
        columns: "*",
        filters: [{ col: "id", op: "eq", val: inserted.id }],
        modifier: "single",
    });
    const upd = sel2.data;
    assert(upd?.status === "approved", "update sets scalar column");
    assert(upd?.data?.foo === "baz", "update merges JSON blob");
    // 4. Filter by job_id (scalar index) and project specific columns.
    const sel3 = (0, store_cjs_1.runQuery)({
        op: "select",
        schema: "common",
        table: "customers",
        columns: "name, company_name",
        filters: [{ col: "id", op: "eq", val: "c-1" }],
        modifier: "maybeSingle",
    });
    assert(sel3.error === null, "maybeSingle on empty table returns no error");
    assert(sel3.data === null, "maybeSingle on empty table returns null");
    console.log("[db-self-test] complete");
    electron_1.app.quit();
}
electron_1.app.on("window-all-closed", () => {
    // macOS apps typically stay active until the user quits explicitly.
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
//# sourceMappingURL=main.cjs.map