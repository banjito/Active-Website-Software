"""
ampOS (Supabase/PostgREST) read-only data puller.

Creds are read from environment variables so nothing secret is hard-coded:
  AMPOS_ANON   - the public anon apikey (JWT, role=anon)
  AMPOS_TOKEN  - the logged-in user's short-lived access_token (Bearer)

Both are grabbed from the live browser session (localStorage 'supabase.auth.token'
for the token; the anon key is baked into the app bundle). The access token
expires ~1 hour after login, so re-grab it if you get 401s.

Usage:
  python ampos_api.py schema <table>           # one row, all columns
  python ampos_api.py get <table> "<querystr>"  # raw PostgREST query, saved to data/<table>.json
  python ampos_api.py count <table>
"""
import os, sys, json, urllib.request, urllib.parse, pathlib

# Load .env (simple KEY=VALUE lines) if present, without overriding real env vars.
_envf = pathlib.Path(__file__).parent / ".env"
if _envf.exists():
    for _line in _envf.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())

BASE = "https://vdxprdihmbqomwqfldpo.supabase.co/rest/v1"
ANON = os.environ["AMPOS_ANON"]
TOKEN = os.environ["AMPOS_TOKEN"]
OUT = pathlib.Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)


SCHEMA = os.environ.get("AMPOS_SCHEMA", "public")


def call(path, prefer=None):
    url = f"{BASE}/{path}"
    req = urllib.request.Request(url)
    req.add_header("apikey", ANON)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept-Profile", SCHEMA)
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8")
            crange = r.headers.get("Content-Range")
            return json.loads(body), crange
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode("utf-8")}, None


def main():
    cmd = sys.argv[1]
    if cmd == "schema":
        table = sys.argv[2]
        data, _ = call(f"{table}?select=*&limit=1")
        if isinstance(data, list) and data:
            print(f"{table} columns:")
            for k, v in data[0].items():
                vs = json.dumps(v)
                if len(vs) > 80:
                    vs = vs[:80] + "..."
                print(f"  {k}: {vs}")
        else:
            print(json.dumps(data, indent=2))
    elif cmd == "count":
        table = sys.argv[2]
        data, crange = call(f"{table}?select=id", prefer="count=exact")
        print(f"{table} count header: {crange}")
    elif cmd == "get":
        table = sys.argv[2]
        query = sys.argv[3] if len(sys.argv) > 3 else "select=*"
        data, crange = call(f"{table}?{query}")
        outfile = OUT / f"{table}.json"
        outfile.write_text(json.dumps(data, indent=2), encoding="utf-8")
        n = len(data) if isinstance(data, list) else "err"
        print(f"saved {n} rows -> {outfile}  (Content-Range: {crange})")
        if isinstance(data, dict) and "_error" in data:
            print(json.dumps(data, indent=2)[:1000])
    else:
        print("unknown cmd")


if __name__ == "__main__":
    main()
