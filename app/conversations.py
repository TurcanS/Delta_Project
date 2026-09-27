"""Saved assistant conversations for signed-in citizens."""
import re
from datetime import datetime

from flask import Blueprint, Response, jsonify, request
from sqlalchemy import or_
from sqlalchemy.orm import selectinload

from app import db
from app.auth import current_user, json_body, login_required
from app.models import Conversation, Message, utcnow

conversations = Blueprint('conversations', __name__)

TITLE_LENGTH = 80
MAX_IMPORT_TURNS = 30
PAGE_SIZE = 50
CITATION_FIELDS = ('document_id', 'chunk_id', 'title', 'url', 'section', 'page', 'language',
                   'publication_date', 'effective_date', 'text', 'highlights')
ANSWER_FIELDS = ('status', 'answer', 'conflict', 'next_steps', 'answer_highlights', 'request_id', 'elapsed_ms')


def make_title(question):
    text = re.sub(r'\s+', ' ', question).strip()
    if len(text) <= TITLE_LENGTH:
        return text
    cut = text[:TITLE_LENGTH].rsplit(' ', 1)[0]
    return cut.rstrip(',.;:') + '…'


def answer_status(result):
    if result.get('conflict') or result.get('status') == 'conflict':
        return 'conflict'
    return result.get('status') if result.get('status') in ('answered', 'abstained') else 'answered'


def owned_conversation(conversation_id, user):
    if not isinstance(conversation_id, int):
        return None
    conversation = db.session.get(Conversation, conversation_id)
    return conversation if conversation is not None and conversation.user_id == user.id else None


def save_turn(user, conversation, question, language, result, commit=True):
    now = utcnow()
    if conversation is None:
        conversation = Conversation(user_id=user.id, title=make_title(question), language=language, created_at=now)
        db.session.add(conversation)
    conversation.updated_at = now
    db.session.add(Message(conversation=conversation, role='user', language=language, content=question, created_at=now))
    message = Message(conversation=conversation, role='assistant', language=language, content=result.get('answer') or '',
                      payload=result, status=answer_status(result), created_at=now)
    db.session.add(message)
    if commit:
        db.session.commit()
    return conversation, message


def sanitize_answer(data):
    """Imported answers come from the browser: keep only the fields the UI renders."""
    if not isinstance(data, dict):
        return None
    clean = {key: data.get(key) for key in ANSWER_FIELDS}
    clean['answer'] = str(clean['answer'] or '')[:8000]
    clean['next_steps'] = clean['next_steps'] if isinstance(clean['next_steps'], list) else []
    clean['answer_highlights'] = clean['answer_highlights'] if isinstance(clean['answer_highlights'], list) else []
    citations = data.get('citations') if isinstance(data.get('citations'), list) else []
    clean['citations'] = [{field: citation.get(field) for field in CITATION_FIELDS} for citation in citations[:12] if isinstance(citation, dict)]
    return clean


def _query(user):
    return (db.select(Conversation).where(Conversation.user_id == user.id)
            .options(selectinload(Conversation.messages))
            .order_by(Conversation.pinned.desc(), Conversation.updated_at.desc()))


@conversations.get('/api/conversations')
@login_required
def list_conversations():
    query = _query(current_user())
    search = (request.args.get('q') or '').strip()[:100]
    if search:
        like = f'%{search}%'
        query = query.where(or_(Conversation.title.ilike(like),
                                Conversation.messages.any(Message.content.ilike(like))))
    offset = request.args.get('offset', 0, type=int)
    offset = max(0, offset or 0)
    rows = db.session.execute(query.offset(offset).limit(PAGE_SIZE + 1)).scalars().all()
    return jsonify(items=[row.summary() for row in rows[:PAGE_SIZE]], has_more=len(rows) > PAGE_SIZE)


@conversations.get('/api/conversations/<int:conversation_id>')
@login_required
def get_conversation(conversation_id):
    conversation = owned_conversation(conversation_id, current_user())
    if conversation is None:
        return jsonify(error='not_found'), 404
    return jsonify(conversation=conversation.to_dict())


@conversations.patch('/api/conversations/<int:conversation_id>')
@login_required
def update_conversation(conversation_id):
    body = json_body()
    if body is None:
        return jsonify(error='json_required'), 415
    conversation = owned_conversation(conversation_id, current_user())
    if conversation is None:
        return jsonify(error='not_found'), 404
    if 'title' in body:
        title = re.sub(r'\s+', ' ', str(body['title'] or '')).strip()
        if not 1 <= len(title) <= 120:
            return jsonify(error='validation', fields={'title': 'invalid'}), 400
        conversation.title = title
    if 'pinned' in body:
        conversation.pinned = bool(body['pinned'])
    db.session.commit()
    return jsonify(conversation=conversation.summary())


@conversations.delete('/api/conversations/<int:conversation_id>')
@login_required
def delete_conversation(conversation_id):
    conversation = owned_conversation(conversation_id, current_user())
    if conversation is None:
        return jsonify(error='not_found'), 404
    db.session.delete(conversation)
    db.session.commit()
    return jsonify(ok=True)


@conversations.delete('/api/conversations')
@login_required
def delete_all_conversations():
    body = json_body()
    if not body or body.get('confirm') is not True:
        return jsonify(error='confirmation_required'), 400
    rows = db.session.execute(db.select(Conversation).where(Conversation.user_id == current_user().id)).scalars().all()
    for row in rows:
        db.session.delete(row)
    db.session.commit()
    return jsonify(ok=True, deleted=len(rows))


@conversations.post('/api/conversations/import')
@login_required
def import_conversation():
    """Keeps the chat a visitor had before signing in."""
    body = json_body()
    if body is None:
        return jsonify(error='json_required'), 415
    turns = body.get('turns')
    if not isinstance(turns, list) or not 1 <= len(turns) <= MAX_IMPORT_TURNS:
        return jsonify(error='validation', fields={'turns': 'invalid'}), 400
    user, conversation = current_user(), None
    for turn in turns:
        if not isinstance(turn, dict):
            continue
        question = str(turn.get('question') or '').strip()[:1000]
        language = turn.get('language') if turn.get('language') in ('ro', 'ru') else 'ro'
        data = sanitize_answer(turn.get('data'))
        if not question or data is None:
            continue
        conversation, _ = save_turn(user, conversation, question, language, data, commit=False)
    if conversation is None:
        db.session.rollback()
        return jsonify(error='validation', fields={'turns': 'invalid'}), 400
    db.session.commit()
    return jsonify(conversation=conversation.to_dict()), 201


LABELS = {
    'ro': {'question': 'Întrebare', 'answer': 'Răspuns', 'sources': 'Surse', 'exported': 'Exportat din Portalul Cetățeanului la',
           'status': {'answered': 'Verificat în documente', 'abstained': 'Informația nu apare în documente', 'conflict': 'Documentele se contrazic'},
           'note': 'Răspunsurile sunt generate din documente publice și pot fi incomplete. Verificați informațiile importante la instituție.'},
    'ru': {'question': 'Вопрос', 'answer': 'Ответ', 'sources': 'Источники', 'exported': 'Экспортировано из Portalul Cetățeanului',
           'status': {'answered': 'Подтверждено документами', 'abstained': 'Нет в документах', 'conflict': 'Документы противоречат друг другу'},
           'note': 'Ответы формируются из публичных документов и могут быть неполными. Проверяйте важную информацию в учреждении.'},
}


@conversations.get('/api/conversations/<int:conversation_id>/export')
@login_required
def export_conversation(conversation_id):
    """Plain-text record a citizen can keep or attach to a petition, sources included."""
    conversation = owned_conversation(conversation_id, current_user())
    if conversation is None:
        return jsonify(error='not_found'), 404
    labels = LABELS['ru' if request.args.get('lang') == 'ru' else 'ro']
    lines = [f'# {conversation.title}', '', f"_{labels['exported']} {datetime.now():%d.%m.%Y %H:%M}_", '']
    for message in conversation.messages:
        if message.role == 'user':
            lines += [f"## {labels['question']}", '', message.content, '']
            continue
        data = message.payload or {}
        lines += [f"### {labels['answer']} ({labels['status'].get(message.status, message.status)})", '', message.content, '']
        citations = data.get('citations') or []
        if citations and message.status != 'abstained':
            lines += [f"**{labels['sources']}:**", '']
            for index, citation in enumerate(citations, 1):
                lines.append(f"{index}. {citation.get('title') or citation.get('url')}: {citation.get('url') or ''}")
                excerpt = re.sub(r'\s+', ' ', citation.get('text') or '').strip()
                if excerpt:
                    lines.append(f'   > {excerpt[:400]}{"…" if len(excerpt) > 400 else ""}')
            lines.append('')
    lines += ['---', labels['note'], '']
    filename = f'conversatie-{conversation.id}.md'
    return Response('\n'.join(lines), mimetype='text/markdown; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="{filename}"'})
