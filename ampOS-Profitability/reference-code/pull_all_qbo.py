"""
Pull QBO actuals (TimeActivity, Invoices, P&L detail) for ALL ampOS jobs that
match a QBO sub-customer. Resumable: skips files already saved. Saves raw qbo.js
output to data/qbo_{time,inv,pnl}_{jobnumber}.json (qbo_load.py strips the banner).

Run:  python pull_all_qbo.py
"""
import subprocess, json, re, pathlib, sys

QBO_DIR = r"C:\Users\jerju\OneDrive\Focus CFO\AI\QBO"
HERE = pathlib.Path(__file__).parent
DATA = HERE / "data"
YEAR = "2026"


def run_qbo(args):
    p = subprocess.run(["node", "qbo.js", "--client", "ampqes"] + args,
                       cwd=QBO_DIR, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return p.stdout or ""


def parse(stdout):
    for marker in ('"QueryResponse"', '"Header"', '"Fault"'):
        k = stdout.find(marker)
        if k != -1:
            s = stdout.rfind("{", 0, k)
            if s != -1:
                try:
                    return json.loads(stdout[s:])
                except Exception:
                    return None
    return None


# ---- 1. build job_number -> QBO customer id map ----
mapfile = DATA / "job_qbo_map.json"
jobs = json.load(open(DATA / "jobs.json", encoding="utf-8"))
ampos_jns = {str(j["job_number"]) for j in jobs if j.get("job_number")}

if mapfile.exists():
    jobmap = json.load(open(mapfile, encoding="utf-8"))
else:
    custmap = {}
    for pref in ["24", "25", "26"]:
        d = parse(run_qbo(["query", f"SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '{pref}%' MAXRESULTS 1000"]))
        for c in (d or {}).get("QueryResponse", {}).get("Customer", []):
            m = re.match(r"\s*(\d{5})", c.get("DisplayName", ""))
            if m:
                custmap.setdefault(m.group(1), c["Id"])  # first match wins
    jobmap = {jn: custmap[jn] for jn in ampos_jns if jn in custmap}
    json.dump(jobmap, open(mapfile, "w", encoding="utf-8"), indent=1)
    print(f"mapped {len(jobmap)}/{len(ampos_jns)} ampOS jobs to QBO customers", flush=True)

# ---- 2. pull per job (resumable) ----
todo = sorted(jobmap.items(), reverse=True)
for i, (jn, cust) in enumerate(todo, 1):
    pulls = [
        ("time", ["query", f"SELECT * FROM TimeActivity WHERE CustomerRef='{cust}' MAXRESULTS 1000"]),
        ("inv", ["query", f"SELECT * FROM Invoice WHERE CustomerRef='{cust}' MAXRESULTS 1000"]),
        ("pnl", ["report", "ProfitAndLossDetail", f"customer={cust}",
                 f"start_date={YEAR}-01-01", f"end_date={YEAR}-12-31", "accounting_method=Accrual"]),
    ]
    did = []
    for kind, args in pulls:
        f = DATA / f"qbo_{kind}_{jn}.json"
        if f.exists() and f.stat().st_size > 50:
            continue
        out = run_qbo(args)
        f.write_text(out, encoding="utf-8")
        did.append(kind)
    print(f"[{i}/{len(todo)}] job {jn} (cust {cust}) {'pulled ' + ','.join(did) if did else 'cached'}", flush=True)

print("DONE pulling QBO actuals for", len(todo), "jobs", flush=True)
