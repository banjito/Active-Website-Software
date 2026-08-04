# ampOS Supabase Backup

Nightly backup of the ampOS Supabase project to a locally attached
TerraMaster D2-320 enclosure. Runs at 02:00 daily via `launchd`.

These scripts are **standalone** — they do not need the ampOS repo at runtime.
Copy this folder to the backup host (e.g. `~/ampos-backup`) and run `install.sh`.

## What gets backed up

| | Source | Destination |
|---|---|---|
| Database | `pg_dump` of all schemas (`common`, `neta_ops`, `lab_ops`, `hr`, `business`, `runway`, `office`, `public`, `auth`, `storage`, …) | `daily/ampos-db-<timestamp>.dump` |
| Roles | `pg_dumpall --roles-only` | `daily/ampos-roles-<timestamp>.sql` |
| Storage files | All buckets (~3,100 objects, ~1.1 GB) | `storage/<bucket>/<path>` |
| Object manifest | `storage.objects` snapshot | `daily/ampos-storage-manifest-<timestamp>.csv` |

Purely platform-managed schemas (`extensions`, `graphql`, `realtime`, `net`,
`pgbouncer`, `supabase_functions`) are excluded — Supabase recreates them.

**Not covered:** Edge Function source, project settings, and secrets in
`vault`. Those live in the repo and the Supabase dashboard; this is a data
backup, not a full project clone.

## Install

On the backup Mac, with the enclosure plugged in and mounted:

```bash
cd ~/ampos-backup
./install.sh
```

It installs Homebrew / `libpq` / `node` if missing, prompts for the database
password and service role key (stored in the login Keychain, never on disk),
writes `~/.config/ampos-backup/config`, and loads the 02:00 launchd job.

Re-running it is safe — it updates in place.

## Layout on the enclosure

```
/Volumes/TerraMaster/ampOS-Backups/
├── daily/          7 most recent snapshots
├── weekly/         4 most recent Sunday snapshots
├── monthly/        12 most recent 1st-of-month snapshots
├── storage/        current mirror of every bucket
├── .trash/<date>/  storage files deleted upstream, kept 30 days
├── logs/           backup-YYYY-MM-DD.log, kept 90 days
└── last-run.json   machine-readable result of the most recent run
```

Weekly and monthly copies are APFS clones of the daily file, so they cost
almost no extra space until the daily is pruned.

## Everyday use

```bash
./ampos-backup.sh                 # run now
DRY_RUN=1 ./ampos-backup.sh       # show what it would do, change nothing
./restore.sh list                 # what snapshots exist
cat /Volumes/TerraMaster/ampOS-Backups/last-run.json

launchctl kickstart -k gui/$UID/com.ampqes.ampos-backup   # force scheduled run
launchctl print gui/$UID/com.ampqes.ampos-backup | head   # is it loaded?
```

## Restoring

```bash
./restore.sh list                          # pick a snapshot
./restore.sh verify   <dump>               # confirm archive is readable
./restore.sh contents <dump>               # what's inside
./restore.sh db <dump> "postgresql://postgres:PW@db.<ref>.supabase.co:5432/postgres"
./restore.sh db <dump> "<url>" --schema neta_ops    # single schema
```

`restore.sh db` requires you to type the target hostname to confirm, because it
overwrites matching tables and is not reversible.

Storage files are plain files in `storage/<bucket>/<path>` — copy them back
with Finder, `rsync`, or `supabase storage cp --recursive`.

Restoring into a **fresh** Supabase project rather than over a live one is
almost always the safer move: restore, verify, then repoint the app.

## Verify it actually works

A backup nobody has restored is a hypothesis. Once a quarter:

1. Create a scratch Supabase project (free tier is fine).
2. `./restore.sh db <latest-dump> "<scratch-project-url>"`
3. Check row counts on a few key tables against production.
4. Delete the scratch project.

## Design notes

- **Atomic dumps.** `pg_dump` writes to `.partial`; the file is only renamed
  after `pg_restore --list` reads the whole archive. A truncated dump can never
  masquerade as a good one.
- **Incremental storage sync.** Objects are compared against the previous
  manifest by `updated_at` + `size`, and the local file must still exist. The
  first run pulls everything; later runs pull only changes.
- **Deletions are parked, not applied.** A file removed in the app moves to
  `.trash/<date>/` for 30 days, so an accidental deletion is still recoverable.
- **Single instance.** A PID lock prevents a slow run from overlapping the next
  night's; stale locks are reclaimed automatically.
- **Fails loudly.** Any failure writes `status: failed` to `last-run.json` and
  raises a macOS notification.

## Troubleshooting

**"enclosure not mounted"** — the volume name in
`~/.config/ampos-backup/config` must match what's under `/Volumes`. macOS
renames a second mount of the same disk to `TerraMaster 1`.

**Job didn't run overnight** — confirm the host stayed awake and the disk
didn't sleep (`pmset -g custom`; `sudo pmset -a disksleep 0`). Check
`~/Library/Logs/ampos-backup.err.log` for bootstrap-level errors.

**"DB password missing from Keychain"** — a launchd job can only read the login
Keychain while that user is logged in. Stay logged in (screen lock is fine);
don't log out.

**Storage sync failures** — a few transient failures are tolerated and retried
next run. The run fails only if more than 2% of objects fail.

## Rotating credentials

```bash
security add-generic-password -a "$USER" -s ampos-backup-db-password -w 'NEW' -U
security add-generic-password -a "$USER" -s ampos-backup-service-role-key -w 'NEW' -U
```
