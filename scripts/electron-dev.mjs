/**
 * Dev launcher for the Electron offline-reports app.
 *
 * Starts the existing Vite dev server, waits for it to accept connections,
 * compiles the Electron main/preload (.cts -> .cjs), then launches Electron
 * pointed at the dev server. Uses only Node built-ins to avoid adding
 * concurrently/wait-on dependencies.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import process from "node:process";

const PORT = 5175;
const URL = `http://localhost:${PORT}`;
const children = [];

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
  children.push(child);
  return child;
}

function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Vite dev server not reachable at ${url}`));
        } else {
          setTimeout(probe, 400);
        }
      });
    };
    probe();
  });
}

function shutdown(code = 0) {
  for (const c of children) {
    if (!c.killed) c.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  // 1. Vite dev server (the existing renderer).
  run("npx", ["vite"]);

  // 2. Compile Electron main/preload.
  await new Promise((resolve, reject) => {
    const tsc = run("npx", ["tsc", "-p", "electron/tsconfig.json"]);
    tsc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`tsc exited ${code}`))
    );
  });

  // 3. Wait for the renderer, then launch Electron.
  await waitForServer(URL);
  const electron = run("npx", ["electron", "."], {
    env: { ...process.env, ELECTRON_RENDERER_URL: URL },
  });
  electron.on("exit", (code) => shutdown(code ?? 0));
}

main().catch((err) => {
  console.error("[electron-dev]", err);
  shutdown(1);
});
