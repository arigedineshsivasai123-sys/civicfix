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
sc, hdrs, body = req("OPTIONS", "/api/analytics/overview", headers={
    "Origin": VERCEL_ORIGIN,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "Authorization,Content-Type,Accept",
})
acao = hdrs.get("Access-Control-Allow-Origin") or hdrs.get("access-control-allow-origin", "")
acac = hdrs.get("Access-Control-Allow-Credentials") or hdrs.get("access-control-allow-credentials", "")
acah = hdrs.get("Access-Control-Allow-Headers") or hdrs.get("access-control-allow-headers", "")
vary = hdrs.get("Vary") or hdrs.get("vary", "")
all_pass &= check("OPTIONS /api/analytics/overview with Accept header → 200", sc == 200, f"got {sc}")
all_pass &= check(f"ACAO == '{VERCEL_ORIGIN}'", acao == VERCEL_ORIGIN, acao)
all_pass &= check("ACAC == 'true'", acac.lower() == "true", acac)
all_pass &= check("Allow-Headers includes Accept", "Accept" in acah or "accept" in acah.lower(), acah)
all_pass &= check("Vary contains Origin", "Origin" in vary, vary)

# Vercel preview branch domain preflight
preview_origin = "https://civicfix-feat-preview.vercel.app"
sc_prev, hdrs_prev, _ = req("OPTIONS", "/api/grievances", headers={
    "Origin": preview_origin,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "Authorization,Content-Type,Accept",
})
acao_prev = hdrs_prev.get("Access-Control-Allow-Origin") or hdrs_prev.get("access-control-allow-origin", "")
all_pass &= check(f"OPTIONS from Vercel preview branch: ACAO == '{preview_origin}'", acao_prev == preview_origin, acao_prev)

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

# ── 4. Grievances — public feed & unauthenticated ────────────────────────────
print("-- Grievances (public feed & unauthenticated) ---------------------")
sc, hdrs, body = req("GET", "/api/grievances/public-feed", headers={"Origin": VERCEL_ORIGIN})
acao = hdrs.get("Access-Control-Allow-Origin") or hdrs.get("access-control-allow-origin", "")
all_pass &= check("GET /api/grievances/public-feed → 200", sc == 200, f"got {sc}")
all_pass &= check("ACAO present on public feed", acao == VERCEL_ORIGIN, acao)
try:
    feed = json.loads(body)
    feed_count = len(feed.get("grievances", []))
    all_pass &= check("Public feed contains grievances", feed_count > 0, f"{feed_count} items")
except Exception as e:
    all_pass &= check("Public feed valid JSON", False, str(e))

sc_unauth, hdrs_unauth, _ = req("GET", "/api/grievances", headers={"Origin": VERCEL_ORIGIN})
acao_unauth = hdrs_unauth.get("Access-Control-Allow-Origin") or hdrs_unauth.get("access-control-allow-origin", "")
all_pass &= check("GET /api/grievances (no token) → 401", sc_unauth == 401, f"got {sc_unauth}")
all_pass &= check("ACAO present on 401 (browser-readable)", acao_unauth == VERCEL_ORIGIN, acao_unauth)
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
    # ── 6. Grievance Submission & Tracking ──────────────────────────────────
    print("-- Grievance Submission & Tracking --------------------------------")
    submission_payload = {
        "title": "Probe Automated Grievance Check",
        "category": "Potholes & Asphalt Damage",
        "locality": "Production Probe Sector",
        "street_or_landmark": "Sensor Station 1",
        "priority": "Medium",
        "description": "Automated verification of grievance creation pipeline after database fix."
    }
    sc_sub, hdrs_sub, body_sub = req("POST", "/api/grievances", headers={
        "Origin": VERCEL_ORIGIN,
        "Authorization": f"Bearer {token}",
    }, body=submission_payload)
    all_pass &= check("POST /api/grievances → 201", sc_sub == 201, f"got {sc_sub}")
    sub_data = {}
    try:
        sub_data = json.loads(body_sub)
    except Exception:
        pass
    sub_case_id = sub_data.get("case_id", "")
    all_pass &= check("Response contains valid case_id", bool(sub_case_id and sub_case_id.startswith("CF-")), sub_case_id)
    all_pass &= check("Response contains tracking_id", sub_data.get("tracking_id") == sub_case_id, sub_data.get("tracking_id"))
    all_pass &= check("Response contains numeric id", isinstance(sub_data.get("id"), int), str(sub_data.get("id")))

    if sub_case_id:
        sc_track, _, body_track = req("GET", f"/api/grievances/track/{sub_case_id}", headers={"Origin": VERCEL_ORIGIN})
        all_pass &= check(f"Public track GET /api/grievances/track/{sub_case_id} → 200", sc_track == 200, f"got {sc_track}")
    print()

# ── Summary ──────────────────────────────────────────────────────────────────
print("=" * 55)
if all_pass:
    print("[+] ALL CHECKS PASSED -- Backend is production-ready.")
else:
    print("[!] SOME CHECKS FAILED -- see details above.")
print()
sys.exit(0 if all_pass else 1)
