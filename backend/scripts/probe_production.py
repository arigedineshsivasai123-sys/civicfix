"""
Production API probe — runs actual HTTP requests against the live Render backend.
Usage: python scripts/probe_production.py
"""
import json
import os
import sys
import urllib.request
import urllib.error

# Force UTF-8 output on Windows
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://civicfix-v1pn.onrender.com"
VERCEL_ORIGIN = "https://civicfix-ss9ng.vercel.app"
EVIL_ORIGIN = "https://evil.example.com"


def req(method, path, headers=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    h = {"Content-Type": "application/json", **(headers or {})}
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read().decode()
            return resp.status, dict(resp.headers), raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, dict(e.headers), raw


def check(label, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    mark = "[+]" if cond else "[!]"
    print(f"  {mark} {status}  {label}", f"({detail})" if detail else "")
    return cond


print("\n=== CivicFix Production API Probe ===")
print(f"  Backend: {BASE}")
print(f"  Vercel origin used in requests: {VERCEL_ORIGIN}\n")

all_pass = True

# ── 1. Health check ──────────────────────────────────────────────────────────
print("-- Health check --------------------------------------------------")
sc, hdrs, body = req("GET", "/api/health")
data = json.loads(body) if sc == 200 else {}
all_pass &= check("GET /api/health → 200", sc == 200, f"got {sc}")
all_pass &= check("status == 'healthy'", data.get("status") == "healthy", data.get("status"))
all_pass &= check("db == 'postgresql'", data.get("db") == "postgresql", data.get("db"))
print(f"  Response body: {body[:200]}\n")

# ── 2. CORS OPTIONS preflight ────────────────────────────────────────────────
print("-- CORS preflight ------------------------------------------------")
sc, hdrs, body = req("OPTIONS", "/api/auth/login", headers={
    "Origin": VERCEL_ORIGIN,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Content-Type,Authorization",
})
acao = hdrs.get("Access-Control-Allow-Origin") or hdrs.get("access-control-allow-origin", "")
acac = hdrs.get("Access-Control-Allow-Credentials") or hdrs.get("access-control-allow-credentials", "")
vary = hdrs.get("Vary") or hdrs.get("vary", "")
all_pass &= check("OPTIONS /api/auth/login → 200", sc == 200, f"got {sc}")
all_pass &= check(f"ACAO == '{VERCEL_ORIGIN}'", acao == VERCEL_ORIGIN, acao)
all_pass &= check("ACAC == 'true'", acac.lower() == "true", acac)
all_pass &= check("Vary contains Origin", "Origin" in vary, vary)

# Disallowed origin should not get ACAO
sc2, hdrs2, _ = req("OPTIONS", "/api/auth/login", headers={
    "Origin": EVIL_ORIGIN,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Content-Type",
})
acao2 = hdrs2.get("Access-Control-Allow-Origin") or hdrs2.get("access-control-allow-origin", "")
all_pass &= check(f"OPTIONS from evil origin: ACAO != '{EVIL_ORIGIN}'", acao2 != EVIL_ORIGIN, f"got ACAO={acao2!r}")
print()

# ── 3. Login ─────────────────────────────────────────────────────────────────
print("-- Login ---------------------------------------------------------")
sc, hdrs, body = req("POST", "/api/auth/login", headers={"Origin": VERCEL_ORIGIN}, body={
    "email": "citizen@civicfix.gov",
    "password": "CivicFix2026!",
})
login_data = {}
try:
    login_data = json.loads(body)
except Exception:
    pass

acao = hdrs.get("Access-Control-Allow-Origin") or hdrs.get("access-control-allow-origin", "")
all_pass &= check("POST /api/auth/login → 200", sc == 200, f"got {sc}")
all_pass &= check(f"ACAO on login response == '{VERCEL_ORIGIN}'", acao == VERCEL_ORIGIN, acao)

token = login_data.get("token") or (login_data.get("user") or {}).get("token") or ""
all_pass &= check("Login response contains token", bool(token), "token present" if token else "NO token")
print(f"  Response body (truncated): {body[:300]}\n")

# ── 4. Grievances — unauthenticated ─────────────────────────────────────────
print("-- Grievances (unauthenticated) ----------------------------------")
sc, hdrs, body = req("GET", "/api/grievances", headers={"Origin": VERCEL_ORIGIN})
acao = hdrs.get("Access-Control-Allow-Origin") or hdrs.get("access-control-allow-origin", "")
all_pass &= check("GET /api/grievances (no token) → 401", sc == 401, f"got {sc}")
all_pass &= check("ACAO present on 401 (browser-readable)", acao == VERCEL_ORIGIN, acao)
print()

# ── 5. Grievances — authenticated ────────────────────────────────────────────
if token:
    print("-- Grievances (authenticated) ------------------------------------")
    sc, hdrs, body = req("GET", "/api/grievances", headers={
        "Origin": VERCEL_ORIGIN,
        "Authorization": f"Bearer {token}",
    })
    acao = hdrs.get("Access-Control-Allow-Origin") or hdrs.get("access-control-allow-origin", "")
    all_pass &= check("GET /api/grievances (with token) → 200", sc == 200, f"got {sc}")
    all_pass &= check("ACAO on 200 response", acao == VERCEL_ORIGIN, acao)
    try:
        griev = json.loads(body)
        count = len(griev) if isinstance(griev, list) else len(griev.get("grievances", griev.get("data", [])))
        print(f"  Grievances returned: {count}")
    except Exception:
        print(f"  Response (truncated): {body[:200]}")
    print()

# ── Summary ──────────────────────────────────────────────────────────────────
print("=" * 55)
if all_pass:
    print("[+] ALL CHECKS PASSED -- Backend is production-ready.")
else:
    print("[!] SOME CHECKS FAILED -- see details above.")
print()
sys.exit(0 if all_pass else 1)
