# Development server: like `python3 -m http.server 8000`, but tells the browser not to cache,
# so edited ES modules are always re-fetched. Players can use the plain command.
import http.server, sys, os, re, base64

SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'screenshots')

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    # Debug builds can save a screenshot of the canvas: POST /__shot?name=foo.jpg with a data URL body.
    # Only plain .jpg / .png names, only into docs/screenshots.
    def do_POST(self):
        m = re.match(r'^/__shot\?name=([A-Za-z0-9_.-]+\.(jpg|png))$', self.path)
        if not m or '..' in m.group(1):
            self.send_error(404); return
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n).decode('ascii', 'ignore')
        data = base64.b64decode(body.split(',', 1)[-1])
        os.makedirs(SHOTS, exist_ok=True)
        with open(os.path.join(SHOTS, m.group(1)), 'wb') as f: f.write(data)
        self.send_response(204); self.end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
