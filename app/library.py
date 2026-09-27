"""Library of the city's projects and official documents, collected from its public websites.

Sources are crawled politely: robots.txt is honoured (www.chisinau.md disallows crawlers, so it
is not visited), each host is asked at most once a second, and documents above MAX_DOCUMENT
bytes are skipped. Project pages on proiecte.chisinau.md give the sector, category, investment,
photo and completion bar; PDF and DOCX files linked from dgaurf.md give their text, read with
OCR (Tesseract) when a PDF is a scan without a text layer.
"""
import hashlib
import html
import io
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

from flask import current_app
from sqlalchemy import text as sql

from app import db
from app.models import CityDocument, utcnow

USER_AGENT = 'PortalulCetateanului/1.0 (civic information portal)'
DELAY = 1.0
MAX_DOCUMENT = 25 * 1024 * 1024
OCR_PAGES = 6
PROJECTS = 'https://proiecte.chisinau.md/ro/'
# Sector listings on proiecte.chisinau.md, mapped to the portal's sector ids.
PROJECT_SECTORS = {'n-1-centru': 'centru', 'n-9-botanica': 'botanica', 'n-8-buiucani': 'buiucani',
                   'n-3-ciocana': 'ciocana', 'n-12-rascani': 'rascani'}
DOCUMENT_PAGES = ['https://dgaurf.md/ro/documentatii-de-urbanism', 'https://dgaurf.md/ro/regulatory',
                  'https://dgaurf.md/ro/budget', 'https://dgaurf.md/ro/procurement-plans',
                  'https://dgaurf.md/ro/activity-plans', 'https://dgaurf.md/ro/proiecte-cu-finantare-externa']
MONTHS = {'ianuarie': 1, 'februarie': 2, 'martie': 3, 'aprilie': 4, 'mai': 5, 'iunie': 6, 'iulie': 7,
          'august': 8, 'septembrie': 9, 'octombrie': 10, 'noiembrie': 11, 'decembrie': 12}

FTS_STATEMENTS = [
    "CREATE VIRTUAL TABLE city_document_fts USING fts5(title, summary, text, content='city_document', content_rowid='id', tokenize='unicode61 remove_diacritics 2')",
    "CREATE TRIGGER city_document_ai AFTER INSERT ON city_document BEGIN INSERT INTO city_document_fts(rowid, title, summary, text) VALUES (new.id, new.title, new.summary, new.text); END",
    "CREATE TRIGGER city_document_ad AFTER DELETE ON city_document BEGIN INSERT INTO city_document_fts(city_document_fts, rowid, title, summary, text) VALUES ('delete', old.id, old.title, old.summary, old.text); END",
    "CREATE TRIGGER city_document_au AFTER UPDATE ON city_document BEGIN INSERT INTO city_document_fts(city_document_fts, rowid, title, summary, text) VALUES ('delete', old.id, old.title, old.summary, old.text); INSERT INTO city_document_fts(rowid, title, summary, text) VALUES (new.id, new.title, new.summary, new.text); END",
]


def has_fts():
    if db.engine.dialect.name != 'sqlite':
        return False
    return bool(db.session.execute(sql("SELECT 1 FROM sqlite_master WHERE name = 'city_document_fts'")).first())


def ensure_index():
    """Creates the FTS index when the database was built without migrations (tests, create_all)."""
    if db.engine.dialect.name == 'sqlite' and not has_fts():
        for statement in FTS_STATEMENTS:
            db.session.execute(sql(statement))
        db.session.execute(sql("INSERT INTO city_document_fts(city_document_fts) VALUES ('rebuild')"))
        db.session.commit()


# ---------------------------------------------------------------- polite fetching

class Fetcher:
    def __init__(self, log=print):
        self.log = log
        self.robots = {}
        self.last = {}

    def allowed(self, url):
        parts = urllib.parse.urlsplit(url)
        root = f'{parts.scheme}://{parts.netloc}'
        if root not in self.robots:
            parser = urllib.robotparser.RobotFileParser()
            try:
                with self._open(f'{root}/robots.txt', timeout=15) as response:
                    parser.parse(response.read().decode('utf-8', 'ignore').splitlines())
            except urllib.error.HTTPError as error:
                parser.parse([] if error.code in (404, 410) else ['User-agent: *', 'Disallow: /'])
            except (urllib.error.URLError, TimeoutError, OSError):
                parser.parse(['User-agent: *', 'Disallow: /'])
            self.robots[root] = parser
        return self.robots[root].can_fetch(USER_AGENT, url)

    def _open(self, url, timeout=30):
        host = urllib.parse.urlsplit(url).netloc
        wait = DELAY - (time.monotonic() - self.last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        self.last[host] = time.monotonic()
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Language': 'ro'})
        return urllib.request.urlopen(request, timeout=timeout)

    def get(self, url, limit=MAX_DOCUMENT):
        if not self.allowed(url):
            self.log(f'  robots.txt disallows {url}')
            return None
        try:
            with self._open(url) as response:
                if int(response.headers.get('Content-Length') or 0) > limit:
                    self.log(f'  too large, skipped: {url}')
                    return None
                data = response.read(limit + 1)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            self.log(f'  could not fetch {url}: {error}')
            return None
        return None if len(data) > limit else data


# ---------------------------------------------------------------- parsing helpers

def clean_text(markup):
    markup = re.sub(r'(?is)<(script|style|iframe)\b.*?</\1>', ' ', markup)
    markup = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</li>|</h\d>', '\n', markup)
    text = html.unescape(re.sub(r'<[^>]+>', ' ', markup))
    text = re.sub(r'[ \t ]+', ' ', text)
    return re.sub(r'\n\s*\n+', '\n\n', '\n'.join(line.strip() for line in text.split('\n'))).strip()


ACRONYMS = {'lt', 'iplt', 'iet', 'ie', 'cmc', 'pug', 'scm', 'dgaurf', 'man', 'berd', 'bei', 'ue', 'imsp', 'cmf', 'amt', 'cct',
            'tika', 'usaid', 'undp', 'giz', 'rtec', 'agsv', 'led', 'it', 'rti', 'tv', 'ip', 'sa', 'ii'}
PLACES = {'chișinău', 'chişinău', 'chisinau', 'botanica', 'centru', 'buiucani', 'ciocana', 'râșcani', 'rîșcani', 'rîşcani', 'telecentru',
          'sîngera', 'singera', 'durlești', 'codru', 'vatra', 'cricova', 'stăuceni', 'ghidighici', 'grătiești', 'trușeni', 'bubuieci',
          'budești', 'colonița', 'tohatin', 'vadul', 'lui', 'vodă', 'moldova', 'românia', 'buzău', 'poșta', 'veche', 'sculeni', 'muncești'}
STREET_PREFIX = re.compile(r'^(str|bd|șos|sos|strada|bulevardul|șoseaua)\.?$')
# Places named after a person or a proper name: "scuarul Nicolae Dimo", "liceul Mihai Eminescu".
NAME_PREFIX = re.compile(r'^(scuarul|parcul|liceul|gimnaziul|școala|scoala|grădina|gradina|stadionul|piața|piata|aleea|lt|iplt)\.?$')
SMALL_WORDS = {'de', 'la', 'din', 'și', 'si', 'cu', 'pe', 'în', 'a', 'al', 'ale', 'pentru', 'spre', 'nr', 'cel', 'cea', 'lui'}


def title_case(line):
    """Readable Romanian casing for titles written in capitals, keeping names and acronyms."""
    letters = [ch for ch in line if ch.isalpha()]
    if not letters or sum(ch.isupper() for ch in letters) / len(letters) <= 0.8:
        return line
    words, result, naming, quoted = line.lower().split(' '), [], False, False
    for index, word in enumerate(words):
        bare = re.sub(r'[^\w]', '', word)
        opens = bool(re.match(r'^[„"«]', word))
        quoted = quoted or opens
        if '/' in word:
            word = '/'.join(part.upper() if re.sub(r'[^\w]', '', part) in ACRONYMS else part for part in word.split('/'))
        elif bare in ACRONYMS and not (bare == 'ii' and index == 0):
            word = word.replace(bare, bare.upper())
        elif 2 <= len(bare) <= 3 and index + 1 < len(words) and re.match(r'^[„"«]', words[index + 1]) and bare not in SMALL_WORDS:
            word = word.replace(bare, bare.upper())  # an institution type before its name: CE „Antonin Ursu”
        elif bare in SMALL_WORDS and index > 0 and not opens:
            pass
        elif index == 0 or naming or quoted or bare in PLACES:
            word = re.sub(r'\w', lambda m: m.group(0).upper(), word, count=1)
        result.append(word)
        if re.search(r'[”"»]$', word.rstrip('.,;:')):
            quoted = False
            naming = False  # a quoted name ends the name
        # A street prefix names what follows, up to a comma or a number.
        following = re.sub(r'[^\w]', '', words[index + 1]) if index + 1 < len(words) else ''
        if NAME_PREFIX.match(bare) and following and following not in SMALL_WORDS and not following.isdigit():
            naming = True
        elif STREET_PREFIX.match(bare) or (naming and not re.search(r'[,;]$', word) and not re.match(r'^\d', words[index + 1] if index + 1 < len(words) else '0')):
            naming = STREET_PREFIX.match(bare) is not None or naming
        if re.search(r'[,;]$', word) or (index + 1 < len(words) and re.match(r'^\d', words[index + 1])):
            naming = False
    return ' '.join(result)


def sentence_case(line):
    return title_case(line)


def parse_money(value):
    """'9 300 000 MDL' → 9300000; '9,3 milioane lei' → 9300000; None when unclear."""
    if not value:
        return None
    text = value.lower().replace(' ', ' ')
    match = re.search(r'(\d+(?:[.,]\d+)?)\s*(milioane|milion|mln|mil\.?)(?:\s+(\d+)\s+de\s+mii)?', text)
    if match:
        thousands = int(match.group(3)) * 1000 if match.group(3) else 0
        return round(float(match.group(1).replace(',', '.')) * 1_000_000) + thousands
    match = re.search(r'\d{1,3}(?:[ .]\d{3})+|\d{4,}', text)
    return int(re.sub(r'[ .]', '', match.group(0))) if match else None


def money_mdl(value):
    """An amount in lei only: '9 300 000 MDL', '9,3 milioane lei', '8 milioane 175 de mii de lei'.

    Years, areas and euro amounts are not lei, so anything without a lei/MDL mark is ignored.
    """
    text = (value or '').lower().replace('\u00a0', ' ')
    match = re.search(r'(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(milioane|milion|mln\.?|mil\.?)?(?:\s+\d+\s+de\s+mii)?\s*(?:de\s+)?(lei|mdl)\b', text)
    if not match:
        return None
    amount = parse_money(match.group(0))
    return amount if amount and amount >= 1000 else None


def parse_date(*texts):
    """First date written as 02.07.2026, 17_09_2024 or '27 iulie 2021' in the given texts."""
    for value in texts:
        value = urllib.parse.unquote(value or '').lower()
        for match in re.finditer(r'(\d{1,2})[._\-/](\d{1,2})[._\-/](20\d{2}|19\d{2})', value):
            try:
                return date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
            except ValueError:
                continue
        short = re.search(r'(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{2})(?![\d.])', value)
        if short:
            try:
                return date(2000 + int(short.group(3)), int(short.group(2)), int(short.group(1)))
            except ValueError:
                pass
        match = re.search(r'(\d{1,2})[\s_]+(' + '|'.join(MONTHS) + r')[\s_]+(20\d{2})', value)
        if match:
            try:
                return date(int(match.group(3)), MONTHS[match.group(2)], int(match.group(1)))
            except ValueError:
                pass
    return None


def image_date(url):
    """Project photos are named <project>_<unix time><n>.jpg: the upload date is when the project
    was added to the portal, since project pages carry no date of their own."""
    match = re.search(r'/\d+_(\d{10})\d*\.\w+$', url or '')
    if not match:
        return None
    moment = datetime.fromtimestamp(int(match.group(1)), timezone.utc).date()
    return moment if date(2010, 1, 1) <= moment <= date.today() else None


def pdf_date(value):
    match = re.match(r"D:(\d{4})(\d{2})(\d{2})", value or '')
    return date(int(match.group(1)), int(match.group(2)), int(match.group(3))) if match else None


# ---------------------------------------------------------------- document text

def docx_text(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        xml = archive.read('word/document.xml').decode('utf-8', 'ignore')
    xml = re.sub(r'</w:p>', '\n', xml)
    xml = re.sub(r'<w:tab/>', '\t', xml)
    return re.sub(r'\n{3,}', '\n\n', html.unescape(re.sub(r'<[^>]+>', '', xml))).strip()


def ocr_pdf(data, language):
    """Text of the first OCR_PAGES pages of a scanned PDF; '' when Tesseract is not installed."""
    if not (shutil.which('pdftoppm') and shutil.which('tesseract')):
        return ''
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / 'doc.pdf'
        source.write_bytes(data)
        subprocess.run(['pdftoppm', '-r', '200', '-gray', '-f', '1', '-l', str(OCR_PAGES), '-png', str(source), f'{folder}/page'],
                       check=False, capture_output=True, timeout=180)
        pages = []
        for image in sorted(Path(folder).glob('page-*.png')):
            result = subprocess.run(['tesseract', str(image), '-', '-l', language], check=False, capture_output=True, timeout=120)
            pages.append(result.stdout.decode('utf-8', 'ignore').strip())
    return '\n\n'.join(page for page in pages if page)


def pdf_text(data, title):
    """(text, page count, used OCR, creation date) of a PDF."""
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = len(reader.pages)
        text = '\n\n'.join((page.extract_text() or '').strip() for page in reader.pages[:80])
        created = pdf_date(str((reader.metadata or {}).get('/CreationDate', '')))
    except Exception:  # damaged or encrypted files still get OCR
        pages, text, created = None, '', None
    if len(text.strip()) >= 80 * max(1, min(pages or 1, 3)):
        return text, pages, False, created
    language = 'rus' if re.search('[А-Яа-я]', title) else 'ron'
    return ocr_pdf(data, language), pages, True, created


# ---------------------------------------------------------------- sources

def project_links(fetcher, log):
    """{project number: (url, sector, listing title)} from the five sector listings.

    The listings write titles in normal case ("Acces spre LT „Petru Rareș”"), while project
    pages often shout them in capitals, so the listing title is kept when there is one.
    """
    found = {}
    for slug, sector in PROJECT_SECTORS.items():
        page = fetcher.get(PROJECTS + slug, limit=8 * 1024 * 1024)
        if not page:
            continue
        markup = page.decode('utf-8', 'ignore')
        titles = {int(number): title_case(clean_text(label)) for number, label in re.findall(
            r'pv-(\d+)-[^"]*"\s+class="item-image">\s*<div class="discount">(.*?)</div>', markup, re.S)}
        for url, number in re.findall(r'href="(https://proiecte\.chisinau\.md/(?:ro/)?pv-(\d+)-[^"]+)"', markup):
            found.setdefault(int(number), (url.split('?')[0], sector, titles.get(int(number))))
        log(f'{slug}: {len(found)} projects so far')
    return found


def parse_project(markup, url, sector, number, listed_title=None):
    body = re.sub(r'data:image/[^"\')]+', '', markup)
    crumb = re.search(r'<div class="col-lg-7">\s*<b>(.*?)</b>', body, re.S)
    title = re.search(r'<h1>(.*?)</h1>', body, re.S)
    description = re.search(r'<div id="real_description">(.*?)<blockquote', body, re.S) or re.search(r'<div id="real_description">(.*?)</div>\s*</div>\s*</div>', body, re.S)
    investment = re.search(r'<h5[^>]*>\s*Investi[țţ]ii?:?\s*(.*?)</h5>', body, re.S)
    progress = re.search(r'role="progressbar"\s+aria-valuenow="(\d+)"', body)
    image = re.search(r'<img class="animated" src="([^"]+)"', body)
    if not title:
        return None
    crumbs = [part.strip() for part in clean_text(crumb.group(1)).split('/')] if crumb else []
    text = clean_text(description.group(1)) if description else ''
    text = re.sub(r'(?m)^Investi[țţ]ii?:?\s*$', '', text).strip()
    amount = clean_text(investment.group(1)).strip() if investment else ''
    return {
        'url': url, 'kind': 'project', 'source': 'proiecte.chisinau.md', 'source_page': PROJECTS,
        'title': (listed_title or sentence_case(clean_text(title.group(1))))[:300], 'summary': text[:600] or None, 'text': text or None,
        'sector': sector, 'category': ' / '.join(crumbs[1:])[:160] or None,
        'investment': amount[:120] or None, 'investment_mdl': money_mdl(amount) or money_mdl(text),
        'progress': int(progress.group(1)) if progress else None,
        'image_url': image.group(1) if image else None, 'project_number': number,
        'published_on': image_date(image.group(1) if image else None) or parse_date(text),
    }


def document_links(fetcher, log, pages=DOCUMENT_PAGES):
    """[(url, title, page)] of PDF/DOCX links, with the link text as title."""
    found = {}
    for page_url in pages:
        page = fetcher.get(page_url, limit=8 * 1024 * 1024)
        if not page:
            continue
        markup = page.decode('utf-8', 'ignore')
        for href, label in re.findall(r'<a[^>]+href="([^"]+\.(?:pdf|docx))(?:\?[^"]*)?"[^>]*>(.*?)</a>', markup, re.I | re.S):
            url = urllib.parse.urljoin(page_url, html.unescape(href))
            title = re.sub(r'\s+', ' ', clean_text(label)).strip()
            if url not in found or (title and not found[url][1]):
                found[url] = (url, title, page_url)
        log(f'{page_url}: {len(found)} documents so far')
    return list(found.values())


def title_from_url(url):
    name = urllib.parse.unquote(url.rsplit('/', 1)[-1]).rsplit('.', 1)[0]
    name = re.sub(r'[_\-]+', ' ', name).strip()
    return (name[:1].upper() + name[1:])[:300] or 'Document'


# ---------------------------------------------------------------- crawl

def store(fields):
    fields = {**fields, 'content_hash': hashlib.sha256((fields.get('text') or fields['title']).encode()).hexdigest(), 'fetched_at': utcnow()}
    row = db.session.execute(db.select(CityDocument).filter_by(url=fields['url'])).scalar()
    if row is None:
        db.session.add(CityDocument(**fields))
    else:
        for key, value in fields.items():
            setattr(row, key, value)
    db.session.commit()
    return row or db.session.execute(db.select(CityDocument).filter_by(url=fields['url'])).scalar()


def cover_dir():
    folder = Path(current_app.instance_path) / 'uploads' / 'library'
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def cover_path(document_id):
    return cover_dir() / f'{document_id}.jpg'


def render_cover(data, document_id):
    """The first page of a PDF as a small JPEG, shown as the document's cover."""
    if not shutil.which('pdftoppm'):
        return False
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / 'doc.pdf'
        source.write_bytes(data)
        subprocess.run(['pdftoppm', '-jpeg', '-jpegopt', 'quality=78', '-singlefile', '-f', '1', '-l', '1', '-scale-to', '560', str(source), f'{folder}/cover'],
                       check=False, capture_output=True, timeout=60)
        rendered = Path(folder) / 'cover.jpg'
        if rendered.exists():
            shutil.copyfile(rendered, cover_path(document_id))
            return True
    return False


def fill_covers(fetcher, log):
    """Covers for PDFs collected before covers existed (downloads each file once more)."""
    missing = [row for row in db.session.execute(db.select(CityDocument).filter_by(kind='pdf')).scalars() if not cover_path(row.id).exists()]
    for row in missing:
        data = fetcher.get(row.url)
        if data and render_cover(data, row.id):
            log(f'  cover: {row.title[:70]}')
    return len(missing)


def crawl(projects=150, documents=60, refresh=False, log=print):
    """Collects the newest `projects` project pages and up to `documents` PDF/DOCX files."""
    ensure_index()
    fetcher = Fetcher(log)
    known = set(db.session.execute(db.select(CityDocument.url)).scalars()) if not refresh else set()
    added = {'project': 0, 'pdf': 0, 'docx': 0}

    links = project_links(fetcher, log) if projects else {}
    for number in sorted(links, reverse=True)[:projects]:
        url, sector, listed_title = links[number]
        if url in known:
            continue
        page = fetcher.get(url, limit=4 * 1024 * 1024)
        project = parse_project(page.decode('utf-8', 'ignore'), url, sector, number, listed_title) if page else None
        if project:
            store(project)
            added['project'] += 1
            log(f'  project {number}: {project["title"][:70]}')

    links = document_links(fetcher, log) if documents else []
    for url, title, page_url in links[:documents]:
        if url in known:
            continue
        data = fetcher.get(url)
        if not data:
            continue
        kind = 'docx' if url.lower().endswith('.docx') else 'pdf'
        title = title or title_from_url(url)
        try:
            if kind == 'docx':
                text, pages, used_ocr, created = docx_text(data), None, False, None
            else:
                text, pages, used_ocr, created = pdf_text(data, title)
        except (zipfile.BadZipFile, KeyError, subprocess.SubprocessError) as error:
            log(f'  could not read {url}: {error}')
            continue
        text = re.sub(r'[ \t]+', ' ', text or '').strip()
        row = store({'url': url, 'kind': kind, 'source': urllib.parse.urlsplit(url).netloc, 'source_page': page_url,
                     'title': title[:300], 'summary': (text[:600] or None), 'text': text or None, 'page_count': pages,
                     'ocr': used_ocr and bool(text), 'published_on': parse_date(title, url) or created})
        if kind == 'pdf':
            render_cover(data, row.id)
        added[kind] += 1
        log(f'  {kind}{" (OCR)" if used_ocr else ""}: {title[:70]}')
    fill_covers(fetcher, log)
    return added


# ---------------------------------------------------------------- search

# Newest first: the document's own date or the day the project was added; undated items last.
NEWEST = 'd.published_on IS NULL, d.published_on DESC, coalesce(d.project_number, 0) DESC, d.id DESC'


def stem(word):
    """Romanian words change their ending (grădinița, grădiniței, grădinițele): long words are
    matched on their stem, so a search finds every form."""
    return word[:max(4, len(word) - 2)] if len(word) > 5 else word


STOPWORDS = {'ce', 'cum', 'care', 'cine', 'unde', 'când', 'cand', 'cât', 'cat', 'câte', 'cate', 'câți', 'cati', 'este', 'sunt', 'fost', 'au', 'a', 'al', 'ale',
             'la', 'de', 'din', 'în', 'in', 'pe', 'cu', 'și', 'si', 'sau', 'pentru', 'spre', 'despre', 'lui', 'mai', 'se', 's', 'făcut', 'facut',
             'un', 'o', 'unei', 'unui', 'nr', 'что', 'как', 'где', 'когда', 'кто', 'сколько', 'какие', 'какой', 'был', 'были', 'было', 'в', 'во',
             'на', 'по', 'с', 'со', 'и', 'или', 'для', 'о', 'об', 'от', 'до', 'из', 'за', 'это', 'ли'}


def fts_query(query, any_word=False):
    """User words → an FTS5 prefix query; punctuation, operators and question words are dropped.

    `any_word` matches documents with any of the words (ranked by how many and how rare), for
    turning a whole question into leads; otherwise every word must appear.
    """
    words = [word for word in re.findall(r'\w+', query or '', re.UNICODE) if word.lower() not in STOPWORDS and (len(word) > 1 or word.isdigit())]
    return (' OR ' if any_word else ' ').join(f'"{stem(word)}"*' for word in words[:12])


def search(query='', kind=None, sector=None, offset=0, limit=20, any_word=False, sort='new'):
    """Matches ranked by relevance (title counts most), or newest first without a query.

    Counts per kind ignore the kind filter, so the filter can show what each choice would give.
    """
    ensure_index()
    params = {'limit': limit + 1, 'offset': offset}
    shared = ''
    if sector:
        shared += ' AND d.sector = :sector'
        params['sector'] = sector
    only_kind = ''
    if kind in ('project', 'pdf', 'docx'):
        only_kind = ' AND d.kind = :kind'
        params['kind'] = kind
    match = fts_query(query, any_word)
    if match and has_fts():
        params['match'] = match
        source = 'city_document_fts JOIN city_document d ON d.id = city_document_fts.rowid WHERE city_document_fts MATCH :match'
        columns = "d.id, snippet(city_document_fts, 2, char(2), char(3), '…', 24) AS snip, snippet(city_document_fts, 0, char(2), char(3), '', 40) AS title_snip"
        order = 'bm25(city_document_fts, 8.0, 3.0, 1.0)' if sort == 'relevance' else NEWEST
    elif match:
        # Without FTS5 (another database engine): plain substring search on title and text.
        params['like'] = f"%{query.strip()}%"
        source = 'city_document d WHERE (d.title LIKE :like OR d.text LIKE :like)'
        columns, order = 'd.id, NULL AS snip, NULL AS title_snip', NEWEST
    else:
        source = 'city_document d WHERE 1=1'
        columns = 'd.id, NULL AS snip, NULL AS title_snip'
        order = NEWEST
    rows = db.session.execute(sql(f'SELECT {columns} FROM {source}{shared}{only_kind} ORDER BY {order} LIMIT :limit OFFSET :offset'), params).all()
    counts = dict(db.session.execute(sql(f'SELECT d.kind, count(*) FROM {source}{shared} GROUP BY d.kind'), params).all())
    documents = {row.id: row for row in db.session.execute(db.select(CityDocument).where(CityDocument.id.in_([r.id for r in rows]))).scalars()}
    items = []
    for row in rows[:limit]:
        snippet = next((value for value in (row.snip, row.title_snip) if value and '\x02' in value), None)
        items.append(documents[row.id].to_dict(snippet=snippet))
    return {'items': items, 'counts': {name: counts.get(name, 0) for name in ('project', 'pdf', 'docx')}, 'has_more': len(rows) > limit}


def sector_stats():
    rows = db.session.execute(sql(
        "SELECT sector, count(*), sum(CASE WHEN progress >= 100 THEN 1 ELSE 0 END), sum(investment_mdl) "
        "FROM city_document WHERE kind = 'project' AND sector IS NOT NULL GROUP BY sector")).all()
    return {sector: {'projects': count, 'completed': done or 0, 'investment_mdl': total or 0} for sector, count, done, total in rows}


def last_crawl():
    value = db.session.execute(db.select(db.func.max(CityDocument.fetched_at))).scalar()
    return value.isoformat() + 'Z' if isinstance(value, datetime) else None
