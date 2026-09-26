"""Backend API contract for the bilingual chatbot and its system prompt."""

from datetime import timezone
from hmac import compare_digest

from flask import Blueprint, current_app, jsonify, request

from app import db
from app.models import SystemPromptVersion


chatbot = Blueprint('chatbot', __name__, url_prefix='/v1')

DEFAULT_SYSTEM_PROMPT = (
    'You are a helpful assistant. Answer in the same language as the user: '
    'Romanian for Romanian questions and Russian for Russian questions. '
    'Be clear and concise. Ask a clarifying question when essential details '
    'are missing. State uncertainty and do not invent facts, procedures, or '
    'contact details.'
)


def _current_prompt():
    latest = db.session.query(SystemPromptVersion).order_by(
        SystemPromptVersion.id.desc()
    ).first()
    if latest is None:
        return {'version': 0, 'instructions': DEFAULT_SYSTEM_PROMPT,
                'created_at': None}

    created_at = latest.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return {'version': latest.id, 'instructions': latest.instructions,
            'created_at': created_at.isoformat()}


def _admin_error():
    configured_key = current_app.config.get('ADMIN_API_KEY')
    if not configured_key:
        return jsonify(error='admin_key_not_configured'), 503

    supplied_key = request.headers.get('X-Admin-Key', '')
    if not compare_digest(supplied_key, configured_key):
        return jsonify(error='unauthorized'), 401
    return None


@chatbot.post('/ask')
def ask():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error='invalid_json'), 400

    question = payload.get('question')
    if not isinstance(question, str) or not question.strip() or len(question) > 4000:
        return jsonify(error='invalid_question',
                       message='question must be a non-empty string of at most 4000 characters'), 400

    prompt = _current_prompt()
    answer_generator = current_app.config.get('CHATBOT_ANSWER_GENERATOR')
    if answer_generator is None:
        return jsonify(error='answer_generation_not_configured',
                       message='A model provider has not been configured.',
                       prompt_version=prompt['version']), 501

    answer = answer_generator(prompt['instructions'], question.strip())
    return jsonify(answer=answer, prompt_version=prompt['version'])


@chatbot.get('/config/prompt')
def get_prompt():
    error = _admin_error()
    if error is not None:
        return error
    return jsonify(_current_prompt())


@chatbot.put('/config/prompt')
def update_prompt():
    error = _admin_error()
    if error is not None:
        return error

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error='invalid_json'), 400

    instructions = payload.get('instructions')
    if not isinstance(instructions, str) or not instructions.strip() or len(instructions) > 20000:
        return jsonify(error='invalid_instructions',
                       message='instructions must be a non-empty string of at most 20000 characters'), 400

    version = SystemPromptVersion(instructions=instructions.strip())
    db.session.add(version)
    db.session.commit()
    return jsonify(_current_prompt()), 201
