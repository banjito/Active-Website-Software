/**
 * Build the Windows x64 offline app from macOS.
 *
 * Why this exists: @electron/rebuild keys its native-module cache on
 * arch + Electron ABI with NO platform (see build/Release/.forge-meta, e.g.
 * "x64--146"). So `electron-builder --mac` — whose x64 pass leaves a Mach-O
 * x86_64 in better-sqlite3/build/Release — makes a following
 * `--win nsis --x64` a cache HIT. The rebuild is skipped and the macOS binary
 * is packaged into the Windows installer, which then cannot open its database.
 * That shipped silently once; `file` on the packaged .node is the only tell.
 *
 * So: fetch the real win32-x64 prebuild, package with rebuild disabled, then
 * VERIFY the binary inside the .exe is PE32+ before anyone can publish it.
 * Restores the host (arm64) binary at the end so `npx electron .` still runs.
 *
 * Run: node scripts/build-offline-win.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqliteDir = path.join(root, "node_modules/better-sqlite3");
const relDir = path.join(sqliteDir, "build/Release");
const nodeFile = path.join(relDir, "better_sqlite3.node");

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const step = (m) => console.log(`\n\x1b[1m▶ ${m}\x1b[0m`);
const die = (m) => {
  console.error(`\n\x1b[31m✗ ${m}\x1b[0m`);
  process.exit(1);
};

const electronVersion = read(path.join(root, "node_modules/electron/package.json")).version;
step(`Electron ${electronVersion} · better-sqlite3 ${read(path.join(sqliteDir, "package.json")).version}`);

// 1. Real win32-x64 prebuild. prebuild-install resolves the Electron ABI itself.
step("Fetching win32-x64 prebuild of better-sqlite3");
fs.rmSync(path.join(relDir, ".forge-meta"), { force: true });
run("node", [path.join(root, "node_modules/prebuild-install/bin.js"),
  "--runtime", "electron", "--target", electronVersion,
  "--platform", "win32", "--arch", "x64", "--tag-prefix", "v"], { cwd: sqliteDir });

const staged = execFileSync("file", ["-b", nodeFile]).toString().trim();
if (!/PE32\+.*x86-64/.test(staged)) die(`Staged module is not a Windows x64 binary:\n  ${staged}`);
console.log(`  staged: ${staged}`);

// 2. Package with npmRebuild off, so nothing overwrites what we just staged.
step("Packaging (nsis, x64, npmRebuild disabled)");
try {
  run("npx", ["electron-builder", "--win", "nsis", "--x64", "-c.npmRebuild=false"]);
} finally {
  // 3. Always put the host binary back, even if packaging failed.
  step("Restoring host build of better-sqlite3");
  fs.rmSync(path.join(relDir, ".forge-meta"), { force: true });
  try {
    run("npx", ["electron-rebuild", "-f", "-w", "better-sqlite3"]);
    console.log(`  host: ${execFileSync("file", ["-b", nodeFile]).toString().trim()}`);
  } catch {
    console.error("  \x1b[33m! restore failed — run: npx electron-rebuild -f -w better-sqlite3\x1b[0m");
  }
}

// 4. The gate: what actually ended up inside the installer.
step("Verifying the module inside the installer");
const exe = fs.readdirSync(path.join(root, "release"))
  .filter((f) => f.endsWith(".exe"))
  .map((f) => path.join(root, "release", f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!exe) die("No .exe found in release/");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ampos-win-verify-"));
const inner = "resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node";
const quiet = { stdio: ["ignore", "ignore", "inherit"] };
run("7z", ["e", "-y", `-o${tmp}`, exe, "$PLUGINSDIR/app-64.7z"], quiet);
run("7z", ["e", "-y", `-o${tmp}`, path.join(tmp, "app-64.7z"), inner], quiet);

const shipped = execFileSync("file", ["-b", path.join(tmp, "better_sqlite3.node")]).toString().trim();
fs.rmSync(tmp, { recursive: true, force: true });
if (!/PE32\+.*x86-64/.test(shipped))
  die(`DO NOT PUBLISH — installer contains the wrong binary:\n  ${shipped}\n  Expected: PE32+ ... x86-64`);

console.log(`\n\x1b[32m✓ ${path.basename(exe)} — ${shipped}\x1b[0m`);
console.log("  Windows runtime is still unverified; launch it on a real machine before the field gets it.");
