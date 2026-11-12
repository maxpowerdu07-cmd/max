#!/usr/bin/env python3
"""Faux streamlink pour les tests : --version, --json, ou un faux live MPEG-TS sur la sortie standard.

L'image contient une barre blanche qui traverse le haut de l'ecran en 10 s (pour mesurer le calage
temporel), un bloc "facecam" en bas a gauche, et le son monte tres fort pendant FAKE_BURST secondes.
"""
import json
import os
import shutil
import subprocess
import sys
import time

args = sys.argv[1:]
if "--version" in args:
    print("streamlink 0.0-test")
    sys.exit(0)
name = next((a.split("/")[-1] for a in args if a.startswith("twitch.tv/")), "x")
if "--json" in args:
    if os.environ.get("FAKE_OFFLINE"):
        print(json.dumps({"error": "No playable streams found on this URL"}))
        sys.exit(1)
    print(json.dumps({"plugin": "twitch", "streams": {}, "metadata": {
        "id": "1", "author": name.capitalize(), "title": "Premier live GTA 6",
        "category": os.environ.get("FAKE_CATEGORY", "Grand Theft Auto VI")}}))
    sys.exit(0)

w, h, r = (int(x) for x in os.environ.get("FAKE_RES", "1280x720x30").split("x"))
b0, b1 = os.environ.get("FAKE_BURST", "70:72").split(":")
speed = (w - 24) / 10.0
graph = (
    f"[0:v]drawbox=x=0:y=0:w=iw:h=40:color=black:t=fill[g];"
    f"smptebars=s={w // 4}x{h * 3 // 10}:r={r}[cam];color=c=white:s=24x40:r={r}[bar];"
    f"[g][cam]overlay=0:H-h[g2];[g2][bar]overlay=x='mod(t,10)*{speed}':y=0[v];"
    f"[1:a]volume='if(between(t,{b0},{b1}),1.0,0.02)':eval=frame[a]"
)
cmd = [shutil.which("ffmpeg") or "ffmpeg", "-hide_banner", "-loglevel", "error",
       "-re", "-f", "lavfi", "-i", f"testsrc2=s={w}x{h}:r={r}",
       "-re", "-f", "lavfi", "-i", "sine=f=440:r=48000",
       "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
       "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", str(r * 2),
       "-keyint_min", str(r * 2), "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-b:v", "3M",
       "-c:a", "aac", "-b:a", "128k", "-f", "mpegts", "-"]
start_file = os.environ.get("FAKE_START_FILE")
if start_file:
    with open(start_file, "w") as f:
        f.write(str(time.time()))
sys.exit(subprocess.run(cmd).returncode)
