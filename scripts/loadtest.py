"""Small load test for the portal's read endpoints (no dependencies beyond the standard library).

Usage:
  gunicorn -c gunicorn.conf.py wsgi:app          # in another terminal
  .venv/bin/python scripts/loadtest.py --url http://127.0.0.1:8000 --concurrency 20 --seconds 8
Reports requests per second and latency percentiles for each endpoint.
"""
import argparse
import statistics
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ENDPOINTS = [
    ('home page', '/'),
    ('health', '/api/health'),
    ('sectors', '/api/sectors'),
    ('problems board', '/api/reports'),
    ('library, newest', '/api/library'),
    ('library search', '/api/library?q=gradinita'),
    ('vote ranking', '/api/swipe/results'),
]


def hammer(base, path, concurrency, seconds):
    latencies, errors, stop = [], [0], time.monotonic() + seconds
    lock = threading.Lock()

    def worker():
        opener = urllib.request.build_opener()
        opener.addheaders = [('Accept-Encoding', 'gzip')]
        while time.monotonic() < stop:
            started = time.perf_counter()
            try:
                with opener.open(base + path, timeout=30) as response:
                    response.read()
                    ok = response.status == 200
            except OSError:
                ok = False
            elapsed = (time.perf_counter() - started) * 1000
            with lock:
                if ok:
                    latencies.append(elapsed)
                else:
                    errors[0] += 1

    with ThreadPoolExecutor(concurrency) as pool:
        for _ in range(concurrency):
            pool.submit(worker)
    latencies.sort()
    pick = lambda q: latencies[min(len(latencies) - 1, int(q * len(latencies)))] if latencies else float('nan')
    return len(latencies) / seconds, statistics.median(latencies) if latencies else float('nan'), pick(0.95), pick(0.99), errors[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--concurrency', type=int, default=20)
    parser.add_argument('--seconds', type=float, default=8)
    args = parser.parse_args()
    print(f'{args.concurrency} concurrent clients, {args.seconds:g} s per endpoint\n')
    print('| Endpoint | Requests/s | p50 ms | p95 ms | p99 ms | Errors |')
    print('|---|---|---|---|---|---|')
    for name, path in ENDPOINTS:
        rate, p50, p95, p99, errors = hammer(args.url.rstrip('/'), path, args.concurrency, args.seconds)
        print(f'| {name} | {rate:.0f} | {p50:.1f} | {p95:.1f} | {p99:.1f} | {errors} |')


if __name__ == '__main__':
    main()
