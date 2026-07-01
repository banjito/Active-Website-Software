"""
Unattended ampOS (Supabase) auth. Mints fresh access tokens from a stored
refresh token so daily pulls run with no browser/login.

Token store lives OUTSIDE OneDrive (per workspace policy — rotating secrets must
not sync): %USERPROFILE%\\.ampos-tokens\\.env  with key AMPOS_REFRESH_TOKEN
(plus cached AMPOS_ACCESS_TOKEN / AMPOS_EXPIRES_AT, auto-managed).

Supabase rotates the refresh token on every use, so we persist the new one each
time. Seed once from a live browser session:  python ampos_auth.py seed <refresh_token>

The anon key is the app's PUBLIC publishable key (baked into the ampOS JS bundle);
safe to embed. Override via env AMPOS_ANON if it ever rotates.
"""
import json, os, sys, time, pathlib, urllib.request, urllib.error

SUPABASE = "https://vdxprdihmbqomwqfldpo.supabase.co"
ANON = os.environ.get("AMPOS_ANON",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkeHByZGlobWJxb213cWZsZHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2OTYwMjUsImV4cCI6MjA1OTI3MjAyNX0.FVCSHH1dXvamJuqBivAqC4LPbOm5SqQ1gmh2zKlgXPo")
STORE = pathlib.Path.home() / ".ampos-tokens" / ".env"


def _read():
    d = {}
    if STORE.exists():
        for ln in STORE.read_text(encoding="utf-8").splitlines():
            ln = ln.strip()
            if "=" in ln and not ln.startswith("#"):
                k, v = ln.split("=", 1)
                d[k.strip()] = v.strip()
    return d


def _write(d):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text("\n".join(f"{k}={v}" for k, v in d.items()) + "\n", encoding="utf-8")


def seed(refresh_token):
    d = _read(); d["AMPOS_REFRESH_TOKEN"] = refresh_token
    d.pop("AMPOS_ACCESS_TOKEN", None); d.pop("AMPOS_EXPIRES_AT", None)
    _write(d)
    print(f"seeded refresh token -> {STORE}")


def get_access_token(force=False):
    d = _read()
    at = d.get("AMPOS_ACCESS_TOKEN")
    exp = int(d.get("AMPOS_EXPIRES_AT", "0") or 0)
    if at and not force and exp - time.time() > 120:
        return at
    rt = d.get("AMPOS_REFRESH_TOKEN")
    if not rt:
        raise SystemExit(f"No AMPOS_REFRESH_TOKEN in {STORE}. Seed it: python ampos_auth.py seed <token>")
    req = urllib.request.Request(
        f"{SUPABASE}/auth/v1/token?grant_type=refresh_token",
        data=json.dumps({"refresh_token": rt}).encode(),
        headers={"apikey": ANON, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            tok = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ampOS token refresh failed ({e.code}): {e.read().decode()[:200]}\n"
                         f"Re-seed from a fresh browser session.")
    d["AMPOS_REFRESH_TOKEN"] = tok["refresh_token"]      # rotated — persist new one
    d["AMPOS_ACCESS_TOKEN"] = tok["access_token"]
    d["AMPOS_EXPIRES_AT"] = str(int(time.time()) + int(tok.get("expires_in", 3600)))
    _write(d)
    return tok["access_token"]


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "seed":
        seed(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == "test":
        t = get_access_token(force=True)
        print("OK — minted access token, length", len(t))
    else:
        print("usage: ampos_auth.py seed <refresh_token> | test")
