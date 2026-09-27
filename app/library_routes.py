"""Search API over the library of city projects and documents (see app/library.py)."""
import threading

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from app import db
from app.auth import current_user, json_body
from app.library import cover_dir, cover_path, crawl, last_crawl, search, sector_stats
from app.models import CityDocument
from app.sector_data import SECTORS

library = Blueprint('library', __name__)
_crawling = threading.Lock()


@library.get('/api/library')
def search_library():
    query = (request.args.get('q') or '').strip()[:200]
    sector = request.args.get('sector') if request.args.get('sector') in SECTORS else None
    limit = min(max(request.args.get('limit', 20, type=int) or 20, 1), 50)
    offset = max(request.args.get('offset', 0, type=int) or 0, 0)
    sort = 'relevance' if request.args.get('sort') == 'relevance' else 'new'
    return jsonify(search(query, request.args.get('kind'), sector, offset, limit, any_word=request.args.get('match') == 'any', sort=sort))


@library.get('/api/library/stats')
def library_stats():
    total = db.session.execute(db.select(db.func.count()).select_from(CityDocument)).scalar()
    return jsonify(sectors=sector_stats(), documents=total, updated_at=last_crawl(), crawling=_crawling.locked())


@library.get('/api/library/<int:document_id>')
def library_document(document_id):
    document = db.session.get(CityDocument, document_id)
    if document is None:
        return jsonify(error='not_found'), 404
    return jsonify({**document.to_dict(), 'text': document.text})


@library.get('/api/library/<int:document_id>/cover')
def library_cover(document_id):
    if not cover_path(document_id).exists():
        return jsonify(error='not_found'), 404
    response = send_from_directory(cover_dir(), f'{document_id}.jpg', max_age=60 * 60 * 24 * 7)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@library.post('/api/library/refresh')
def refresh_library():
    """Employees start a crawl; it runs in the background and adds only what is new."""
    user = current_user()
    if user is None:
        return jsonify(error='auth_required'), 401
    if user.role != 'employee':
        return jsonify(error='forbidden'), 403
    if json_body() is None:
        return jsonify(error='json_required'), 415
    if not _crawling.acquire(blocking=False):
        return jsonify(status='running'), 202
    app = current_app._get_current_object()

    def run():
        try:
            with app.app_context():
                crawl(log=lambda line: app.logger.info('library: %s', line))
        finally:
            _crawling.release()

    threading.Thread(target=run, daemon=True).start()
    return jsonify(status='started'), 202
