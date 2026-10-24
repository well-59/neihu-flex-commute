"""Vercel function for GET /api/monitoring; same parsing as the local preview server."""
from http.server import BaseHTTPRequestHandler
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('monitor', Path(__file__).resolve().parents[1] / 'scripts/monitoring-snapshot.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        status, cached = 200, True
        try:
            # Only /tmp is writable on Vercel; the latest batch is kept there like data/monitoring/.
            data = monitor.collect(cache=Path('/tmp/neihu-monitoring'))
            if data.get('schemaVersion') != 1 or not isinstance(data.get('rows'), list):
                status, cached, data = 503, False, {'error': '監控資料格式無效。'}
        except Exception:
            status, cached, data = 503, False, {'error': '官方來源暫時無法取得，既有觀測仍按原始時間判斷過期。'}
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        # Shared 60-second CDN cache, matching the local server's per-minute fetch.
        if cached:
            self.send_header('Vercel-CDN-Cache-Control', 'max-age=60')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
