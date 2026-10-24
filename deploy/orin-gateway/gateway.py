#!/usr/bin/env python3
"""Key-protected gateway in front of a local llama.cpp server, meant to sit behind a public tunnel.

Only the endpoints Prerak needs are forwarded. Every request needs `Authorization: Bearer <key>`, generation
length is capped, each client IP is rate limited, repeated wrong keys get the IP blocked for a while, and only
one generation runs at a time (with a short queue). Standard library only, so it runs on a bare Jetson.
"""

import argparse
import hmac
import http.client
import json
import queue
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROUTES = {
    ("GET", "/health"): "open",
    ("GET", "/v1/models"): "light",
    ("POST", "/apply-template"): "light",
    ("POST", "/completion"): "generate",
    ("POST", "/v1/chat/completions"): "generate",
}
LIMITS = {"light": (180, 600), "generate": (40, 600)}  # (requests, per seconds) per client IP
AUTH_FAILS = (10, 600)  # this many wrong keys within the window...
BLOCK_SECONDS = 900  # ...blocks the IP for this long
MAX_BODY = 512 * 1024
MAX_TOKENS = 3000
QUEUE_SIZE = 3
KEEPALIVE_SECONDS = 15


class State:
    def __init__(self, key: str, upstream: str):
        self.key = key.encode()
        u = urlsplit(upstream)
        self.up_host, self.up_port = u.hostname or "127.0.0.1", u.port or 80
        self.lock = threading.Lock()
        self.hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self.fails: dict[str, deque] = defaultdict(deque)
        self.blocked: dict[str, float] = {}
        self.gen_slot = threading.Semaphore(1)
        self.waiting = 0

    def _within(self, dq: deque, limit: int, window: int, now: float) -> bool:
        while dq and dq[0] <= now - window:
            dq.popleft()
        if len(dq) >= limit:
            return False
        dq.append(now)
        return True

    def allow(self, ip: str, kind: str) -> bool:
        limit, window = LIMITS[kind]
        with self.lock:
            return self._within(self.hits[(ip, kind)], limit, window, time.time())

    def is_blocked(self, ip: str) -> bool:
        with self.lock:
            until = self.blocked.get(ip, 0)
            if until and until < time.time():
                del self.blocked[ip]
                return False
            return until > 0

    def record_fail(self, ip: str) -> None:
        limit, window = AUTH_FAILS
        with self.lock:
            if not self._within(self.fails[ip], limit, window, time.time()):
                self.blocked[ip] = time.time() + BLOCK_SECONDS

    def check_key(self, header: str | None) -> bool:
        if not header or not header.startswith("Bearer "):
            return False
        return hmac.compare_digest(header[7:].strip().encode(), self.key)


def clamp_body(path: str, body: dict) -> dict:
    if path == "/completion":
        n = body.get("n_predict")
        body["n_predict"] = MAX_TOKENS if not isinstance(n, int) or n < 0 or n > MAX_TOKENS else n
    elif path == "/v1/chat/completions":
        for field in ("max_tokens", "max_completion_tokens"):
            n = body.get(field)
            if n is not None and (not isinstance(n, int) or n < 0 or n > MAX_TOKENS):
                body[field] = MAX_TOKENS
        body.setdefault("max_tokens", MAX_TOKENS)
        body["n"] = 1
    return body


def make_handler(state: State):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"  # body ends when the connection closes, so streams pass through untouched
        server_version = "gateway"
        sys_version = ""

        def log_message(self, fmt, *args):  # request bodies are never logged
            pass

        def _ip(self) -> str:
            # cloudflared connects from loopback and puts the real client address in this header.
            if self.client_address[0] in ("127.0.0.1", "::1"):
                return self.headers.get("CF-Connecting-IP") or self.client_address[0]
            return self.client_address[0]

        def _log(self, status: int, started: float, note: str = "") -> None:
            print(f"{time.strftime('%H:%M:%S')} {self._ip():<16} {self.command:<4} {self.path:<22} {status} "
                  f"{time.time() - started:6.1f}s {note}", flush=True)

        def _json(self, status: int, message: str, started: float) -> None:
            payload = json.dumps({"error": {"message": message, "code": status}}).encode()
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                if status == 429:
                    self.send_header("Retry-After", "60")
                self.end_headers()
                self.wfile.write(payload)
            except OSError:
                pass
            self._log(status, started, message)

        def do_GET(self):
            self._handle()

        def do_POST(self):
            self._handle()

        def _handle(self):
            started = time.time()
            path = urlsplit(self.path).path.rstrip("/") or "/"
            kind = ROUTES.get((self.command, path))
            ip = self._ip()
            if kind is None:
                return self._json(404, "Not found", started)
            if kind == "open":
                return self._ok(started)
            if state.is_blocked(ip):
                return self._json(429, "Too many wrong keys. Try again later.", started)
            if not state.check_key(self.headers.get("Authorization")):
                state.record_fail(ip)
                return self._json(401, "Missing or wrong API key", started)
            if not state.allow(ip, kind):
                return self._json(429, "Rate limit reached. Please wait a few minutes.", started)

            body = b""
            if self.command == "POST":
                try:
                    length = int(self.headers.get("Content-Length") or 0)
                except ValueError:
                    return self._json(400, "Bad Content-Length", started)
                if length <= 0 or length > MAX_BODY:
                    return self._json(413, "Request body too large or empty", started)
                try:
                    parsed = json.loads(self.rfile.read(length))
                    if not isinstance(parsed, dict):
                        raise ValueError
                except ValueError:
                    return self._json(400, "Body must be a JSON object", started)
                body = json.dumps(clamp_body(path, parsed)).encode()
                streaming = bool(parsed.get("stream"))
            else:
                streaming = False

            if kind != "generate":
                return self._forward_simple(path, body, started)

            with state.lock:
                if state.waiting >= QUEUE_SIZE:
                    full = True
                else:
                    full = False
                    state.waiting += 1
            if full:
                return self._json(429, "The model is busy with other people. Try again in a minute.", started)
            try:
                if streaming:
                    self._forward_stream(path, body, started)
                else:
                    with state.gen_slot:
                        self._forward_simple(path, body, started)
            finally:
                with state.lock:
                    state.waiting -= 1

        def _ok(self, started):
            payload = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            self._log(200, started)

        def _upstream(self, path: str, body: bytes, timeout: float) -> tuple[http.client.HTTPConnection, http.client.HTTPResponse]:
            conn = http.client.HTTPConnection(state.up_host, state.up_port, timeout=timeout)
            headers = {"Content-Type": "application/json"} if body else {}
            conn.request(self.command, path, body=body or None, headers=headers)
            return conn, conn.getresponse()

        def _forward_simple(self, path: str, body: bytes, started: float) -> None:
            try:
                conn, resp = self._upstream(path, body, timeout=600)
                data = resp.read()
                conn.close()
            except OSError as e:
                return self._json(502, f"Model server unreachable ({e.__class__.__name__})", started)
            try:
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.getheader("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except OSError:
                pass
            self._log(resp.status, started)

        def _forward_stream(self, path: str, body: bytes, started: float) -> None:
            # Headers go out at once and a comment line every few seconds keeps the tunnel from timing out while
            # the request waits for the model or the prompt is processed. SSE readers ignore ":" lines.
            chunks: queue.Queue = queue.Queue()
            cancel = threading.Event()
            holder: dict = {}

            def worker():
                with state.gen_slot:
                    if cancel.is_set():
                        return chunks.put(None)
                    try:
                        conn, resp = self._upstream(path, body, timeout=600)
                        holder["conn"] = conn
                        if resp.status != 200:
                            detail = resp.read().decode("utf-8", "replace")[:500]
                            chunks.put(f"data: {json.dumps({'error': {'message': f'Model server answered {resp.status}: {detail}'}})}\n\n".encode())
                        else:
                            while not cancel.is_set():
                                piece = resp.read1(8192)
                                if not piece:
                                    break
                                chunks.put(piece)
                        conn.close()
                    except OSError as e:
                        if not cancel.is_set():
                            chunks.put(f"data: {json.dumps({'error': {'message': f'Model server unreachable ({e.__class__.__name__})'}})}\n\n".encode())
                    finally:
                        chunks.put(None)

            try:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("X-Accel-Buffering", "no")
                self.end_headers()
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()
            except OSError:
                return self._log(499, started, "client left")

            threading.Thread(target=worker, daemon=True).start()
            note = ""
            try:
                while True:
                    try:
                        piece = chunks.get(timeout=KEEPALIVE_SECONDS)
                    except queue.Empty:
                        piece = b": waiting\n\n"
                    if piece is None:
                        break
                    self.wfile.write(piece)
                    self.wfile.flush()
            except OSError:
                note = "client left, generation stopped"
                cancel.set()
                conn = holder.get("conn")
                if conn and conn.sock:
                    try:
                        conn.sock.shutdown(2)
                    except OSError:
                        pass
            self._log(200, started, note)

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--upstream", default="http://127.0.0.1:8000")
    ap.add_argument("--key-file", required=True)
    args = ap.parse_args()
    with open(args.key_file) as f:
        key = f.read().strip()
    if len(key) < 24:
        raise SystemExit("API key is too short")
    state = State(key, args.upstream)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(state))
    server.daemon_threads = True
    print(f"gateway listening on 127.0.0.1:{args.port} -> {args.upstream}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
