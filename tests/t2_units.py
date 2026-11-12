"""Tests unitaires : calage, mise en page, IA, Zernio, YouTube, file de publication (serveurs simules)."""
import copy, json, os, shutil, sys, tempfile, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent)); sys.path.insert(0, str(HERE))
import clipper as C
from mocks import MockAPI

tmp = Path(tempfile.mkdtemp(prefix="clipper_t2_")).resolve()
api = MockAPI(18431)

def cfg_for(**over):
    cfg = copy.deepcopy(C.DEFAULTS)
    cfg["_base"] = str(tmp); cfg["channels"] = ["fake"]
    for k in ("output_dir", "buffer_dir", "log_dir"):
        cfg["general"][k] = str(tmp / cfg["general"][k])
    cfg["ai"].update(enabled=True, api_key="sk-test", api_url=api.base + "/v1/messages")
    cfg["zernio"].update(api_key="zk", api_url=api.base + "/api/v1")
    cfg["youtube"].update(client_id="cid", client_secret="sec", token_url=api.base + "/token",
                          upload_url=api.base + "/upload/youtube/v3/videos")
    for k, v in over.items():
        cfg[k].update(v)
    return cfg

# ---- calage sur la parole
W = [(0.0, 0.4, "Bon"), (0.5, 0.9, "allez."), (2.0, 2.3, "Regarde"), (2.35, 2.6, "ça"), (2.65, 3.0, "non"), (3.05, 3.5, "non!"), (5.0, 5.4, "Ok.")]
s = C.snap_start(W, 2.5, 0.0, 4.0); assert abs(s - 1.85) < 0.01, s          # debut de phrase apres un silence
assert abs(C.snap_start(W, 2.45, 2.2, 2.5) - 2.32) < 0.02                     # sinon debut de mot, pas au milieu
e = C.snap_end(W, 3.2, 2.0, 4.5); assert abs(e - 3.8) < 0.01, e              # fin de phrase
assert C.snap_start([], 7.0, 5, 9) == 7.0 and C.snap_end([], 7.0, 5, 9) == 7.0
# ---- creneaux
win = C.parse_windows(["12:00-13:30", "22h30-01h00", "nimporte"])
assert win == [(720, 810), (1350, 60)]
assert C.in_windows(725, win) and not C.in_windows(900, win) and C.in_windows(10, win) and C.in_windows(1400, win) and C.in_windows(5, [])
# ---- mise en page
g = C.geometry("blur", 1920, 1080, 0, None); assert (g.crop_w, g.game_h, g.layout) == (1920, 608, "blur")
g = C.geometry("stack", 1920, 1080, 0, [0.0, 0.7, 0.25, 0.3]); assert g.layout == "stack" and g.game_h == 810 and g.cam == (0, 756, 480, 324), g
g = C.geometry("stack", 1920, 1080, 0.45, [0.8, 0.75, 0.3, 0.4]); cx, cy, cw, ch = g.cam
assert cx + cw <= 1920 and cy + ch <= 1080 and g.game_y + g.game_h <= 1920 - 40 and abs(g.game_h / 1080 - 1080 / g.crop_w) < 0.01  # pas de deformation
g = C.geometry("blur", 1280, 720, 0.6, None); assert g.game_h % 2 == 0 and g.crop_x + g.crop_w <= 1280
assert C.ass_color("#FFE600") == "&H0000E6FF" and C.strip_emoji("IL TOMBE 💀 DU TOIT 😭") == "IL TOMBE DU TOIT"
assert C.wrap_title("UN TITRE VRAIMENT BEAUCOUP TROP LONG POUR TENIR SUR UNE SEULE LIGNE") [0] == "UN TITRE VRAIMENT"
assert C.clean_hashtags(["#gta6", "GTA6", "#Twitch FR", "x", "#clips!"]) == ["#gta6", "#TwitchFR", "#clips"]
n = C.write_ass(tmp / "s.ass", g, [(0.2, 0.5, "Oh"), (0.55, 0.9, "non"), (1.0, 1.6, "anticonstitutionnellement")], "Accroche {test}", "twitch.tv/x", 5.0, C.DEFAULTS["subtitles"])
txt = (tmp / "s.ass").read_text(encoding="utf-8"); assert n == 5 and "\\fscx" in txt and "{test}" not in txt and "&H0000E6FF&" in txt

# ---- IA
ai = C.AIClient(cfg_for())
r = ai.analyse("contexte", [(1.0, b"\xff\xd8" + b"0" * 3000)])
assert r["note"] == 8 and r["accroche"] == "IL TOMBE DU TOIT" and r["hashtags"] == ["#gta6", "#fail", "#twitchfr"] and r["debut"] == 2.0, r
body = api.calls[-1][3]; assert body["model"] == "claude-haiku-5-5" and body["tool_choice"]["name"] == "fiche_clip" and "temperature" not in body
assert body["messages"][0]["content"][1]["type"] == "image" and api.calls[-1][2].get("anthropic-version") == "2023-06-01"
api.ai_mode = "text400"; r = ai.analyse("contexte", []); assert r and r["note"] == 8 and ai.use_tool is False      # repli sur JSON simple
assert "tools" not in api.calls[-1][3] and api.calls[-1][3]["messages"][-1]["role"] == "user"
api.ai_mode = "refusal"; assert ai.analyse("c", []) == {"refus": True}
api.ai_mode = "garbage"; assert ai.analyse("c", []) is None
api.ai_mode = "401"; assert ai.analyse("c", []) is None and ai.enabled is False
api.ai_mode = "tool"
lim = C.AIClient(cfg_for(ai={"max_calls_per_hour": 1})); assert lim.analyse("c", []) and lim.analyse("c", []) is None  # plafond de cout
assert C.AIClient(cfg_for(ai={"api_key": ""})).enabled is False

# ---- fichier video de test
clip = tmp / "clips" / "fake" / "c1.mp4"; clip.parent.mkdir(parents=True)
clip.write_bytes(os.urandom(300_000))
meta = {"caption": "Titre\n\n#gta6", "title": "Titre", "tags": ["gta6"], "cover_ms": 4200, "lang": "fr", "privacy": "", "category": "20", "account": ""}

# ---- Zernio
z = C.ZernioAPI(cfg_for())
res = z.publish("tiktok", str(clip), meta, "key-1")
assert res == {"url": "https://tiktok.example/post1", "pid": "post1"}, res
pb = api.posts["post1"]["body"]; psd = pb["platforms"][0]["platformSpecificData"]
assert pb["publishNow"] is True and pb["mediaItems"] == [{"type": "video", "url": "https://cdn.example/1.mp4"}] and pb["platforms"][0]["accountId"] == "acc_tt"
assert psd["privacyLevel"] == "PUBLIC_TO_EVERYONE" and psd["allowDuet"] and psd["videoCoverTimestampMs"] == 4200
up = [c for c in api.calls if c[0] == "PUT" and c[1] == "/upload/1"][0]; assert up[3] == 300_000 and up[2]["content-type"] == "video/mp4"
assert z.publish("tiktok", str(clip), meta, "key-1")["pid"] == "post1" and len(api.posts) == 1          # meme cle = pas de doublon
assert z.publish("instagram", str(clip), meta, "key-2")["url"].startswith("https://instagram.example/") and api.count("POST", "/api/v1/media/presign") == 1  # fichier envoye une seule fois
assert api.posts["post2"]["body"]["platforms"][0]["platformSpecificData"] == {"shareToFeed": True, "thumbOffset": 4200}
try: z.publish("youtube", str(clip), meta, "k3"); raise SystemExit("devait echouer")
except C.PublishError as e: assert "aucun compte youtube" in str(e) and e.cooldown
api.z_fail = 503
try: z.publish("tiktok", str(clip), meta, "key-9"); raise SystemExit("devait echouer")
except C.PublishError as e: assert e.temporary
try: C.ZernioAPI(cfg_for(zernio={"api_key": ""})).publish("tiktok", str(clip), meta, "k"); raise SystemExit("x")
except C.PublishError as e: assert "cle API" in str(e)

# ---- YouTube (envoi coupe au milieu puis repris, jeton rafraichi)
(tmp / "youtube_token.json").write_text(json.dumps({"refresh_token": "rt-good"}))
y = C.YouTubeAPI(cfg_for()); assert y.configured() and y.authorized()
api.yt_401_once = True
res = y.publish("youtube", str(clip), meta, "k")
assert res == {"url": "https://www.youtube.com/shorts/vid123", "pid": "vid123"}, res
assert api.yt_received == 300_000 and api.count("PUT", "yt-broken") == 1 and api.count("PUT", "yt-status") >= 1 and api.count("PUT", "yt-data") == 1
init = [c for c in api.calls if c[1] == "/upload/youtube/v3/videos"][-1]
assert init[3]["snippet"]["categoryId"] == "20" and init[3]["status"]["privacyStatus"] == "public" and init[3]["snippet"]["defaultLanguage"] == "fr"
assert api.count("POST", "/token") == 2 and json.loads((tmp / "youtube_token.json").read_text())["access_token"]
(tmp / "youtube_token.json").write_text(json.dumps({"refresh_token": "rt-revoked"}))
try: C.YouTubeAPI(cfg_for()).publish("youtube", str(clip), meta, "k"); raise SystemExit("x")
except C.PublishError as e: assert "auth youtube" in str(e) and e.cooldown == 3600

# ---- file de publication (creneaux, ecart, plafond, urgence, simulation, reprise)
class FakeBackend:
    def __init__(self): self.sent, self.fail = [], None
    def publish(self, platform, path, meta, key):
        if self.fail: e, self.fail = self.fail, None; raise e
        self.sent.append((platform, Path(path).name, meta["title"])); return {"url": f"https://x/{len(self.sent)}", "pid": str(len(self.sent))}
    def check(self, pid, platform): return None
def rec(name, score, age_min=30, **kw):
    f = tmp / "clips" / "fake" / name; f.write_bytes(b"x" * 10)
    d = {"id": "fake/" + name, "file": str(f), "channel": "fake", "display": "Fake", "made": time.time() - age_min * 60, "score": score,
         "title": "Titre " + name, "hashtags": ["#gta6"], "credit": "twitch.tv/fake", "cover_ms": 3000, "lang": "fr", "category": "GTA"}
    d.update(kw); return d
def publisher(dry=False, **pub):
    shutil.rmtree(tmp / "clips" / "publications.json", ignore_errors=True)
    for f in ("publications.json", "publications.csv"):
        (tmp / "clips" / f).unlink(missing_ok=True)
    p = {"enabled": True, "dry_run": dry, "timezone": "", "tiktok": dict(C.DEFAULTS["publish"]["tiktok"], enabled=True, windows=[]),
         "youtube": dict(C.DEFAULTS["publish"]["youtube"], enabled=True, windows=["00:00-00:01"])}
    p.update(pub)
    P = C.Publisher(cfg_for(publish=p), C.ClipStore(tmp / "clips")); fb = FakeBackend(); P.backends = {"zernio": fb, "youtube": fb}
    return P, fb
P, fb = publisher()
for r in (rec("a.mp4", 60), rec("b.mp4", 90), rec("c.mp4", 40), rec("d.mp4", 95, age_min=5), rec("e.mp4", 99, sensible=True)):
    P.add_clip(r)
now = time.time(); P.clock.minute_of_day = lambda ts: 600   # 10:00 : hors creneau YouTube
P.step("tiktok", now); P.step("youtube", now)
assert fb.sent == [("tiktok", "b.mp4", "Titre b.mp4")], fb.sent                 # meilleur clip eligible ; d trop recent, e sensible, c sous le seuil
P.step("tiktok", now + 60); assert len(fb.sent) == 1                             # ecart minimal entre deux posts
P.step("tiktok", now + 3700); assert fb.sent[-1][1] == "d.mp4"                   # d est devenu eligible (delai passe) et mieux note que a
P.step("tiktok", now + 7400); assert fb.sent[-1][1] == "a.mp4" and len(fb.sent) == 3
assert P.state["fake/e.mp4"]["tiktok"]["status"] == "ignore" and "c.mp4" not in str(fb.sent)
P.clock.minute_of_day = lambda ts: 0; P.step("youtube", now); assert fb.sent[-1][0] == "youtube"   # dans le creneau
saved = json.loads((tmp / "clips" / "publications.json").read_text()); assert saved["fake/b.mp4"]["tiktok"]["url"] == "https://x/1"
assert "tiktok" in (tmp / "clips" / "publications.csv").read_text(encoding="utf-8-sig")
P2 = C.Publisher(P.cfg, C.ClipStore(tmp / "clips")); assert len(P2.history["tiktok"]) == 3 and P2.state["fake/b.mp4"]["tiktok"]["status"] == "publie"  # reprise apres redemarrage
P, fb = publisher(tiktok=dict(C.DEFAULTS["publish"]["tiktok"], enabled=True, windows=[], max_per_day=1))
P.add_clip(rec("f.mp4", 70)); P.add_clip(rec("g.mp4", 80)); P.step("tiktok", now); P.step("tiktok", now + 9000); assert len(fb.sent) == 1   # plafond par jour
P, fb = publisher(rush_score=85, tiktok=dict(C.DEFAULTS["publish"]["tiktok"], enabled=True, windows=["03:00-03:01"]))
P.clock.minute_of_day = lambda ts: 600; P.add_clip(rec("h.mp4", 70)); P.add_clip(rec("i.mp4", 92)); P.step("tiktok", now)
assert [s[1] for s in fb.sent] == ["i.mp4"]                                      # urgence : publie hors creneau, pas h
P, fb = publisher(); P.add_clip(rec("j.mp4", 70)); fb.fail = C.PublishError("reseau", network=True)
P.step("tiktok", now); st = P.state["fake/j.mp4"]["tiktok"]; assert st["status"] == "attente" and "tries" not in st and P.backoff["tiktok"] > time.time()
P.backoff.clear(); st["next"] = 0; fb.fail = C.PublishError("refus definitif"); P.step("tiktok", now + 1); assert P.state["fake/j.mp4"]["tiktok"]["status"] == "echec"
P, fb = publisher(dry=True); P.add_clip(rec("k.mp4", 70)); P.step("tiktok", now); assert not fb.sent and P.state["fake/k.mp4"]["tiktok"]["status"] == "simule"
m = P.build_meta(P.targets["youtube"], rec("l.mp4", 70, title="Un <titre> " + "x" * 120)); assert len(m["title"]) == 100 and "<" not in m["title"] and "#shorts" in m["caption"] and m["tags"] == ["gta6"]
# ---- galerie
store = C.ClipStore(tmp / "clips"); r = rec("z.mp4", 77); r.update(start=time.time(), duration=30.0, ai_note=8, sensible=False, ratio=3.2, uniq=120, mood="drole", summary="", caption="Titre </script> #gta6")
store.add(r); page = C.build_gallery(tmp / "clips", store.load(), {"fake/z.mp4": {"tiktok": {"status": "publie", "url": "https://x/1"}}}).read_text(encoding="utf-8")
assert "</script> #gta6" not in page and "fake/z.mp4" in page and "https://x/1" in page
js = page.split("<script>")[1].split("</script>")[0]; (tmp / "g.js").write_text("const document={getElementById:()=>({appendChild(){},set onchange(v){},value:''}),createElement:()=>({appendChild(){}}),body:{}};const navigator={};" + js.replace("(function init()", "(function init_skip(){});(function init()").replace("render();\n})();", "})();"), encoding="utf-8")
if shutil.which("node"):
    import subprocess; rc = subprocess.run(["node", "--check", str(tmp / "g.js")], capture_output=True, text=True); assert rc.returncode == 0, rc.stderr
# ---- config : BOM et erreur lisible
(tmp / "c.toml").write_bytes(b"\xef\xbb\xbf" + 'channels = ["Squeezie", "#Gotaga "]\n[streamer.Squeezie]\nlayout = "stack"\n'.encode())
c = C.load_config(str(tmp / "c.toml")); assert c["channels"] == ["squeezie", "gotaga"] and C.make_chan_cfg(c, "squeezie").layout == "stack" and Path(c["general"]["output_dir"]).resolve() == (tmp / "clips").resolve()
shutil.rmtree(tmp, ignore_errors=True)
print("TESTS UNITAIRES OK")
