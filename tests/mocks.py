"""Faux serveurs pour les tests : chat Twitch (IRC), API Anthropic, Zernio et YouTube."""
import http.server
import json
import math
import random
import socket
import threading
import time
import urllib.parse


def poisson(lam: float) -> int:
    if lam <= 0:
        return 0
    limit, k, p = math.exp(-lam), 0, 1.0
    while p > limit:
        k += 1
        p *= random.random()
    return k - 1


class IrcServer(threading.Thread):
    """rate(t) et hype(t) sont des fonctions du temps ecoule depuis t0() (None tant que le live n'a pas demarre)."""

    def __init__(self, port, rate, hype, t0, raid_at=None, drop_after=None):
        super().__init__(daemon=True)
        self.port, self.rate, self.hype, self.t0 = port, rate, hype, t0
        self.raid_at, self.drop_after = raid_at, drop_after
        self.stats = {"conns": 0, "caps": 0, "joins": 0, "pong": False}
        self.srv = socket.socket()
        self.srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.srv.bind(("127.0.0.1", port))
        self.srv.listen(5)

    def run(self):
        while True:
            try:
                c, _ = self.srv.accept()
            except OSError:
                return
            threading.Thread(target=self.handle, args=(c,), daemon=True).start()

    def handle(self, conn):
        self.stats["conns"] += 1
        n = self.stats["conns"]
        conn.settimeout(0.05)
        born, buf, tags, pinged, raided, chan = time.time(), b"", False, False, False, "fake"
        try:
            while True:
                try:
                    d = conn.recv(4096)
                    if not d:
                        return
                    buf += d
                    while b"\r\n" in buf:
                        line, buf = buf.split(b"\r\n", 1)
                        s = line.decode()
                        if s.startswith("CAP REQ"):
                            tags = True
                            self.stats["caps"] += 1
                            conn.sendall(b":tmi.twitch.tv CAP * ACK :twitch.tv/tags twitch.tv/commands\r\n")
                        elif s.startswith("JOIN"):
                            self.stats["joins"] += 1
                            chan = s.split("#", 1)[1]
                        elif s.startswith("PONG"):
                            self.stats["pong"] = True
                except socket.timeout:
                    pass
                now = time.time()
                if self.drop_after and n == 1 and now - born > self.drop_after:
                    conn.close()   # coupure volontaire : teste la reconnexion
                    return
                if not pinged and now - born > 6:
                    conn.sendall(b"PING :tmi.twitch.tv\r\n")
                    pinged = True
                t0 = self.t0()
                t = (now - t0) if t0 else -1.0
                if self.raid_at is not None and not raided and t >= self.raid_at:
                    raided = True
                    conn.sendall(f"@msg-id=raid;msg-param-viewerCount=900 :tmi.twitch.tv USERNOTICE #{chan}\r\n".encode())
                out = []
                for _ in range(poisson(self.rate(t) * 0.1)):
                    u = "user%d" % random.randint(1, 4000)
                    msg = random.choice(["KEKW", "LUL", "mdrrrr", "PTDR il est tombe", "CLIP", "😂😂"]) \
                        if random.random() < self.hype(t) else random.choice(["salut", "ok", "il fait quoi", "ah ouais"])
                    pre = f"@badges=;color=#1E90FF;display-name={u};emotes=;user-type= " if tags else ""
                    out.append(f"{pre}:{u}!{u}@{u}.tmi.twitch.tv PRIVMSG #{chan} :{msg}\r\n")
                if out:
                    conn.sendall("".join(out).encode("utf-8"))
                time.sleep(0.1)
        except OSError:
            return


class MockAPI:
    """Un seul serveur HTTP local qui imite Anthropic (/v1/messages), Zernio (/api/v1/...) et YouTube."""

    def __init__(self, port):
        self.port = port
        self.base = f"http://127.0.0.1:{port}"
        self.ai_mode = "tool"          # tool | text400 | refusal | garbage | 401
        self.ai_reply = {"note": 8, "resume": "Le streamer tombe du toit et le chat explose.",
                         "accroche": "IL TOMBE DU TOIT 💀", "titre": "Il pensait vraiment y arriver 😭",
                         "hashtags": ["#gta6", "fail", "#Twitch FR"], "debut": 2.0, "fin": 0, "sensible": False}
        self.calls = []                # (methode, chemin, en-tetes, corps JSON ou taille)
        self.posts = {}                # Zernio : id -> {platform, polls, key}
        self.keys = {}                 # Idempotency-Key -> id
        self.z_fail = None             # code d'erreur a renvoyer une fois sur POST /posts
        self.yt_received = 0
        self.yt_break_once = True      # coupe le premier envoi YouTube au milieu
        self.yt_401_once = False
        self.lock = threading.Lock()
        api = self

        class H(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *a):
                pass

            def reply(self, code, obj=None, headers=None):
                data = b"" if obj is None else json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(data)

            def body(self, limit=None):
                n = int(self.headers.get("Content-Length") or 0)
                return self.rfile.read(n if limit is None else min(n, limit))

            def do_GET(self):
                p = urllib.parse.urlparse(self.path).path
                api.calls.append(("GET", p, {k.lower(): v for k, v in self.headers.items()}, None))
                if p == "/api/v1/accounts":
                    return self.reply(200, {"accounts": [
                        {"_id": "acc_tt", "platform": "tiktok", "username": "maxclips", "isActive": True},
                        {"_id": "acc_ig", "platform": "instagram", "username": "maxclips", "isActive": True}]})
                if p.startswith("/api/v1/posts/"):
                    post = api.posts.get(p.rsplit("/", 1)[1])
                    if not post:
                        return self.reply(404, {"error": "not found"})
                    post["polls"] += 1
                    done = post["polls"] >= 2
                    return self.reply(200, {"post": {"_id": post["id"], "status": "published" if done else "publishing",
                                                     "platforms": [{"platform": post["platform"],
                                                                    "status": "published" if done else "processing",
                                                                    "platformPostUrl": f"https://{post['platform']}.example/{post['id']}" if done else None}]}})
                self.reply(404, {"error": "?"})

            def do_POST(self):
                u = urllib.parse.urlparse(self.path)
                raw = self.body()
                try:
                    data = json.loads(raw.decode("utf-8")) if raw[:1] in (b"{", b"[") else raw.decode("utf-8", "replace")
                except ValueError:
                    data = None
                api.calls.append(("POST", u.path, {k.lower(): v for k, v in self.headers.items()}, data))
                if u.path == "/v1/messages":
                    if api.ai_mode == "401" or self.headers.get("x-api-key") != "sk-test":
                        return self.reply(401, {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}})
                    usage = {"input_tokens": 4200, "output_tokens": 180}
                    if api.ai_mode == "refusal":
                        return self.reply(200, {"content": [], "stop_reason": "refusal", "usage": usage})
                    if api.ai_mode == "garbage":
                        return self.reply(200, {"content": [{"type": "text", "text": "Voici mon avis : super clip !"}], "stop_reason": "end_turn", "usage": usage})
                    if api.ai_mode == "text400":
                        if "tools" in data:
                            return self.reply(400, {"type": "error", "error": {"type": "invalid_request_error", "message": "tool_choice not supported"}})
                        return self.reply(200, {"content": [{"type": "thinking", "thinking": "", "signature": "x"},
                                                            {"type": "text", "text": "```json\n" + json.dumps(api.ai_reply) + "\n```"}],
                                                "stop_reason": "end_turn", "usage": usage})
                    return self.reply(200, {"content": [{"type": "tool_use", "id": "t1", "name": "fiche_clip", "input": api.ai_reply}],
                                            "stop_reason": "tool_use", "usage": usage})
                if u.path == "/api/v1/media/presign":
                    n = len([c for c in api.calls if c[1] == "/api/v1/media/presign"])
                    return self.reply(200, {"uploadUrl": f"{api.base}/upload/{n}", "publicUrl": f"https://cdn.example/{n}.mp4"})
                if u.path == "/api/v1/posts":
                    if api.z_fail:
                        code, api.z_fail = api.z_fail, None
                        return self.reply(code, {"error": "boom"})
                    key = self.headers.get("Idempotency-Key")
                    if key in api.keys:
                        pid = api.keys[key]
                        return self.reply(200, {"message": "Post already exists (idempotent retry)", "post": {"_id": pid, "status": "publishing"}})
                    pid = "post%d" % (len(api.posts) + 1)
                    api.keys[key] = pid
                    api.posts[pid] = {"id": pid, "platform": data["platforms"][0]["platform"], "polls": 0, "body": data}
                    return self.reply(201, {"message": "ok", "post": {"_id": pid, "status": "publishing",
                                                                      "platforms": [{"platform": data["platforms"][0]["platform"], "status": "pending"}]}})
                if u.path == "/token":
                    form = urllib.parse.parse_qs(data if isinstance(data, str) else "")
                    if form.get("grant_type") == ["refresh_token"] and form.get("refresh_token") == ["rt-good"]:
                        n = len([c for c in api.calls if c[1] == "/token"])
                        return self.reply(200, {"access_token": f"at{n}", "expires_in": 3600})
                    return self.reply(400, {"error": "invalid_grant"})
                if u.path == "/upload/youtube/v3/videos":
                    if api.yt_401_once:
                        api.yt_401_once = False
                        return self.reply(401, {"error": {"code": 401, "message": "Invalid Credentials", "errors": [{"reason": "authError"}]}})
                    api.yt_total = int(self.headers.get("X-Upload-Content-Length") or 0)
                    return self.reply(200, None, {"Location": f"{api.base}/yt-session/1"})
                self.reply(404, {"error": "?"})

            def do_PUT(self):
                u = urllib.parse.urlparse(self.path)
                rng = self.headers.get("Content-Range") or ""
                if u.path.startswith("/upload/"):
                    n = len(self.body())
                    api.calls.append(("PUT", u.path, {k.lower(): v for k, v in self.headers.items()}, n))
                    return self.reply(200)
                if u.path.startswith("/yt-session/"):
                    if rng.startswith("bytes */"):   # "ou en est l'envoi ?"
                        self.body()
                        api.calls.append(("PUT", "yt-status", {k.lower(): v for k, v in self.headers.items()}, api.yt_received))
                        if api.yt_received >= api.yt_total:
                            return self.reply(200, {"id": "vid123", "status": {"privacyStatus": "public"}})
                        return self.reply(308, None, {"Range": f"bytes=0-{api.yt_received - 1}"} if api.yt_received else {})
                    if api.yt_break_once:
                        api.yt_break_once = False
                        got = self.body(limit=int(self.headers.get("Content-Length") or 0) // 3)
                        api.yt_received = len(got)
                        api.calls.append(("PUT", "yt-broken", {k.lower(): v for k, v in self.headers.items()}, len(got)))
                        self.close_connection = True
                        return self.reply(503, {"error": {"code": 503, "message": "backend error"}}, {"Connection": "close"})
                    got = self.body()
                    start = int(rng.split(" ")[1].split("-")[0]) if rng else 0
                    assert start == api.yt_received, (start, api.yt_received)
                    api.yt_received += len(got)
                    api.calls.append(("PUT", "yt-data", {k.lower(): v for k, v in self.headers.items()}, len(got)))
                    return self.reply(200, {"id": "vid123", "status": {"privacyStatus": "public"}})
                self.reply(404, {"error": "?"})

        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def count(self, method, path):
        return len([c for c in self.calls if c[0] == method and c[1] == path])
