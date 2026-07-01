"""Helpers to load QBO JSON saved from qbo.js (which prepends dotenv/Client banners)
and to roll up job-level actuals from TimeActivity + ProfitAndLossDetail."""
import json, collections


def load_qbo(path):
    """Strip qbo.js banner lines and parse the JSON body.
    The dotenv tip lines can contain '{', so locate the real root by the first
    known top-level key and back up to its opening brace."""
    t = open(path, encoding="utf-8").read()
    for marker in ('"QueryResponse"', '"Header"', '"Fault"', '"Error"'):
        k = t.find(marker)
        if k != -1:
            start = t.rfind("{", 0, k)
            if start != -1:
                return json.loads(t[start:])
    # fallback: last line that looks like JSON
    raise ValueError(f"No JSON root found in {path}")


def time_rollup(path):
    """TimeActivity -> labor hours & cost, by day, by description, by person."""
    ta = load_qbo(path).get("QueryResponse", {}).get("TimeActivity", []) or []
    out = {"entries": len(ta), "hours": 0.0, "cost": 0.0,
           "by_day": collections.defaultdict(lambda: [0.0, 0.0]),  # date -> [hrs, cost]
           "by_desc": collections.defaultdict(lambda: [0.0, 0.0]),
           "by_person": collections.defaultdict(lambda: [0.0, 0.0])}
    for e in ta:
        h = float(e.get("Hours", 0) or 0) + float(e.get("Minutes", 0) or 0) / 60.0
        cr = float(e.get("CostRate", 0) or 0)
        c = h * cr
        out["hours"] += h; out["cost"] += c
        out["by_day"][e.get("TxnDate")][0] += h
        out["by_day"][e.get("TxnDate")][1] += c
        out["by_desc"][(e.get("Description") or "(none)").strip()][0] += h
        out["by_desc"][(e.get("Description") or "(none)").strip()][1] += c
        who = (e.get("EmployeeRef") or e.get("VendorRef") or {}).get("name", "?")
        out["by_person"][who][0] += h
        out["by_person"][who][1] += c
    return out


def _walk(rows, acc):
    for r in rows.get("Row", []):
        if "Rows" in r:
            _walk(r["Rows"], acc)
        cd = r.get("ColData")
        if cd and r.get("type") == "Data":
            acc.append(cd)


def pnl_rollup(path):
    """ProfitAndLossDetail -> transactions with income vs expense split.
    Returns dict with income$, expense$, and transaction list."""
    pnl = load_qbo(path)
    cols = [c["ColTitle"] for c in pnl["Columns"]["Column"]]
    ai = cols.index("Amount")
    rows = []
    _walk(pnl["Rows"], rows)
    txns = []
    income = 0.0; expense = 0.0
    for cd in rows:
        vals = [c.get("value", "") for c in cd]
        amt = float(vals[ai]) if vals[ai] not in ("", None) else 0.0
        ttype = vals[1]
        txns.append({"date": vals[0], "type": ttype, "name": vals[3],
                     "class": vals[4], "memo": vals[5], "amount": amt})
        # In P&L detail, income txns (Invoice/SalesReceipt) are positive income;
        # expenses (Bill/Expense/Check) are costs. Classify by txn type.
        if ttype in ("Invoice", "Sales Receipt", "Payment", "Credit Memo", "Deposit"):
            income += amt
        else:
            expense += amt
    return {"income": income, "expense": expense, "txns": txns, "cols": cols}


def invoice_rollup(path):
    inv = load_qbo(path).get("QueryResponse", {}).get("Invoice", []) or []
    billed = sum(float(i.get("TotalAmt", 0) or 0) for i in inv)
    balance = sum(float(i.get("Balance", 0) or 0) for i in inv)
    return {"count": len(inv), "billed": billed, "collected": billed - balance,
            "open": balance, "invoices": inv}
