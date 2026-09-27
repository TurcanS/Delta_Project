"""Publish app/prompts/custom_instructions.txt to the RAG service (versioned, optimistic locking).

Usage:  .venv/bin/python scripts/push_prompt.py          # show the live revision and a diff summary
        .venv/bin/python scripts/push_prompt.py --apply  # publish the file as a new revision
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.config import Config  # noqa: E402  (loads .env)


def call(method, payload=None):
    request = urllib.request.Request(
        f"{Config.RAG_API_URL.rstrip('/')}/v1/config/prompt", method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': f'Bearer {Config.RAG_ADMIN_KEY}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode())


def main():
    if not Config.RAG_ADMIN_KEY:
        sys.exit('RAG_ADMIN_KEY is not set in .env')
    wanted = (ROOT / 'app' / 'prompts' / 'custom_instructions.txt').read_text(encoding='utf-8').strip()
    try:
        live = call('GET')
    except urllib.error.HTTPError as error:
        if error.code == 404:
            sys.exit(f'{Config.RAG_API_URL} has no /v1/config/prompt endpoint; the prompt cannot be published to this server.')
        raise
    print(f"live revision {live['revision']} ({live.get('updated_at')}), {len(live['custom_instructions'])} chars")
    if live['custom_instructions'].strip() == wanted:
        print('Already up to date.')
        return
    print(f'local file differs ({len(wanted)} chars).')
    if '--apply' in sys.argv:
        result = call('PUT', {'custom_instructions': wanted, 'expected_revision': live['revision']})
        print(f"published revision {result['revision']}")
    else:
        print('Run with --apply to publish.')


if __name__ == '__main__':
    main()
