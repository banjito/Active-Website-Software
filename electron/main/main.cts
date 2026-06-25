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
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
} from "electron";
import * as fs from "fs";
import * as path from "path";
import { initStore, runQuery, type QueryIntent } from "../db/store.cjs";

// Vite dev server URL (see `npm run electron:dev`). When unset we load the
// packaged renderer from disk.
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

app.setName("ampOS Offline");

let mainWindow: BrowserWindow | null = null;

function getBuildResourcePath(fileName: string): string | undefined {
  return [
    path.join(__dirname, "../../../build-resources", fileName),
    path.join(process.resourcesPath, "build-resources", fileName),
  ].find((candidate) => fs.existsSync(candidate));
}

function updateDockIcon(): void {
  if (process.platform !== "darwin") return;

  const preferredIcon = nativeTheme.shouldUseDarkColors
    ? "icon-dark.png"
    : "icon.png";
  const iconPath =
    getBuildResourcePath(preferredIcon) ?? getBuildResourcePath("icon.png");
  if (!iconPath) return;

  app.dock?.setIcon(
    nativeImage.createFromPath(iconPath).resize({ width: 256, height: 256 }),
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0a0a0a",
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
      setTimeout(() => app.quit(), 800);
    }
  });

  // Open target=_blank / external links in the user's browser, not a new window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Packaged build: renderer is emitted to electron/renderer-dist by
    // `vite build --config vite.config.electron.ts`. __dirname here is
    // electron/build/main, so step up two levels.
    void mainWindow.loadFile(
      path.join(__dirname, "../../renderer-dist/index.html"),
    );
  }

  // Surface renderer console + load failures during tests/dev.
  if (process.env.ELECTRON_SHELL_TEST || process.env.ELECTRON_DEBUG) {
    mainWindow.webContents.on("console-message", (_e, _lvl, msg) =>
      console.log("[renderer]", msg),
    );
    mainWindow.webContents.on("did-fail-load", (_e, code, desc) =>
      console.log("[did-fail-load]", code, desc),
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  updateDockIcon();
  nativeTheme.on("updated", updateDockIcon);

  // Open the offline SQLite store under the OS app-data dir and expose the
  // query executor to the renderer's offline Supabase adapter over IPC.
  initStore(path.join(app.getPath("userData"), "ampreports.sqlite"));
  ipcMain.handle("db:query", (_evt, intent: QueryIntent) => runQuery(intent));

  // PDF export over IPC (renderer can trigger export of its own report).
  ipcMain.handle(
    "pdf:export",
    (evt, opts: { defaultName?: string; landscape?: boolean }) => {
      const win = BrowserWindow.fromWebContents(evt.sender);
      if (!win) return { ok: false, error: "no window" };
      return exportReportPdf(win, opts);
    },
  );

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
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.once("did-finish-load", () => {
      void runShellSelfTest(win);
    });
  }

  // Headless PDF test: render the loaded renderer to a PDF file and verify.
  if (process.env.ELECTRON_PDF_TEST) {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.once("did-finish-load", async () => {
      const out = path.join(app.getPath("temp"), "ampreports-pdf-test.pdf");
      const res = await exportReportPdf(win, { toPath: out });
      const bytes =
        res.ok && fs.existsSync(out) ? fs.readFileSync(out) : Buffer.alloc(0);
      const isPdf =
        bytes.length > 0 && bytes.subarray(0, 5).toString() === "%PDF-";
      console.log(
        `${isPdf ? "PASS" : "FAIL"}: printToPDF wrote a valid PDF (${bytes.length} bytes)`,
      );
      if (!isPdf) process.exitCode = 1;
      console.log("[pdf-test] complete");
      app.quit();
    });
  }

  app.on("activate", () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * Render the given window's current report to a PDF file. Electron's
 * printToPDF applies print-media emulation, so the reports' existing
 * `print:hidden`/`print:block` Tailwind classes yield a clean print layout
 * without any per-report changes. `landscape` is passed for wide-table reports.
 */
async function exportReportPdf(
  win: BrowserWindow,
  opts: {
    defaultName?: string;
    landscape?: boolean;
    toPath?: string;
    search?: string;
    hash?: string;
  } = {},
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    let target = opts.toPath;
    if (!target) {
      const res = await dialog.showSaveDialog(win, {
        title: "Export Report to PDF",
        defaultPath: `${opts.defaultName || "report"}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (res.canceled || !res.filePath)
        return { ok: false, error: "canceled" };
      target = res.filePath;
    }
    const exportWindow = new BrowserWindow({
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

      await exportWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          document.documentElement.style.background = '#ffffff';
          document.body.style.background = '#ffffff';
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
      `);

      const data = await exportWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "Letter",
        landscape: !!opts.landscape,
        margins: { marginType: "default" },
      });
      fs.writeFileSync(target, data);
    } finally {
      exportWindow.destroy();
    }
    return { ok: true, path: target };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Application menu with a non-invasive "Export Report to PDF" action. */
function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Export Report to PDF…",
          accelerator: "CmdOrCtrl+Shift+E",
          click: (_item, win) => {
            if (win) void exportReportPdf(win as BrowserWindow);
          },
        },
        { type: "separator" as const },
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },
    { role: "editMenu" as const },
    { role: "viewMenu" as const },
    { role: "windowMenu" as const },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Poll the renderer DOM until `expr` is truthy (or timeout). */
async function waitForDom(
  win: BrowserWindow,
  expr: string,
  timeoutMs = 15000,
): Promise<unknown> {
  const start = Date.now();
  for (;;) {
    const val = await win.webContents.executeJavaScript(
      `(()=>{try{return ${expr}}catch(e){return null}})()`,
    );
    if (val) return val;
    if (Date.now() - start > timeoutMs) return val;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Boots the offline shell, checks the list page, then opens a report. */
async function runShellSelfTest(win: BrowserWindow): Promise<void> {
  const assert = (cond: boolean, msg: string) => {
    console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
    if (!cond) process.exitCode = 1;
  };

  // 1. Report list renders with report buttons.
  const title = await waitForDom(
    win,
    `document.querySelector('h1')?.textContent`,
  );
  assert(title === "ampOS Offline", "list page heading renders");

  if (process.env.ELECTRON_CAPTURE) {
    await new Promise((r) => setTimeout(r, 700));
    const png = await win.webContents.capturePage();
    fs.writeFileSync("/tmp/shell-capture.png", png.toPNG());
  }
  const count = (await waitForDom(
    win,
    `document.querySelectorAll('main button').length`,
  )) as number;
  assert(count > 30, `report list shows many reports (${count})`);

  // 2. Navigate into a report and confirm it mounts without an error overlay.
  await win.webContents.executeJavaScript(
    `location.hash = '#/jobs/offline/switchgear-report'`,
  );
  const opened = await waitForDom(
    win,
    `!!document.querySelector('button') && document.body.innerText.includes('All reports')`,
  );
  assert(!!opened, "report page mounts (toolbar present)");
  const crashed = (await win.webContents.executeJavaScript(
    `document.body.innerText.toLowerCase().includes('cannot read') || document.body.innerText.includes('Unknown report')`,
  )) as boolean;
  assert(!crashed, "report mounted without a render crash");

  console.log("[shell-test] complete");
  app.quit();
}

/** Round-trips the offline executor to verify the data layer end-to-end. */
function runDbSelfTest(): void {
  const assert = (cond: boolean, msg: string) => {
    console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
    if (!cond) process.exitCode = 1;
  };

  // 1. Insert a report (JSONB-blob style) and return the new row.
  const ins = runQuery({
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
  const inserted = ins.data as { id?: string; data?: { foo?: string } } | null;
  assert(!!inserted?.id, "insert returns generated id");
  assert(inserted?.data?.foo === "bar", "insert preserves nested JSON payload");

  // 2. Read it back by id with .single().
  const sel = runQuery({
    op: "select",
    schema: "neta_ops",
    table: "switchgear_reports",
    columns: "*",
    filters: [{ col: "id", op: "eq", val: inserted!.id }],
    modifier: "single",
  });
  const got = sel.data as { data?: { n?: number } } | null;
  assert(got?.data?.n === 42, "select by id round-trips nested JSON");

  // 3. Update merges into the JSON blob.
  runQuery({
    op: "update",
    schema: "neta_ops",
    table: "switchgear_reports",
    filters: [{ col: "id", op: "eq", val: inserted!.id }],
    payload: { status: "approved", data: { foo: "baz", n: 42 } },
  });
  const sel2 = runQuery({
    op: "select",
    schema: "neta_ops",
    table: "switchgear_reports",
    columns: "*",
    filters: [{ col: "id", op: "eq", val: inserted!.id }],
    modifier: "single",
  });
  const upd = sel2.data as { status?: string; data?: { foo?: string } } | null;
  assert(upd?.status === "approved", "update sets scalar column");
  assert(upd?.data?.foo === "baz", "update merges JSON blob");

  // 4. Filter by job_id (scalar index) and project specific columns.
  const sel3 = runQuery({
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
  app.quit();
}

app.on("window-all-closed", () => {
  // macOS apps typically stay active until the user quits explicitly.
  if (process.platform !== "darwin") app.quit();
});
