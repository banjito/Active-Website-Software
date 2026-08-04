#!/bin/bash
#
# One-time setup for ampOS nightly backups on a macOS host.
#
# Installs prerequisites, stores credentials in the login Keychain, writes the
# config file, and loads the 2am launchd job. Safe to re-run: it updates what
# already exists instead of duplicating it.
#
#   ./install.sh
#
set -euo pipefail

LABEL="com.ampqes.ampos-backup"
CONFIG_DIR="$HOME/.config/ampos-backup"
CONFIG_FILE="$CONFIG_DIR/config"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

KC_DB_PASSWORD="ampos-backup-db-password"
KC_SERVICE_ROLE="ampos-backup-service-role-key"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()    { printf '  \033[32mok\033[0m   %s\n' "$*"; }
warn()  { printf '  \033[33mwarn\033[0m %s\n' "$*"; }
fail()  { printf '  \033[31mfail\033[0m %s\n' "$*"; exit 1; }

bold "ampOS backup installer"
echo

# The launchd job stores this directory as an absolute path, so installing from
# a staging location (a fresh AirDrop lands in ~/Downloads) silently breaks the
# moment the folder is moved. Catch that before anything is written.
case "$SCRIPT_DIR" in
  "$HOME/Downloads"/*|"$HOME/Desktop"/*|/tmp/*|/private/tmp/*|/Volumes/*)
    warn "running from $SCRIPT_DIR"
    echo "     The scheduled job will point at this exact path. If you move or"
    echo "     delete this folder later, backups stop without warning."
    echo "     Recommended: mv \"$SCRIPT_DIR\" ~/ampos-backup, then re-run there."
    echo
    read -r -p "  Continue installing from here anyway? [y/N]: " ans
    [[ "$ans" =~ ^[Yy]$ ]] || { echo "  Aborted - nothing was changed."; exit 0; }
    echo
    ;;
esac

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------

bold "1. Checking prerequisites"

BREW=""
for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [ -x "$p" ] && BREW="$p" && break
done

if [ -z "$BREW" ]; then
  warn "Homebrew not found - installing (you will be prompted for your password)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$p" ] && BREW="$p" && break
  done
  [ -z "$BREW" ] && fail "Homebrew install did not complete"
fi
ok "Homebrew: $BREW"

BREW_PREFIX="$("$BREW" --prefix)"

if [ ! -x "$BREW_PREFIX/opt/libpq/bin/pg_dump" ]; then
  echo "     installing libpq (postgres client tools)..."
  "$BREW" install libpq >/dev/null || fail "could not install libpq"
fi
PG_BIN="$BREW_PREFIX/opt/libpq/bin"
ok "pg_dump: $("$PG_BIN/pg_dump" --version)"

if ! command -v node >/dev/null 2>&1 && [ ! -x "$BREW_PREFIX/bin/node" ]; then
  echo "     installing node..."
  "$BREW" install node >/dev/null || fail "could not install node"
fi
NODE_BIN="$(command -v node || echo "$BREW_PREFIX/bin/node")"
NODE_MAJOR="$("$NODE_BIN" -e 'console.log(process.versions.node.split(".")[0])')"
[ "$NODE_MAJOR" -lt 18 ] && fail "node 18+ required for built-in fetch (found $NODE_MAJOR)"
ok "node: $("$NODE_BIN" --version)"

# ---------------------------------------------------------------------------
# 2. Enclosure
# ---------------------------------------------------------------------------

echo
bold "2. Backup destination"

echo "  Mounted volumes:"
for v in /Volumes/*; do [ -d "$v" ] && echo "    $v"; done

DEFAULT_VOL="/Volumes/TerraMaster"
read -r -p "  Enclosure volume [$DEFAULT_VOL]: " VOL
VOL="${VOL:-$DEFAULT_VOL}"

[ -d "$VOL" ] || fail "$VOL is not mounted - plug in the enclosure and re-run"
mount | grep -q " on $VOL " || fail "$VOL exists but nothing is mounted there"

BACKUP_ROOT="$VOL/ampOS-Backups"
mkdir -p "$BACKUP_ROOT" || fail "cannot write to $VOL (check permissions / format)"

FS_TYPE="$(mount | grep " on $VOL " | sed -E 's/.*\(([a-z]+),.*/\1/')"
FREE_GB="$(df -g "$VOL" | awk 'NR==2 {print $4}')"
ok "$BACKUP_ROOT  (${FS_TYPE:-unknown}, ${FREE_GB}GB free)"

if [ "$FREE_GB" -lt 60 ]; then
  warn "only ${FREE_GB}GB free; 7 daily + 4 weekly + 12 monthly needs roughly 40-60GB"
fi
case "$FS_TYPE" in
  apfs|hfs) ;;
  exfat|msdos)
    warn "$FS_TYPE cannot clone or hardlink - weekly/monthly copies will use full space" ;;
  *) warn "unrecognised filesystem '$FS_TYPE'; APFS is recommended" ;;
esac

# ---------------------------------------------------------------------------
# 3. Credentials
# ---------------------------------------------------------------------------

echo
bold "3. Credentials (stored in the login Keychain, not on disk)"

store_secret() {
  local service="$1" label="$2" existing
  existing="$(security find-generic-password -s "$service" -w 2>/dev/null || true)"
  if [ -n "$existing" ]; then
    read -r -p "  $label already stored. Replace? [y/N]: " ans
    [[ "$ans" =~ ^[Yy]$ ]] || { ok "$label kept"; return 0; }
  fi
  local value
  read -r -s -p "  $label: " value
  echo
  [ -z "$value" ] && fail "$label cannot be empty"
  security add-generic-password -a "$USER" -s "$service" -w "$value" -U \
    || fail "could not write $label to Keychain"
  ok "$label stored"
}

echo "  Supabase dashboard -> Project Settings -> Database (password)"
echo "                     -> Project Settings -> API (service_role key)"
echo
store_secret "$KC_DB_PASSWORD"  "Database password"
store_secret "$KC_SERVICE_ROLE" "Service role key"

# ---------------------------------------------------------------------------
# 4. Config file
# ---------------------------------------------------------------------------

echo
bold "4. Writing config"

mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_FILE" <<EOF
# ampOS backup configuration - edit and the next run picks it up.
# Written by install.sh on $(date '+%Y-%m-%d %H:%M:%S')

BACKUP_ROOT="$BACKUP_ROOT"

SUPABASE_URL="https://vdxprdihmbqomwqfldpo.supabase.co"

# Primary endpoint.
DB_HOST="db.vdxprdihmbqomwqfldpo.supabase.co"
DB_PORT="5432"
DB_USER="postgres"
DB_NAME="postgres"

# Used automatically if the primary refuses connections. This is the Supavisor
# pooler in SESSION mode (port 5432) -- do not point it at transaction mode
# (6543), which cannot serve pg_dump.
DB_HOST_FALLBACK="aws-0-us-east-2.pooler.supabase.com"
DB_USER_FALLBACK="postgres.vdxprdihmbqomwqfldpo"

KC_DB_PASSWORD="$KC_DB_PASSWORD"
KC_SERVICE_ROLE="$KC_SERVICE_ROLE"

# Snapshots retained per tier.
KEEP_DAILY=7
KEEP_WEEKLY=4
KEEP_MONTHLY=12

# Storage files deleted upstream are parked in .trash for this many days.
KEEP_TRASH_DAYS=30
KEEP_LOG_DAYS=90

# Refuse to start below this much free space.
MIN_FREE_GB=15

# Parallel storage downloads.
SYNC_CONCURRENCY=8
EOF
chmod 600 "$CONFIG_FILE"
ok "$CONFIG_FILE"

# ---------------------------------------------------------------------------
# 5. Schedule
# ---------------------------------------------------------------------------

echo
bold "5. Scheduling 2:00am daily job"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SCRIPT_DIR/ampos-backup.sh</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key><integer>2</integer>
        <key>Minute</key><integer>0</integer>
    </dict>

    <key>RunAtLoad</key>
    <false/>

    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/ampos-backup.out.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/ampos-backup.err.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$PG_BIN:$BREW_PREFIX/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null || fail "generated plist is invalid"

chmod +x "$SCRIPT_DIR/ampos-backup.sh" "$SCRIPT_DIR/restore.sh" 2>/dev/null || true

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST" || fail "launchctl bootstrap failed"
ok "loaded $LABEL (daily at 02:00)"

# The enclosure is USB-attached, so it must survive sleep for a 2am run.
if pmset -g custom 2>/dev/null | grep -qE '^\s*disksleep\s+[1-9]'; then
  warn "disk sleep is enabled; the enclosure may be spun down at 2am"
  echo "     consider: sudo pmset -a disksleep 0"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo
bold "Installed."
cat <<EOF

  Test it now (no writes):   $SCRIPT_DIR/ampos-backup.sh   with DRY_RUN=1
  Run a real backup now:     $SCRIPT_DIR/ampos-backup.sh
  Force a scheduled run:     launchctl kickstart -k gui/$UID/$LABEL
  Check last result:         cat "$BACKUP_ROOT/last-run.json"
  Watch tonight's log:       tail -f "$BACKUP_ROOT/logs/backup-\$(date +%F).log"
  Restore from a dump:       $SCRIPT_DIR/restore.sh --help
  Uninstall:                 launchctl bootout gui/$UID/$LABEL && rm "$PLIST"

  The first run downloads the full ~1.1GB of storage files and will take a
  while. Later runs transfer only what changed.

EOF
