"""Score the assistant on eval/questions.jsonl: paired Romanian/Russian questions with known answers.

Each question lists the status it should get (answered, abstained or conflict), the facts the answer
must contain (each group is a list of acceptable spellings), the document it should cite and a
passage from that document. The report shows where the assistant is right, where it cites the wrong
source, and where the two languages disagree.

Usage:
  .venv/bin/python scripts/evaluate.py --check                # validate the question file only
  .venv/bin/python scripts/evaluate.py                        # ask the RAG service configured in .env
  .venv/bin/python scripts/evaluate.py --app http://127.0.0.1:5000   # go through the portal's /api/ask
  .venv/bin/python scripts/evaluate.py --only ru --limit 6
Results are written to eval/results/<timestamp>.json; the summary is printed as Markdown.
"""
import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS = ROOT / 'eval' / 'questions.jsonl'
STATUSES = {'answered', 'abstained', 'conflict'}
# Phrases that say part of the question is not covered by the documents.
GAP_MARKERS = ('nu conțin', 'nu există informa', 'nu este precizat', 'nu sunt precizat', 'nu este menționat', 'nu sunt date',
               'nu se menționează', 'nu am găsit', 'nu oferă', 'nu indică', 'lipsesc', 'nu apare',
               'нет информации', 'не указан', 'не содерж', 'не упомина', 'отсутству', 'не найден', 'не приводится')


def load_questions(path=QUESTIONS):
    rows = [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
    problems = []
    pairs = defaultdict(set)
    for row in rows:
        pairs[row['pair']].add(row['language'])
        if not set(row['expected_status']) <= STATUSES:
            problems.append(f"{row['id']}: unknown status {row['expected_status']}")
        if 'answered' in row['expected_status'] and not row['facts']:
            problems.append(f"{row['id']}: an answerable question needs at least one fact group")
        if any(not group for group in row['facts']):
            problems.append(f"{row['id']}: empty fact group")
    problems += [f'{pair}: needs both ro and ru' for pair, languages in pairs.items() if languages != {'ro', 'ru'}]
    ids = [row['id'] for row in rows]
    problems += [f'duplicate id {i}' for i in set(ids) if ids.count(i) > 1]
    return rows, problems


def normalize(text):
    text = unicodedata.normalize('NFC', text or '').lower()
    text = text.replace('ş', 'ș').replace('ţ', 'ț').replace(' ', ' ').replace(' ', ' ')
    return re.sub(r'\s+', ' ', text)


def compact(text):
    # "9 300 000" and "9300000" count as the same figure.
    return re.sub(r'(?<=\d)[ .](?=\d{3}\b)', '', normalize(text))


def contains(haystack, needle):
    return normalize(needle) in normalize(haystack) or compact(needle) in compact(haystack)


def cyrillic_share(text):
    letters = [ch for ch in re.sub(r'[„“"«»][^„“"«»]*[“"»]', '', text or '') if ch.isalpha()]
    return sum('а' <= ch.lower() <= 'я' or ch in 'ёЁ' for ch in letters) / len(letters) if letters else 0.0


def status_of(data):
    return 'conflict' if data.get('conflict') or data.get('status') == 'conflict' else data.get('status')


def score(row, data):
    answer = data.get('answer') or ''
    citations = data.get('citations') or []
    status = status_of(data)
    checks = {'status': status in row['expected_status']}
    if row['facts']:
        checks['facts'] = all(any(contains(answer, alt) for alt in group) for group in row['facts'])
    if row['sources'] and status != 'abstained':
        checks['source'] = any(any(fragment in (c.get('url') or '') for fragment in row['sources']) for c in citations)
    if row.get('passage') and status != 'abstained':
        checks['passage'] = any(contains(c.get('text') or '', row['passage']) for c in citations)
    if row.get('mentions_gap'):
        checks['gap_flagged'] = any(marker in normalize(answer) for marker in GAP_MARKERS)
    if status != 'abstained':
        share = cyrillic_share(answer)
        checks['language'] = share > 0.6 if row['language'] == 'ru' else share < 0.1
    return {'id': row['id'], 'pair': row['pair'], 'language': row['language'], 'category': row['category'],
            'status': status, 'checks': checks, 'passed': all(checks.values()), 'answer': answer,
            'cited': [c.get('url') for c in citations], 'elapsed_ms': data.get('elapsed_ms')}


_app = None


def ask_rag(question, language):
    """Asks the RAG service through the portal's adapter, so the scores match what users see."""
    global _app
    sys.path.insert(0, str(ROOT))
    from app import create_app
    from app.assistant import ask_upstream
    _app = _app or create_app()
    with _app.app_context():
        return ask_upstream(question, language)


def ask_app(base):
    def ask(question, language):
        request = urllib.request.Request(f"{base.rstrip('/')}/api/ask", method='POST',
                                         data=json.dumps({'question': question, 'language': language}).encode(),
                                         headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode())
    return ask


def summarize(results):
    lines = ['| Group | Passed | Status | Facts | Source | Passage | Language |', '|---|---|---|---|---|---|---|']

    def row(label, items):
        def rate(check):
            relevant = [r['checks'][check] for r in items if check in r['checks']]
            return f'{sum(relevant)}/{len(relevant)}' if relevant else '–'
        lines.append(f"| {label} | {sum(r['passed'] for r in items)}/{len(items)} | {rate('status')} | {rate('facts')} | "
                     f"{rate('source')} | {rate('passage')} | {rate('language')} |")

    row('All', results)
    for language in ('ro', 'ru'):
        row(language.upper(), [r for r in results if r['language'] == language])
    for category in sorted({r['category'] for r in results}):
        row(category, [r for r in results if r['category'] == category])
    by_pair = defaultdict(dict)
    for r in results:
        by_pair[r['pair']][r['language']] = r
    split = [pair for pair, both in by_pair.items() if len(both) == 2 and (both['ro']['status'] != both['ru']['status'] or both['ro']['passed'] != both['ru']['passed'])]
    lines += ['', f"RO/RU consistency: {len(by_pair) - len(split)}/{len(by_pair)} pairs agree" + (f" (differ: {', '.join(sorted(split))})" if split else '')]
    failed = [r for r in results if not r['passed']]
    if failed:
        lines += ['', 'Failed checks:']
        lines += [f"- {r['id']} ({r['status']}): {', '.join(k for k, v in r['checks'].items() if not v)}" for r in failed]
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true', help='validate the question file and exit')
    parser.add_argument('--app', help="portal base URL; default asks the RAG service directly")
    parser.add_argument('--only', choices=('ro', 'ru'))
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()

    rows, problems = load_questions()
    if problems:
        sys.exit('Invalid question file:\n' + '\n'.join(problems))
    if args.check:
        print(f'{len(rows)} questions in {len({r["pair"] for r in rows})} RO/RU pairs: OK')
        return
    rows = [r for r in rows if not args.only or r['language'] == args.only][:args.limit]
    ask = ask_app(args.app) if args.app else ask_rag
    results = []
    for row in rows:
        started = time.monotonic()
        try:
            result = score(row, ask(row['question'], row['language']))
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            sys.exit(f"{row['id']}: the assistant is unreachable ({error}). No results written.")
        results.append(result)
        print(f"{'PASS' if result['passed'] else 'FAIL'} {row['id']:8} {time.monotonic() - started:5.1f}s  {result['status']}", flush=True)
    out = ROOT / 'eval' / 'results' / f"{datetime.now():%Y%m%d-%H%M}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding='utf-8')
    print('\n' + summarize(results) + f'\n\nFull results: {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
