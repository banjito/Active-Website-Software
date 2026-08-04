#!/bin/bash
#
# Inspect and restore ampOS backups produced by ampos-backup.sh.
#
#   ./restore.sh list                        show available snapshots
#   ./restore.sh verify <dump>               check an archive is readable
#   ./restore.sh contents <dump>             list schemas/tables in an archive
#   ./restore.sh db <dump> <target-url>      restore the database
#   ./restore.sh db <dump> <target-url> --schema neta_ops
#
# The target URL is a full libpq connection string, e.g.
#   postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres
#
set -euo pipefail

CONFIG_FILE="${AMPOS_BACKUP_CONFIG:-$HOME/.config/ampos-backup/config}"
BACKUP_ROOT="/Volumes/TerraMaster/ampOS-Backups"
# shellcheck source=/dev/null
[ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"

for prefix in /opt/homebrew /usr/local; do
  [ -x "$prefix/opt/libpq/bin/pg_restore" ] && PATH="$prefix/opt/libpq/bin:$PATH"
done
export PATH

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Print the leading comment block as help, stopping at the first line of code.
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; exit "${1:-0}"; }

cmd="${1:-}"; shift || true
[ -z "$cmd" ] || [ "$cmd" = "--help" ] || [ "$cmd" = "-h" ] && usage 0

case "$cmd" in

list)
  bold "Snapshots in $BACKUP_ROOT"
  for tier in daily weekly monthly; do
    d="$BACKUP_ROOT/$tier"
    [ -d "$d" ] || continue
    echo
    printf '  \033[1m%s\033[0m\n' "$tier"
    found=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      found=1
      printf '    %-46s %8s  %s\n' \
        "$(basename "$f")" \
        "$(du -h "$f" | cut -f1)" \
        "$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$f")"
    done < <(ls -1t "$d"/ampos-db-*.dump 2>/dev/null)
    [ "$found" = "0" ] && echo "    (none)"
  done
  echo
  if [ -d "$BACKUP_ROOT/storage" ]; then
    bold "Storage mirror"
    echo "  $(du -sh "$BACKUP_ROOT/storage" 2>/dev/null | cut -f1)  at $BACKUP_ROOT/storage"
  fi
  [ -f "$BACKUP_ROOT/last-run.json" ] && { echo; bold "Last run"; cat "$BACKUP_ROOT/last-run.json"; }
  ;;

verify)
  dump="${1:-}"; [ -n "$dump" ] || die "usage: restore.sh verify <dump>"
  [ -f "$dump" ] || die "no such file: $dump"
  if pg_restore --list "$dump" >/dev/null 2>&1; then
    n="$(pg_restore --list "$dump" | grep -c '^[0-9]')"
    printf '\033[32mOK\033[0m  %s\n' "$(basename "$dump")"
    echo "    $(du -h "$dump" | cut -f1), $n restorable objects"
  else
    die "archive is unreadable or truncated: $dump"
  fi
  ;;

contents)
  dump="${1:-}"; [ -n "$dump" ] || die "usage: restore.sh contents <dump>"
  [ -f "$dump" ] || die "no such file: $dump"
  # Entries are "<id>; <oid> <oid> <DESC> <schema> <name> [<owner>]". DESC is
  # positional -- scanning for the word TABLE anywhere would also match
  # "COMMENT <schema> TABLE <name>" and PUBLICATION entries. Strip the numeric
  # prefix, then read DESC from the front.
  entries() { pg_restore --list "$1" | sed -nE 's/^[0-9]+; [0-9]+ [0-9]+ //p'; }

  bold "Tables per schema in $(basename "$dump")"
  entries "$dump" | awk '$1=="TABLE" && $2!="DATA" {print $2}' | sort | uniq -c | sort -rn
  echo
  bold "Schemas containing row data"
  entries "$dump" | awk '$1=="TABLE" && $2=="DATA" {print $3}' | sort | uniq -c | sort -rn
  ;;

db)
  dump="${1:-}"; target="${2:-}"; shift 2 2>/dev/null || true
  [ -n "$dump" ] && [ -n "$target" ] || die "usage: restore.sh db <dump> <target-url> [--schema NAME]"
  [ -f "$dump" ] || die "no such file: $dump"

  extra=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --schema) extra+=(--schema="$2"); shift 2 ;;
      *) die "unknown option: $1" ;;
    esac
  done

  pg_restore --list "$dump" >/dev/null 2>&1 || die "archive is unreadable: $dump"

  # Never let a typo point this at production without a deliberate confirmation.
  host="$(printf '%s' "$target" | sed -E 's#.*@([^:/]+).*#\1#')"
  echo
  bold "About to restore into an existing database"
  echo "  archive : $(basename "$dump")  ($(du -h "$dump" | cut -f1))"
  echo "  target  : $host"
  [ "${#extra[@]}" -gt 0 ] && echo "  scope   : ${extra[*]}"
  echo
  echo "  This overwrites matching tables in the target. It is not reversible."
  read -r -p "  Type the target hostname to continue: " confirm
  [ "$confirm" = "$host" ] || die "confirmation did not match - nothing was changed"

  echo
  echo "Restoring..."
  # --clean --if-exists so reruns are idempotent; failures are reported per
  # object rather than aborting, since managed Supabase objects often collide.
  pg_restore \
    --dbname="$target" \
    --no-owner --no-privileges \
    --clean --if-exists \
    --jobs=4 \
    "${extra[@]}" \
    "$dump" 2>&1 | grep -v 'does not exist, skipping' || true

  echo
  bold "Restore finished."
  echo "  Review any errors above. Objects owned by Supabase-managed roles"
  echo "  (auth triggers, storage policies) commonly report benign conflicts."
  ;;

storage)
  echo "Storage files are mirrored as plain files - copy them back with any tool:"
  echo
  echo "  Mirror location : $BACKUP_ROOT/storage/<bucket>/<path>"
  echo "  Recently deleted: $BACKUP_ROOT/.trash/<date>/<bucket>/<path>"
  echo
  echo "  To re-upload a whole bucket with the Supabase CLI:"
  echo "    supabase storage cp --recursive \\"
  echo "      \"$BACKUP_ROOT/storage/customer-reports\" \\"
  echo "      ss:///customer-reports --experimental"
  ;;

*)
  die "unknown command '$cmd' (try --help)"
  ;;
esac
