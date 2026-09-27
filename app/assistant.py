"""Server-side bridge to the municipal RAG API.

The browser never sees the API key: it calls /api/ask, and this module forwards
the question with the bearer token from the environment.
"""
import copy
import json
import re
import threading
import time
import unicodedata
import uuid
from collections import OrderedDict
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, session
from sqlalchemy.exc import SQLAlchemyError

from app import db
from app.auth import current_user
from app.conversations import owned_conversation, save_turn
from app.models import Feedback, Message
from app.rag_adapter import normalize

assistant = Blueprint('assistant', __name__)

LANGUAGES = {'ro', 'ru'}
MAX_QUESTION = 1000
FEEDBACK_REASONS = ('incorrect', 'incomplete', 'sources', 'outdated', 'translation')
# Fields the UI renders; retrieval debug data stays on the server.
CITATION_FIELDS = ('document_id', 'chunk_id', 'title', 'url', 'section', 'page', 'language',
                   'publication_date', 'effective_date', 'text', 'highlights')


def _rag_request(path, payload=None, timeout=90):
    base = current_app.config['RAG_API_URL'].rstrip('/')
    key = current_app.config['RAG_API_KEY']
    if not key:
        raise RuntimeError('RAG_API_KEY is not configured')
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f'{base}{path}', data=data, method='POST' if data else 'GET', headers={
        'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


# One-for-one letter maps, so answer_highlights offsets stay valid after the fix.
TO_CYRILLIC = str.maketrans({'ț': 'ц', 'ţ': 'ц', 'ș': 'ш', 'ş': 'ш', 'ă': 'э', 'â': 'ы', 'î': 'ы', 'Ț': 'Ц', 'Ș': 'Ш', 'Ă': 'Э', 'Â': 'Ы', 'Î': 'Ы',
                             'a': 'а', 'e': 'е', 'o': 'о', 'p': 'р', 'c': 'с', 'x': 'х', 'y': 'у', 'i': 'и', 'A': 'А', 'E': 'Е', 'O': 'О', 'P': 'Р', 'C': 'С', 'X': 'Х', 'I': 'И'})
TO_LATIN = str.maketrans({'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'Х': 'X', 'Т': 'T', 'М': 'M', 'Н': 'H', 'К': 'K', 'В': 'B'})
MIXED_WORD = re.compile(r'\w*(?:[a-zA-ZăâîșțşţĂÂÎȘȚ]\w*[а-яА-ЯёЁ]|[а-яА-ЯёЁ]\w*[a-zA-ZăâîșțşţĂÂÎȘȚ])\w*')


def fix_mixed_script(text):
    """Small models sometimes write 'Градиниțа': move each mixed word to its majority script."""
    def repair(match):
        word = match.group(0)
        cyrillic = sum(1 for ch in word if 'а' <= ch.lower() <= 'я' or ch in 'ёЁ')
        latin = sum(1 for ch in word if ch.isalpha()) - cyrillic
        fixed = word.translate(TO_CYRILLIC if cyrillic >= latin else TO_LATIN)
        # Only accept a repair that yields a single-script word of the same length.
        return fixed if len(fixed) == len(word) and not MIXED_WORD.fullmatch(fixed) else word
    return MIXED_WORD.sub(repair, text or '')


class AnswerCache:
    """Recent answers by (question, language), so a question asked again is answered at once.

    The same questions come back often (the examples on the home page, a school enrolment
    period); each costs the answer service several seconds of inference. Entries expire, the
    size is bounded, and only successful answers are kept.
    """

    def __init__(self, size=512, ttl=15 * 60):
        self.size, self.ttl = size, ttl
        self.entries = OrderedDict()
        self.lock = threading.Lock()

    @staticmethod
    def key(question, language):
        folded = unicodedata.normalize('NFC', question).lower().replace('ş', 'ș').replace('ţ', 'ț')
        return language, re.sub(r'[\s?!.]+', ' ', folded).strip()

    def get(self, question, language):
        key = self.key(question, language)
        with self.lock:
            entry = self.entries.get(key)
            if not entry or time.monotonic() - entry[0] > self.ttl:
                self.entries.pop(key, None)
                return None
            self.entries.move_to_end(key)
            return copy.deepcopy(entry[1])

    def put(self, question, language, result):
        with self.lock:
            self.entries[self.key(question, language)] = (time.monotonic(), copy.deepcopy(result))
            self.entries.move_to_end(self.key(question, language))
            while len(self.entries) > self.size:
                self.entries.popitem(last=False)


answers = AnswerCache()


def ask_upstream(question, language):
    """Asks the RAG service (or the answer cache) and returns the answer the portal renders."""
    started = time.monotonic()
    cached = answers.get(question, language)
    if cached is not None:
        # A fresh request id keeps feedback on this reply separate from the original one.
        return {**cached, 'request_id': uuid.uuid4().hex[:16], 'elapsed_ms': round((time.monotonic() - started) * 1000), 'cached': True}
    result = _ask_service(question, language, started)
    if result.get('status') in ('answered', 'abstained', 'conflict'):
        answers.put(question, language, result)
    return result


def _ask_service(question, language, started):
    answer = _rag_request('/v1/ask', {'question': question, 'answer_language': language})
    elapsed = round((time.monotonic() - started) * 1000)
    if 'claims' in answer or 'retrieval' in answer:
        return normalize(answer, elapsed_ms=elapsed, fix_text=fix_mixed_script)
    result = _trim(answer)
    if result['elapsed_ms'] is None:
        result['elapsed_ms'] = elapsed
    return result


def _trim(answer):
    """The earlier response format (citations + grounding), still accepted."""
    citations = [{field: citation.get(field) for field in CITATION_FIELDS}
                 for citation in answer.get('citations') or []]
    return {
        'status': answer.get('status'),
        'answer': fix_mixed_script(answer.get('answer') or ''),
        'citations': citations,
        'conflict': answer.get('conflict'),
        'next_steps': answer.get('next_steps') or [],
        'answer_highlights': (answer.get('grounding') or {}).get('answer_highlights') or [],
        'request_id': answer.get('request_id'),
        'elapsed_ms': answer.get('elapsed_ms'),
    }


@assistant.post('/api/ask')
def ask():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        body = {}
    question = str(body.get('question') or '').strip()
    language = body.get('language', 'ro')
    if len(question) < 2:
        return jsonify(error='empty_question'), 400
    if len(question) > MAX_QUESTION:
        return jsonify(error='question_too_long'), 400
    if language not in LANGUAGES:
        return jsonify(error='unsupported_language'), 400
    user = current_user()
    conversation = None
    if body.get('conversation_id') is not None:
        # Checked before the model call so a bad id never costs an inference.
        if user is None:
            return jsonify(error='auth_required'), 401
        conversation = owned_conversation(body['conversation_id'], user)
        if conversation is None:
            return jsonify(error='not_found'), 404
    try:
        result = ask_upstream(question, language)
    except urllib.error.HTTPError as error:
        current_app.logger.warning('RAG API returned %s', error.code)
        return jsonify(error='upstream_error'), 502
    except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError) as error:
        current_app.logger.warning('RAG API unavailable: %s', error)
        return jsonify(error='upstream_unavailable'), 503
    if user is not None:
        try:
            conversation, message = save_turn(user, conversation, question, language, result)
            result.update(conversation_id=conversation.id, message_id=message.id, conversation_title=conversation.title)
        except SQLAlchemyError as error:
            # Saving history must never cost the citizen their answer.
            db.session.rollback()
            current_app.logger.warning('Could not save conversation: %s', error)
    return jsonify(result)


@assistant.get('/api/assistant/health')
def health():
    try:
        info = _rag_request('/v1/health', timeout=8)
    except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError):
        return jsonify(status='unavailable'), 503
    models = info.get('models') or {}
    return jsonify(status=info.get('status'), storage=info.get('storage'),
                   model=models.get('generation') or info.get('answer_model'))


@assistant.post('/api/feedback')
def feedback():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        body = {}
    rating = body.get('rating')
    if rating not in ('up', 'down'):
        return jsonify(error='invalid_rating'), 400
    reasons = [reason for reason in FEEDBACK_REASONS if reason in (body.get('reasons') or [])] if isinstance(body.get('reasons'), list) else []
    sources = [{key: str(source.get(key) or '')[:300] for key in ('document_id', 'chunk_id', 'url')}
               for source in (body.get('sources') if isinstance(body.get('sources'), list) else [])[:12] if isinstance(source, dict)]
    # The details a person adds after "No" complete the rating they already gave, rather than adding a second one.
    feedback_id = body.get('feedback_id')
    if isinstance(feedback_id, int) and feedback_id in session.get('feedback_ids', []):
        row = db.session.get(Feedback, feedback_id)
        if row is not None:
            row.rating, row.reasons = rating, reasons or row.reasons
            row.comment = str(body.get('comment') or '')[:1000] or row.comment
            db.session.commit()
            _log_feedback({'at': datetime.now(timezone.utc).isoformat(), 'id': row.id, 'rating': rating, 'reasons': reasons, 'comment': row.comment, 'update': True})
            return jsonify(ok=True, id=row.id)
    entry = {
        'at': datetime.now(timezone.utc).isoformat(),
        'rating': rating,
        'request_id': str(body.get('request_id') or '')[:64],
        'question': str(body.get('question') or '')[:MAX_QUESTION],
        'status': str(body.get('status') or '')[:32],
        'language': body.get('language') if body.get('language') in LANGUAGES else None,
        'comment': str(body.get('comment') or '')[:1000],
        'reasons': reasons,
        'sources': sources,
    }
    user = current_user()
    row = None
    try:
        row = Feedback(user_id=user.id if user else None, **{key: value or None for key, value in entry.items() if key != 'at'})
        db.session.add(row)
        message = db.session.get(Message, body.get('message_id')) if user and isinstance(body.get('message_id'), int) else None
        if message is not None and message.role == 'assistant' and message.conversation.user_id == user.id:
            message.rating = rating
        db.session.commit()
        session['feedback_ids'] = [*session.get('feedback_ids', []), row.id][-50:]
    except SQLAlchemyError as error:
        db.session.rollback()
        current_app.logger.warning('Could not store feedback: %s', error)
        row = None
    _log_feedback({**entry, 'id': row.id if row else None})
    return jsonify(ok=True, id=row.id if row else None), 201


def _log_feedback(entry):
    path = Path(current_app.instance_path) / 'feedback.jsonl'
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as file:
        file.write(json.dumps(entry, ensure_ascii=False) + '\n')
