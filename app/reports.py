"""Public board of city problems: photo reports, "I saw it too" confirmations and fixes.

Anyone may report and confirm; only municipal employees change a report's status or
attach the after-photo that proves the fix. Every photo is decoded and re-encoded as JPEG
before it is stored, so what the board serves is a real image with no camera metadata.
"""
import secrets
import time
import warnings
from collections import defaultdict, deque
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from flask import Blueprint, current_app, jsonify, request, send_from_directory, session

from app import db
from app.auth import current_user, json_body
from app.models import Complaint, ComplaintStatus, utcnow
from app.sector_data import SECTORS

reports = Blueprint('reports', __name__)

CATEGORIES = ('pothole', 'lighting', 'waste', 'ads', 'sidewalk', 'vandalism', 'greenery', 'other')
STATUSES = {'reported': ComplaintStatus.sent, 'in_progress': ComplaintStatus.approved, 'solved': ComplaintStatus.solved}
MAX_PHOTO_BYTES = 8 * 1024 * 1024
MAX_PHOTO_PIXELS = 40_000_000
MAX_PHOTO_EDGE = 1600
PAGE_SIZE = 60
POST_WINDOW = 600
POSTS_PER_WINDOW = 6
_posts = defaultdict(deque)


def photo_dir():
    folder = Path(current_app.instance_path) / 'uploads' / 'reports'
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _decode(data):
    """A fully decoded, upright RGB image, or None when the bytes are not a usable photo."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as probe:
                if probe.format not in ('JPEG', 'PNG', 'WEBP') or probe.width * probe.height > MAX_PHOTO_PIXELS:
                    return None
                probe.verify()
            image = Image.open(BytesIO(data))
            image.load()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        return None
    image = ImageOps.exif_transpose(image)
    return image.convert('RGB')


def save_photo(upload):
    """Store an uploaded photo under a random name; returns (filename, error)."""
    if upload is None or not upload.filename:
        return None, 'required'
    data = upload.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        return None, 'too_large'
    image = _decode(data)
    if image is None:
        return None, 'unsupported'
    image.thumbnail((MAX_PHOTO_EDGE, MAX_PHOTO_EDGE))
    name = f'{secrets.token_hex(12)}.jpg'
    image.save(photo_dir() / name, 'JPEG', quality=85, optimize=True)
    return name, None


def _throttled():
    now = time.monotonic()
    attempts = _posts[request.remote_addr]
    while attempts and now - attempts[0] > POST_WINDOW:
        attempts.popleft()
    if len(attempts) >= POSTS_PER_WINDOW:
        return True
    attempts.append(now)
    return False


def _text(name, limit):
    return str(request.form.get(name) or '').strip()[:limit]


@reports.get('/api/reports')
def list_reports():
    """Newest first, with per-status counts for the current sector/category filter."""
    query = db.select(Complaint)
    sector = request.args.get('sector')
    category = request.args.get('category')
    if sector in SECTORS:
        query = query.where(Complaint.sector == sector)
    if category in CATEGORIES:
        query = query.where(Complaint.category == category)
    counts = {'reported': 0, 'in_progress': 0, 'solved': 0}
    # Counted in SQL: the board must not load every report just to count them.
    by_status = query.with_only_columns(Complaint.status, db.func.count()).group_by(Complaint.status).order_by(None)
    for status_value, count in db.session.execute(by_status):
        counts[{ComplaintStatus.approved: 'in_progress', ComplaintStatus.solved: 'solved'}.get(status_value, 'reported')] += count
    status = request.args.get('status')
    if status == 'reported':
        query = query.where(Complaint.status.in_((ComplaintStatus.sent, ComplaintStatus.pending)))
    elif status in STATUSES:
        query = query.where(Complaint.status == STATUSES[status])
    elif status == 'open':
        query = query.where(Complaint.status != ComplaintStatus.solved)
    offset = max(0, request.args.get('offset', 0, type=int) or 0)
    ordered = query.order_by(Complaint.created_at.desc(), Complaint.id.desc())
    rows = db.session.execute(ordered.offset(offset).limit(PAGE_SIZE + 1)).scalars().all()
    confirmed = set(session.get('confirmed_reports', []))
    items = [{**report.to_dict(), 'confirmed': report.id in confirmed} for report in rows[:PAGE_SIZE]]
    return jsonify(items=items, counts=counts, has_more=len(rows) > PAGE_SIZE)


@reports.get('/api/reports/<int:report_id>')
def get_report(report_id):
    report = db.session.get(Complaint, report_id)
    if report is None:
        return jsonify(error='not_found'), 404
    return jsonify({**report.to_dict(), 'confirmed': report.id in session.get('confirmed_reports', [])})


@reports.post('/api/reports')
def create_report():
    title = _text('title', 140)
    description = _text('description', 4000)
    sector = request.form.get('sector')
    category = request.form.get('category')
    errors = {}
    if len(title) < 3:
        errors['title'] = 'required'
    if len(description) < 3:
        errors['description'] = 'required'
    if sector not in SECTORS:
        errors['sector'] = 'invalid'
    if category not in CATEGORIES:
        errors['category'] = 'invalid'
    if 'photo' not in request.files:
        errors['photo'] = 'required'
    if errors:
        return jsonify(error='validation', fields=errors), 400
    if _throttled():
        return jsonify(error='too_many_reports'), 429
    filename, problem = save_photo(request.files['photo'])
    if problem:
        return jsonify(error='validation', fields={'photo': problem}), 400
    user = current_user()
    report = Complaint(title=title, body=description, sector=sector, category=category,
                       address=_text('address', 160) or None, image_filename=filename,
                       user_id=user.id if user else None, status=ComplaintStatus.sent, confirmations=1)
    db.session.add(report)
    db.session.commit()
    session['confirmed_reports'] = [*session.get('confirmed_reports', []), report.id][-500:]
    return jsonify({**report.to_dict(), 'confirmed': True}), 201


@reports.post('/api/reports/<int:report_id>/confirm')
def confirm_report(report_id):
    """"I saw it too": one confirmation per browser session, instead of a duplicate report."""
    if json_body() is None:
        return jsonify(error='json_required'), 415
    report = db.session.get(Complaint, report_id)
    if report is None:
        return jsonify(error='not_found'), 404
    confirmed = session.get('confirmed_reports', [])
    if report_id not in confirmed:
        # Incremented in SQL so simultaneous confirmations from different people all count.
        db.session.execute(db.update(Complaint).where(Complaint.id == report_id)
                           .values(confirmations=Complaint.confirmations + 1))
        db.session.commit()
        db.session.refresh(report)
        session['confirmed_reports'] = [*confirmed, report_id][-500:]
    return jsonify(confirmations=report.confirmations, confirmed=True)


@reports.post('/api/reports/<int:report_id>/status')
def update_status(report_id):
    """Employees move a report along and, when it is fixed, attach the after-photo."""
    user = current_user()
    if user is None:
        return jsonify(error='auth_required'), 401
    if user.role != 'employee':
        return jsonify(error='forbidden'), 403
    report = db.session.get(Complaint, report_id)
    if report is None:
        return jsonify(error='not_found'), 404
    status = request.form.get('status')
    if status not in STATUSES:
        return jsonify(error='validation', fields={'status': 'invalid'}), 400
    if 'photo' in request.files:
        filename, problem = save_photo(request.files['photo'])
        if problem:
            return jsonify(error='validation', fields={'photo': problem}), 400
        report.after_image_filename = filename
    note = _text('note', 2000)
    if note:
        report.resolution_note = note
    was_solved = report.status == ComplaintStatus.solved
    report.status = STATUSES[status]
    report.updated_at = utcnow()
    # The fix date is set once, when the report becomes solved; later edits keep it.
    if status != 'solved':
        report.resolved_at = None
    elif not was_solved or report.resolved_at is None:
        report.resolved_at = report.updated_at
    db.session.commit()
    return jsonify(report.to_dict())


@reports.get('/api/reports/photos/<name>')
def report_photo(name):
    response = send_from_directory(photo_dir(), name, max_age=60 * 60 * 24 * 30)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response
