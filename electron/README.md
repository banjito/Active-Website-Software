# ampOS Offline (Electron)

A standalone, fully-offline desktop app for filling out NETA reports. It is
**only** the reports: a searchable report list + one page per report + PDF
export. No login, no cloud sync, no other ampOS features. All ~48 report
components from `src/components/reports/` run unchanged against a local SQLite
store (via an offline Supabase adapter), and export to PDF with Electron's
`printToPDF`.

## Develop

```bash
npm run electron:dev
```

Runs Vite (`vite.config.electron.ts`, port 5180) + compiles the main/preload
(`.cts` → `.cjs`) + launches Electron pointed at the dev server.

## Build the installers

Two-step: build the renderer + main, then package with electron-builder.

```bash
# 1. Build renderer (Vite) and main/preload (tsc)
npm run electron:build:renderer
npm run electron:build:main

# 2a. macOS (run on a Mac) — produces a .dmg and .zip in release/
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac

# 2b. Windows (run on Windows) — produces .exe (nsis) + .msi in release/
npx electron-builder --win
```

`npm run electron:build` does step 1 + electron-builder for the current OS in
one go.

### Platform notes

- **Windows from macOS is partial.** The **NSIS** `.exe` installer *does* build
  on a Mac (NSIS packaging uses a bundled `makensis`, no Wine) — use
  `npx electron-builder --win nsis --x64`. This produces
  `release/ampOS Offline_<ver>_x64.exe` with the correct Windows-native
  `better-sqlite3` binary. The **MSI** target does NOT build on macOS: it needs
  WiX under electron-builder's bundled Wine, which fails
  (`candle.exe` / `C:\windows` errors). Build the `.msi` on a real Windows
  machine (`npx electron-builder --win` there builds both nsis + msi natively).
- **Target x64 for Windows.** electron-builder defaults to the host arch, so on
  an Apple-Silicon Mac a bare `--win` yields an arm64 build (wrong for almost
  all Windows PCs). Always pass `--x64`.
- **Runtime verification needs Windows.** A macOS host can assemble and verify
  the *structure* of the Windows build (PE binaries, bundled renderer) but
  cannot launch the `.exe`. Confirm reports render / SQLite opens / PDF export
  works by running the installer on an actual Windows machine.
- **macOS arch:** the committed download is built `--arm64` (Apple Silicon).
  For Intel Macs add `--x64`, or `--universal` for a single fat binary.
- **`better-sqlite3` is native.** electron-builder rebuilds it for the target
  Electron ABI/arch automatically during packaging. It's the only runtime
  `node_module` shipped — everything else in the renderer is bundled by Vite
  (see the `files` filter in `electron-builder.yml`).
- **Code signing** is skipped locally (`CSC_IDENTITY_AUTO_DISCOVERY=false`).
  For distribution: Windows Authenticode, macOS Developer ID + notarization.

## Distribution

Installers are **too large for git / the Vercel deploy**, so they are hosted as
**GitHub Release assets** — never commit them (`release/`, `renderer-dist/`, and
`public/assets/offline-software.zip` are gitignored).

Current release: https://github.com/banjito/Active-Website-Software/releases/tag/offline-v1.0.0
The portal download buttons (`src/app/portal/page.tsx`) link straight to the
Windows `.exe` and macOS `.zip` release assets.

To publish a new build:
```bash
# build renderer + main, then package per platform (see above), then:
gh release create offline-vX.Y.Z --repo banjito/Active-Website-Software \
  "release/ampOS Offline_X.Y.Z_x64.exe#ampOS Offline - Windows (x64) Installer" \
  "release/ampOS Offline-X.Y.Z-arm64-mac.zip#ampOS Offline - macOS (Apple Silicon)"
```
Then update the two `href`s in `src/app/portal/page.tsx` to the new tag.
