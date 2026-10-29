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
    # In production set ALLOWED_ORIGIN to the exact Vercel URL, e.g.:
    #   https://civicfix-ss9ng.vercel.app
    # In local dev it defaults to the Vite dev server.
    allowed_origin = os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173")
    _cors_origins = [allowed_origin, "http://localhost:5173", "http://127.0.0.1:5173"]

    CORS(
        app,
        origins=_cors_origins,
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization", "X-Session-Token"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    # ── CORS safety net ──────────────────────────────────────────────
    # Flask-CORS handles the standard cases, but this after_request hook
    # ensures CORS headers are present on ALL responses (including error
    # responses from blueprints that Flask-CORS might miss) without ever
    # setting a wildcard on credentialed requests.
    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "")
        if origin in _cors_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            # Tell caches that responses differ per Origin
            vary = response.headers.get("Vary", "")
            if "Origin" not in vary:
                response.headers["Vary"] = (vary + ", Origin").lstrip(", ")
        return response

    # ── Database schema (idempotent — safe to call on every start) ───
    try:
        init_db()
        logger.info("Database schema verified/initialised.")
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
