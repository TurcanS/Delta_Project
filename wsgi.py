"""Entry point for production servers: gunicorn wsgi:app (see gunicorn.conf.py)."""
from app import create_app

app = create_app()
