"""
tests/test_cors_and_auth.py
============================
Tests that verify CORS behaviour and the full login → protected-resource flow
against the exact production origins used by CivicFix.

Key invariants checked:
  * OPTIONS preflights from an allowed origin → 200, ACAO header present
  * OPTIONS preflights from a disallowed origin → ACAO header absent
  * POST /api/auth/login from allowed origin → ACAO present, token returned
  * GET /api/grievances without a token → 401, ACAO still present (so the
    browser can actually read the 401 status code and error body)
  * GET /api/grievances with a valid token → 200, ACAO present
  * Full login → grievances round-trip from the Vercel production origin
"""

import os
import sys
import pytest

# Ensure the backend directory is on the path (same pattern as other test files)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Make the test suite use the production Vercel origin ───────────────────
PROD_ORIGIN = "https://civicfix-ss9ng.vercel.app"
EVIL_ORIGIN = "https://evil.example.com"
LOCAL_ORIGIN = "http://localhost:5173"

# Force the allowed_origin so tests are independent of the shell environment.
os.environ.setdefault("ALLOWED_ORIGIN", PROD_ORIGIN)


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def app():
    """Create a fresh application with the production ALLOWED_ORIGIN."""
    os.environ["ALLOWED_ORIGIN"] = PROD_ORIGIN
    from app import create_app
    from seed_data import seed_database
    application = create_app()
    application.config["TESTING"] = True
    # Seed a deterministic test database so auth tests can log in.
    seed_database(force_reset=True)
    return application


@pytest.fixture(scope="module")
def client(app):
    return app.test_client()


@pytest.fixture(scope="module")
def auth_token(client):
    """Return a valid bearer token obtained via POST /api/auth/login."""
    resp = client.post(
        "/api/auth/login",
        json={"email": "citizen@civicfix.gov", "password": "CivicFix2026!"},
        headers={"Origin": PROD_ORIGIN, "Content-Type": "application/json"},
    )
    assert resp.status_code == 200, f"Login failed: {resp.get_data(as_text=True)}"
    data = resp.get_json()
    token = data.get("token") or (data.get("user", {}) or {}).get("token")
    assert token, f"No token in login response: {data}"
    return token


# ── Preflight (OPTIONS) tests ────────────────────────────────────────────────

class TestPreflightAllowedOrigin:
    """OPTIONS from an allowed origin must include ACAO and return 200."""

    def test_login_preflight_status(self, client):
        resp = client.options(
            "/api/auth/login",
            headers={
                "Origin": PROD_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type,Authorization",
            },
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)

    def test_login_preflight_acao_header(self, client):
        resp = client.options(
            "/api/auth/login",
            headers={
                "Origin": PROD_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type,Authorization",
            },
        )
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao == PROD_ORIGIN, f"Expected ACAO={PROD_ORIGIN!r}, got {acao!r}"

    def test_grievances_preflight_acao_header(self, client):
        resp = client.options(
            "/api/grievances",
            headers={
                "Origin": PROD_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao == PROD_ORIGIN, f"Expected ACAO={PROD_ORIGIN!r}, got {acao!r}"

    def test_local_origin_preflight_acao(self, client):
        """localhost:5173 is always allowed (dev fallback)."""
        resp = client.options(
            "/api/auth/login",
            headers={
                "Origin": LOCAL_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao == LOCAL_ORIGIN, f"Expected ACAO={LOCAL_ORIGIN!r}, got {acao!r}"


class TestPreflightDisallowedOrigin:
    """OPTIONS from a disallowed origin must NOT receive an ACAO header."""

    def test_evil_origin_no_acao(self, client):
        resp = client.options(
            "/api/auth/login",
            headers={
                "Origin": EVIL_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao != EVIL_ORIGIN, (
            f"Security violation: ACAO should not be {EVIL_ORIGIN!r}"
        )
        assert acao != "*", "Security violation: ACAO must never be wildcard"


# ── Actual-request CORS tests ────────────────────────────────────────────────

class TestActualRequestCors:
    """Non-preflight requests from allowed origins must include ACAO."""

    def test_login_post_includes_acao(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "citizen@civicfix.gov", "password": "CivicFix2026!"},
            headers={"Origin": PROD_ORIGIN, "Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao == PROD_ORIGIN, f"Expected ACAO={PROD_ORIGIN!r}, got {acao!r}"

    def test_login_returns_token(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "citizen@civicfix.gov", "password": "CivicFix2026!"},
            headers={"Origin": PROD_ORIGIN, "Content-Type": "application/json"},
        )
        data = resp.get_json()
        token = data.get("token") or (data.get("user", {}) or {}).get("token")
        assert token, f"No token in response: {data}"

    def test_grievances_unauthenticated_returns_401_with_acao(self, client):
        """Browser must be able to read the 401 — ACAO must be present."""
        resp = client.get(
            "/api/grievances",
            headers={"Origin": PROD_ORIGIN},
        )
        assert resp.status_code == 401
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao == PROD_ORIGIN, (
            f"401 response missing ACAO={PROD_ORIGIN!r}; browser cannot read it. "
            f"Got: {acao!r}"
        )

    def test_grievances_authenticated_returns_200_with_acao(self, client, auth_token):
        resp = client.get(
            "/api/grievances",
            headers={
                "Origin": PROD_ORIGIN,
                "Authorization": f"Bearer {auth_token}",
            },
        )
        assert resp.status_code == 200
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao == PROD_ORIGIN, f"Expected ACAO={PROD_ORIGIN!r}, got {acao!r}"

    def test_health_check_no_cors_for_disallowed_origin(self, client):
        """Even GET /api/health should not grant ACAO to evil origins."""
        resp = client.get(
            "/api/health",
            headers={"Origin": EVIL_ORIGIN},
        )
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao != EVIL_ORIGIN
        assert acao != "*"


# ── End-to-end flow ─────────────────────────────────────────────────────────

class TestEndToEndLoginAndGrievances:
    """Full round-trip: login from Vercel origin, then fetch grievances."""

    def test_full_login_then_grievances(self, client):
        # Step 1 — login
        login_resp = client.post(
            "/api/auth/login",
            json={"email": "citizen@civicfix.gov", "password": "CivicFix2026!"},
            headers={"Origin": PROD_ORIGIN, "Content-Type": "application/json"},
        )
        assert login_resp.status_code == 200, login_resp.get_data(as_text=True)
        login_data = login_resp.get_json()
        token = login_data.get("token") or (login_data.get("user", {}) or {}).get("token")
        assert token, f"No token: {login_data}"

        # Step 2 — fetch grievances
        griev_resp = client.get(
            "/api/grievances",
            headers={
                "Origin": PROD_ORIGIN,
                "Authorization": f"Bearer {token}",
            },
        )
        assert griev_resp.status_code == 200, griev_resp.get_data(as_text=True)
        data = griev_resp.get_json()
        # Accept list or dict-with-grievances-key response shapes
        if isinstance(data, list):
            assert isinstance(data, list)
        else:
            assert "grievances" in data or "data" in data, f"Unexpected shape: {data}"

        # CORS header must be present on the 200 too
        acao = griev_resp.headers.get("Access-Control-Allow-Origin", "")
        assert acao == PROD_ORIGIN

    def test_manager_login_and_grievances(self, client):
        """Manager role should also be able to log in and see grievances."""
        login_resp = client.post(
            "/api/auth/login",
            json={
                "email": "manager.roads@civicfix.gov",
                "password": "CivicFix2026!",
            },
            headers={"Origin": PROD_ORIGIN, "Content-Type": "application/json"},
        )
        assert login_resp.status_code == 200, login_resp.get_data(as_text=True)
        login_data = login_resp.get_json()
        token = login_data.get("token") or (login_data.get("user", {}) or {}).get("token")
        assert token

        griev_resp = client.get(
            "/api/grievances",
            headers={
                "Origin": PROD_ORIGIN,
                "Authorization": f"Bearer {token}",
            },
        )
        assert griev_resp.status_code == 200


# ── Vary header ──────────────────────────────────────────────────────────────

class TestVaryHeader:
    """Responses must include 'Vary: Origin' so CDNs/proxies cache correctly."""

    def test_login_response_has_vary_origin(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "citizen@civicfix.gov", "password": "CivicFix2026!"},
            headers={"Origin": PROD_ORIGIN, "Content-Type": "application/json"},
        )
        vary = resp.headers.get("Vary", "")
        assert "Origin" in vary, f"'Origin' not in Vary header: {vary!r}"

    def test_401_response_has_vary_origin(self, client):
        resp = client.get(
            "/api/grievances",
            headers={"Origin": PROD_ORIGIN},
        )
        vary = resp.headers.get("Vary", "")
        assert "Origin" in vary, f"'Origin' not in Vary header on 401: {vary!r}"


# ── Seed Demo Endpoint tests ────────────────────────────────────────────────

class TestSeedDemoEndpoint:
    """POST /api/admin/seed-demo is safe, idempotent, and returns 200."""

    def test_seed_demo_idempotent_when_already_seeded(self, client):
        resp = client.post("/api/admin/seed-demo", headers={"Origin": PROD_ORIGIN})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("status") == "ok"
