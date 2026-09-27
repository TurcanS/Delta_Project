"""Swipe game over the city's projects: residents like or dislike, the municipality reads the tally.

Anyone can vote, once per project per browser; the results are public, and employees can
download them as CSV. Votes are counted in SQL so simultaneous votes are never lost.
"""
import csv
import io
import random
import secrets
import time
from collections import defaultdict, deque

from flask import Blueprint, Response, jsonify, request, session
from sqlalchemy import case, func

from app import db
from app.auth import current_user, json_body
from app.models import CityDocument, ProjectVote, utcnow
from app.sector_data import SECTORS

swipe = Blueprint('swipe', __name__)
DECK_SIZE = 10
VOTE_WINDOW = 600
VOTES_PER_WINDOW = 200
_votes = defaultdict(deque)


def voter_key():
    if 'voter' not in session:
        session['voter'] = secrets.token_hex(12)
    return session['voter']


def _throttled():
    now = time.monotonic()
    attempts = _votes[request.remote_addr]
    while attempts and now - attempts[0] > VOTE_WINDOW:
        attempts.popleft()
    if len(attempts) >= VOTES_PER_WINDOW:
        return True
    attempts.append(now)
    return False


def tallies(document_ids=None):
    """{document id: (likes, dislikes)}"""
    query = db.select(ProjectVote.document_id, func.sum(case((ProjectVote.value > 0, 1), else_=0)),
                      func.sum(case((ProjectVote.value < 0, 1), else_=0))).group_by(ProjectVote.document_id)
    if document_ids is not None:
        query = query.where(ProjectVote.document_id.in_(document_ids))
    return {document_id: (likes or 0, dislikes or 0) for document_id, likes, dislikes in db.session.execute(query)}


def card(document, counts):
    likes, dislikes = counts.get(document.id, (0, 0))
    return {**document.to_dict(), 'likes': likes, 'dislikes': dislikes}


@swipe.get('/api/swipe/deck')
def deck():
    """Photographed projects this browser has not voted on: recent ones first, lightly shuffled."""
    voted = db.select(ProjectVote.document_id).where(ProjectVote.voter == voter_key())
    query = (db.select(CityDocument).where(CityDocument.kind == 'project', CityDocument.image_url.is_not(None), CityDocument.id.not_in(voted))
             .order_by(CityDocument.published_on.desc(), CityDocument.id.desc()))
    sector = request.args.get('sector')
    if sector in SECTORS:
        query = query.where(CityDocument.sector == sector)
    pool = list(db.session.execute(query.limit(DECK_SIZE * 3)).scalars())
    random.shuffle(pool)
    chosen = pool[:DECK_SIZE]
    counts = tallies([document.id for document in chosen])
    remaining = db.session.execute(db.select(func.count()).select_from(query.subquery())).scalar()
    return jsonify(cards=[card(document, counts) for document in chosen], remaining=remaining)


@swipe.post('/api/swipe/vote')
def vote():
    body = json_body()
    if body is None:
        return jsonify(error='json_required'), 415
    value = {'like': 1, 'dislike': -1}.get(body.get('value'))
    document = db.session.get(CityDocument, body.get('document_id')) if isinstance(body.get('document_id'), int) else None
    if value is None or document is None or document.kind != 'project':
        return jsonify(error='validation'), 400
    if _throttled():
        return jsonify(error='too_many_votes'), 429
    user = current_user()
    key = voter_key()
    existing = db.session.execute(db.select(ProjectVote).filter_by(document_id=document.id, voter=key)).scalar()
    if existing:
        existing.value, existing.created_at = value, utcnow()
    else:
        db.session.add(ProjectVote(document_id=document.id, voter=key, value=value, user_id=user.id if user else None))
    db.session.commit()
    likes, dislikes = tallies([document.id]).get(document.id, (0, 0))
    return jsonify(likes=likes, dislikes=dislikes, value=body['value'])


def ranking(sector=None, limit=50):
    query = (db.select(CityDocument, func.sum(case((ProjectVote.value > 0, 1), else_=0)).label('likes'), func.count(ProjectVote.id).label('votes'))
             .join(ProjectVote, ProjectVote.document_id == CityDocument.id).group_by(CityDocument.id))
    if sector in SECTORS:
        query = query.where(CityDocument.sector == sector)
    rows = db.session.execute(query.order_by(func.count(ProjectVote.id).desc(), CityDocument.id.desc()).limit(limit)).all()
    return [{**document.to_dict(), 'likes': likes, 'dislikes': votes - likes, 'votes': votes} for document, likes, votes in rows]


@swipe.get('/api/swipe/results')
def results():
    items = ranking(request.args.get('sector'))
    # Approval with at least three votes first, so one enthusiastic vote does not top the list.
    items.sort(key=lambda item: (item['votes'] >= 3, item['likes'] / item['votes'], item['votes']), reverse=True)
    total = db.session.execute(db.select(func.count(ProjectVote.id))).scalar()
    voters = db.session.execute(db.select(func.count(func.distinct(ProjectVote.voter)))).scalar()
    mine = dict(db.session.execute(db.select(ProjectVote.document_id, ProjectVote.value).where(ProjectVote.voter == voter_key())).all())
    return jsonify(items=items, votes=total, voters=voters, mine={str(k): ('like' if v > 0 else 'dislike') for k, v in mine.items()})


@swipe.get('/api/swipe/results.csv')
def results_csv():
    user = current_user()
    if user is None:
        return jsonify(error='auth_required'), 401
    if user.role != 'employee':
        return jsonify(error='forbidden'), 403
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(['project', 'sector', 'category', 'likes', 'dislikes', 'votes', 'approval_percent', 'url'])
    for item in ranking(limit=10_000):
        writer.writerow([item['title'], item['sector'] or '', item['category'] or '', item['likes'], item['dislikes'], item['votes'],
                         round(100 * item['likes'] / item['votes']), item['url']])
    return Response('﻿' + buffer.getvalue(), mimetype='text/csv',
                    headers={'Content-Disposition': 'attachment; filename="voturi-proiecte.csv"'})
