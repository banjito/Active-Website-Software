#!/bin/bash
#
# ampOS nightly backup -> TerraMaster D2-320
#
# Dumps the Supabase Postgres database and mirrors all Storage buckets to the
# external enclosure, then applies grandfather-father-son retention.
#
# Standalone: this script does not need the ampOS repo. Settings come from
# ~/.config/ampos-backup/config and secrets from the macOS login Keychain,
# both created by install.sh.
#
#   ./ampos-backup.sh              run a backup now
#   DRY_RUN=1 ./ampos-backup.sh    show what it would do, change nothing
#
set -euo pipefail

CONFIG_FILE="${AMPOS_BACKUP_CONFIG:-$HOME/.config/ampos-backup/config}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Defaults, then config file, then environment overrides
# ---------------------------------------------------------------------------

BACKUP_ROOT="/Volumes/TerraMaster/ampOS-Backups"
SUPABASE_URL="https://vdxprdihmbqomwqfldpo.supabase.co"
DB_HOST="db.vdxprdihmbqomwqfldpo.supabase.co"
DB_PORT="5432"
DB_USER="postgres"
DB_NAME="postgres"

# Used automatically when DB_HOST refuses connections. Session mode only.
DB_HOST_FALLBACK="aws-0-us-east-2.pooler.supabase.com"
DB_USER_FALLBACK="postgres.vdxprdihmbqomwqfldpo"

KC_DB_PASSWORD="ampos-backup-db-password"
KC_SERVICE_ROLE="ampos-backup-service-role-key"

KEEP_DAILY=7
KEEP_WEEKLY=4
KEEP_MONTHLY=12
KEEP_TRASH_DAYS=30
KEEP_LOG_DAYS=90
MIN_FREE_GB=15
SYNC_CONCURRENCY=8

# shellcheck source=/dev/null
[ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"

# Environment wins over the config file, so a one-off run can retarget safely.
BACKUP_ROOT="${AMPOS_BACKUP_ROOT:-$BACKUP_ROOT}"
DRY_RUN="${DRY_RUN:-0}"

# Managed Supabase schemas that the platform recreates on its own. Everything
# else -- auth, storage, and all ampOS schemas -- is dumped.
EXCLUDE_SCHEMAS=(extensions graphql graphql_public net pgbouncer realtime _realtime _analytics supabase_functions)

# libpq is keg-only so it is never on the default PATH, and launchd jobs start
# with a minimal PATH of their own. Resolve Homebrew on both Apple Silicon and
# Intel layouts.
for prefix in /opt/homebrew /usr/local; do
  [ -x "$prefix/opt/libpq/bin/pg_dump" ] && PATH="$prefix/opt/libpq/bin:$PATH"
  [ -d "$prefix/bin" ] && PATH="$PATH:$prefix/bin"
done
export PATH="$PATH:/usr/bin:/bin:/usr/sbin:/sbin"

STAMP="$(date +%Y-%m-%d_%H%M%S)"
DATE_ONLY="$(date +%Y-%m-%d)"
# Overridable so a weekly/monthly copy can be forced on demand, and so the
# promotion rules can be exercised without waiting for the calendar.
DOW="${FORCE_DOW:-$(date +%u)}"   # 1=Mon .. 7=Sun
DOM="${FORCE_DOM:-$(date +%d)}"

LOG_DIR="$BACKUP_ROOT/logs"
LOG_FILE="$LOG_DIR/backup-$DATE_ONLY.log"
STATUS_FILE="$BACKUP_ROOT/last-run.json"
LOCK_FILE="/tmp/ampos-backup.lock"

START_EPOCH="$(date +%s)"
FAIL_REASON=""
DUMP_PATH=""
DUMP_BYTES=0
STORAGE_SYNCED=0
STORAGE_BYTES=0

# Note whether a human is watching before stdout gets redirected to the log.
INTERACTIVE=0
[ -t 1 ] && INTERACTIVE=1

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

# Writes go straight to the log file (no process substitution) so that output
# ordering is exact and nothing is lost when the script exits.
log() {
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S')  $*"
  echo "$line"
  [ "$INTERACTIVE" = "1" ] && echo "$line" >&3
  return 0
}

die() { FAIL_REASON="$*"; log "FATAL: $*"; exit 1; }

notify() {
  osascript -e "display notification \"${2//\"/}\" with title \"${1//\"/}\"" >/dev/null 2>&1 || true
}

write_status() {
  local status="$1" detail="$2"
  [ -d "$BACKUP_ROOT" ] || return 0
  cat > "$STATUS_FILE" <<EOF
{
  "status": "$status",
  "finished_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "elapsed_seconds": $(( $(date +%s) - START_EPOCH )),
  "dump_file": "$(basename "${DUMP_PATH:-}")",
  "dump_bytes": ${DUMP_BYTES:-0},
  "storage_files_synced": ${STORAGE_SYNCED:-0},
  "storage_bytes_synced": ${STORAGE_BYTES:-0},
  "detail": "${detail//\"/\'}"
}
EOF
}

on_exit() {
  local code=$?
  if [ "$code" -eq 0 ]; then
    write_status "ok" "completed"
    log "=== Backup completed in $(( $(date +%s) - START_EPOCH ))s ==="
  else
    write_status "failed" "${FAIL_REASON:-exited with code $code}"
    log "=== Backup FAILED: ${FAIL_REASON:-exit code $code} ==="
    notify "ampOS backup FAILED" "${FAIL_REASON:-exit code $code}. Log: $LOG_FILE"
  fi
  rm -f "$LOCK_FILE"
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

# One run at a time; a lock left by a crashed run is reclaimed automatically.
if [ -e "$LOCK_FILE" ]; then
  old_pid="$(cat "$LOCK_FILE" 2>/dev/null || echo '')"
  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
    echo "ampOS backup: run $old_pid still active, skipping." >&2
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

ENCLOSURE_MOUNT="$(dirname "$BACKUP_ROOT")"

# Everything below logs to the enclosure, so the mount is checked first and
# reported through stderr and a notification instead.
if [ ! -d "$ENCLOSURE_MOUNT" ] || ! mount | grep -q " on $ENCLOSURE_MOUNT "; then
  echo "ampOS backup FATAL: enclosure not mounted at $ENCLOSURE_MOUNT" >&2
  notify "ampOS backup FAILED" "Enclosure not mounted at $ENCLOSURE_MOUNT"
  exit 1
fi

mkdir -p "$LOG_DIR" "$BACKUP_ROOT"/{daily,weekly,monthly,storage,.trash}

exec 3>&1              # fd 3 = console, used by log() when interactive
exec >>"$LOG_FILE" 2>&1
trap on_exit EXIT

log "=== ampOS backup starting ($STAMP) ==="
log "Target : $BACKUP_ROOT"
log "Log    : $LOG_FILE"
[ "$DRY_RUN" = "1" ] && log "DRY RUN - nothing will be written or deleted"

command -v pg_dump >/dev/null || die "pg_dump not found (brew install libpq)"
command -v psql    >/dev/null || die "psql not found (brew install libpq)"
command -v node    >/dev/null || die "node not found (brew install node)"

free_gb="$(df -g "$ENCLOSURE_MOUNT" | awk 'NR==2 {print $4}')"
log "Free space: ${free_gb}GB"
[ "$free_gb" -lt "$MIN_FREE_GB" ] && die "only ${free_gb}GB free, need ${MIN_FREE_GB}GB"

# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------

PGPASSWORD="$(security find-generic-password -s "$KC_DB_PASSWORD" -w 2>/dev/null || true)"
SERVICE_ROLE_KEY="$(security find-generic-password -s "$KC_SERVICE_ROLE" -w 2>/dev/null || true)"
export PGPASSWORD

[ -z "$PGPASSWORD" ]       && die "DB password missing from Keychain ($KC_DB_PASSWORD) - rerun install.sh"
[ -z "$SERVICE_ROLE_KEY" ] && die "service role key missing from Keychain ($KC_SERVICE_ROLE) - rerun install.sh"

# Fail on a bad credential now, not part-way through a 1GB dump. Surface
# libpq's own message -- "password authentication failed" and "connection
# refused" need very different fixes.
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"

clean_err() {
  printf '%s' "$1" | grep -v 'collation version mismatch\|^DETAIL:\|^HINT:' \
    | head -3 | tr '\n' ' '
}

try_connect() {
  psql -h "$1" -p "$DB_PORT" -U "$2" -d "$DB_NAME" --no-psqlrc -tAc 'select 1' 2>&1 >/dev/null
}

# Supabase exposes two endpoints and either can be down independently: the
# direct host (db.<ref>.supabase.co) and the Supavisor pooler. Backups are too
# important to lose to one endpoint being unavailable, so fall back rather than
# fail. The pooler must be session mode (5432) -- transaction mode breaks
# pg_dump.
if CONN_ERR="$(try_connect "$DB_HOST" "$DB_USER")"; then
  log "Database connection OK ($DB_HOST)"
elif [ -n "${DB_HOST_FALLBACK:-}" ] && \
     CONN_ERR2="$(try_connect "$DB_HOST_FALLBACK" "${DB_USER_FALLBACK:-$DB_USER}")"; then
  log "WARN: $DB_HOST unreachable [$(clean_err "$CONN_ERR")]"
  DB_HOST="$DB_HOST_FALLBACK"
  DB_USER="${DB_USER_FALLBACK:-$DB_USER}"
  log "Database connection OK via fallback ($DB_HOST)"
else
  msg="$DB_HOST: $(clean_err "$CONN_ERR")"
  [ -n "${DB_HOST_FALLBACK:-}" ] && msg="$msg | $DB_HOST_FALLBACK: $(clean_err "${CONN_ERR2:-not attempted}")"
  die "cannot connect as $DB_USER -- $msg"
fi

# psql prints a harmless collation-version warning on every Supabase connection.
quiet_psql() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-psqlrc -q "$@" \
    2> >(grep -v 'collation version mismatch\|^DETAIL:\|^HINT:' >&2)
}

# ---------------------------------------------------------------------------
# 1. Database dump
# ---------------------------------------------------------------------------

DUMP_PATH="$BACKUP_ROOT/daily/ampos-db-$STAMP.dump"
ROLES_PATH="$BACKUP_ROOT/daily/ampos-roles-$STAMP.sql"

exclude_args=()
for s in "${EXCLUDE_SCHEMAS[@]}"; do exclude_args+=(--exclude-schema="$s"); done

if [ "$DRY_RUN" = "1" ]; then
  log "[dry-run] would dump database to $(basename "$DUMP_PATH")"
  DUMP_PATH=""
else
  log "Dumping database (custom format, compressed)..."
  DUMP_ERR="$(mktemp -t ampos-pgdump)"

  # --no-owner/--no-privileges: Supabase-managed roles will not exist on a
  # restore target, and grants are captured separately in the roles dump.
  # Errors go to a file rather than a pipe so pg_dump's own exit code survives.
  if ! pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --format=custom --compress=9 --no-owner --no-privileges \
        --quote-all-identifiers "${exclude_args[@]}" \
        --file="$DUMP_PATH.partial" 2>"$DUMP_ERR"
  then
    grep -v 'collation version mismatch\|^DETAIL:\|^HINT:' "$DUMP_ERR" >&2 || true
    rm -f "$DUMP_PATH.partial" "$DUMP_ERR"
    die "pg_dump failed"
  fi
  grep -v 'collation version mismatch\|^DETAIL:\|^HINT:' "$DUMP_ERR" >&2 || true
  rm -f "$DUMP_ERR"

  [ -f "$DUMP_PATH.partial" ] || die "pg_dump produced no output"

  # Promote off .partial only once pg_restore can read the whole archive, so a
  # truncated file can never pass as a good backup.
  if ! pg_restore --list "$DUMP_PATH.partial" >/dev/null 2>&1; then
    rm -f "$DUMP_PATH.partial"
    die "dump failed verification - archive is unreadable or truncated"
  fi

  mv "$DUMP_PATH.partial" "$DUMP_PATH"
  DUMP_BYTES="$(stat -f%z "$DUMP_PATH")"
  log "Dump OK: $(du -h "$DUMP_PATH" | cut -f1), $(pg_restore --list "$DUMP_PATH" | grep -c '^[0-9]') objects"

  # Role definitions, needed to rebuild grants on a fresh cluster.
  pg_dumpall -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --roles-only > "$ROLES_PATH" 2>/dev/null \
    || log "WARN: roles dump unavailable (non-fatal)"
fi

# ---------------------------------------------------------------------------
# 2. Storage bucket mirror
# ---------------------------------------------------------------------------

MANIFEST="$BACKUP_ROOT/storage/.manifest-$STAMP.csv"

log "Exporting storage object manifest..."
quiet_psql -c "\copy (select b.name, o.name, coalesce(o.updated_at, o.created_at), coalesce((o.metadata->>'size')::bigint, 0) from storage.objects o join storage.buckets b on b.id = o.bucket_id where o.name is not null order by 1, 2) to '$MANIFEST' with (format csv)" \
  || die "failed to export storage manifest"

log "Manifest: $(wc -l < "$MANIFEST" | tr -d ' ') objects"

if [ "$DRY_RUN" = "1" ]; then
  log "[dry-run] would sync storage into $BACKUP_ROOT/storage"
  rm -f "$MANIFEST"
else
  SYNC_RESULT="$(mktemp -t ampos-sync)"

  # Stream the sync's output into the log as it happens rather than buffering
  # it in a variable; the first run takes many minutes and a silent log is
  # indistinguishable from a hung one. Counters come back via SYNC_RESULT.
  set +e
  if [ "$INTERACTIVE" = "1" ]; then
    SUPABASE_URL="$SUPABASE_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
      MANIFEST="$MANIFEST" DEST="$BACKUP_ROOT/storage" \
      TRASH="$BACKUP_ROOT/.trash/$DATE_ONLY" SYNC_CONCURRENCY="$SYNC_CONCURRENCY" \
      RESULT_FILE="$SYNC_RESULT" \
      node "$SCRIPT_DIR/storage-sync.mjs" 2>&1 | tee /dev/fd/3
    sync_code=${PIPESTATUS[0]}
  else
    SUPABASE_URL="$SUPABASE_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
      MANIFEST="$MANIFEST" DEST="$BACKUP_ROOT/storage" \
      TRASH="$BACKUP_ROOT/.trash/$DATE_ONLY" SYNC_CONCURRENCY="$SYNC_CONCURRENCY" \
      RESULT_FILE="$SYNC_RESULT" \
      node "$SCRIPT_DIR/storage-sync.mjs" 2>&1
    sync_code=$?
  fi
  set -e

  if [ "$sync_code" -ne 0 ]; then
    rm -f "$SYNC_RESULT"
    die "storage sync failed"
  fi

  STORAGE_SYNCED="$(awk -F= '/^SYNCED=/{print $2}' "$SYNC_RESULT" 2>/dev/null | tail -1)"
  STORAGE_BYTES="$(awk -F= '/^BYTES=/{print $2}'  "$SYNC_RESULT" 2>/dev/null | tail -1)"
  STORAGE_SYNCED="${STORAGE_SYNCED:-0}"
  STORAGE_BYTES="${STORAGE_BYTES:-0}"
  rm -f "$SYNC_RESULT"

  # Keep the manifest with the dump from the same night: together they record
  # exactly which object versions that snapshot corresponds to.
  mv "$MANIFEST" "$BACKUP_ROOT/daily/ampos-storage-manifest-$STAMP.csv" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 3. Grandfather-father-son promotion
# ---------------------------------------------------------------------------

# Clone (APFS) or hardlink so weekly/monthly copies cost no extra space; fall
# back to a real copy on filesystems that support neither, such as exFAT.
link_or_copy() {
  local src="$1" dst="$2"
  [ -f "$dst" ] && return 0
  cp -c "$src" "$dst" 2>/dev/null && return 0
  ln    "$src" "$dst" 2>/dev/null && return 0
  cp    "$src" "$dst"
}

if [ "$DRY_RUN" != "1" ] && [ -n "$DUMP_PATH" ] && [ -f "$DUMP_PATH" ]; then
  if [ "$DOW" = "7" ]; then
    link_or_copy "$DUMP_PATH" "$BACKUP_ROOT/weekly/$(basename "$DUMP_PATH")"
    log "Promoted to weekly"
  fi
  if [ "$DOM" = "01" ]; then
    link_or_copy "$DUMP_PATH" "$BACKUP_ROOT/monthly/$(basename "$DUMP_PATH")"
    log "Promoted to monthly"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Retention
# ---------------------------------------------------------------------------

# Each run writes a .dump plus sidecar files sharing one timestamp, so pruning
# works on whole timestamps rather than individual files.
prune() {
  local dir="$1" keep="$2" label="$3"
  local stamps total
  stamps="$(ls -1 "$dir" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}' | sort -u || true)"
  total="$(printf '%s' "$stamps" | grep -c . || true)"

  if [ "$total" -le "$keep" ]; then
    log "Retention $label: $total snapshot(s), limit $keep - nothing to prune"
    return 0
  fi

  local n=0
  while IFS= read -r s; do
    [ -z "$s" ] && continue
    if [ "$DRY_RUN" = "1" ]; then
      log "[dry-run] would prune $label snapshot $s"
    else
      rm -f "$dir"/*"$s"*
    fi
    n=$(( n + 1 ))
  done <<< "$(printf '%s\n' "$stamps" | head -n "$(( total - keep ))")"

  log "Retention $label: pruned $n, kept $keep"
  return 0
}

prune "$BACKUP_ROOT/daily"   "$KEEP_DAILY"   "daily"
prune "$BACKUP_ROOT/weekly"  "$KEEP_WEEKLY"  "weekly"
prune "$BACKUP_ROOT/monthly" "$KEEP_MONTHLY" "monthly"

if [ "$DRY_RUN" != "1" ]; then
  find "$BACKUP_ROOT/.trash" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_TRASH_DAYS" \
    -exec rm -rf {} + 2>/dev/null || true
  find "$LOG_DIR" -name 'backup-*.log' -mtime "+$KEEP_LOG_DAYS" -delete 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

log "---"
[ -n "$DUMP_PATH" ] && [ -f "$DUMP_PATH" ] && log "Database dump : $(du -h "$DUMP_PATH" | cut -f1)"
log "Storage synced: $STORAGE_SYNCED file(s), $(( STORAGE_BYTES / 1048576 )) MB transferred"
log "Storage mirror: $(du -sh "$BACKUP_ROOT/storage" 2>/dev/null | cut -f1 || echo n/a)"
log "Backup tree   : $(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1 || echo n/a)"
log "Free space    : $(df -g "$ENCLOSURE_MOUNT" | awk 'NR==2 {print $4}')GB"
