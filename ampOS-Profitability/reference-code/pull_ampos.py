"""
Pull ampOS (Supabase) bid-side data unattended, using ampos_auth for the token.
Replaces the manual browser capture. Saves data/{opportunities,estimates,jobs,
customers,contacts}.json. Each table lives in a specific Postgres schema (set via
the Accept-Profile header).

Run:  python pull_ampos.py
"""
import json, pathlib, urllib.request, urllib.error
import ampos_auth as A

BASE = "https://vdxprdihmbqomwqfldpo.supabase.co/rest/v1"
DATA = pathlib.Path(__file__).parent / "data"
DATA.mkdir(exist_ok=True)

PULLS = [
    ("opportunities", "business", "select=*&offset=0&limit=10000"),
    ("estimates", "business",
     "select=id,opportunity_id,quote_number,status,created_at,updated_at,user_id,data,travel_data&limit=5000"),
    ("jobs", "neta_ops", "select=*&deleted_at=is.null&limit=5000"),
    ("customers", "common", "select=*&limit=10000"),
    ("contacts", "common", "select=*&limit=10000"),
]


def pull(table, schema, query, token):
    req = urllib.request.Request(f"{BASE}/{table}?{query}")
    req.add_header("apikey", A.ANON)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept-Profile", schema)
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode("utf-8"))
    (DATA / f"{table}.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    return len(data) if isinstance(data, list) else data


def main():
    token = A.get_access_token()
    for table, schema, query in PULLS:
        try:
            n = pull(table, schema, query, token)
            print(f"  {table}: {n} rows", flush=True)
        except urllib.error.HTTPError as e:
            print(f"  {table}: HTTP {e.code} {e.read().decode()[:120]}", flush=True)


if __name__ == "__main__":
    main()
