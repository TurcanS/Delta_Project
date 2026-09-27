"""Session-based accounts for citizens, municipal employees and administrators.

The SPA talks JSON to these routes. The session cookie is HttpOnly and SameSite=Lax,
and every state-changing route requires a JSON body, which a cross-site HTML form
cannot send, so plain CSRF via forms is not possible.
"""
import re
import secrets
import time
from collections import defaultdict, deque
from functools import wraps

from flask import Blueprint, g, jsonify, request, session

from app import db
from app.models import Complaint, Feedback, User, utcnow

auth = Blueprint('auth', __name__)

EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
MIN_PASSWORD = 8
LOGIN_WINDOW = 600
LOGIN_ATTEMPTS = 8
_failures = defaultdict(deque)


def current_user():
    if 'user' not in g:
        user_id = session.get('user_id')
        user = db.session.get(User, user_id) if user_id else None
        if user is not None and (not user.is_active or session.get('auth_version') != _auth_version(user)):
            clear_session()
            user = None
        g.user = user
    return g.user


def _auth_version(user):
    # Changing the password invalidates other sessions.
    return (user.password_hash or '')[-12:]


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return jsonify(error='auth_required'), 401
        return view(*args, **kwargs)
    return wrapper


def json_body():
    """The request's JSON object; None when the body is not JSON or not an object."""
    if not request.is_json:
        return None
    body = request.get_json(silent=True)
    if body is None:
        return {}
    return body if isinstance(body, dict) else None


# Kept when the signed-in person changes, so one browser cannot confirm a report twice.
SESSION_KEEP = ('confirmed_reports', 'voter')


def clear_session():
    kept = {key: session[key] for key in SESSION_KEEP if key in session}
    session.clear()
    session.update(kept)


def _start_session(user):
    clear_session()
    session.permanent = True
    session['user_id'] = user.id
    session['auth_version'] = _auth_version(user)
    user.last_login_at = utcnow()
    db.session.commit()


def _throttled(key):
    now = time.monotonic()
    attempts = _failures[key]
    while attempts and now - attempts[0] > LOGIN_WINDOW:
        attempts.popleft()
    return len(attempts) >= LOGIN_ATTEMPTS


def _unique_username(email):
    base = re.sub(r'[^a-z0-9]+', '', email.split('@')[0].lower())[:60] or 'user'
    candidate = base
    while db.session.execute(db.select(User).filter_by(username=candidate)).scalar():
        candidate = f'{base}{secrets.randbelow(10_000):04d}'
    return candidate


def create_user(email, password, full_name, role='citizen', language='ro'):
    user = User(email=email, username=_unique_username(email), full_name=full_name, role=role,
                preferred_language=language)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return user


@auth.post('/api/auth/register')
def register():
    body = json_body()
    if body is None:
        return jsonify(error='json_required'), 415
    email = str(body.get('email') or '').strip().lower()
    password = str(body.get('password') or '')
    full_name = str(body.get('full_name') or '').strip()[:120]
    language = body.get('language') if body.get('language') in ('ro', 'ru') else 'ro'
    errors = {}
    if len(full_name) < 2:
        errors['full_name'] = 'required'
    if not EMAIL.match(email) or len(email) > 120:
        errors['email'] = 'invalid'
    if len(password) < MIN_PASSWORD:
        errors['password'] = 'too_short'
    if not errors and db.session.execute(db.select(User).filter_by(email=email)).scalar():
        errors['email'] = 'taken'
    if errors:
        return jsonify(error='validation', fields=errors), 400
    user = create_user(email, password, full_name, language=language)
    _start_session(user)
    return jsonify(user=user.to_dict()), 201


@auth.post('/api/auth/login')
def login():
    body = json_body()
    if body is None:
        return jsonify(error='json_required'), 415
    email = str(body.get('email') or '').strip().lower()
    password = str(body.get('password') or '')
    key = f'{request.remote_addr}|{email}'
    if _throttled(key):
        return jsonify(error='too_many_attempts'), 429
    user = db.session.execute(db.select(User).filter_by(email=email)).scalar()
    if user is None or not user.check_password(password):
        _failures[key].append(time.monotonic())
        return jsonify(error='invalid_credentials'), 401
    if not user.is_active:
        return jsonify(error='account_disabled'), 403
    _failures.pop(key, None)
    _start_session(user)
    return jsonify(user=user.to_dict())


@auth.post('/api/auth/logout')
def logout():
    clear_session()
    return jsonify(ok=True)


@auth.get('/api/auth/me')
def me():
    user = current_user()
    return jsonify(user=user.to_dict() if user else None)


@auth.patch('/api/account')
@login_required
def update_account():
    body = json_body()
    if body is None:
        return jsonify(error='json_required'), 415
    user = current_user()
    if 'full_name' in body:
        full_name = str(body['full_name'] or '').strip()[:120]
        if len(full_name) < 2:
            return jsonify(error='validation', fields={'full_name': 'required'}), 400
        user.full_name = full_name
    if body.get('preferred_language') in ('ro', 'ru'):
        user.preferred_language = body['preferred_language']
    db.session.commit()
    return jsonify(user=user.to_dict())


@auth.post('/api/account/password')
@login_required
def change_password():
    body = json_body()
    if body is None:
        return jsonify(error='json_required'), 415
    user = current_user()
    if not user.check_password(str(body.get('current_password') or '')):
        return jsonify(error='validation', fields={'current_password': 'wrong'}), 400
    new = str(body.get('new_password') or '')
    if len(new) < MIN_PASSWORD:
        return jsonify(error='validation', fields={'new_password': 'too_short'}), 400
    user.set_password(new)
    db.session.commit()
    session['auth_version'] = _auth_version(user)
    return jsonify(ok=True)


@auth.delete('/api/account')
@login_required
def delete_account():
    """Right to erasure: removes the account and every saved conversation; public reports stay, anonymised."""
    body = json_body()
    if body is None:
        return jsonify(error='json_required'), 415
    user = current_user()
    if not user.check_password(str(body.get('password') or '')):
        return jsonify(error='validation', fields={'password': 'wrong'}), 400
    db.session.execute(db.update(Feedback).where(Feedback.user_id == user.id).values(user_id=None))
    db.session.execute(db.update(Complaint).where(Complaint.user_id == user.id).values(user_id=None))
    db.session.delete(user)
    db.session.commit()
    clear_session()
    return jsonify(ok=True)
