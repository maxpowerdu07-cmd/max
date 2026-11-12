"""Essai reel : un vrai live Twitch, le vrai streamlink, la vraie transcription.
A lancer sur une machine qui peut joindre Twitch (pas de faux serveurs ici)."""
import json, os, shutil, statistics, subprocess, sys, tempfile, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
EXE = os.environ.get("CLIPPER_EXE")
CLIPPER = [EXE] if EXE else [sys.executable, str(HERE.parent / "clipper.py")]
SL = [EXE, "_streamlink"] if EXE else [sys.executable, "-m", "streamlink"]
CANDS = ["xqc", "summit1g", "lirik", "sodapoppin", "kaicenat", "jynxzi", "caseoh_", "hasanabi", "tarik", "shroud", "nmplol",
         "eslcs", "riotgames", "gotaga", "kamet0", "zerator", "squeezie", "otplol_", "ibai", "auronplay", "rubius", "thegrefg",
         "illojuan", "loltyler1", "tfue", "rocketleague", "chess", "monstercat"]
ff = shutil.which("ffmpeg") or (str(Path(EXE).parent / "ffmpeg.exe") if EXE else "ffmpeg")

def live_channels(limit=3):
    out = []
    for ch in CANDS:
        try:
            r = subprocess.run(SL + ["--json", "twitch.tv/" + ch], capture_output=True, text=True, errors="replace", timeout=60)
            d = json.loads(r.stdout or "{}")
        except Exception as e:
            print(f"  {ch}: erreur {e}"); continue
        if d.get("streams") and not d.get("error"):
            print(f"  {ch}: EN LIVE ({(d.get('metadata') or {}).get('category')}) qualites: {', '.join(list(d['streams'])[:8])}")
            out.append(ch)
            if len(out) >= limit: break
        else:
            print(f"  {ch}: hors ligne")
    return out

def attempt(ch, seconds):
    tmp = Path(tempfile.mkdtemp(prefix="clipper_t5_")).resolve()
    (tmp / "config.toml").write_text(f'''
channels = ["{ch}"]
[general]
render_workers = 1
[twitch]
quality = "720p60,720p,best"
[detect]
window_seconds = 4
baseline_seconds = 32
warmup_seconds = 25
ratio = 1.02
sigma = 0.0
min_rate = 0.3
min_unique = 2
cooldown_seconds = 30
settle_seconds = 2
[clip]
pre_seconds = 8
post_seconds = 4
min_seconds = 8
[subtitles]
model = "tiny"
language = ""
''', encoding="utf-8")
    env = dict(os.environ, CLIPPER_RUN_SECONDS=str(seconds))
    t = time.time()
    p = subprocess.run(CLIPPER + ["run", "--config", str(tmp / "config.toml")], cwd=tmp, env=env, capture_output=True, text=True, errors="replace", timeout=seconds + 300)
    log = p.stdout + p.stderr
    lines = [l.split(" : « ")[0] for l in log.splitlines()]       # ne pas recopier les paroles du streamer
    keep = [l for l in lines if any(k in l for k in ("PIC", "CLIP", "ERROR", "WARNING", "Traceback", "jeu en cours", "chat :", "live detecte", "abandonne", "etat :", "encodage", "sous-titres", "ignore"))]
    print("\n".join(keep[-28:]))
    print(f"  (code de sortie {p.returncode}, {time.time()-t:.0f} s)")
    jl = tmp / "clips" / "clips.jsonl"
    recs = [json.loads(l) for l in jl.read_text(encoding="utf-8").splitlines()] if jl.exists() else []
    segs = list((tmp / "buffer" / ch).glob("seg_*.ts")) if (tmp / "buffer" / ch).exists() else []
    print(f"  segments restants dans le tampon : {len(segs)} ; clips : {len(recs)}")
    if "Traceback" in log:
        print(log[-3000:]); return False
    if "transcription impossible" in log or "sous-titres desactives" in log:
        print("  SOUS-TITRES EN PANNE"); return False
    if not recs:
        return False
    ok = True
    for r in recs[:3]:
        f = Path(r["file"])
        info = subprocess.run([ff, "-hide_banner", "-i", str(f)], capture_output=True, text=True, errors="replace").stderr
        dims = "1080x1920" in info and "Audio: aac" in info
        stds = []
        for ts in (0.5, r["duration"] / 2, max(0.6, r["duration"] - 1.0)):
            raw = subprocess.run([ff, "-v", "error", "-ss", f"{ts:.2f}", "-i", str(f), "-frames:v", "1", "-vf", "crop=1080:608:0:566,scale=64:36,format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
            stds.append(round(statistics.pstdev(raw), 1) if len(raw) > 100 else 0.0)
        words = len(r.get("transcript", "").split())
        print(f"  clip {f.name}: {f.stat().st_size // 1024} Ko, {r['duration']} s, {r['fps']} fps, {r['layout']}, note {r['score']}, chat x{r['ratio']}, {r['uniq']} pers., son z={r['audio_z']}, "
              f"{words} mots transcrits, jeu connu: {bool(r['category'])}, 1080x1920+aac: {dims}, contraste images: {stds}")
        ok = ok and dims and f.stat().st_size > 300_000 and r["duration"] >= 8 and max(stds) > 4
    total = sum(len(r.get("transcript", "").split()) for r in recs)
    print(f"  mots transcrits sur l'ensemble des clips : {total}")
    return ok

print("Recherche d'un live :")
chans = live_channels()
if not chans:
    print("AUCUN LIVE TROUVE parmi les candidats : essai reel impossible"); sys.exit(2)
for ch in chans[:2]:
    print(f"\n=== Essai reel sur twitch.tv/{ch} ===")
    if attempt(ch, int(os.environ.get("T5_SECONDS", "270"))):
        print("ESSAI REEL OK"); sys.exit(0)
print("ESSAI REEL EN ECHEC"); sys.exit(1)
