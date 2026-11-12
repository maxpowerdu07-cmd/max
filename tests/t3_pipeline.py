"""Test de bout en bout : faux live + faux chat + fausse IA + fausses plateformes -> clip publie."""
import json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from mocks import IrcServer, MockAPI

CLIPPER = [sys.executable, str(HERE.parent / "clipper.py")] if not os.environ.get("CLIPPER_EXE") else [os.environ["CLIPPER_EXE"]]
tmp = Path(tempfile.mkdtemp(prefix="clipper_t3_")).resolve()
start_file = tmp / "start.txt"
api = MockAPI(18432)
def t0():
    try: return float(start_file.read_text())
    except (OSError, ValueError): return None
irc = IrcServer(16700, rate=lambda t: 40 if 50 <= t < 60 else 10, hype=lambda t: 0.7 if 50 <= t < 61 else 0.05, t0=t0, drop_after=12)
irc.start()
q = lambda s: json.dumps(str(s))
(tmp / "youtube_token.json").write_text(json.dumps({"refresh_token": "rt-good"}))
(tmp / "config.toml").write_text(f'''
channels = ["fake"]
[general]
render_workers = 1
[twitch]
streamlink_cmd = [{q(sys.executable)}, {q(HERE / "fake_sl.py")}]
irc_host = "127.0.0.1"
irc_port = 16700
irc_tls = false
games = ["grand theft auto vi"]
meta_refresh_seconds = 15
[detect]
window_seconds = 4
baseline_seconds = 32
warmup_seconds = 20
cooldown_seconds = 20
[clip]
pre_seconds = 8
lead_seconds = 6
post_seconds = 5
min_seconds = 8
[subtitles]
font = "DejaVu Sans"
model = "tiny"
[post]
hashtags = ["#gta6", "#twitchfr"]
[ai]
enabled = true
api_key = "sk-test"
api_url = "{api.base}/v1/messages"
[encode]
nvenc = "off"
[publish]
enabled = true
min_score = 0
delay_minutes = 0
timezone = ""
[publish.tiktok]
enabled = true
windows = []
[publish.instagram]
enabled = true
windows = []
[publish.youtube]
enabled = true
windows = []
[zernio]
api_key = "zk"
api_url = "{api.base}/api/v1"
[youtube]
client_id = "cid"
client_secret = "sec"
token_url = "{api.base}/token"
upload_url = "{api.base}/upload/youtube/v3/videos"
''', encoding="utf-8")
env = dict(os.environ, FAKE_START_FILE=str(start_file), FAKE_BURST="46:48", CLIPPER_RUN_SECONDS=os.environ.get("T3_SECONDS", "190"))
t_begin = time.time()
p = subprocess.run(CLIPPER + ["run", "--config", str(tmp / "config.toml")], cwd=tmp, env=env, capture_output=True, text=True, errors="replace", timeout=400)
log = p.stdout + p.stderr
keep = [l for l in log.splitlines() if any(k in l for k in ("PIC", "CLIP", "PUBLIE", "ERROR", "WARNING", "Traceback", "jeu en cours", "chat :", "live detecte", "abandonne", "Error"))]
print("\n".join(keep[-30:]))
T = t0(); assert T, "le faux live n'a pas demarre"
recs = [json.loads(l) for l in (tmp / "clips" / "clips.jsonl").read_text(encoding="utf-8").splitlines()]
assert len(recs) == 1, f"{len(recs)} clip(s)"
r = recs[0]; clip = Path(r["file"]); assert clip.exists() and clip.stat().st_size > 200_000
print(f"clip : debut +{r['start']-T:.1f}s  duree {r['duration']}s  note {r['score']} (base {r['base_score']}, IA {r['ai_note']})  chat x{r['ratio']}  {r['uniq']} pers.  son z={r['audio_z']}  {r['mood']}  {r['layout']} {r['fps']}fps  jeu={r['category']}")
assert r["ai_note"] == 8 and r["hook"] == "IL TOMBE DU TOIT" and r["title"].startswith("Il pensait") and r["hashtags"][:3] == ["#gta6", "#twitchfr", "#fail"], r
assert r["mood"] == "drole" and r["audio_z"] >= 2 and r["category"] == "Grand Theft Auto VI" and r["display"] == "Fake"
# le pic sonore est a +46..48 s : le clip doit commencer ~6 s avant (lead) + 2 s coupees par l'IA, et contenir la reaction du chat (+50..60 s)
assert 40.0 <= r["start"] - T <= 45.5 and r["start"] - T + r["duration"] >= 58, (r["start"] - T, r["duration"])
ff = shutil.which("ffmpeg")
pr = subprocess.run([ff, "-hide_banner", "-i", str(clip)], capture_output=True, text=True).stderr
assert "1080x1920" in pr and "Audio: aac" in pr, pr[-400:]
# calage temporel : la barre blanche du faux live donne l'heure exacte de la premiere image
row = subprocess.run([ff, "-v", "error", "-i", str(clip), "-frames:v", "1", "-vf", "crop=1080:2:0:583,format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout[:1080]
xs = [i for i, v in enumerate(row) if v > 180]; assert xs, "barre introuvable"
t_mod = ((sum(xs) / len(xs)) * 1280 / 1080 - 12) / 125.6
exp = (r["start"] - T) % 10
err = (t_mod - exp + 5) % 10 - 5
print(f"calage : premiere image a t%10 = {t_mod:.2f}s, attendu {exp:.2f}s -> ecart {err:+.2f}s")
assert abs(err) < 1.2, err
pubs = json.loads((tmp / "clips" / "publications.json").read_text(encoding="utf-8"))[r["id"]]
print("publications :", {k: (v["status"], v.get("url")) for k, v in pubs.items()})
assert all(pubs[k]["status"] == "publie" and pubs[k]["url"] for k in ("tiktok", "instagram", "youtube")), pubs
assert len(api.posts) == 2 and api.count("POST", "/api/v1/media/presign") == 1 and api.yt_received == clip.stat().st_size
tt = [x["body"] for x in api.posts.values() if x["platform"] == "tiktok"][0]
assert tt["content"].startswith("Il pensait") and "#gta6" in tt["content"] and 0 < tt["platforms"][0]["platformSpecificData"]["videoCoverTimestampMs"] < r["duration"] * 1000
assert irc.stats["conns"] >= 2 and irc.stats["caps"] >= 2 and irc.stats["pong"], irc.stats
assert (tmp / "clips" / "index.html").exists() and clip.with_suffix(".txt").exists() and "PUBLIE" in log and "Traceback" not in log
left = [x for x in (tmp / "buffer" / "_work").iterdir()] if (tmp / "buffer" / "_work").exists() else []
assert not left, left
d = subprocess.run(CLIPPER + ["doctor", "--config", str(tmp / "config.toml")], cwd=tmp, env=env, capture_output=True, text=True, errors="replace", timeout=120).stdout
print("\n".join(l for l in d.splitlines() if "Zernio" in l or "YouTube" in l or "IA" in l or "streamlink ->" in l))
assert "[OK]  IA" in d and "[OK]  Zernio : compte tiktok" in d and "[OK]  YouTube : autorisation" in d
shutil.copy(clip, HERE / "last_clip.mp4")
print(f"TEST DE BOUT EN BOUT OK ({time.time()-t_begin:.0f} s)")
