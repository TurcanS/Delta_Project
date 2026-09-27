"""Production behaviour shared by every request: sessions, database, errors, headers, speed.

- The session secret survives restarts and is shared by all worker processes.
- SQLite runs in WAL mode with a busy timeout (readers never block the crawler or each other)
  and enforces foreign keys, so ON DELETE rules in the migrations actually apply.
- /api errors are always JSON; security headers and a Content-Security-Policy on every page.
- Hashed build assets are cached for a year and served gzipped from an in-memory cache.
"""
import gzip
import hashlib
import os
import re
import secrets
import threading
import time
from pathlib import Path

from flask import g, jsonify, request
from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException

COMPRESSIBLE = ('application/json', 'text/', 'application/javascript', 'image/svg+xml')
_gzip_cache = {}
_gzip_lock = threading.Lock()


def persistent_secret(app):
    """SECRET_KEY from the environment, else one generated once and kept in the instance folder.

    A random key per process would sign each worker's sessions differently: a visitor signed in
    through one worker would be signed out by the next.
    """
    if os.environ.get('SECRET_KEY'):
        return
    path = Path(app.instance_path) / 'secret_key'
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as file:
            file.write(secrets.token_hex(32))
    except FileExistsError:
        pass
    app.config['SECRET_KEY'] = path.read_text().strip()


@event.listens_for(Engine, 'connect')
def _sqlite_pragmas(connection, _record):
    if type(connection).__module__.startswith('sqlite3'):
        cursor = connection.cursor()
        cursor.execute('PRAGMA journal_mode=WAL')
        cursor.execute('PRAGMA synchronous=NORMAL')
        cursor.execute('PRAGMA busy_timeout=5000')
        cursor.execute('PRAGMA foreign_keys=ON')
        cursor.close()


def _inline_script_hashes(app):
    """CSP hashes for the inline scripts of the built index.html (the theme bootstrap)."""
    from app.routes import FRONTEND_DIST
    index = FRONTEND_DIST / 'index.html'
    if not index.is_file():
        return []
    markup = index.read_text(encoding='utf-8')
    scripts = re.findall(r'<script>(.*?)</script>', markup, re.S)
    import base64
    return [f"'sha256-{base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()}'" for body in scripts]


def content_security_policy(app):
    script = ' '.join(["'self'", *_inline_script_hashes(app)])
    return '; '.join([
        "default-src 'self'",
        f'script-src {script}',
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://proiecte.chisinau.md",
        "connect-src 'self'",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ])


def _gzip(response):
    if (response.status_code != 200 or 'gzip' not in request.headers.get('Accept-Encoding', '')
            or response.headers.get('Content-Encoding') or not response.mimetype.startswith(COMPRESSIBLE)):
        return response
    response.direct_passthrough = False
    data = response.get_data()
    if len(data) < 1024:
        return response
    if request.path.startswith('/assets/'):
        # Built assets never change under the same name: compress each once.
        key = (request.path, len(data))
        with _gzip_lock:
            if key not in _gzip_cache:
                _gzip_cache[key] = gzip.compress(data, 6)
            compressed = _gzip_cache[key]
    else:
        compressed = gzip.compress(data, 5)
    response.set_data(compressed)
    response.headers['Content-Encoding'] = 'gzip'
    response.headers['Vary'] = 'Accept-Encoding'
    return response


def init_platform(app):
    persistent_secret(app)
    policy = {'value': None}

    @app.before_request
    def start_timer():
        g.started = time.perf_counter()

    @app.after_request
    def finish(response):
        if request.path.startswith('/assets/'):
            response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        elif request.path == '/' or response.mimetype == 'text/html':
            response.headers['Cache-Control'] = 'no-cache'
        if response.mimetype == 'text/html':
            if policy['value'] is None or app.debug:
                policy['value'] = content_security_policy(app)
            response.headers['Content-Security-Policy'] = policy['value']
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        response.headers.setdefault('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)')
        response = _gzip(response)
        if 'started' in g:
            response.headers['Server-Timing'] = f'app;dur={(time.perf_counter() - g.started) * 1000:.1f}'
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        if not request.path.startswith('/api/'):
            return error
        names = {413: 'too_large', 404: 'not_found', 405: 'method_not_allowed', 400: 'bad_request', 429: 'too_many_requests'}
        return jsonify(error=names.get(error.code, error.name.lower().replace(' ', '_'))), error.code

    @app.errorhandler(Exception)
    def server_error(error):
        from app import db
        db.session.rollback()
        app.logger.exception('Unhandled error on %s %s', request.method, request.path)
        if request.path.startswith('/api/'):
            return jsonify(error='server_error'), 500
        return 'A apărut o eroare. Reîncercați peste câteva momente.', 500

    @app.get('/api/health')
    def health():
        """Liveness and readiness for a load balancer: the database answers and the library index exists."""
        from app import db
        started = time.perf_counter()
        try:
            db.session.execute(text('SELECT 1'))
            from app.library import has_fts
            fts = has_fts()
        except Exception:  # the check itself must never raise
            return jsonify(status='error', database='unavailable'), 503
        return jsonify(status='ok', database='ok', search_index=fts, db_ms=round((time.perf_counter() - started) * 1000, 1))
