import os
from pathlib import Path


def _load_dotenv():
    """Read KEY=value pairs from the project .env without overriding real env vars."""
    env_file = Path(__file__).resolve().parent.parent / '.env'
    if not env_file.is_file():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"\''))


_load_dotenv()


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.urandom(32).hex()
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', '').lower() in ('1', 'true')
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 24 * 14
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL', 'sqlite:///app.db'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # one report photo plus its text
    RAG_API_URL = os.environ.get('RAG_API_URL', 'http://158.158.8.113:8000')
    RAG_API_KEY = os.environ.get('RAG_API_KEY', '')
    RAG_ADMIN_KEY = os.environ.get('RAG_ADMIN_KEY', '')
