"""
Production entry point for Gunicorn (Render).
Start command: gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
"""
from app import create_app

app = create_app()
