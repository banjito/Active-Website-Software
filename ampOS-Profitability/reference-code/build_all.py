"""
Daily refresh orchestrator for the AMP Job Profitability dashboard.

Schedule this once a day (Windows Task Scheduler). It:
  1. Force-refreshes QBO actuals for ACTIVE jobs (their costs/hours/billing change
     daily); COMPLETED/billed jobs keep their cached pull (fast, fewer API calls).
  2. Re-pulls (incremental) via pull_all_qbo.py.
  3. Regenerates AMP Job Dashboard.html via build_dashboard.py.

ampOS bid data is refreshed too, unattended, via pull_ampos.py (ampos_auth refresh
token). New jobs/quotes flow in automatically; the job->QBO map is rebuilt each run.

Run:  python build_all.py
"""
import json, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).parent
DATA = HERE / "data"
ACTIVE_STATUS = {"in_progress", "ready_to_bill", "progress_billing", "pending"}


def run(script):
    print(f"--- running {script} ---", flush=True)
    r = subprocess.run([sys.executable, str(HERE / script)], cwd=str(HERE),
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(f"!! {script} failed (exit {r.returncode})", flush=True); sys.exit(1)


def main():
    # 1. refresh ampOS bid data (unattended, via refresh token)
    run("pull_ampos.py")
    # 2. rebuild the job->QBO map so any NEW jobs get mapped
    (DATA / "job_qbo_map.json").unlink(missing_ok=True)
    # 3. invalidate cached QBO files for ACTIVE jobs so they re-pull fresh today
    jobs = json.load(open(DATA / "jobs.json", encoding="utf-8"))
    active = {str(j["job_number"]) for j in jobs if j.get("status") in ACTIVE_STATUS and j.get("job_number")}
    removed = 0
    for jn in active:
        for kind in ("time", "inv", "pnl"):
            f = DATA / f"qbo_{kind}_{jn}.json"
            if f.exists():
                f.unlink(); removed += 1
    print(f"refresh: invalidated {removed} cached files for {len(active)} active jobs", flush=True)
    # 4. pull QBO actuals (incremental) and 5. rebuild dashboard
    run("pull_all_qbo.py")
    run("build_dashboard.py")
    print("refresh complete -> AMP Job Dashboard.html", flush=True)


if __name__ == "__main__":
    main()
