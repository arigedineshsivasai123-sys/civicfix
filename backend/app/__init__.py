import os
import logging
from flask import Flask, request, send_from_directory, jsonify
from flask_cors import CORS
from app.database import init_db

# ── Structured logging ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("civicfix")


def create_app():
    app = Flask(__name__)

    # ── Secret key ───────────────────────────────────────────────────
    secret = os.environ.get("SECRET_KEY", "")
    if not secret:
        import secrets as _s
        secret = _s.token_hex(32)
        logger.warning(
            "SECRET_KEY is not set. Using a random key — sessions will be "
            "invalidated on every restart. Set SECRET_KEY in production."
        )
    app.config["SECRET_KEY"] = secret

    # ── CORS ─────────────────────────────────────────────────────────
    # Support comma-separated ALLOWED_ORIGIN, strip trailing slashes,
    # and include exact Vercel production domain, preview domains, and local dev.
    import re

    raw_origin = os.environ.get("ALLOWED_ORIGIN", "")
    _explicit_origins = [o.strip().rstrip("/") for o in raw_origin.split(",") if o.strip()]

    _default_origins = [
        "https://civicfix-ss9ng.vercel.app",
        "https://civicfix.vercel.app",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:3000",
    ]
    for d in _default_origins:
        if d not in _explicit_origins:
            _explicit_origins.append(d)

    _vercel_preview_re = re.compile(r"^https:\/\/civicfix(-[a-zA-Z0-9_-]+)?\.vercel\.app$")
    _cors_origins = list(_explicit_origins) + [_vercel_preview_re]

    def _is_origin_allowed(origin: str) -> bool:
        if not origin:
            return False
        clean = origin.rstrip("/")
        if clean in _explicit_origins:
            return True
        if _vercel_preview_re.match(clean):
            return True
        return False

    _allowed_headers = [
        "Content-Type",
        "Authorization",
        "X-Session-Token",
        "Accept",
        "Origin",
        "X-Requested-With",
    ]
    _allowed_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

    CORS(
        app,
        origins=_cors_origins,
        supports_credentials=True,
        allow_headers=_allowed_headers,
        methods=_allowed_methods,
    )

    # ── CORS safety net ──────────────────────────────────────────────
    # Flask-CORS handles standard routes, but this after_request hook
    # guarantees that preflight OPTIONS, errors (401, 404, 500), and all
    # blueprint responses always carry the complete set of required CORS headers.
    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "")
        if _is_origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = ", ".join(_allowed_headers)
            response.headers["Access-Control-Allow-Methods"] = ", ".join(_allowed_methods)
            vary = response.headers.get("Vary", "")
            if "Origin" not in vary:
                response.headers["Vary"] = (vary + ", Origin").lstrip(", ")
        return response

    # ── Database schema (idempotent — safe to call on every start) ───
    try:
        init_db()
        logger.info("Database schema verified/initialised.")
        try:
            from seed_data import seed_database
            seed_database(force_reset=False)
            logger.info("Database initial seed verified/completed.")
        except Exception as seed_exc:
            logger.warning(f"Database auto-seed check skipped: {seed_exc}")
    except Exception as exc:
        logger.error(f"Database initialisation failed: {exc}")
        raise

    # ── Upload folder ────────────────────────────────────────────────
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    uploads_dir = os.environ.get("UPLOAD_FOLDER", os.path.join(backend_dir, "uploads"))
    os.makedirs(uploads_dir, exist_ok=True)
    app.config["UPLOAD_FOLDER"] = uploads_dir

    # ── Blueprints ───────────────────────────────────────────────────
    from app.routes.auth_routes import auth_bp
    from app.routes.grievance_routes import grievances_bp
    from app.routes.analytics_routes import analytics_bp
    from app.routes.admin_routes import admin_bp
    from app.routes.notification_routes import notification_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(grievances_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(notification_bp)

    # ── Static uploads ───────────────────────────────────────────────
    @app.route("/uploads/<path:filename>")
    def serve_upload(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    # ── Health check ─────────────────────────────────────────────────
    @app.route("/api/health")
    def health_check():
        from app.database import USE_POSTGRES
        db_mode = "postgresql" if USE_POSTGRES else "sqlite"
        return jsonify({
            "status": "healthy",
            "service": "CivicFix API",
            "version": "1.0.0",
            "db": db_mode,
        })

    # ── Error handlers ───────────────────────────────────────────────
    @app.errorhandler(404)
    def handle_404(e):
        return jsonify({"error": "Requested resource was not found."}), 404

    @app.errorhandler(500)
    def handle_500(e):
        logger.exception("Unhandled server error")
        return jsonify({"error": "Internal server error. Please try again."}), 500

    return app
