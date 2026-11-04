"""RankFeed-Server: liefert Tierlist und RankFeed aus und sammelt die Artikel.

Start im Ordner code:   python3 server.py
Danach auf dem Ausstellungsrechner die Tierlist öffnen, die Handys öffnen RankFeed
über die Netzwerkadresse, die beim Start angezeigt wird.

Alles Gespeicherte liegt in rankfeed/data. Ordner löschen = RankFeed beginnt von vorn.

Auf einem Server im Internet: PORT=8765 python3 server.py (siehe SERVER.md)
"""
import json
import os
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "rankfeed", "data")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8765))
MAX_ARTICLES = 400

lock = threading.Lock()


def load(name, default):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(name, value):
    os.makedirs(DATA, exist_ok=True)
    tmp = os.path.join(DATA, name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(DATA, name))


articles = load("articles.json", [])
memory = load("memory.json", {})


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Neue Versionen der Seiten sollen sofort ankommen
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/articles":
            try:
                since = int(parse_qs(url.query).get("since", ["0"])[0])
            except ValueError:
                since = 0
            with lock:
                new = [a for a in articles if a["seq"] > since]
                latest = articles[-1]["seq"] if articles else 0
            return self.send_json({"articles": new, "latest": latest})
        if url.path == "/api/memory":
            with lock:
                return self.send_json(memory)
        super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"null")
        except ValueError:
            return self.send_json({"error": "kein gültiges JSON"}, 400)
        if not isinstance(data, dict):
            return self.send_json({"error": "erwartet ein Objekt"}, 400)

        if url.path == "/api/articles":
            with lock:
                data["seq"] = (articles[-1]["seq"] if articles else 0) + 1
                articles.append(data)
                del articles[:-MAX_ARTICLES]
                save("articles.json", articles)
            return self.send_json({"seq": data["seq"]})
        if url.path == "/api/memory":
            with lock:
                memory.clear()
                memory.update(data)
                save("memory.json", memory)
            return self.send_json({"ok": True})
        self.send_json({"error": "unbekannte Adresse"}, 404)

    def log_message(self, fmt, *args):
        # Das Abfragen der Handys alle paar Sekunden würde das Terminal fluten
        if "/api/articles?since=" not in (args[0] if args else ""):
            super().log_message(fmt, *args)


def lan_address():
    # Verbindet nichts, fragt nur das System, über welche Adresse es ins Netz ginge
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    ip = lan_address()
    print("RankFeed-Server läuft")
    print(f"  Tierlist (dieser Rechner):  http://localhost:{PORT}/Emoji%20Tierlist.html")
    print(f"  RankFeed (dieser Rechner):  http://localhost:{PORT}/RankFeed.html")
    if ip:
        print(f"  RankFeed für Handys:        http://{ip}:{PORT}/RankFeed.html")
    print("Beenden mit Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
