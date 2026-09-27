# Portalul Cetățeanului

Municipal information assistant for Chișinău City Hall. It answers citizens' and employees' questions in Romanian and Russian **only from City Hall's public documents**, shows the exact document and passage behind every answer, and says so openly when the documents are silent or contradict each other.

## What it does

| Requirement | Where |
|---|---|
| Answers from a defined corpus, RO + RU | `app/assistant.py` proxies the RAG service; the answer language follows the question's language |
| Exact document + passage for every answer | Answer card lists the sources; clicking an underlined phrase opens the cited passage with the evidence highlighted (`SourceViewer.jsx`) |
| Missing information / contradictions flagged | Status on every answer: verified, not in the documents, or contradictory sources |
| Website navigation | Sector map with praetorship contacts; answers without a source route to the responsible praetorship or City Hall (`contactRouting.js`) |
| Feedback (bonus) | Rate each answer, with an optional comment; stored in `feedback` and on the saved message |

### Accounts and saved conversations

- Sign up / sign in with e-mail and password (session cookie, hashed passwords, login throttling, sessions invalidated when the password changes).
- Signed-in users get every exchange saved with its sources, so a reopened conversation shows the same evidence. The history sidebar supports search, date groups, rename, pin, delete and Markdown export (a record with the sources that a citizen can keep or attach to a petition).
- Visitors keep their chat for the browser tab. When they sign in, it is imported into the account automatically.
- The account page has the conversation list, profile and preferred language (the portal opens in it), password change, and privacy controls: delete all conversations, or delete the account entirely.

### Problems board (`#/probleme`)

- Anyone can report a city problem with a photo, a name, a category, the sector and an address. The photo is resized in the browser before upload, which also drops its GPS metadata. Uploads live in `instance/uploads/reports/`.
- Before publishing, the form shows open reports of the same kind in that sector, so people confirm an existing one ("Am văzut și eu") instead of adding a duplicate. Each browser session counts once.
- Employees (`--role employee`) change the status (reported → in progress → solved) from the report view and attach an after-photo; solved reports show a before/after slider and how many days the fix took.
- Light and dark themes: follows the system until the visitor picks one with the header toggle.
- `flask --app run seed-reports` fills an empty board with 12 demo reports (photos from Wikimedia Commons, credited on each report).

## Run locally

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/flask --app run db upgrade
cd frontend && npm ci && npm run build && cd ..
.venv/bin/flask --app run run --port 5000
```

`.env` needs `SECRET_KEY`, `RAG_API_URL`, `RAG_API_KEY` and, to publish model instructions, `RAG_ADMIN_KEY`. For frontend development run `npm run dev` in `frontend/` (Vite proxies `/api` to port 5000).

Create an account from the command line (for example a municipal employee):

```bash
.venv/bin/flask --app run create-user ana@primaria.md --name "Ana Ciobanu" --role employee
```

## Library of projects and documents (`#/documente`)

The portal keeps its own searchable library of the city's paperwork, next to the assistant:

- **Projects** from proiecte.chisinau.md: title, sector, category, photo, published investment and the completion bar of each project page.
- **Documents** (PDF, DOCX) linked from dgaurf.md: urban-planning decisions, orders, regulations and the PUG study summaries. Text is extracted with pypdf; scanned PDFs are read with Tesseract OCR (Romanian or Russian, chosen from the title), and the reader says when a text was recognised automatically.
- Everything is listed newest first and grouped by month. Documents use their own date (from the title, file name or PDF metadata); project pages carry no date, so a project is dated by the upload time in its photo names (`1311_1754114705.jpg` → 2 August 2025), i.e. when it was added to the portal. When searching, results can also be ordered by relevance.
- Each card shows the thing itself: the project's photo, or the first page of the PDF rendered with poppler (`instance/uploads/library/`).
- Search uses SQLite FTS5 with diacritics ignored and light Romanian stemming, so `gradinita` finds „Grădiniței” and „grădinițele”. Results show the matching passage, and the reader marks every match.
- The home page shows the newest projects, each sector panel shows how many projects the sector has published, and when the assistant cannot answer it offers library pages that mention the subject, as leads rather than answers.

The crawler is polite: it honours robots.txt (www.chisinau.md disallows crawlers and is never visited), waits a second between requests to a host and skips files over 25 MB. OCR needs `tesseract` (with `tesseract-data-ron` and `tesseract-data-rus`) and `pdftoppm` from poppler; without them documents are still indexed by title.

```bash
.venv/bin/flask --app run crawl-library --projects 150 --documents 60   # add what is new
.venv/bin/flask --app run crawl-library --refresh                       # fetch everything again
```

Municipal employees can also start a collection from the library page ("Actualizează acum"); it runs in the background.

## Project swipe game

A small button in the corner of every page ("Votează proiectele") opens a deck of city projects from the library. Residents drag a card right if they like the project and left if not (or use the buttons, or the ← → keys; ↑ skips). After each vote they see how many other residents agree, and a public ranking shows every project's approval, putting projects with at least three votes first.

- One vote per project per browser; changing one's mind replaces the vote. The voter key survives signing in, so a vote cannot be doubled by logging in.
- Votes are anonymous; signed-in votes also keep the account id for the municipality's own analysis.
- Municipal employees download all results from the ranking as CSV (`/api/swipe/results.csv`: project, sector, category, likes, dislikes, approval, link).

## Answer service

The portal uses four endpoints of the RAG service at `RAG_API_URL`: `POST /v1/ask` for questions (bearer key `RAG_API_KEY`), `GET /v1/health` for status, storage and model, and `GET`/`PUT /v1/config/prompt` for the versioned instructions (`RAG_ADMIN_KEY`). The service answers with claims that cite passages by chunk id; [`app/rag_adapter.py`](app/rag_adapter.py) turns them into what the answer card shows: the answer with each claim underlined and numbered, and every source with its full passage, the quoted words highlighted, its title and the original page address (read from the passage when the service reports it as unknown). `insufficient_evidence` is shown as "not in the documents", and `conflict` with its description. The earlier response format is still accepted.

## Model instructions

The RAG service's answer model follows versioned custom instructions kept in [`app/prompts/custom_instructions.txt`](app/prompts/custom_instructions.txt): strict grounding, figures copied verbatim, explicit abstention and contradiction reporting, and a formal direct answer style. Check or publish them with:

```bash
.venv/bin/python scripts/push_prompt.py          # compare with the live revision
.venv/bin/python scripts/push_prompt.py --apply  # publish a new revision
```

## Evaluation

[`eval/questions.jsonl`](eval/questions.jsonl) holds 16 question pairs, each asked in Romanian and in Russian, written from the project pages of proiecte.chisinau.md. Every question states the status it should get, the facts the answer must contain, the document it should cite and the supporting passage. The set covers plain facts, lists, eligibility, a part-versus-total trap (the new block of Grădinița nr. 125 cost 9,3 mil. lei; the multi-year total is over 14 mil. 446 mii), a real inconsistency between two pages (3 new groups versus 2 new groups plus one rebuilt), questions the documents cannot answer, a half-answerable question and a project that is not finished yet.

```bash
.venv/bin/python scripts/evaluate.py --check                        # validate the question file
.venv/bin/python scripts/evaluate.py                                # ask the RAG service from .env
.venv/bin/python scripts/evaluate.py --app http://127.0.0.1:5000    # go through the portal
```

The report scores status, facts, cited document, cited passage, answer language and RO/RU agreement, and saves every answer to `eval/results/`.

## Tests

```bash
.venv/bin/python -m unittest tests.test_app     # API, accounts, conversations, reports, feedback, migrations, evaluation set
node frontend/tests/smoke.cjs                    # browser smoke test (needs the app running)
node frontend/tests/answers.cjs                  # answer card: checklist, evidence, routing, feedback (mocked answers)
node frontend/tests/regressions.cjs              # review regressions; changes data, so point it at a throwaway database (see the file header)
```
