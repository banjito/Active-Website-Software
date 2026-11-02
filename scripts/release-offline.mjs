/**
 * Build or publish an ampOS Offline release. Installed apps update themselves
 * from the published one.
 *
 *   1. Bump "version" in package.json.
 *   2. node scripts/release-offline.mjs            Build + verify. Publishes nothing.
 *   3. Test release/ampOS-Offline-Windows-x64-Setup.exe on a real Windows PC.
 *   4. node scripts/release-offline.mjs --publish  Goes live for everyone.
 *
 * Mac is Apple Silicon only, matching the portal's download button.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tag = `offline-v${version}`;

const WIN_EXE = "ampOS-Offline-Windows-x64-Setup.exe"; // Portal + updater.
const MAC_ZIP = `ampOS-Offline-${version}-arm64-mac.zip`; // Updater.
const PORTAL_MAC_ZIP = "ampOS-Offline-macOS-AppleSilicon.zip"; // Portal.
const MAC_APP = path.join(release, "mac-arm64", "ampOS Offline.app");

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
const step = (m) => console.log(`\n\x1b[1m▶ ${m}\x1b[0m`);
const die = (m) => {
  console.error(`\n\x1b[31m✗ ${m}\x1b[0m`);
  process.exit(1);
};

const stopIfPublished = () => {
  const found = spawnSync("gh", ["release", "view", tag], { cwd: root, stdio: "ignore" });
  if (found.status === 0) die(`${tag} is already published. Bump "version" in package.json first.`);
};

/** A feed with the wrong version or hash makes every update fail without a sound. */
function checkFeed(feedName, fileName) {
  const feedPath = path.join(release, feedName);
  const filePath = path.join(release, fileName);
  if (!fs.existsSync(feedPath)) die(`Missing release/${feedName}. Build first.`);
  if (!fs.existsSync(filePath)) die(`Missing release/${fileName}. Build first.`);

  const feed = fs.readFileSync(feedPath, "utf8");
  const hash = createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");
  if (!feed.includes(`version: ${version}\n`)) die(`${feedName} is not for ${version}.`);
  if (!feed.includes(`url: ${fileName}`)) die(`${feedName} does not point at ${fileName}.`);
  if (!feed.includes(hash)) die(`${feedName} does not match ${fileName}. Build again.`);
}

const checkFeeds = () => {
  checkFeed("latest.yml", WIN_EXE);
  checkFeed("latest-mac.yml", MAC_ZIP);
};

function build() {
  stopIfPublished();

  step(`Building ampOS Offline ${version}`);
  run("npm", ["run", "electron:build:renderer"]);
  run("npm", ["run", "electron:build:main"]);

  step("Packaging and notarizing for Mac. This takes several minutes.");
  run("npx", ["electron-builder", "--mac", "zip", "--arm64", "--publish", "never"], {
    env: {
      ...process.env,
      APPLE_KEYCHAIN_PROFILE: process.env.APPLE_KEYCHAIN_PROFILE ?? "ampos-notary",
    },
  });

  step("Verifying the Mac app");
  const gatekeeper = spawnSync("spctl", ["-a", "-vv", MAC_APP], { encoding: "utf8" });
  if (gatekeeper.status !== 0 || !gatekeeper.stderr.includes("Notarized Developer ID")) {
    die(`Mac app is not notarized:\n${gatekeeper.stderr}`);
  }

  const feedConfig = path.join(MAC_APP, "Contents/Resources/app-update.yml");
  if (!fs.readFileSync(feedConfig, "utf8").includes("provider: generic")) {
    die("Mac app has the wrong update feed. Check `publish` in electron-builder.yml.");
  }

  // Windows packs the same files, so this covers both. Without it, a missing
  // package would ship an app that never updates again, with no visible error.
  const probe = spawnSync(path.join(MAC_APP, "Contents/MacOS/ampOS Offline"), [], {
    env: { ...process.env, ELECTRON_UPDATER_TEST: "1" },
    encoding: "utf8",
    timeout: 60_000,
  });
  if (!probe.stdout?.includes("[updater-test] ok")) {
    die(`The packaged app can't load the updater. Check \`files\` in electron-builder.yml.\n${probe.stderr}`);
  }

  step("Packaging for Windows");
  run("node", ["scripts/build-offline-win.mjs"]);

  step("Checking release files");
  fs.copyFileSync(path.join(release, MAC_ZIP), path.join(release, PORTAL_MAC_ZIP));
  checkFeeds();

  console.log(`\n\x1b[32m✓ ${version} built and verified. Nothing is published yet.\x1b[0m`);
  console.log(`  Test release/${WIN_EXE} on a real Windows PC.`);
  console.log("  Then run: node scripts/release-offline.mjs --publish");
}

function publish() {
  stopIfPublished();
  checkFeeds();

  const files = [WIN_EXE, MAC_ZIP, PORTAL_MAC_ZIP, "latest.yml", "latest-mac.yml"].map((f) =>
    path.join(release, f),
  );
  const missing = files.find((f) => !fs.existsSync(f));
  if (missing) die(`Missing ${missing}. Build first.`);

  step(`Publishing ${tag}`);
  run("gh", [
    "release", "create", tag, ...files,
    "--title", `ampOS Offline ${version}`,
    "--notes", `ampOS Offline ${version}`,
    "--latest",
  ]);

  console.log(`\n\x1b[32m✓ ${version} is live. Installed apps pick it up the next time they open online.\x1b[0m`);
}

if (process.argv.includes("--publish")) publish();
else build();
