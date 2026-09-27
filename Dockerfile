# Portalul Cetățeanului: one image with the built frontend, gunicorn and OCR for scanned PDFs.
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# tesseract + poppler read scanned PDFs for the document library (Romanian and Russian).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-ron tesseract-ocr-rus poppler-utils \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app app
COPY migrations migrations
COPY wsgi.py run.py gunicorn.conf.py ./
COPY --from=frontend /build/dist frontend/dist
RUN useradd --create-home portal && mkdir -p instance && chown portal instance
USER portal
# Database, uploads, covers and the session secret live here: mount a volume to keep them.
VOLUME /srv/instance
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import sys, urllib.request; sys.exit(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status != 200)"
CMD ["sh", "-c", "flask --app wsgi db upgrade && exec gunicorn -c gunicorn.conf.py wsgi:app"]
