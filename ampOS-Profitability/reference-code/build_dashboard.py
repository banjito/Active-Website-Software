"""
Build an interactive, self-contained HTML job-profitability dashboard.

Layout: project dropdown -> summary header -> two columns (QUOTE left / ACTUALS
right, each broken into Revenue + COGS categories) -> monthly view at bottom.
Every number is clickable and opens a modal with the underlying detail:
  - Quote: estimate SOV line items, travel_data (mileage / travel time / per diem)
  - Actuals: QBO invoices, P&L transactions per category, to-the-day TimeActivity
All data is embedded as JSON; pure vanilla JS, no external dependencies.
"""
import json, collections, pathlib, html
import qbo_load as q

HERE = pathlib.Path(__file__).parent
DATA = HERE / "data"
OUT = HERE / "AMP Job Dashboard.html"
TARGET = 0.40
OVERHEAD_PCT = 0.494  # company OpEx as % of revenue (YTD) for the net view
PULL_DATE = "2026-06-30"

jobs = {j["job_number"]: j for j in json.load(open(DATA / "jobs.json", encoding="utf-8"))}
opps = {o["id"]: o for o in json.load(open(DATA / "opportunities.json", encoding="utf-8"))}
custs = {c["id"]: c for c in json.load(open(DATA / "customers.json", encoding="utf-8"))}
ests = {}
for e in json.load(open(DATA / "estimates.json", encoding="utf-8")):
    ests.setdefault(e["opportunity_id"], []).append(e)

jobmap = json.load(open(DATA / "job_qbo_map.json", encoding="utf-8")) if (DATA / "job_qbo_map.json").exists() else {}
DONE_STATUS = {"billed", "ready_to_bill", "completed", "progress_billing"}
ACTIVE_STATUS = {"in_progress", "ready_to_bill", "progress_billing", "pending"}

LABOR_ACCTS = {"5006", "5030", "6003", "6010"}
ACCT_GROUP = {
    "5006": "Labor (W-2 + burden)", "5030": "Labor (W-2 + burden)",
    "6003": "Labor (W-2 + burden)", "6010": "Labor (W-2 + burden)",
    "5008": "Contract Labor", "5004": "Travel & Lodging", "5002": "Fuel / Mileage",
    "5001": "Materials", "5007": "Rental Equipment", "6390": "Per Diem",
    "6270": "Meals", "5003": "Meals", "5005": "Postage", "5009": "3rd-Party Testing",
    "5050": "Insurance",
}


def cust_name(cid):
    c = custs.get(cid)
    return (c.get("company_name") or c.get("name")) if c else ""


def pnl_txns(path):
    """Every P&L-detail transaction with its account + category."""
    pnl = q.load_qbo(path)
    cols = [c["ColTitle"] for c in pnl["Columns"]["Column"]]
    di = {n: i for i, n in enumerate(cols)}
    out = []

    def walk(node, acct):
        for r in node.get("Row", []):
            hdr = r.get("Header", {}).get("ColData"); a = acct
            if hdr and hdr[0].get("value"):
                a = hdr[0]["value"]
            if r.get("type") == "Data":
                cd = r.get("ColData")
                amt = float(cd[di["Amount"]]["value"]) if cd[di["Amount"]].get("value") else 0.0
                out.append({
                    "date": cd[di["Date"]].get("value", ""),
                    "ttype": cd[di["Transaction Type"]].get("value", ""),
                    "num": cd[di.get("Num", 2)].get("value", ""),
                    "name": cd[di["Name"]].get("value", ""),
                    "memo": cd[di["Memo/Description"]].get("value", ""),
                    "amount": amt, "acct": a, "acct4": a[:4],
                    "isIncome": a[:1] == "4",
                    "cat": ACCT_GROUP.get(a[:4], "Other") if a[:1] != "4" else "Revenue",
                })
            if "Rows" in r:
                walk(r["Rows"], a)
    walk(pnl["Rows"], "(root)")
    return out


def bid(jn):
    j = jobs[jn]; o = opps.get(j["opportunity_id"]) or {}
    elist = ests.get(j["opportunity_id"], [])
    e = sorted(elist, key=lambda x: x.get("created_at", ""))[-1] if elist else None
    d = json.loads(e["data"]) if e else {}
    hs = d.get("hoursSummary") or {}; td = d.get("travel_data") or {}
    sov = d.get("sovItems") or []
    return {"o": o, "d": d, "hs": hs, "td": td, "sov": sov,
            "quoted": float(o.get("quoted_amount") or 0)}


def money(x):
    return round(float(x or 0))


def build_job(jn, cust, kind):
    j = jobs[jn]; B = bid(jn)
    o = B["o"]; hs = B["hs"]; td = B["td"]; sov = B["sov"]
    quoted = B["quoted"]

    # ----- ACTUALS -----
    txns = pnl_txns(DATA / f"qbo_pnl_{jn}.json")
    t = q.time_rollup(DATA / f"qbo_time_{jn}.json")
    inv = q.invoice_rollup(DATA / f"qbo_inv_{jn}.json")
    ta_raw = q.load_qbo(DATA / f"qbo_time_{jn}.json").get("QueryResponse", {}).get("TimeActivity", [])

    # actual labor: max(P&L burdened labor, TimeActivity); detail = time entries
    labor_pnl = sum(x["amount"] for x in txns if x["acct4"] in LABOR_ACCTS)
    labor_act = max(labor_pnl, t["cost"])
    # worked hours = entries carrying a cost rate (excludes $0 per-diem day-markers)
    worked_hours = sum(float(e.get("Hours", 0) or 0) + float(e.get("Minutes", 0) or 0) / 60
                       for e in ta_raw if float(e.get("CostRate", 0) or 0) > 0)
    # actual non-labor categories from P&L
    cat_act = collections.defaultdict(float)
    cat_txns = collections.defaultdict(list)
    for x in txns:
        if x["isIncome"] or x["acct4"] in LABOR_ACCTS:
            continue
        cat_act[x["cat"]] += x["amount"]
        cat_txns[x["cat"]].append(x)
    # assemble actual COGS rows
    act_cogs = []
    # labor row first
    act_cogs.append({
        "cat": "Labor (W-2 + burden)", "amount": money(labor_act),
        "detail": {"title": f"Labor — TimeActivity (to-the-day) · {t['hours']:.0f} hrs",
                   "cols": ["Date", "Employee", "Hours", "Cost rate", "Cost $", "Description"],
                   "rows": [[e.get("TxnDate", ""),
                             (e.get("EmployeeRef") or e.get("VendorRef") or {}).get("name", ""),
                             round(float(e.get("Hours", 0) or 0) + float(e.get("Minutes", 0) or 0) / 60, 1),
                             round(float(e.get("CostRate", 0) or 0), 2),
                             round((float(e.get("Hours", 0) or 0) + float(e.get("Minutes", 0) or 0) / 60) * float(e.get("CostRate", 0) or 0)),
                             e.get("Description", "")]
                            for e in sorted(ta_raw, key=lambda z: z.get("TxnDate", ""))]}})
    for cat in sorted(cat_act, key=lambda c: -cat_act[c]):
        rows = [[x["date"], x["ttype"], x["name"], x["memo"], money(x["amount"])]
                for x in sorted(cat_txns[cat], key=lambda z: z["date"])]
        act_cogs.append({"cat": cat, "amount": money(cat_act[cat]),
                         "detail": {"title": f"{cat} — QBO transactions",
                                    "cols": ["Date", "Type", "Name", "Memo", "Amount $"], "rows": rows}})
    actual_cogs_total = sum(c["amount"] for c in act_cogs)

    # actual revenue (invoices)
    inv_rows = [[i.get("TxnDate", ""), i.get("DocNumber", ""), money(i.get("TotalAmt")), money(i.get("Balance"))]
                for i in sorted(inv["invoices"], key=lambda z: z.get("TxnDate", ""))]
    act_rev = [{"label": "Billed (invoices)", "amount": money(inv["billed"]),
                "detail": {"title": "Invoices", "cols": ["Date", "Invoice #", "Amount $", "Open balance $"], "rows": inv_rows}}]

    # ----- QUOTE (budget) -----
    realized_rate = (labor_act / t["hours"]) if t["hours"] else 45.0
    work_h = (hs.get("workHours") or 0) + (hs.get("nonSovHours") or 0)
    travel_h = hs.get("travelHours") or 0
    mileage = sum(x.get("vehicleTravelCost", 0) for x in (td.get("travelExpense") or []) if isinstance(x, dict))
    perdiem = sum((x.get("numDays", 0) or 0) * (x.get("firstDayRate", 0) or 0) for x in (td.get("perDiem") or []) if isinstance(x, dict))
    material = sum((it.get("quantity") or 0) * (it.get("materialPrice") or 0) for it in sov)
    bud_labor = work_h * realized_rate
    bud_travel_labor = travel_h * realized_rate
    sov_rows = [[it.get("item", ""), it.get("quantity", 0), it.get("laborMen", 0), it.get("laborHours", 0),
                 money((it.get("quantity") or 0) * (it.get("materialPrice") or 0)), it.get("notes", "")] for it in sov]
    q_cogs = [
        {"cat": "Labor (W-2 + burden)", "amount": money(bud_labor),
         "detail": {"title": f"Budget labor — {work_h:.0f} onsite/non-SOV hrs × ${realized_rate:.0f}/hr (realized cost rate)",
                    "cols": ["SOV item", "Qty", "Men", "Hours", "Material $", "Notes"], "rows": sov_rows}},
        {"cat": "Travel & Lodging", "amount": money(bud_travel_labor + mileage),
         "detail": {"title": f"Budget travel — {travel_h:.1f} travel hrs × ${realized_rate:.0f} + mileage",
                    "cols": ["Component", "Detail", "Amount $"],
                    "rows": [["Travel labor", f"{travel_h:.1f} hrs × ${realized_rate:.0f}", money(bud_travel_labor)],
                             ["Mileage / vehicle", "from estimate travel_data", money(mileage)]]}},
        {"cat": "Per Diem", "amount": money(perdiem),
         "detail": {"title": "Budget per diem", "cols": ["Days", "Rate", "Amount $"],
                    "rows": [[x.get("numDays", 0), x.get("firstDayRate", 0), money((x.get("numDays", 0) or 0) * (x.get("firstDayRate", 0) or 0))]
                             for x in (td.get("perDiem") or []) if isinstance(x, dict)]}},
        {"cat": "Materials", "amount": money(material),
         "detail": {"title": "Budget materials (from SOV line items)",
                    "cols": ["SOV item", "Qty", "Material $/unit", "Extended $"],
                    "rows": [[it.get("item", ""), it.get("quantity", 0), it.get("materialPrice", 0),
                              money((it.get("quantity") or 0) * (it.get("materialPrice") or 0))] for it in sov if (it.get("materialPrice") or 0)]}},
    ]
    q_cogs = [c for c in q_cogs if c["amount"] or c["cat"] == "Labor (W-2 + burden)"]
    quote_cogs_total = sum(c["amount"] for c in q_cogs)
    q_rev = [{"label": "Quoted (NET-30)", "amount": money(quoted),
              "detail": {"title": f"Quote #{o.get('quote_number')} — SOV line items (basis of price)",
                         "cols": ["SOV item", "Qty", "Men", "Hours", "Material $", "Notes"], "rows": sov_rows}}]

    # ----- summary / EAC -----
    done = j.get("status") in DONE_STATUS
    pct = 1.0 if done else (min(inv["billed"] / quoted, 1.0) if (quoted and inv["billed"]) else None)
    proj_cost = (actual_cogs_total / pct) if pct else None
    proj_gm = ((quoted - proj_cost) / quoted) if (pct and quoted) else None
    rev_now = inv["billed"] or 0
    gm_snapshot = ((rev_now - actual_cogs_total) / rev_now) if rev_now else None
    bud_gm = ((quoted - quote_cogs_total) / quoted) if quoted else None
    net_after_oh = (proj_gm - OVERHEAD_PCT) if proj_gm is not None else None

    # ----- monthly -----
    m = collections.defaultdict(lambda: {"cost": 0.0, "billed": 0.0, "hours": 0.0})
    for e in ta_raw:
        mo = (e.get("TxnDate") or "")[:7]
        h = float(e.get("Hours", 0) or 0) + float(e.get("Minutes", 0) or 0) / 60
        m[mo]["cost"] += h * float(e.get("CostRate", 0) or 0); m[mo]["hours"] += h
    for x in txns:
        if x["isIncome"] or x["acct4"] in LABOR_ACCTS:
            continue
        m[(x["date"] or "")[:7]]["cost"] += x["amount"]
    for i in inv["invoices"]:
        m[(i.get("TxnDate") or "")[:7]]["billed"] += float(i.get("TotalAmt", 0) or 0)
    months = sorted(k for k in m if k)
    monthly = []
    cum_cost = 0
    for mo in months:
        cum_cost += m[mo]["cost"]
        monthly.append({"month": mo, "cost": money(m[mo]["cost"]), "billed": money(m[mo]["billed"]),
                        "hours": round(m[mo]["hours"], 1), "cumCost": money(cum_cost),
                        "detail": {"title": f"{mo} — cost transactions & time",
                                   "cols": ["Date", "Source", "Detail", "Amount/Hrs"],
                                   "rows": (
                                       [[e.get("TxnDate"), "Time", (e.get("EmployeeRef") or {}).get("name", ""),
                                         f"{float(e.get('Hours',0) or 0):.1f} hrs"] for e in ta_raw if (e.get("TxnDate") or "")[:7] == mo]
                                       + [[x["date"], x["ttype"], x["name"], money(x["amount"])]
                                          for x in txns if (x["date"] or "")[:7] == mo and not x["isIncome"] and x["acct4"] not in LABOR_ACCTS])}})

    if not kind:
        kind = "Multi-month" if len(months) >= 3 else ("Short" if months else "—")
    return {
        "jn": jn, "title": j.get("title"), "customer": cust_name(j.get("customer_id")) or cust_name(o.get("customer_id")),
        "division": (j.get("amp_division") or o.get("amp_division") or "").replace("_", " ").title(),
        "status": j.get("status"), "kind": kind, "quoteNo": o.get("quote_number"),
        "summary": {
            "quoted": money(quoted), "billed": money(inv["billed"]), "collected": money(inv["collected"]),
            "openAR": money(inv["open"]), "pct": pct,
            "budgetCogs": quote_cogs_total, "actualCogs": actual_cogs_total, "projCost": money(proj_cost) if proj_cost else None,
            "budgetHours": round(work_h + travel_h, 1), "actualHours": round(worked_hours, 1),
            "budGM": bud_gm, "projGM": proj_gm, "gmSnapshot": gm_snapshot, "netAfterOH": net_after_oh,
            "target": TARGET,
        },
        "quote": {"revenue": q_rev, "cogs": q_cogs, "cogsTotal": quote_cogs_total},
        "actual": {"revenue": act_rev, "cogs": act_cogs, "cogsTotal": actual_cogs_total},
        "monthly": monthly,
    }


# Build every job that has QBO actuals pulled (pnl file present & non-trivial).
def has_data(jn):
    f = DATA / f"qbo_pnl_{jn}.json"
    return f.exists() and f.stat().st_size > 50

renderable = [jn for jn in jobmap if jn in jobs and has_data(jn)]
JOBS = []
for jn in renderable:
    try:
        JOBS.append(build_job(jn, jobmap[jn], None))
    except Exception as ex:
        print(f"  skip {jn}: {ex}")
# sort: in-progress (with activity) first, then pending, then completed; newest first
def _srt(J):
    st = J["status"]
    rank = 0 if st in {"in_progress", "ready_to_bill", "progress_billing"} else (1 if st == "pending" else 2)
    no_activity = 0 if (J["summary"]["actualCogs"] > 0 or J["summary"]["billed"] > 0) else 1
    return (rank, no_activity, -int(J["jn"]) if J["jn"].isdigit() else 0)
JOBS.sort(key=_srt)

# ---------------- HTML ----------------
HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMP Job Profitability Dashboard</title>
<style>
:root{--navy:#1F3864;--orange:#E8742C;--green:#1a7f37;--red:#c0392b;--bg:#f4f6f9;--line:#dde3ec;}
*{box-sizing:border-box;}
body{margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:#1c2330;}
header{background:var(--navy);color:#fff;padding:16px 24px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
header h1{font-size:18px;margin:0;font-weight:600;}
header .logo{font-weight:800;letter-spacing:1px;color:var(--orange);font-size:20px;}
.combo{position:relative;}
#picker{font-size:15px;padding:9px 14px;border-radius:6px;border:1px solid #ccc;width:440px;}
.opts{position:absolute;top:calc(100% + 2px);left:0;width:440px;background:#fff;border:1px solid #bbb;border-radius:6px;max-height:360px;overflow:auto;z-index:60;display:none;box-shadow:0 8px 22px rgba(0,0,0,.18);}
.opts.open{display:block;}
.opt{padding:8px 12px;cursor:pointer;font-size:13px;color:#1c2330;border-bottom:1px solid #f1f1f1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.opt:hover{background:#fff3e6;}
.opt .st{color:#8a94a3;font-size:11px;float:right;text-transform:capitalize;}
.meta{margin-left:auto;font-size:12px;opacity:.8;text-align:right;}
.wrap{max-width:1280px;margin:0 auto;padding:20px;}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px;}
.card .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7686;}
.card .val{font-size:22px;font-weight:700;margin-top:4px;}
.card.flag-good{border-left:5px solid var(--green);}
.card.flag-bad{border-left:5px solid var(--red);}
.card.flag-warn{border-left:5px solid var(--orange);}
.pill{display:inline-block;font-size:11px;padding:2px 8px;border-radius:20px;color:#fff;margin-left:6px;}
.pill.good{background:var(--green);}.pill.bad{background:var(--red);}.pill.warn{background:var(--orange);}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
@media(max-width:820px){.cols{grid-template-columns:1fr;}}
.panel{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;}
.panel h2{margin:0;padding:12px 16px;font-size:15px;background:var(--navy);color:#fff;}
.panel.act h2{background:var(--orange);}
table{width:100%;border-collapse:collapse;font-size:13px;}
td,th{padding:8px 14px;border-bottom:1px solid #eef1f5;text-align:left;}
th{font-size:11px;text-transform:uppercase;color:#6b7686;background:#fafbfc;}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;}
tr.sub td{font-weight:700;background:#f0f3f8;border-top:2px solid var(--line);}
tr.section td{font-weight:700;color:var(--navy);background:#eef2f8;font-size:12px;text-transform:uppercase;letter-spacing:.5px;}
.drill{color:#0a58ca;cursor:pointer;border-bottom:1px dotted #0a58ca;}
.drill:hover{background:#fff7ec;}
.gm-good{color:var(--green);font-weight:700;}.gm-bad{color:var(--red);font-weight:700;}
.monthly{margin-top:20px;}
.bars{display:flex;align-items:flex-end;gap:10px;height:170px;padding:14px 6px;border-bottom:1px solid var(--line);overflow-x:auto;}
.barwrap{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:54px;}
.barpair{display:flex;align-items:flex-end;gap:3px;height:130px;}
.bar{width:16px;border-radius:3px 3px 0 0;cursor:pointer;}
.bar.cost{background:var(--orange);}.bar.bill{background:var(--navy);}
.barlbl{font-size:10px;color:#6b7686;}
.legend{font-size:12px;padding:8px 16px;color:#6b7686;}
.legend b.c{color:var(--orange);}.legend b.b{color:var(--navy);}
.modal{position:fixed;inset:0;background:rgba(20,28,45,.55);display:none;align-items:center;justify-content:center;padding:20px;z-index:50;}
.modal.open{display:flex;}
.modalbox{background:#fff;border-radius:12px;max-width:900px;width:100%;max-height:85vh;overflow:auto;}
.modalbox h3{margin:0;padding:16px 20px;background:var(--navy);color:#fff;font-size:15px;position:sticky;top:0;display:flex;justify-content:space-between;}
.modalbox .x{cursor:pointer;font-weight:700;}
.note{font-size:12px;color:#6b7686;padding:6px 16px 16px;}
.foot{font-size:11px;color:#8a94a3;text-align:center;padding:24px;}
</style></head><body>
<header>
  <span class="logo">AMP</span><h1>Job Profitability Dashboard</h1>
  <div class="combo"><input id="picker" placeholder="Click or type to search jobs…" autocomplete="off"><div id="opts" class="opts"></div></div>
  <div class="meta">Bid: ampOS &nbsp;|&nbsp; Actuals: QuickBooks (AMPQES)<br>As of __PULL__ &middot; target gross margin __TARGET__ &middot; <span id="jc"></span> jobs</div>
</header>
<div class="wrap">
  <div id="summary" class="cards"></div>
  <div class="cols">
    <div class="panel"><h2>QUOTE / Budget</h2><table id="quoteTbl"></table></div>
    <div class="panel act"><h2>ACTUALS (to date)</h2><table id="actTbl"></table></div>
  </div>
  <div class="panel monthly"><h2 style="background:#39507a">Monthly view — cost (orange) vs billed (navy)</h2>
    <div id="bars" class="bars"></div>
    <div class="legend"><b class="c">&#9632;</b> Cost incurred &nbsp;&nbsp; <b class="b">&#9632;</b> Billed &nbsp;&middot;&nbsp; click a bar for that month's detail</div>
  </div>
  <div class="foot">Click any underlined number to see the underlying detail. ampOS bid data + QuickBooks (AMPQES) actuals &middot; refreshed daily via build_all.py.</div>
</div>
<div class="modal" id="modal"><div class="modalbox"><h3><span id="mTitle"></span><span class="x" onclick="closeM()">&times;</span></h3><div id="mBody"></div></div></div>
<script>
const JOBS = __DATA__;
const fmt = n => (n==null||n==='')?'':'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:0});
const pct = n => (n==null)?'&mdash;':(n*100).toFixed(1)+'%';
let DET = {};   // detail registry id -> {title,cols,rows}
let did = 0;
function reg(d){ if(!d) return null; const k='d'+(did++); DET[k]=d; return k; }
function drill(id){ const d=DET[id]; if(!d) return;
  document.getElementById('mTitle').innerHTML=d.title;
  let h='<table><tr>'+d.cols.map((c,i)=>'<th class="'+(i>0&&i>=d.cols.length-2?'num':'')+'">'+c+'</th>').join('')+'</tr>';
  if(!d.rows.length) h+='<tr><td colspan="'+d.cols.length+'" class="note">No underlying records.</td></tr>';
  d.rows.forEach(r=>{h+='<tr>'+r.map((v,i)=>{const isn=typeof v==='number';return '<td class="'+(isn?'num':'')+'">'+(isn?(d.cols[i].includes('$')||d.cols[i].includes('rate')?fmt(v):v.toLocaleString()):(v==null?'':v))+'</td>';}).join('')+'</tr>';});
  h+='</table>';
  document.getElementById('mBody').innerHTML=h;
  document.getElementById('modal').classList.add('open');
}
function closeM(){document.getElementById('modal').classList.remove('open');}
function numCell(v,detail){const k=reg(detail);return '<td class="num">'+(k?'<span class="drill" onclick="drill(\\''+k+'\\')">':'')+fmt(v)+(k?'</span>':'')+'</td>';}
function flagClass(gm,t){return gm==null?'flag-warn':(gm>=t?'flag-good':'flag-bad');}
function render(idx){
  DET={};did=0;
  const J=JOBS[idx], s=J.summary;
  // summary cards
  const proj = s.projGM, pillp = proj==null?'<span class="pill warn">no billing yet</span>':(proj>=s.target?'<span class="pill good">on target</span>':'<span class="pill bad">below '+(s.target*100)+'%</span>');
  const cards=[
    ['Status', (J.status||'').replace(/_/g,' '), ''],
    ['Quoted', fmt(s.quoted), ''],
    ['Billed', fmt(s.billed), ''],
    ['Collected', fmt(s.collected), ''],
    ['% complete (billed)', s.pct==null?'&mdash;':pct(s.pct), ''],
    ['Budget COGS', fmt(s.budgetCogs), ''],
    ['Actual COGS to date', fmt(s.actualCogs), ''],
    ['Projected final cost', s.projCost==null?'&mdash;':fmt(s.projCost), ''],
    ['Budget gross margin', pct(s.budGM), ''],
    ['Projected gross margin '+pillp, pct(s.projGM), flagClass(s.projGM,s.target)],
    ['Hours: bud &rarr; actual', s.budgetHours+' &rarr; '+s.actualHours, s.actualHours>s.budgetHours*1.1?'flag-warn':''],
    ['Net margin after overhead', s.netAfterOH==null?'&mdash;':pct(s.netAfterOH), ''],
  ];
  document.getElementById('summary').innerHTML = cards.map(c=>'<div class="card '+c[2]+'"><div class="lbl">'+c[0]+'</div><div class="val">'+c[1]+'</div></div>').join('');
  // quote table
  let q='<tr class="section"><td colspan="2">Revenue</td></tr>';
  J.quote.revenue.forEach(r=>{q+='<tr><td>'+r.label+'</td>'+numCell(r.amount,r.detail)+'</tr>';});
  q+='<tr class="section"><td colspan="2">Budgeted COGS</td></tr>';
  J.quote.cogs.forEach(r=>{q+='<tr><td>'+r.cat+'</td>'+numCell(r.amount,r.detail)+'</tr>';});
  q+='<tr class="sub"><td>Total budget COGS</td><td class="num">'+fmt(J.quote.cogsTotal)+'</td></tr>';
  q+='<tr class="sub"><td>Budget gross margin</td><td class="num '+(s.budGM>=s.target?'gm-good':'gm-bad')+'">'+pct(s.budGM)+'</td></tr>';
  document.getElementById('quoteTbl').innerHTML=q;
  // actual table
  let a='<tr class="section"><td colspan="2">Revenue</td></tr>';
  J.actual.revenue.forEach(r=>{a+='<tr><td>'+r.label+'</td>'+numCell(r.amount,r.detail)+'</tr>';});
  a+='<tr><td>Collected</td><td class="num">'+fmt(s.collected)+'</td></tr>';
  a+='<tr class="section"><td colspan="2">Actual COGS (to date)</td></tr>';
  J.actual.cogs.forEach(r=>{a+='<tr><td>'+r.cat+'</td>'+numCell(r.amount,r.detail)+'</tr>';});
  a+='<tr class="sub"><td>Total actual COGS</td><td class="num">'+fmt(J.actual.cogsTotal)+'</td></tr>';
  a+='<tr class="sub"><td>Projected gross margin</td><td class="num '+(s.projGM>=s.target?'gm-good':(s.projGM==null?'':'gm-bad'))+'">'+pct(s.projGM)+'</td></tr>';
  document.getElementById('actTbl').innerHTML=a;
  // monthly bars
  const mx=Math.max(1,...J.monthly.map(m=>Math.max(m.cost,m.billed)));
  document.getElementById('bars').innerHTML = J.monthly.map(m=>{
    const k=reg(m.detail);
    const ch=Math.round(125*m.cost/mx), bh=Math.round(125*m.billed/mx);
    return '<div class="barwrap"><div class="barpair" onclick="drill(\\''+k+'\\')">'
      +'<div class="bar cost" style="height:'+ch+'px" title="cost '+fmt(m.cost)+'"></div>'
      +'<div class="bar bill" style="height:'+bh+'px" title="billed '+fmt(m.billed)+'"></div></div>'
      +'<div class="barlbl">'+m.month.slice(2)+'</div></div>';
  }).join('') || '<div class="note">No monthly activity.</div>';
}
const picker=document.getElementById('picker');
const opts=document.getElementById('opts');
const labels=JOBS.map(j=>j.jn+' — '+j.title+(j.kind&&j.kind!=='—'?'  ('+j.kind+')':''));
document.getElementById('jc').textContent=JOBS.length;
function showOpts(q){
  q=(q||'').toLowerCase().trim();
  let h='';
  JOBS.forEach((j,i)=>{ if(q && labels[i].toLowerCase().indexOf(q)<0) return;
    h+='<div class="opt" data-i="'+i+'">'+labels[i]+'<span class="st">'+(j.status||'').replace(/_/g,' ')+'</span></div>'; });
  opts.innerHTML=h||'<div class="opt">no match</div>';
  opts.classList.add('open');
}
picker.addEventListener('focus',()=>{picker.select();showOpts('');});
picker.addEventListener('input',()=>showOpts(picker.value));
opts.addEventListener('mousedown',e=>{const o=e.target.closest('.opt');if(!o||o.dataset.i===undefined)return;
  const i=+o.dataset.i;picker.value=labels[i];opts.classList.remove('open');picker.blur();render(i);});
document.addEventListener('click',e=>{if(!e.target.closest('.combo'))opts.classList.remove('open');});
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeM();});
picker.value=labels[0]||'';render(0);
</script></body></html>"""

HTML = HTML.replace("__DATA__", json.dumps(JOBS)).replace("__PULL__", PULL_DATE).replace("__TARGET__", f"{int(TARGET*100)}%")
OUT.write_text(HTML, encoding="utf-8")
print("Saved:", OUT)
for J in JOBS:
    s = J["summary"]
    print(f"  {J['jn']} {J['title'][:34]:34} budGM {('%.0f%%'%(s['budGM']*100)) if s['budGM'] else '--':>5} projGM {('%.0f%%'%(s['projGM']*100)) if s['projGM'] else 'n/a':>5} | quoteCOGS {s['budgetCogs']:>8,} actCOGS {s['actualCogs']:>8,}")
