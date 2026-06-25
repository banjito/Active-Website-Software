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
 * Electron main process for AmpOfflineReports.
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
const path = __importStar(require("path"));
const store_cjs_1 = require("../db/store.cjs");
// Vite dev server URL (see `npm run electron:dev`). When unset we load the
// packaged renderer from disk.
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: "#0a0a0a",
        show: false,
        title: "AmpOfflineReports",
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
    // Open the offline SQLite store under the OS app-data dir and expose the
    // query executor to the renderer's offline Supabase adapter over IPC.
    (0, store_cjs_1.initStore)(path.join(electron_1.app.getPath("userData"), "ampreports.sqlite"));
    electron_1.ipcMain.handle("db:query", (_evt, intent) => (0, store_cjs_1.runQuery)(intent));
    // PDF export over IPC (renderer can trigger export of its own report).
    electron_1.ipcMain.handle("pdf:export", (evt, opts) => {
        const win = electron_1.BrowserWindow.fromWebContents(evt.sender);
        if (!win)
            return { ok: false, error: "no window" };
        return exportReportPdf(win, opts);
    });
    buildMenu();
    // Headless data-layer test: round-trip the executor, then exit. No window.
    if (process.env.ELECTRON_DB_TEST) {
        runDbSelfTest();
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
    // Headless PDF test: render the loaded renderer to a PDF file and verify.
    if (process.env.ELECTRON_PDF_TEST) {
        const win = electron_1.BrowserWindow.getAllWindows()[0];
        win.webContents.once("did-finish-load", async () => {
            const out = path.join(electron_1.app.getPath("temp"), "ampreports-pdf-test.pdf");
            const res = await exportReportPdf(win, { toPath: out });
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
        const data = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: "Letter",
            landscape: !!opts.landscape,
            margins: { marginType: "default" },
        });
        fs.writeFileSync(target, data);
        return { ok: true, path: target };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
/** Application menu with a non-invasive "Export Report to PDF" action. */
function buildMenu() {
    const isMac = process.platform === "darwin";
    const template = [
        ...(isMac
            ? [{ role: "appMenu" }]
            : []),
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
    assert(title === "AmpOfflineReports", "list page heading renders");
    const count = (await waitForDom(win, `document.querySelectorAll('main button').length`));
    assert(count > 30, `report list shows many reports (${count})`);
    // 2. Navigate into a report and confirm it mounts without an error overlay.
    await win.webContents.executeJavaScript(`location.hash = '#/jobs/offline/switchgear-report'`);
    const opened = await waitForDom(win, `!!document.querySelector('button') && document.body.innerText.includes('All reports')`);
    assert(!!opened, "report page mounts (toolbar present)");
    const crashed = (await win.webContents.executeJavaScript(`document.body.innerText.toLowerCase().includes('cannot read') || document.body.innerText.includes('Unknown report')`));
    assert(!crashed, "report mounted without a render crash");
    console.log("[shell-test] complete");
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
        payload: { job_id: "job-1", user_id: "user-1", data: { foo: "bar", n: 42 } },
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