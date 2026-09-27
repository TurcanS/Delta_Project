"""Production server settings. Run with: gunicorn wsgi:app

Answers wait several seconds on the RAG service, so each worker runs threads: a slow answer
holds one thread, not a whole process. Override any value with the environment variables below.
"""
import multiprocessing
import os

bind = os.environ.get('BIND', f"0.0.0.0:{os.environ.get('PORT', '8000')}")
workers = int(os.environ.get('WEB_CONCURRENCY', min(multiprocessing.cpu_count() * 2 + 1, 8)))
worker_class = 'gthread'
threads = int(os.environ.get('THREADS', 8))
timeout = 120           # the RAG call may take up to 90 s
graceful_timeout = 30
keepalive = 5
max_requests = 2000     # recycle workers now and then, so memory never creeps up
max_requests_jitter = 200
accesslog = '-'
errorlog = '-'
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(M)sms'
