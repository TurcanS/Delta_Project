"""Turns the RAG service's /v1/ask response into the answer shape the portal renders.

The service answers with claims, each citing short passages by chunk id, and marks them in
the answer text as "[5feaa81d]". The portal shows the answer with the grounded phrases
underlined and numbered, and every source with its full passage and the quoted words
highlighted. Only /v1/ask is used: when the service gives no title or address, they are read
from the passage itself (crawled pages start with their address, and project pages name
themselves just before "Descriere") or from the crawl folder in the filename.
"""
import re
import unicodedata
import uuid

MARKER = re.compile(r'\s*\[([0-9a-fA-F]{6,64}(?:\s*[,;]\s*[0-9a-fA-F]{6,64})*)\]')
URL_LINE = re.compile(r'^\s*(https?://\S+)\s*$')
STATUS = {'answered': 'answered', 'insufficient_evidence': 'abstained', 'abstained': 'abstained',
          'not_found': 'abstained', 'conflict': 'conflict', 'partial': 'answered'}
UNKNOWN = {'', 'unknown', 'none', 'null', 'n/a'}


def known(value):
    return None if value is None or str(value).strip().lower() in UNKNOWN else str(value).strip()


def split_url(text):
    """Crawled passages begin with the page address; returns (url, text without that line)."""
    lines = (text or '').split('\n', 1)
    match = URL_LINE.match(lines[0])
    if not match:
        return None, text or ''
    return match.group(1), (lines[1] if len(lines) > 1 else '').lstrip('\n')


# Crawled pages end with the site's menu and footer; the passage stops where they begin.
BOILERPLATE_START = re.compile(r'^(Mai mult|Citește mai mult|Подробнее|Articole recente|Proiect realizat împreună cu locuitorii orașului!|© ?\d{4})\s*$', re.M)


def strip_boilerplate(text, keep=''):
    match = BOILERPLATE_START.search(text or '')
    if not match or match.start() < 40:
        return text
    trimmed = text[:match.start()].rstrip()
    # Never cut away the words the answer quotes.
    return trimmed if not keep or locate(trimmed, keep) else text


def _sentence_case(line):
    letters = [ch for ch in line if ch.isalpha()]
    if letters and sum(ch.isupper() for ch in letters) / len(letters) > 0.8:
        line = line.lower()
        return line[:1].upper() + line[1:]
    return line


def title_for(text, filename, url):
    """A readable title: the project name before "Descriere", else a cleaned filename."""
    lines = [line.strip() for line in (text or '').split('\n') if line.strip()]
    if 'Descriere' in lines:
        index = lines.index('Descriere')
        if index > 0 and len(lines[index - 1]) <= 160:
            return _sentence_case(lines[index - 1])
    name = re.sub(r'(--[0-9a-f]{8,})?(\.main)?\.txt$', '', (filename or '').rsplit('/', 1)[-1])
    if url and re.match(r'primaria-municipiului-chisinau|index|page', name):
        slug = url.rstrip('/').rsplit('/', 1)[-1].split('?')[0]
        name = re.sub(r'^(pv|n|d)-\d+-', '', slug) or name
    name = re.sub(r'[-_]+', ' ', name).strip()
    return (name[:1].upper() + name[1:]) if name else 'Document'


def site_of(filename):
    """documents/dgaurf-md/x.txt → https://dgaurf.md/ (the crawl folder names the site)."""
    parts = (filename or '').split('/')
    if len(parts) >= 3 and re.fullmatch(r'[a-z0-9-]+-(md|ro|com|org)', parts[1]):
        host, tld = parts[1].rsplit('-', 1)
        return f'https://{host}.{tld}/'
    return None


def language_of(text):
    letters = [ch for ch in text or '' if ch.isalpha()]
    cyrillic = sum('а' <= ch.lower() <= 'я' or ch in 'ёЁ' for ch in letters)
    return 'ru' if letters and cyrillic / len(letters) > 0.5 else 'ro'


def _fold(text):
    """Comparison form: case, diacritic variants (ş/ș, ţ/ț) and whitespace do not matter."""
    text = unicodedata.normalize('NFC', text or '').replace('ş', 'ș').replace('ţ', 'ț').replace('Ş', 'Ș').replace('Ţ', 'Ț')
    return text.lower()


def locate(haystack, needle):
    """Code-point range of `needle` in `haystack`, tolerant to spacing; None when absent."""
    needle = (needle or '').strip()
    if not needle:
        return None
    folded = _fold(haystack)
    index = folded.find(_fold(needle))
    if index >= 0:
        return index, index + len(needle)
    words = [re.escape(word) for word in _fold(needle).split()]
    match = re.search(r'\s+'.join(words), folded) if words else None
    return (match.start(), match.end()) if match else None


FILE_NAME = re.compile(r'(\.(txt|pdf|html?|docx?)$)|(--[0-9a-f]{8,})', re.I)


def build_citation(citation, chunk):
    """One source for the viewer: full passage text, evidence range, title, URL, language."""
    raw = (chunk or {}).get('text') or citation.get('passage') or ''
    url, text = split_url(raw)
    text = strip_boilerplate(text, citation.get('passage'))
    url = known(citation.get('source_url')) or url or site_of(citation.get('filename'))
    # The service's own title when it is a real title rather than a file name.
    given = known(citation.get('title')) or known((chunk or {}).get('title'))
    given = given if given and not FILE_NAME.search(given) else None
    highlights = []
    span = locate(text, citation.get('passage'))
    if span:
        highlights.append({'start': span[0], 'end': span[1], 'matches': ['answer_evidence']})
    elif citation.get('passage') and citation['passage'] not in text:
        # The quote is not in the stored chunk: show it on its own so the evidence stays visible.
        text = citation['passage'] if not text else f"{citation['passage']}\n\n{text}"
        highlights.append({'start': 0, 'end': len(citation['passage']), 'matches': ['answer_evidence']})
    return {
        'document_id': citation.get('document_id'), 'chunk_id': citation.get('id'),
        'title': given or title_for(text, citation.get('filename'), url), 'url': url,
        'section': known(citation.get('heading')), 'page': known(citation.get('page')),
        'language': language_of(text), 'publication_date': None, 'effective_date': None,
        'text': text, 'highlights': highlights,
    }


def clean_answer(answer, id_for_prefix):
    """Removes "[id]" markers; each marker grounds the text written since the previous one."""
    parts, highlights, cursor, grounded_from = [], [], 0, 0
    for match in MARKER.finditer(answer or ''):
        parts.append(answer[cursor:match.start()])
        cleaned = ''.join(parts)
        ids = [id_for_prefix(prefix.strip()) for prefix in re.split(r'[,;]', match.group(1))]
        ids = [chunk_id for chunk_id in ids if chunk_id]
        start = grounded_from
        while start < len(cleaned) and (cleaned[start].isspace() or cleaned[start] in '-•*'):
            start += 1
        if re.match(r'\d+[.)]\s', cleaned[start:start + 4]):
            start += len(re.match(r'\d+[.)]\s+', cleaned[start:]).group(0))
        end = len(cleaned.rstrip())
        if ids and end > start:
            highlights.append({'start': start, 'end': end, 'text': cleaned[start:end],
                               'sources': [{'chunk_id': chunk_id} for chunk_id in ids]})
        cursor = match.end()
        grounded_from = len(cleaned)
    parts.append(answer[cursor:] if answer else '')
    return ''.join(parts).strip(), highlights


def normalize(raw, elapsed_ms=None, fix_text=lambda text: text):
    """Maps a claims-style response to the portal's answer; old-style responses pass through."""
    chunks = {chunk.get('id'): chunk for chunk in raw.get('retrieval') or []}
    cited, order = {}, []
    for citation in [c for claim in raw.get('claims') or [] for c in claim.get('citations') or []] + list(raw.get('conflict_citations') or []):
        if citation.get('id') and citation['id'] not in cited:
            cited[citation['id']] = citation
            order.append(citation['id'])
    citations = [build_citation(cited[chunk_id], chunks.get(chunk_id)) for chunk_id in order]

    def id_for_prefix(prefix):
        prefix = prefix.lower()
        return next((chunk_id for chunk_id in order if chunk_id.lower().startswith(prefix)), None)

    text, highlights = clean_answer(fix_text(raw.get('answer') or ''), id_for_prefix)
    if not highlights:
        # No inline markers: ground each claim where its sentence appears in the answer.
        for claim in raw.get('claims') or []:
            span = locate(text, claim.get('text'))
            ids = [c.get('id') for c in claim.get('citations') or [] if c.get('id')]
            if span and ids:
                highlights.append({'start': span[0], 'end': span[1], 'text': text[span[0]:span[1]], 'sources': [{'chunk_id': i} for i in ids]})
    # Clicking a grounded phrase opens its source with the quoted words in focus.
    evidence = {c['chunk_id']: c['highlights'][0] for c in citations if c['highlights']}
    for highlight in highlights:
        highlight['sources'] = [{**source, **({'start': evidence[source['chunk_id']]['start'], 'end': evidence[source['chunk_id']]['end']} if source['chunk_id'] in evidence else {})}
                                for source in highlight['sources']]
    status = STATUS.get(str(raw.get('status') or '').lower(), 'answered' if citations else 'abstained')
    conflict = bool(raw.get('conflict')) or status == 'conflict'
    if status == 'abstained':
        citations, highlights = [], []
    return {
        'status': 'conflict' if conflict else status,
        'answer': text,
        'citations': citations,
        'conflict': ({'message': raw.get('conflict_description')} if raw.get('conflict_description') else True) if conflict else None,
        'next_steps': [],
        'answer_highlights': highlights,
        'request_id': raw.get('request_id') or uuid.uuid4().hex[:16],
        'elapsed_ms': raw.get('elapsed_ms') if raw.get('elapsed_ms') is not None else elapsed_ms,
    }
