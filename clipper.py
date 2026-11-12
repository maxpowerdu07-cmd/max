#!/usr/bin/env python3
"""
clipper.py v2 - surveille des streams Twitch, fabrique des clips verticaux 9:16
et peut les publier tout seul sur TikTok / Instagram / YouTube Shorts.

Commandes :
  python clipper.py doctor            verifie l'installation et les comptes
  python clipper.py run               enregistre + detecte + fabrique (+ publie si active)
  python clipper.py watch             detection seule, sans video (pour regler les seuils)
  python clipper.py snapshot NOM      image du live avec une grille (pour placer la facecam)
  python clipper.py gallery           reconstruit la page de tri clips/index.html
  python clipper.py auth youtube      autorise l'envoi sur ta chaine YouTube (une seule fois)
  python clipper.py post FICHIER.mp4 --to tiktok,instagram,youtube
                                      publie un fichier tout de suite (test des comptes)

Principe : pour chaque streamer, streamlink -> ffmpeg ecrit un tampon glissant de petits
segments. Le chat Twitch (lecture anonyme) sert de capteur : quand le nombre de personnes
qui ecrivent explose par rapport a la normale, on decoupe le moment, on le cale sur la
parole et sur le pic sonore, on le met en page en 9:16 avec sous-titres mot a mot, puis
on le note. Une file de publication poste ensuite les meilleurs clips aux bons horaires.
"""
from __future__ import annotations

import argparse
import array
import base64
import collections
import copy
import csv
import datetime as dt
import hashlib
import http.server
import importlib.util
import json
import logging
import math
import os
import queue
import random
import re
import secrets
import shutil
import socket
import ssl
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from dataclasses import dataclass, field
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    tomllib = None

VERSION = "2.0"
log = logging.getLogger("clipper")
STOP = threading.Event()

# --------------------------------------------------------------------------- config

DEFAULTS = {
    "channels": [],
    "general": {
        "output_dir": "clips",
        "buffer_dir": "buffer",
        "log_dir": "logs",
        "buffer_seconds": 180,
        "segment_seconds": 4,
        "render_workers": 2,
        "keep_awake": True,
    },
    "twitch": {
        "quality": "best",
        "low_latency": True,
        "oauth_token": "",
        "streamlink_cmd": [],
        "irc_host": "irc.chat.twitch.tv",
        "irc_port": 6697,
        "irc_tls": True,
        "games": [],
        "meta_refresh_seconds": 300,
    },
    "detect": {
        "window_seconds": 8,
        "baseline_seconds": 240,
        "warmup_seconds": 120,
        "ratio": 1.8,
        "sigma": 4.0,
        "min_rate": 3.0,
        "min_unique": 8,
        "cooldown_seconds": 45,
        "max_clips_per_hour": 12,
        "settle_seconds": 3,
        "max_extend_seconds": 15,
        "hype_weight": 0.5,
        "user_cooldown": 2.0,
        "raid_mute_seconds": 90,
        "hype_words": [],
        "ignore_users": [
            "nightbot", "streamelements", "streamlabs", "moobot", "fossabot", "wizebot",
            "sery_bot", "commanderroot", "soundalerts", "pokemoncommunitygame",
        ],
    },
    "clip": {
        "pre_seconds": 16,
        "lead_seconds": 9,
        "post_seconds": 8,
        "max_seconds": 58,
        "min_seconds": 14,
        "layout": "blur",
        "game_zoom": 0.0,
        "fps": "auto",
        "credit": "twitch.tv/{channel}",
        "snap": True,
        "audio_anchor": True,
        "loudnorm": True,
    },
    "subtitles": {
        "enabled": True,
        "model": "small",
        "language": "",
        "device": "cpu",
        "uppercase": True,
        "words_per_line": 3,
        "highlight": True,
        "font": "Arial Black",
        "size": 84,
        "color": "#FFFFFF",
        "highlight_color": "#FFE600",
    },
    "post": {
        "hashtags": [],
        "caption": "{titre} {hashtags}",
    },
    "ai": {
        "enabled": False,
        "api_key": "",
        "model": "claude-haiku-5-5",
        "frames": 6,
        "min_note": 0,
        "max_calls_per_hour": 120,
        "trim": True,
        "title_overlay": True,
        "api_url": "",
    },
    "encode": {"nvenc": "auto", "cq": 21},
    "publish": {
        "enabled": False,
        "dry_run": False,
        "timezone": "Europe/Paris",
        "min_score": 55,
        "delay_minutes": 15,
        "max_age_hours": 30,
        "rush_score": 0,
        "need_ai": False,
        "tiktok": {
            "enabled": False, "via": "zernio", "account": "",
            "windows": ["12:00-13:30", "17:00-21:30"],
            "max_per_day": 6, "min_gap_minutes": 60,
            "privacy": "PUBLIC_TO_EVERYONE",
            "caption": "{titre} {hashtags}",
        },
        "instagram": {
            "enabled": False, "via": "zernio", "account": "",
            "windows": ["12:00-13:30", "18:00-21:30"],
            "max_per_day": 6, "min_gap_minutes": 60,
            "caption": "{titre}\n\n{hashtags}\n{credit}",
        },
        "youtube": {
            "enabled": False, "via": "youtube", "account": "",
            "windows": ["12:00-15:00", "19:00-22:00"],
            "max_per_day": 8, "min_gap_minutes": 45,
            "privacy": "public", "category": "20",
            "caption": "{titre}\n\n{credit}\n{hashtags} #shorts",
        },
    },
    "zernio": {"api_key": "", "api_url": ""},
    "youtube": {
        "client_id": "", "client_secret": "", "token_file": "youtube_token.json",
        "auth_url": "", "token_url": "", "upload_url": "",
    },
    "streamer": {},
}

PLATFORMS = ("tiktok", "instagram", "youtube")


def deep_merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(path: str) -> dict:
    if tomllib is None:
        sys.exit("Python 3.11 ou plus recent requis (version actuelle : %s)." % sys.version.split()[0])
    p = Path(path)
    if not p.exists():
        sys.exit(f"Fichier de config introuvable : {p}")
    try:
        user = tomllib.loads(p.read_text(encoding="utf-8-sig"))
    except tomllib.TOMLDecodeError as e:
        sys.exit(f"Erreur dans {p.name} : {e}\n"
                 "Astuce : garde les guillemets autour des textes, et dans les chemins Windows "
                 "ecris / a la place de \\ (ex. C:/clipper/clips).")
    cfg = deep_merge(copy.deepcopy(DEFAULTS), user)
    base = p.resolve().parent
    cfg["_base"] = str(base)
    g = cfg["general"]
    for k in ("output_dir", "buffer_dir", "log_dir"):
        g[k] = str(Path(g[k]) if os.path.isabs(g[k]) else (base / g[k]))
    cfg["channels"] = [str(c).strip().lower().lstrip("#") for c in cfg["channels"] if str(c).strip()]
    cfg["streamer"] = {str(k).lower(): v for k, v in cfg["streamer"].items()}
    cfg["twitch"]["games"] = [str(x).lower() for x in cfg["twitch"]["games"]]
    return cfg


@dataclass
class ChanCfg:
    name: str
    window: int
    baseline: int
    warmup: float
    ratio: float
    sigma: float
    min_rate: float
    min_unique: int
    cooldown: float
    max_per_hour: int
    settle: float
    max_extend: float
    hype_weight: float
    user_cooldown: float
    raid_mute: float
    hype_words: list
    ignore_users: set
    pre: float
    lead: float
    post: float
    max_len: float
    min_len: float
    layout: str
    zoom: float
    facecam: list | None
    fps: object
    credit: str
    language: str
    hashtags: list
    display: str


def make_chan_cfg(cfg: dict, name: str) -> ChanCfg:
    d, c, s, p = cfg["detect"], cfg["clip"], cfg["subtitles"], cfg["post"]
    o = cfg["streamer"].get(name, {})

    def g(sec: dict, key: str):
        return o.get(key, sec[key])

    return ChanCfg(
        name=name,
        window=max(2, int(g(d, "window_seconds"))),
        baseline=int(g(d, "baseline_seconds")),
        warmup=float(g(d, "warmup_seconds")),
        ratio=float(g(d, "ratio")),
        sigma=float(g(d, "sigma")),
        min_rate=float(g(d, "min_rate")),
        min_unique=int(g(d, "min_unique")),
        cooldown=float(g(d, "cooldown_seconds")),
        max_per_hour=int(g(d, "max_clips_per_hour")),
        settle=float(g(d, "settle_seconds")),
        max_extend=float(g(d, "max_extend_seconds")),
        hype_weight=float(g(d, "hype_weight")),
        user_cooldown=float(g(d, "user_cooldown")),
        raid_mute=float(g(d, "raid_mute_seconds")),
        hype_words=[str(w) for w in g(d, "hype_words")],
        ignore_users={str(u).lower() for u in g(d, "ignore_users")},
        pre=float(g(c, "pre_seconds")),
        lead=float(g(c, "lead_seconds")),
        post=float(g(c, "post_seconds")),
        max_len=float(g(c, "max_seconds")),
        min_len=float(g(c, "min_seconds")),
        layout=str(g(c, "layout")),
        zoom=float(g(c, "game_zoom")),
        facecam=o.get("facecam"),
        fps=g(c, "fps"),
        credit=str(g(c, "credit")),
        language=str(g(s, "language")),
        hashtags=[str(h) for h in g(p, "hashtags")],
        display=str(o.get("display", "")),
    )


FROZEN = bool(getattr(sys, "frozen", False))      # True quand le programme tourne en .exe


def app_dir() -> Path:
    """Dossier du programme (celui du .exe, ou celui de clipper.py)."""
    return Path(sys.executable).resolve().parent if FROZEN else Path(__file__).resolve().parent


def self_cmd(*args: str) -> list[str]:
    """Commande pour relancer ce programme avec une sous-commande interne."""
    return [sys.executable, *args] if FROZEN else [sys.executable, os.path.abspath(__file__), *args]


def clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x
CONFIG_TEMPLATE = r'''# ============================================================
#  Clipper - réglages. Seule la ligne "channels" est obligatoire.
#  Après une modification : ferme Clipper et relance-le.
# ============================================================

# Streamers à surveiller : le nom dans l'adresse twitch.tv/NOM, en minuscules.
channels = ["streamer1", "streamer2", "streamer3"]

[general]
output_dir = "clips"        # les clips finis arrivent ici (un dossier par streamer)
render_workers = 2          # clips fabriqués en même temps

[twitch]
quality = "best"            # "best", ou "720p60" pour consommer moins de débit
games = []                  # ex. ["grand theft auto vi"] : ne clipper QUE quand le streamer est sur ce jeu
oauth_token = ""            # facultatif : jeton d'un compte abonné ou Turbo, pour éviter les coupures pub

[detect]
ratio = 1.8                 # sensibilité : plus haut = moins de clips, mais plus forts
min_rate = 3.0              # activité minimale du chat (personnes par seconde) ; 1.5 pour un petit streamer
min_unique = 8              # nombre minimal de personnes différentes qui réagissent
cooldown_seconds = 45       # pause entre deux clips d'un même streamer
max_clips_per_hour = 12

[clip]
layout = "blur"             # "blur" = image entière sur fond flouté | "stack" = facecam en haut, jeu zoomé en bas
max_seconds = 58
credit = "twitch.tv/{channel}"   # crédit affiché sur la vidéo ("" pour l'enlever)

[subtitles]
enabled = true
model = "small"             # "base" (rapide), "small" (conseillé), "medium" (plus précis, plus lent)
language = "fr"             # langue parlée ; "" = détection automatique
device = "cpu"              # "cuda" = carte graphique (pip install nvidia-cublas-cu12 nvidia-cudnn-cu12)
highlight_color = "#FFE600" # couleur du mot en cours

[post]
# Hashtags ajoutés à toutes les légendes (mets ici ceux qu'exige une campagne de clipping).
hashtags = ["#gta6", "#gtavi", "#twitchfr"]

# ------------------------------------------------------------
#  IA (facultatif) : regarde le clip, le note sur 10, écrit l'accroche
#  incrustée, le titre et les hashtags, et signale les contenus à risque.
#  Il faut une clé API Anthropic (payante à l'usage, séparée de l'abonnement Claude).
# ------------------------------------------------------------
[ai]
enabled = false
api_key = ""
model = "claude-haiku-5-5"
min_note = 0                # ex. 5 : les clips notés moins de 5/10 par l'IA ne sont pas fabriqués
max_calls_per_hour = 120    # garde-fou sur la dépense

# ------------------------------------------------------------
#  Publication automatique
#  TikTok + Instagram : via Zernio (zernio.com), gratuit pour 2 comptes.
#     Crée un compte, connecte TikTok et Instagram (compte professionnel),
#     puis colle ta clé API ci-dessous dans [zernio].
#  YouTube Shorts : API officielle Google (gratuite), voir [youtube].
#  Commence avec dry_run = true : Clipper écrit ce qu'il publierait, sans rien envoyer.
# ------------------------------------------------------------
[publish]
enabled = false
dry_run = true
timezone = "Europe/Paris"   # fuseau des créneaux ci-dessous
min_score = 55              # note minimale (sur 100) pour qu'un clip soit publié
delay_minutes = 15          # délai avant publication : supprime le fichier du clip pour l'annuler
rush_score = 0              # ex. 85 : au-dessus de cette note, publication immédiate, même hors créneau
need_ai = false             # true = ne publier que les clips validés par l'IA

[publish.tiktok]
enabled = true
via = "zernio"
windows = ["12:00-13:30", "17:00-21:30"]   # créneaux de publication ; [] = à toute heure
max_per_day = 6
min_gap_minutes = 60
caption = "{titre} {hashtags}"

[publish.instagram]
enabled = true
via = "zernio"
windows = ["12:00-13:30", "18:00-21:30"]
max_per_day = 6
min_gap_minutes = 60
caption = "{titre}\n\n{hashtags}\n{credit}"

[publish.youtube]
enabled = true
via = "youtube"             # "zernio" possible aussi (3e compte Zernio, payant)
windows = ["12:00-15:00", "19:00-22:00"]
max_per_day = 8
min_gap_minutes = 45
category = "20"             # 20 = Jeux vidéo
caption = "{titre}\n\n{credit}\n{hashtags} #shorts"

[zernio]
api_key = ""

[youtube]
# console.cloud.google.com : crée un projet, active "YouTube Data API v3", puis crée un
# identifiant OAuth de type "Application de bureau" et colle ses deux valeurs ici.
# Ensuite, dans Clipper : "Autoriser YouTube" (une seule fois).
client_id = ""
client_secret = ""

[encode]
nvenc = "auto"              # "auto" = utilise la carte graphique NVIDIA si possible

# ------------------------------------------------------------
#  Réglages propres à un streamer (facultatif).
#  facecam = [x, y, largeur, hauteur] en fractions de l'image (0 à 1) :
#  utilise "Capture d'un live avec grille" pour les lire.
# ------------------------------------------------------------
# [streamer.streamer1]
# layout = "stack"
# facecam = [0.0, 0.70, 0.25, 0.30]
# display = "Streamer1"       # nom affiché dans les titres
# hashtags = ["#gta6", "#streamer1"]
# min_rate = 1.5
'''
PLACEHOLDER_CHANNELS = ["streamer1", "streamer2", "streamer3"]


# --------------------------------------------------------------------------- detection (chat)

MOOD_FUNNY, MOOD_HYPE, MOOD_SHOCK = 1, 2, 4
MOOD_NAMES = {MOOD_FUNNY: "drole", MOOD_HYPE: "hype", MOOD_SHOCK: "choc"}
LEX = {
    MOOD_FUNNY: ("lul", "lulw", "kekw", "omegalul", "lmao", "lmfao", "lol", "lool", "mdr", "ptdr", "xd",
                 "xdd", "haha", "hahaha", "jpp", "icant", "pepelaugh", "explosé", "😂", "🤣", "💀"),
    MOOD_HYPE: ("pog", "pogchamp", "poggers", "pogu", "clip", "clippez", "clipper", "insane", "crazy",
                "letsgo", "let's go", "incroyable", "le fou", "monstre", "goat", "enorme", "énorme", "🔥"),
    MOOD_SHOCK: ("wtf", "omg", "no way", "noway", "oh non", "mais non", "monkas", "holy", "aya", "😱", "😳"),
}
CLIP_WORDS = ("clip", "clippez", "clipper", "clipez")
_COLLAPSE = re.compile(r"(.)\1{2,}")
_STRIP = ".,!?;:()[]\"'*~"


def normalize(text: str) -> str:
    """minuscules + 'mdrrrr' -> 'mdr', 'nooon' -> 'non'."""
    return _COLLAPSE.sub(r"\1", text.lower()).strip()


class Lexicon:
    def __init__(self, extra_hype=()):
        self.tokens: dict[str, int] = {}
        self.phrases: list[tuple[str, int]] = []
        for mood, words in LEX.items():
            for w in words:
                self._add(w, mood)
        for w in extra_hype:
            self._add(w, MOOD_HYPE)

    def _add(self, w: str, mood: int) -> None:
        w = normalize(w)
        if not w:
            return
        if " " in w or not w.isascii():
            self.phrases.append((w, mood))
        else:
            self.tokens[w] = self.tokens.get(w, 0) | mood

    def classify(self, raw: str) -> tuple[str, int, bool]:
        norm = normalize(raw)
        toks = [t.strip(_STRIP) for t in norm.split()]
        mask = 0
        for t in toks:
            m = self.tokens.get(t)
            if m:
                mask |= m
        for ph, m in self.phrases:
            if ph in norm:
                mask |= m
        if "??" in raw:
            mask |= MOOD_SHOCK
        return norm, mask, any(t in CLIP_WORDS for t in toks)


@dataclass
class ClipEvent:
    channel: str
    t_on: float                 # debut estime du pic de chat
    t0: float                   # franchissement du seuil
    t_peak: float               # sommet du pic
    ratio: float                # pic / niveau normal
    rate: float                 # personnes-messages par seconde au sommet
    baseline: float
    uniq: int = 0
    msgs: int = 0
    hype_share: float = 0.0
    mood: str = "neutre"
    top_chat: list = field(default_factory=list)
    t_start: float = 0.0
    t_end: float = 0.0
    audio_z: float = 0.0
    anchor: float = 0.0
    score: int = 0
    category: str = ""
    stream_title: str = ""
    display: str = ""


def base_score(ratio: float, uniq: int, hype_share: float, audio_z: float) -> int:
    """Note 0-100 a partir des signaux mesures (sans IA)."""
    s_ratio = clamp((ratio - 1.0) / 4.0, 0.0, 1.0)
    s_size = clamp(math.log10(max(uniq, 1)) / 2.3, 0.0, 1.0)
    s_hype = clamp(hype_share / 0.5, 0.0, 1.0)
    s_audio = clamp(audio_z / 4.0, 0.0, 1.0)
    return int(round(100 * (0.40 * s_ratio + 0.20 * s_size + 0.20 * s_hype + 0.20 * s_audio)))


class Detector:
    """Repere les pics d'activite du chat d'un streamer (mediane/MAD robustes)."""

    def __init__(self, name: str, c: ChanCfg, now: float | None = None):
        self.name, self.c = name, c
        self.lex = Lexicon(c.hype_words)
        self.lock = threading.Lock()
        self.bins: dict[int, float] = collections.defaultdict(float)
        self.msgs: collections.deque = collections.deque()
        self.last_user: dict[str, float] = {}
        now = time.time() if now is None else now
        self.started = now
        self.valid_from = int(now) + 1
        self.state: dict | None = None
        self.last_fire = 0.0
        self.fires: collections.deque[float] = collections.deque()
        self.muted_until = 0.0
        self.armed = True           # desarme apres un clip, jusqu'au retour au calme
        self.last_peak = 0.0
        self.last_prune = now
        self.cur = 0.0
        self.med = 0.0
        self.clips = 0

    # ----- entrees
    def add_message(self, ts: float, user: str, text: str) -> None:
        c = self.c
        u = user.lower()
        if u in c.ignore_users or text.startswith("!"):
            return
        norm, mask, clip_req = self.lex.classify(text)
        with self.lock:
            self.msgs.append((ts, u, norm[:60], mask))
            lu = self.last_user.get(u)
            if lu is not None and ts - lu < c.user_cooldown:
                return  # un meme spectateur ne compte qu'une fois toutes les N secondes
            self.last_user[u] = ts
            self.bins[int(ts)] += 1.0 + (c.hype_weight if mask else 0.0) + (1.0 if clip_req else 0.0)

    def resume(self, now: float) -> None:
        """Apres une coupure du chat : on repart d'une base propre."""
        with self.lock:
            self.valid_from = int(now) + 1
            self.state = None

    def mute(self, now: float, seconds: float | None = None) -> None:
        """Raid entrant : le chat explose sans qu'il se passe rien a l'ecran."""
        with self.lock:
            self.muted_until = max(self.muted_until, now + (self.c.raid_mute if seconds is None else seconds))
            self.state = None

    # ----- calculs
    def _under_cap(self, now: float) -> bool:
        while self.fires and now - self.fires[0] > 3600:
            self.fires.popleft()
        return len(self.fires) < self.c.max_per_hour

    def _prune(self, now: float) -> None:
        c = self.c
        horizon = int(now) - c.baseline - 3 * c.window - 10
        for k in [k for k in self.bins if k < horizon]:
            del self.bins[k]
        while self.msgs and self.msgs[0][0] < now - 200:
            self.msgs.popleft()
        if len(self.last_user) > 2000:
            for k in [k for k, v in self.last_user.items() if now - v > 60]:
                del self.last_user[k]
        self.last_prune = now

    def _window_stats(self, a: float, b: float) -> dict:
        users, n, hyped = set(), 0, 0
        moods = collections.Counter()
        lines = collections.Counter()
        for ts, u, norm, mask in self.msgs:
            if ts < a:
                continue
            if ts > b:
                break
            n += 1
            users.add(u)
            if mask:
                hyped += 1
                for m in (MOOD_FUNNY, MOOD_HYPE, MOOD_SHOCK):
                    if mask & m:
                        moods[m] += 1
            if norm and len(norm) <= 40:
                lines[norm] += 1
        mood = "neutre"
        if moods:
            best, cnt = moods.most_common(1)[0]
            if cnt >= max(3, 0.12 * n):
                mood = MOOD_NAMES[best]
        top = [(t, k) for t, k in lines.most_common(8) if k >= 2][:6]
        return {"uniq": len(users), "msgs": n, "hype_share": (hyped / n) if n else 0.0, "mood": mood, "top": top}

    def tick(self, now: float) -> ClipEvent | None:
        c = self.c
        with self.lock:
            if now - self.last_prune > 15:
                self._prune(now)
            w = c.window
            now_s = int(now)
            bins = self.bins
            cur = sum(bins.get(s, 0.0) for s in range(now_s - w, now_s)) / w
            self.cur = cur
            if now - self.started < c.warmup:
                return None
            blocks = []
            for k in range(max(1, c.baseline // w)):
                b0 = now_s - w * (k + 2)
                if b0 < self.valid_from:
                    break
                blocks.append(sum(bins.get(s, 0.0) for s in range(b0, b0 + w)) / w)
            if len(blocks) < 6:
                return None
            med = statistics.median(blocks)
            sig = 1.4826 * statistics.median(abs(x - med) for x in blocks)
            self.med = med
            thr = max(c.min_rate, med * c.ratio, med + c.sigma * sig)

            if self.state is None:
                if not self.armed and (cur < max(med * 1.25, thr * 0.65) or cur >= self.last_peak * 1.5):
                    self.armed = True  # le chat est retombe (ou nouveau pic bien plus fort) : on peut re-declencher
                if (self.armed and cur >= thr and now >= self.muted_until and now - self.last_fire >= c.cooldown
                        and self._under_cap(now)):
                    # debut reel du pic : premiere seconde nettement au-dessus de la normale
                    on_thr = max(med * 1.5, med + 2.0 * sig, c.min_rate * 0.7)
                    t_on = now - w / 2.0
                    for s in range(now_s - w, now_s - 1):
                        if (bins.get(s, 0.0) + bins.get(s + 1, 0.0)) / 2.0 >= on_thr:
                            t_on = float(s)
                            break
                    self.state = {"t0": now, "t_on": t_on, "peak": cur, "t_peak": now, "med": med}
                return None

            st = self.state
            if cur > st["peak"]:
                st["peak"], st["t_peak"] = cur, now
            if now - st["t_peak"] < c.settle and now - st["t0"] < c.max_extend:
                return None
            self.state = None
            self.armed, self.last_peak = False, st["peak"]
            stats = self._window_stats(st["t_on"] - 1.0, st["t_peak"] + 2.0)
            if stats["uniq"] < c.min_unique:
                self.last_fire = now - c.cooldown + 10  # petite pause, pas un vrai clip
                return None
            self.last_fire = now
            self.fires.append(now)
            self.clips += 1
            base = max(st["med"], 0.1)
            ev = ClipEvent(self.name, st["t_on"], st["t0"], st["t_peak"], st["peak"] / base, st["peak"], st["med"],
                           uniq=stats["uniq"], msgs=stats["msgs"], hype_share=stats["hype_share"],
                           mood=stats["mood"], top_chat=stats["top"])
            ev.t_start = ev.t_on - c.pre
            ev.t_end = max(ev.t_peak + c.post, ev.t_start + c.min_len)
            ev.t_end = min(ev.t_end, ev.t_start + c.max_len)
            ev.score = base_score(ev.ratio, ev.uniq, ev.hype_share, 0.0)
            return ev


# --------------------------------------------------------------------------- chat Twitch (IRC anonyme)

def parse_irc(line: str) -> tuple[dict, str, str, list[str]]:
    tags: dict[str, str] = {}
    if line.startswith("@"):
        t, _, line = line.partition(" ")
        for kv in t[1:].split(";"):
            k, _, v = kv.partition("=")
            tags[k] = v
    prefix = ""
    if line.startswith(":"):
        prefix, _, line = line[1:].partition(" ")
    head, sep, trailing = line.partition(" :")
    params = head.split()
    if sep:
        params.append(trailing)
    if not params:
        return tags, prefix, "", []
    return tags, prefix, params[0], params[1:]


class ChatClient(threading.Thread):
    def __init__(self, cfg: dict, on_message, on_event, on_reset):
        super().__init__(daemon=True, name="chat")
        self.cfg = cfg
        self.channels = cfg["channels"]
        self.on_message, self.on_event, self.on_reset = on_message, on_event, on_reset
        self.connected = False

    def run(self) -> None:
        backoff = 3
        while not STOP.is_set():
            t0 = time.time()
            try:
                self._session()
            except Exception as e:  # noqa: BLE001
                log.warning("chat : connexion perdue (%s)", e)
            self.connected = False
            self.on_reset()
            backoff = 3 if time.time() - t0 > 120 else min(backoff * 2, 30)
            if STOP.wait(backoff):
                break

    def _session(self) -> None:
        tw = self.cfg["twitch"]
        raw = socket.create_connection((tw["irc_host"], int(tw["irc_port"])), timeout=15)
        if tw["irc_tls"]:
            sock = ssl.create_default_context().wrap_socket(raw, server_hostname=tw["irc_host"])
        else:
            sock = raw
        sock.settimeout(45)

        def send(line: str) -> None:
            sock.sendall((line + "\r\n").encode("utf-8"))

        try:
            send("CAP REQ :twitch.tv/tags twitch.tv/commands")
            send("PASS SCHMOOPIIE")
            send("NICK justinfan%d" % random.randint(10000, 99999))
            for ch in self.channels:
                send("JOIN #" + ch)
                time.sleep(0.6)  # Twitch limite les JOIN (20 / 10 s)
                if STOP.is_set():
                    return
            log.info("chat : connecte, %d channel(s) rejoint(s)", len(self.channels))
            self.connected = True
            self.on_reset()
            buf = b""
            probe = False
            while not STOP.is_set():
                try:
                    data = sock.recv(65536)
                except socket.timeout:
                    if probe:
                        raise ConnectionError("pas de reponse au PING") from None
                    send("PING :keepalive")
                    probe = True
                    continue
                if not data:
                    raise ConnectionError("connexion fermee par Twitch")
                probe = False
                buf += data
                *lines, buf = buf.split(b"\r\n")
                now = time.time()
                for raw_line in lines:
                    tags, prefix, cmd, params = parse_irc(raw_line.decode("utf-8", "replace"))
                    if cmd == "PRIVMSG" and len(params) >= 2:
                        text = params[1]
                        if text.startswith("\x01ACTION "):
                            text = text[8:].rstrip("\x01")
                        self.on_message(params[0].lstrip("#"), prefix.split("!", 1)[0], text, now)
                    elif cmd == "PING":
                        send("PONG :" + (params[0] if params else "tmi.twitch.tv"))
                    elif cmd == "USERNOTICE" and params:
                        if tags.get("msg-id") == "raid":
                            self.on_event(params[0].lstrip("#"), "raid", now)
                    elif cmd == "RECONNECT":
                        raise ConnectionError("Twitch demande une reconnexion")
        finally:
            try:
                sock.close()
            except OSError:
                pass

# --------------------------------------------------------------------------- outils process / http

_FFMPEG: str | None = None


def ffmpeg_path() -> str | None:
    """ffmpeg livre a cote du programme, sinon celui du PATH."""
    global _FFMPEG
    if _FFMPEG is None:
        local = app_dir() / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        _FFMPEG = str(local) if local.exists() else (shutil.which("ffmpeg") or "")
    return _FFMPEG or None


def ffmpeg_bin() -> str:
    return ffmpeg_path() or "ffmpeg"


def sh(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, errors="replace", **kw)


class NetError(Exception):
    """Erreur reseau ou serveur (temporaire)."""


def http_call(method: str, url: str, *, headers: dict | None = None, body=None, timeout: float = 60.0):
    """Appel HTTP minimal (bibliotheque standard). Retourne (code, en-tetes, octets).
    `body` : None, bytes, dict (envoye en JSON) ou objet fichier (envoye en flux)."""
    h = dict(headers or {})
    data = body
    if isinstance(body, dict):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers.items()), r.read()
    except urllib.error.HTTPError as e:
        try:
            payload = e.read()
        except Exception:  # noqa: BLE001
            payload = b""
        return e.code, dict(e.headers.items()) if e.headers else {}, payload
    except (urllib.error.URLError, socket.timeout, ConnectionError, ssl.SSLError, OSError) as e:
        raise NetError(str(getattr(e, "reason", e))) from None


def as_json(payload: bytes):
    try:
        return json.loads(payload.decode("utf-8", "replace"))
    except ValueError:
        return None


def header(headers: dict, name: str) -> str:
    low = name.lower()
    for k, v in headers.items():
        if k.lower() == low:
            return v
    return ""


# --------------------------------------------------------------------------- enregistrement (tampon glissant)

def streamlink_base(cfg: dict) -> list[str]:
    tw = cfg["twitch"]
    if tw["streamlink_cmd"]:
        return list(tw["streamlink_cmd"])
    if FROZEN:
        return self_cmd("_streamlink")     # streamlink est embarque dans le .exe
    if importlib.util.find_spec("streamlink") is not None:
        return [sys.executable, "-m", "streamlink"]
    exe = shutil.which("streamlink")
    return [exe] if exe else [sys.executable, "-m", "streamlink"]


def streamlink_cmd(cfg: dict, name: str, retry: bool = True) -> list[str]:
    tw = cfg["twitch"]
    cmd = streamlink_base(cfg) + ["--stdout", "--loglevel", "warning"]
    if retry:
        cmd += ["--retry-streams", "20", "--retry-max", "0"]
    if tw["low_latency"]:
        cmd += ["--twitch-low-latency"]
    if tw["oauth_token"]:
        cmd += ["--twitch-api-header", "Authorization=OAuth " + tw["oauth_token"]]
    cmd += ["twitch.tv/" + name, tw["quality"]]
    return cmd


def fetch_meta(cfg: dict, name: str) -> dict | None:
    """Categorie (jeu), titre et nom affiche du live, via streamlink --json."""
    try:
        r = sh(streamlink_base(cfg) + ["--json", "twitch.tv/" + name], timeout=45)
    except (OSError, subprocess.TimeoutExpired):
        return None
    data = as_json((r.stdout or "").encode("utf-8"))
    if not isinstance(data, dict) or data.get("error") or not isinstance(data.get("metadata"), dict):
        return None
    m = data["metadata"]
    return {"category": m.get("category") or "", "title": m.get("title") or "", "author": m.get("author") or ""}


SEG_RE = re.compile(r"seg_(\d{9})\.ts$")


@dataclass
class Seg:
    idx: int
    path: Path
    start: float           # heure d'arrivee du debut du segment
    end: float
    open: bool = False     # encore en cours d'ecriture
    stall: bool = False    # trou a l'interieur (pub, gel du flux)
    fresh: bool = False    # premier segment apres une reconnexion


class Recorder(threading.Thread):
    """streamlink -> ffmpeg (copie sans re-encodage) -> segments numerotes de quelques secondes."""

    STALL_SECONDS = 200  # une coupure pub peut durer 3 minutes

    def __init__(self, cfg: dict, name: str):
        super().__init__(daemon=True, name="rec-" + name)
        self.cfg, self.name_ = cfg, name
        g = cfg["general"]
        self.buf = Path(g["buffer_dir"]) / name
        shutil.rmtree(self.buf, ignore_errors=True)
        self.buf.mkdir(parents=True, exist_ok=True)
        self.logdir = Path(g["log_dir"])
        self.logdir.mkdir(parents=True, exist_ok=True)
        self.seg = int(g["segment_seconds"])
        self.live = False
        self.ff_alive = False
        self.lock = threading.Lock()
        self.birth: dict[int, float] = {}
        self.session_starts: set[int] = set()
        self.next_no = 0

    def scan(self) -> list[tuple[int, Path, float, int]]:
        items = []
        for p in self.buf.glob("seg_*.ts"):
            m = SEG_RE.match(p.name)
            if not m:
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            items.append((int(m.group(1)), p, st.st_mtime, st.st_size))
        items.sort()
        return items

    def timeline(self, now: float | None = None) -> list[Seg]:
        """Segments du tampon avec leurs heures d'arrivee (horloge du PC)."""
        now = time.time() if now is None else now
        items = self.scan()
        with self.lock:
            birth = dict(self.birth)
            starts = set(self.session_starts)
        out: list[Seg] = []
        for i, (idx, p, mt, _size) in enumerate(items):
            last = i == len(items) - 1
            prev = items[i - 1] if i else None
            contig = prev is not None and prev[0] == idx - 1 and idx not in starts
            is_open = last and self.ff_alive
            end = now if is_open else mt
            start = prev[2] if contig else birth.get(idx, end - self.seg)
            stall = False
            if contig and not is_open and end - start > self.seg * 2.5 + 2:
                stall, start = True, end - self.seg
            if end <= start:
                end = start + 0.05
            out.append(Seg(idx, p, start, end, is_open, stall, not contig))
        return out

    def run(self) -> None:
        while not STOP.is_set():
            started = time.time()
            try:
                self._once()
            except Exception as e:  # noqa: BLE001
                log.exception("[%s] enregistrement : %s", self.name_, e)
            self.live = False
            self.ff_alive = False
            if STOP.wait(max(5.0, 20.0 - (time.time() - started))):
                break

    def _once(self) -> None:
        start_no = self.next_no
        with self.lock:
            self.session_starts.add(start_no)
        ff_cmd = [
            ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-fflags", "+genpts+discardcorrupt",
            "-i", "pipe:0", "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy",
            "-f", "segment", "-segment_time", str(self.seg), "-segment_format", "mpegts",
            "-segment_start_number", str(start_no), "seg_%09d.ts",
        ]
        sl_log = open(self.logdir / f"streamlink_{self.name_}.log", "ab")
        ff_log = open(self.logdir / f"ffmpeg_{self.name_}.log", "ab")
        sl = ff = None
        activity = 0.0
        try:
            sl = subprocess.Popen(streamlink_cmd(self.cfg, self.name_), stdout=subprocess.PIPE, stderr=sl_log)
            ff = subprocess.Popen(ff_cmd, stdin=sl.stdout, stderr=ff_log, cwd=str(self.buf))
            sl.stdout.close()
            self.ff_alive = True
            while not STOP.is_set():
                if ff.poll() is not None:
                    break
                if sl.poll() is not None:  # le live est termine : laisser ffmpeg finir
                    try:
                        ff.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        pass
                    break
                now = time.time()
                items = self.scan()
                mine = [it for it in items if it[0] >= start_no]
                if mine:
                    with self.lock:
                        for idx, _p, _mt, _sz in mine:
                            if idx not in self.birth:
                                self.birth[idx] = now
                                activity = now
                    self.next_no = max(self.next_no, mine[-1][0] + 1)
                    activity = max(activity, mine[-1][2])
                    live = now - activity < 25
                    if live and not self.live:
                        log.info("[%s] live detecte, enregistrement en cours", self.name_)
                    self.live = live
                    if now - activity > self.STALL_SECONDS:
                        log.warning("[%s] flux fige depuis %d s, redemarrage", self.name_, int(now - activity))
                        break
                time.sleep(0.5)
        finally:
            self.ff_alive = False
            for p in (sl, ff):
                if p is not None and p.poll() is None:
                    p.terminate()
                    try:
                        p.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        p.kill()
            sl_log.close()
            ff_log.close()

    def cleanup(self, keep_seconds: float) -> None:
        limit = time.time() - keep_seconds
        items = self.scan()
        for idx, p, mt, _sz in items[:-1]:  # jamais le segment en cours
            if mt < limit:
                try:
                    p.unlink()
                except OSError:
                    pass
        if items:
            low = items[0][0]
            with self.lock:
                for k in [k for k in self.birth if k < low]:
                    del self.birth[k]
                self.session_starts = {s for s in self.session_starts if s >= low}


# --------------------------------------------------------------------------- volume sonore (pic = moment de l'action)

def rms_db_blocks(pcm: bytes, rate: int = 8000, block: float = 0.5) -> list[float]:
    a = array.array("h")
    a.frombytes(pcm[: len(pcm) - (len(pcm) % 2)])
    if sys.byteorder == "big":
        a.byteswap()
    n = int(rate * block)
    out = []
    for i in range(0, len(a) - n + 1, n):
        seg = a[i:i + n]
        ms = sum(x * x for x in seg) / n
        out.append(20.0 * math.log10(math.sqrt(ms) / 32768.0 + 1e-6))
    return out


class AudioMeter(threading.Thread):
    """Mesure le volume de chaque segment ferme (0,5 s de resolution)."""

    def __init__(self, rec: Recorder):
        super().__init__(daemon=True, name="audio-" + rec.name_)
        self.rec = rec
        self.done: set[int] = set()
        self.samples: collections.deque = collections.deque(maxlen=1400)  # ~11 minutes
        self.lock = threading.Lock()

    def run(self) -> None:
        while not STOP.wait(1.0):
            try:
                for s in self.rec.timeline():
                    if s.open or s.idx in self.done:
                        continue
                    self.done.add(s.idx)
                    vals = self.measure(s.path)
                    with self.lock:
                        for i, v in enumerate(vals):
                            self.samples.append((s.start + (i + 0.5) * 0.5, v))
                if len(self.done) > 600:
                    top = max(self.done)
                    self.done = {i for i in self.done if i > top - 300}
            except Exception as e:  # noqa: BLE001
                log.debug("audio %s : %s", self.rec.name_, e)

    @staticmethod
    def measure(path: Path) -> list[float]:
        try:
            r = subprocess.run([ffmpeg_bin(), "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "8000",
                                "-f", "s16le", "-"], capture_output=True, timeout=30)
        except (OSError, subprocess.TimeoutExpired):
            return []
        return rms_db_blocks(r.stdout) if r.returncode == 0 else []

    def peak(self, a: float, b: float) -> tuple[float, float]:
        """(heure du pic sonore entre a et b, ecart a la normale en nombre de sigma)."""
        with self.lock:
            data = list(self.samples)
        win = [(t, v) for t, v in data if a <= t <= b]
        ref = [v for t, v in data if a - 120 <= t < a - 2]
        if not win or len(ref) < 40:
            return 0.0, 0.0
        # lissage sur 1 s pour ignorer les claquements isoles
        best_t, best_v = win[0][0], -200.0
        for i in range(len(win)):
            v = (win[i][1] + win[min(i + 1, len(win) - 1)][1]) / 2.0
            if v > best_v:
                best_t, best_v = win[i][0], v
        med = statistics.median(ref)
        sig = max(1.5, 1.4826 * statistics.median(abs(x - med) for x in ref))
        return best_t, (best_v - med) / sig


# --------------------------------------------------------------------------- infos du live (jeu, titre)

class MetaWatcher(threading.Thread):
    def __init__(self, cfg: dict, recorders: dict):
        super().__init__(daemon=True, name="meta")
        self.cfg, self.recorders = cfg, recorders
        self.meta: dict[str, dict] = {}
        self.last: dict[str, float] = {}
        self.refresh = float(cfg["twitch"]["meta_refresh_seconds"])

    def get(self, ch: str) -> dict:
        return self.meta.get(ch, {})

    def allowed(self, ch: str) -> bool:
        games = self.cfg["twitch"]["games"]
        cat = self.get(ch).get("category", "")
        if not games or not cat:
            return True  # categorie inconnue : on ne bloque pas
        return any(g in cat.lower() for g in games)

    def run(self) -> None:
        while not STOP.is_set():
            for ch in self.cfg["channels"]:
                if STOP.is_set():
                    return
                rec = self.recorders.get(ch)
                if rec is not None and not rec.live:
                    self.last.pop(ch, None)
                    continue
                now = time.time()
                if now - self.last.get(ch, 0.0) < self.refresh:
                    continue
                self.last[ch] = now
                m = fetch_meta(self.cfg, ch)
                if m:
                    old = self.meta.get(ch, {}).get("category")
                    self.meta[ch] = m
                    if m["category"] != old:
                        log.info("[%s] jeu en cours : %s%s", ch, m["category"] or "?",
                                 "" if self.allowed(ch) else "  (hors filtre 'games' : pas de clip)")
            STOP.wait(5)

# --------------------------------------------------------------------------- transcription

HALLUCINATIONS = (
    "thanks for watching", "thank you for watching", "like and subscribe", "subscribe to",
    "merci d'avoir regard", "sous-titr", "amara.org", "abonnez-vous", "see you in the next",
)


def add_cuda_dll_paths() -> None:
    """Windows : retrouve les DLL CUDA installees via pip (nvidia-cublas-cu12, nvidia-cudnn-cu12)."""
    if os.name != "nt":
        return
    import site
    roots = list(site.getsitepackages()) + [site.getusersitepackages()]
    for r in roots:
        for b in Path(r).glob("nvidia/*/bin"):
            try:
                os.add_dll_directory(str(b))
            except OSError:
                pass
            os.environ["PATH"] = str(b) + os.pathsep + os.environ.get("PATH", "")


def cuda_probe_main(model: str) -> int:
    """Lance dans un processus a part : une DLL CUDA manquante peut tuer le processus."""
    add_cuda_dll_paths()
    import numpy as np
    from faster_whisper import WhisperModel
    m = WhisperModel(model, device="cuda", compute_type="float16")
    segs, _ = m.transcribe(np.zeros(32000, dtype="float32"), beam_size=1)
    list(segs)
    print("CUDA_OK")
    return 0


class Transcriber:
    def __init__(self, cfg: dict):
        s = cfg["subtitles"]
        self.enabled = bool(s["enabled"])
        self.model_name = s["model"]
        self.device = str(s["device"]).lower()
        self.model = None
        self.failed = False
        self.lock = threading.Lock()

    def _load(self) -> None:
        from faster_whisper import WhisperModel  # import tardif : optionnel
        dev, ct = "cpu", "int8"
        if self.device in ("cuda", "auto", "gpu"):
            try:
                r = sh(self_cmd("_cudaprobe", self.model_name), timeout=1800)
                if r.returncode == 0 and "CUDA_OK" in r.stdout:
                    dev, ct = "cuda", "float16"
                    add_cuda_dll_paths()
                else:
                    log.warning("sous-titres : GPU indisponible, passage sur CPU "
                                "(pip install nvidia-cublas-cu12 nvidia-cudnn-cu12)")
            except (OSError, subprocess.TimeoutExpired):
                pass
        self.model = WhisperModel(self.model_name, device=dev, compute_type=ct)
        log.info("sous-titres : modele '%s' charge sur %s", self.model_name, dev)

    def preload(self) -> None:
        if not self.enabled:
            return

        def work() -> None:
            with self.lock:
                if self.model is None and not self.failed:
                    try:
                        log.info("sous-titres : chargement du modele (telechargement au premier lancement)...")
                        self._load()
                    except Exception as e:  # noqa: BLE001
                        self.failed = True
                        log.warning("sous-titres desactives (%s). Installe : pip install faster-whisper", e)

        threading.Thread(target=work, daemon=True, name="whisper-load").start()

    def words(self, wav: str, language: str) -> list[tuple[float, float, str]]:
        if not self.enabled or self.failed:
            return []
        with self.lock:
            if self.model is None:
                try:
                    self._load()
                except Exception as e:  # noqa: BLE001
                    log.warning("sous-titres desactives (%s). Installe : pip install faster-whisper", e)
                    self.failed = True
                    return []
            try:
                segs, _info = self.model.transcribe(
                    wav, language=language or None, beam_size=1, vad_filter=True,
                    word_timestamps=True, condition_on_previous_text=False,
                )
                out = []
                for seg in segs:
                    text = seg.text.strip().lower()
                    if seg.no_speech_prob > 0.7 or seg.avg_logprob < -1.3:
                        continue
                    if any(h in text for h in HALLUCINATIONS):
                        continue
                    for w in seg.words or []:
                        if w.word.strip():
                            out.append((float(w.start), float(w.end), w.word.strip()))
                return out
            except Exception as e:  # noqa: BLE001
                log.warning("transcription impossible (%s)", e)
                return []


# --------------------------------------------------------------------------- calage du debut / de la fin sur la parole

_SENT_END = (".", "?", "!", "…")


def snap_start(words, t: float, lo: float, hi: float) -> float:
    """Debut de clip : au commencement d'une phrase (ou d'un mot) proche de t, jamais au milieu d'un mot."""
    best = None
    for i, (s, _e, _w) in enumerate(words):
        if s < lo or s > hi:
            continue
        prev = words[i - 1] if i else None
        gap = s - prev[1] if prev else 9.0
        strength = 2 if (gap >= 0.6 or (prev and prev[2].endswith(_SENT_END))) else 1 if gap >= 0.3 else 0
        key = (strength, -abs(s - t))
        if best is None or key > best[0]:
            cut = max(s - 0.15, (prev[1] + 0.03) if prev else s - 0.15)
            best = (key, cut)
    if best is not None:
        return max(lo, best[1])
    for s, e, _w in words:  # aucun debut de mot a portee : au moins ne pas couper un mot
        if s < t < e:
            return max(lo, s - 0.1)
    return t


def snap_end(words, t: float, lo: float, hi: float) -> float:
    """Fin de clip : apres la fin d'une phrase (ou d'un mot) proche de t."""
    best = None
    for i, (_s, e, w) in enumerate(words):
        if e < lo or e > hi:
            continue
        nxt = words[i + 1] if i + 1 < len(words) else None
        gap = nxt[0] - e if nxt else 9.0
        strength = 2 if (gap >= 0.6 or w.endswith(_SENT_END)) else 1 if gap >= 0.3 else 0
        key = (strength, -abs(e - t))
        if best is None or key > best[0]:
            cut = min(e + 0.3, (nxt[0] - 0.03) if nxt else e + 0.3)
            best = (key, max(cut, e))
    if best is not None:
        return min(hi, best[1])
    for s, e, _w in words:
        if s < t < e:
            return min(hi, e + 0.1)
    return t


# --------------------------------------------------------------------------- mise en page + sous-titres ASS

W, H = 1080, 1920


def even(x: float) -> int:
    return max(2, int(round(x / 2.0)) * 2)


@dataclass
class Geom:
    layout: str
    crop_w: int
    crop_x: int
    game_h: int
    game_y: int
    cam: tuple | None       # (x, y, w, h) dans la source
    cam_h: int
    cam_y: int
    cap_y: int              # centre vertical des sous-titres
    title_y: int            # haut du bandeau d'accroche
    credit_xy: tuple


def even_floor(x: float) -> int:
    return max(2, int(x) // 2 * 2)


def geometry(layout: str, src_w: int, src_h: int, zoom: float, facecam) -> Geom:
    stack = bool(layout == "stack" and facecam and len(facecam) == 4)
    if zoom <= 0:
        zoom = 0.75 if stack else 1.0
    zoom = clamp(zoom, 0.45, 1.0)
    cam_h, cam_y = 560, 330
    max_h = (H - (cam_y + cam_h) - 40) if stack else 1300
    full_w = even_floor(src_w)
    crop_w = even_floor(src_w * zoom)
    min_w = even_floor(W * src_h / max_h) + 2     # zoom maximal sans deformer l'image
    crop_w = int(clamp(crop_w, min(min_w, full_w), full_w))
    crop_x = (src_w - crop_w) // 2
    game_h = even(W * src_h / crop_w)
    if stack:
        fx, fy, fw, fh = (clamp(float(v), 0.0, 1.0) for v in facecam)
        cx, cy = int(src_w * fx), int(src_h * fy)
        cw = even_floor(min(src_w * fw, src_w - cx))
        ch = even_floor(min(src_h * fh, src_h - cy))
        cx, cy = min(cx, src_w - cw), min(cy, src_h - ch)
        game_y = cam_y + cam_h
        return Geom("stack", crop_w, crop_x, game_h, game_y, (cx, cy, cw, ch), cam_h, cam_y,
                    cap_y=game_y, title_y=150, credit_xy=(36, cam_y + 18))
    game_y = max(300, (H - game_h) // 2 - 90)
    cap_y = min(game_y + game_h + 130, 1470)
    return Geom("blur", crop_w, crop_x, game_h, game_y, None, 0, 0,
                cap_y=cap_y, title_y=max(170, game_y - 290), credit_xy=(36, game_y - 62))


def build_filter(g: Geom, fps: int, with_ass: bool, start: float, duration: float,
                 has_audio: bool, loudnorm: bool) -> tuple[str, str, str | None]:
    """Retourne (filtergraph, sortie video, sortie audio) pour un canevas 1080x1920.
    La decoupe se fait ici (trim) : exacte a l'image pres, meme si le flux a peu d'images-cles."""
    cut = f"trim=start={start:.3f}:duration={duration:.3f},setpts=PTS-STARTPTS,fps={fps},format=yuv420p"
    bg = ("scale=108:192:force_original_aspect_ratio=increase,crop=108:192,gblur=sigma=3,"
          "scale=1080:1920:flags=bilinear,lutyuv=y=16+(val-16)*0.55")
    game = f"crop={g.crop_w}:ih:{g.crop_x}:0,scale={W}:{g.game_h}"
    if g.layout == "stack":
        cx, cy, cw, ch = g.cam
        graph = (
            f"[0:v:0]{cut},split=3[a][b][c];"
            f"[a]{bg}[bg];"
            f"[b]crop={cw}:{ch}:{cx}:{cy},scale={W}:{g.cam_h}:force_original_aspect_ratio=increase,"
            f"crop={W}:{g.cam_h}[cam];"
            f"[c]{game}[game];"
            f"[bg][cam]overlay=0:{g.cam_y}[t1];[t1][game]overlay=0:{g.game_y}[v0]"
        )
    else:
        graph = (
            f"[0:v:0]{cut},split=2[a][b];"
            f"[a]{bg}[bg];"
            f"[b]{game}[game];"
            f"[bg][game]overlay=0:{g.game_y}[v0]"
        )
    vout = "[v0]"
    if with_ass:
        graph += ";[v0]ass=subs.ass[v]"
        vout = "[v]"
    aout = None
    if has_audio:
        graph += (f";[0:a:0]atrim=start={start:.3f}:duration={duration:.3f},asetpts=PTS-STARTPTS"
                  + (",loudnorm=I=-14:TP=-1.5:LRA=11" if loudnorm else "") + "[aout]")
        aout = "[aout]"
    return graph, vout, aout


def ass_time(t: float) -> str:
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def ass_escape(s: str) -> str:
    return s.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ").replace("\r", " ")


def ass_color(hex_color: str, default: str = "&H00FFFFFF") -> str:
    m = re.fullmatch(r"#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})", str(hex_color).strip())
    if not m:
        return default
    r, g, b = m.groups()
    return f"&H00{b}{g}{r}".upper()


def strip_emoji(s: str) -> str:
    """Les polices de sous-titres n'affichent pas les emojis : on les retire du texte incruste."""
    return re.sub(r"\s{2,}", " ", "".join(ch for ch in s if ord(ch) < 0x2190 or 0x2C00 <= ord(ch) < 0xD800)).strip()


def wrap_title(text: str, width: int = 22, max_lines: int = 3) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        if cur and len(cur) + 1 + len(word) > width:
            lines.append(cur)
            cur = word
        else:
            cur = (cur + " " + word).strip()
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1][: width - 1].rstrip() + "…"
    return lines


def make_chunks(words, per_line: int, max_chars: int = 16, max_gap: float = 0.7):
    """Regroupe les mots en petits blocs affiches ensemble : [[(debut, fin, mot), ...], ...]."""
    groups, cur = [], []
    for s, e, w in words:
        w = w.strip()
        if not w:
            continue
        if cur:
            length = sum(len(x[2]) for x in cur) + len(cur) + len(w)
            if (len(cur) >= per_line or length > max_chars or s - cur[-1][1] > max_gap
                    or cur[-1][2].endswith(_SENT_END)):
                groups.append(cur)
                cur = []
        cur.append((s, e, w))
    if cur:
        groups.append(cur)
    return groups


def write_ass(path: Path, g: Geom, words, title: str, credit: str, duration: float, sub: dict) -> int:
    """Ecrit le fichier de sous-titres. Retourne le nombre de lignes affichees."""
    font = ass_escape(str(sub["font"])).replace(",", " ")
    size = int(sub["size"])
    col = ass_color(sub["color"])
    hi = ass_color(sub["highlight_color"], "&H0000E6FF")
    upper = bool(sub["uppercase"])
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}",
        "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Cap,{font},{size},{col},&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,8,3,5,40,40,40,1",
        "Style: Title,Arial,60,&H00101010,&H000000FF,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,3,14,0,8,40,40,40,1",
        "Style: Credit,Arial,38,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,4,1,7,20,20,20,1",
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    n = 0
    end = ass_time(duration)
    if credit:
        x, y = g.credit_xy
        lines.append(f"Dialogue: 0,{ass_time(0)},{end},Credit,,0,0,0,,{{\\pos({x},{y})}}{ass_escape(credit)}")
        n += 1
    title = strip_emoji(title or "")
    if title:
        y = g.title_y
        for ln in wrap_title(title.upper() if upper else title):
            lines.append(f"Dialogue: 2,{ass_time(0)},{end},Title,,0,0,0,,{{\\pos({W // 2},{y})}}{ass_escape(ln)}")
            y += 92
            n += 1
    chunks = make_chunks(words, int(sub["words_per_line"]))
    pos = f"\\an5\\pos({W // 2},{g.cap_y})"
    for ci, ch in enumerate(chunks):
        c_start = ch[0][0]
        c_end = max(ch[-1][1], c_start + 0.35) + 0.2
        if ci + 1 < len(chunks):
            c_end = min(c_end, chunks[ci + 1][0][0])
        c_end = min(max(c_end, c_start + 0.2), duration)
        texts = [ass_escape((w.upper() if upper else w).rstrip(".,;:") or w) for _s, _e, w in ch]
        total = sum(len(t) for t in texts) + len(texts) - 1
        fit = f"\\fscx{int(100 * 17 / total)}\\fscy{int(100 * 17 / total)}" if total > 17 else ""
        if not sub["highlight"]:
            lines.append(f"Dialogue: 1,{ass_time(c_start)},{ass_time(c_end)},Cap,,0,0,0,,{{{pos}{fit}}}{' '.join(texts)}")
            n += 1
            continue
        for wi, (s, _e, _w) in enumerate(ch):
            w_start = c_start if wi == 0 else s
            w_end = ch[wi + 1][0] if wi + 1 < len(ch) else c_end
            if w_end - w_start < 0.02:
                continue
            parts = [f"{{\\c{hi}&}}{t}{{\\c{col}&}}" if j == wi else t for j, t in enumerate(texts)]
            pop = "\\fad(40,0)" if wi == 0 else ""
            lines.append(f"Dialogue: 1,{ass_time(w_start)},{ass_time(w_end)},Cap,,0,0,0,,"
                         f"{{{pos}{fit}{pop}}}{' '.join(parts)}")
            n += 1
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return n

# --------------------------------------------------------------------------- IA (optionnelle) : note, accroche, titre

AI_SYSTEM = """Tu es monteur de clips courts (TikTok, Reels, Shorts) tirés de lives Twitch. On te montre un moment détecté automatiquement : des images dans l'ordre chronologique, ce qui est dit (transcription horodatée) et les réactions du chat. Tu juges si ce moment mérite d'être publié et tu rédiges ses textes.

Règles :
- Décris uniquement ce que tu vois et ce que tu lis. N'invente ni action ni citation.
- accroche : le texte incrusté en haut de la vidéo. 38 caractères maximum, percutante, sans emoji ni hashtag. Elle donne envie de regarder sans mentir sur ce qui se passe.
- titre : la légende de publication. 90 caractères maximum, 1 ou 2 emojis possibles, sans hashtag.
- hashtags : 3 à 5, en minuscules, sans espace, liés au jeu et au moment.
- note de 0 à 10 : le potentiel réel du clip auprès de gens qui ne connaissent pas le streamer. 10 = moment exceptionnel, 5 = correct, 2 = il ne se passe rien de lisible. Sois sévère : la plupart des moments valent entre 3 et 6.
- debut et fin : si le clip gagne à être raccourci, indique en secondes depuis le début du clip où il devrait commencer et finir. Mets 0 pour ne rien couper. Ne coupe jamais l'action ni la réaction qui la suit.
- sensible : true si le clip contient des propos haineux ou discriminatoires, du harcèlement, de la nudité, ou une situation humiliante ou dangereuse pour une personne réelle. La violence du jeu vidéo lui-même n'est pas sensible.
- Pas de moquerie blessante envers le streamer, ni d'affirmation invérifiable à son sujet.
- Écris les textes dans la langue demandée."""

AI_TOOL = {
    "name": "fiche_clip",
    "description": "Enregistre l'évaluation du clip et ses textes de publication.",
    "input_schema": {
        "type": "object",
        "properties": {
            "note": {"type": "integer", "description": "Potentiel du clip, de 0 à 10."},
            "resume": {"type": "string", "description": "Une phrase : ce qui se passe réellement dans le clip."},
            "accroche": {"type": "string", "description": "Texte incrusté en haut de la vidéo, 38 caractères maximum, sans emoji."},
            "titre": {"type": "string", "description": "Légende de publication, 90 caractères maximum."},
            "hashtags": {"type": "array", "items": {"type": "string"}, "description": "3 à 5 hashtags."},
            "debut": {"type": "number", "description": "Seconde où le clip devrait commencer (0 = ne rien couper)."},
            "fin": {"type": "number", "description": "Seconde où le clip devrait finir (0 = ne rien couper)."},
            "sensible": {"type": "boolean", "description": "true si le contenu ne doit pas être publié automatiquement."},
        },
        "required": ["note", "resume", "accroche", "titre", "hashtags", "sensible"],
    },
}
AI_JSON_HINT = ("\n\nRéponds uniquement par un objet JSON, sans texte autour, avec les clés : note (entier 0-10), "
                "resume, accroche, titre, hashtags (liste), debut (nombre), fin (nombre), sensible (true/false).")
LANG_NAMES = {"fr": "français", "en": "anglais", "es": "espagnol", "de": "allemand", "it": "italien",
              "pt": "portugais", "ar": "arabe"}


def clean_hashtags(tags, limit: int = 8) -> list[str]:
    out, seen = [], set()
    for t in tags or []:
        t = "#" + re.sub(r"[^0-9A-Za-zÀ-ÖØ-öø-ÿ_]", "", str(t).lstrip("#"))
        if len(t) < 3 or t.lower() in seen:
            continue
        seen.add(t.lower())
        out.append(t)
        if len(out) >= limit:
            break
    return out


def extract_json(text: str):
    a, b = text.find("{"), text.rfind("}")
    if a < 0 or b <= a:
        return None
    try:
        return json.loads(text[a:b + 1])
    except ValueError:
        return None


def clean_ai(d: dict) -> dict | None:
    def num(key, default=0.0):
        try:
            return float(d.get(key, default) or 0.0)
        except (TypeError, ValueError):
            return default

    def txt(key, limit):
        return re.sub(r"\s+", " ", str(d.get(key) or "")).strip()[:limit]

    if "note" not in d:
        return None
    hook = strip_emoji(txt("accroche", 60)).strip(" .\"'«»")
    if len(hook) > 44:
        hook = hook[:44].rsplit(" ", 1)[0]
    return {
        "note": int(clamp(round(num("note")), 0, 10)),
        "resume": txt("resume", 300),
        "accroche": hook,
        "titre": txt("titre", 100),
        "hashtags": [h.lower() for h in clean_hashtags(d.get("hashtags") if isinstance(d.get("hashtags"), list) else [], 5)],
        "debut": max(0.0, num("debut")),
        "fin": max(0.0, num("fin")),
        "sensible": bool(d.get("sensible")),
    }


class AIClient:
    API_URL = "https://api.anthropic.com/v1/messages"

    def __init__(self, cfg: dict):
        a = cfg["ai"]
        self.key = (a["api_key"] or os.environ.get("ANTHROPIC_API_KEY", "")).strip()
        self.enabled = bool(a["enabled"]) and bool(self.key)
        if a["enabled"] and not self.key:
            log.warning("IA activee mais aucune cle API ([ai] api_key) : l'IA reste eteinte")
        self.model = str(a["model"])
        self.url = a["api_url"] or self.API_URL
        self.frames = int(clamp(int(a["frames"]), 0, 12))
        self.max_per_hour = int(a["max_calls_per_hour"])
        self.calls: collections.deque[float] = collections.deque()
        self.lock = threading.Lock()
        self.use_tool = True
        self.n_calls = self.tok_in = self.tok_out = 0

    def _allow(self) -> bool:
        now = time.time()
        with self.lock:
            while self.calls and now - self.calls[0] > 3600:
                self.calls.popleft()
            if len(self.calls) >= self.max_per_hour:
                return False
            self.calls.append(now)
            return True

    def _post(self, body: dict, timeout: float = 90.0):
        return http_call("POST", self.url, body=body, timeout=timeout, headers={
            "x-api-key": self.key, "anthropic-version": "2023-06-01", "content-type": "application/json"})

    def ping(self) -> tuple[bool, str]:
        try:
            code, _h, payload = self._post({"model": self.model, "max_tokens": 64,
                                            "messages": [{"role": "user", "content": "Réponds : ok"}]}, 40)
        except NetError as e:
            return False, f"reseau : {e}"
        if code == 200:
            return True, self.model
        err = (as_json(payload) or {}).get("error") or {}
        return False, f"{code} {err.get('message', '')}"[:160]

    def analyse(self, prompt: str, frames: list[tuple[float, bytes]]) -> dict | None:
        """Retourne la fiche du clip, {'refus': True} si le modele refuse, ou None si l'IA est indisponible."""
        if not self.enabled:
            return None
        if not self._allow():
            log.warning("IA : plafond de %d appels/heure atteint, clip traite sans IA", self.max_per_hour)
            return None
        images: list[dict] = []
        for t, jpg in frames:
            images.append({"type": "text", "text": f"Image à t = {t:.1f} s :"})
            images.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                       "data": base64.b64encode(jpg).decode("ascii")}})
        data = None
        for attempt in range(3):
            tool = self.use_tool
            body = {"model": self.model, "max_tokens": 1500 if tool else 6000, "system": AI_SYSTEM,
                    "messages": [{"role": "user", "content": images + [
                        {"type": "text", "text": prompt + ("" if tool else AI_JSON_HINT)}]}]}
            if tool:
                body["tools"] = [AI_TOOL]
                body["tool_choice"] = {"type": "tool", "name": AI_TOOL["name"]}
            try:
                code, _h, payload = self._post(body)
            except NetError as e:
                log.warning("IA : reseau (%s)", e)
                return None
            parsed = as_json(payload)
            if code == 200 and isinstance(parsed, dict):
                data = parsed
                break
            msg = ""
            if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
                msg = str(parsed["error"].get("message", ""))[:200]
            if code == 400 and tool:
                log.warning("IA : format 'outil' refuse (%s), passage en JSON simple", msg)
                self.use_tool = False
                continue
            if code in (401, 403):
                log.error("IA : cle API refusee (%s %s). IA desactivee pour cette session.", code, msg)
                self.enabled = False
                return None
            if code in (429, 500, 502, 503, 529) and attempt < 2:
                time.sleep(4 * (attempt + 1))
                continue
            log.warning("IA : erreur %s %s", code, msg)
            return None
        if data is None:
            return None
        usage = data.get("usage") or {}
        with self.lock:
            self.n_calls += 1
            self.tok_in += int(usage.get("input_tokens") or 0)
            self.tok_out += int(usage.get("output_tokens") or 0)
        if data.get("stop_reason") == "refusal":
            return {"refus": True}
        out, text = None, ""
        for block in data.get("content") or []:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use" and isinstance(block.get("input"), dict):
                out = block["input"]
            elif block.get("type") == "text":
                text += str(block.get("text") or "")
        if out is None and text:
            out = extract_json(text)
        if not isinstance(out, dict):
            log.warning("IA : reponse illisible (fin : %s)", data.get("stop_reason"))
            return None
        return clean_ai(out)

    def usage_line(self) -> str:
        return f"IA {self.n_calls} appels, {self.tok_in + self.tok_out} tokens" if self.n_calls else ""


def ai_prompt(ev: ClipEvent, duration: float, t_on_rel: float, words, frame_times, lang: str) -> str:
    lines = [
        f"Streamer : {ev.display or ev.channel}",
        f"Jeu : {ev.category or 'inconnu'}",
        f"Titre du live : {ev.stream_title or 'inconnu'}",
        f"Langue des textes : {LANG_NAMES.get(lang, 'la langue parlée dans le clip')}",
        f"Durée du clip : {duration:.0f} s. Le chat réagit à partir de {max(0.0, t_on_rel):.0f} s "
        f"(activité x{ev.ratio:.1f}, {ev.uniq} personnes, ambiance : {ev.mood}).",
    ]
    if ev.top_chat:
        lines.append("Messages les plus répétés dans le chat : "
                     + ", ".join(f'"{t}" (x{n})' for t, n in ev.top_chat[:6]))
    lines.append("Transcription :")
    if words:
        cur, start = [], None
        for s, e, w in words:
            if start is None:
                start = s
            cur.append(w)
            if e - start > 3.0 or w.endswith(_SENT_END):
                lines.append(f"[{start:.1f}s] " + " ".join(cur))
                cur, start = [], None
        if cur:
            lines.append(f"[{start:.1f}s] " + " ".join(cur))
    else:
        lines.append("(aucune parole détectée)")
    if frame_times:
        lines.append(f"{len(frame_times)} images jointes, prises à : " + ", ".join(f"{t:.1f}s" for t in frame_times))
    return "\n".join(lines)

# --------------------------------------------------------------------------- rendu

def has_nvenc() -> bool:
    try:
        r = sh([ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                "color=c=black:s=256x256:d=0.2", "-c:v", "h264_nvenc", "-f", "null", "-"], timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return r.returncode == 0


def probe_video(path: Path) -> tuple[int, int, float, bool]:
    """(largeur, hauteur, images/s, presence d'une piste son) lus dans la sortie de ffmpeg -i."""
    try:
        r = sh([ffmpeg_bin(), "-hide_banner", "-i", str(path)], timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return 1920, 1080, 60.0, True
    w, h, fps, seen = 1920, 1080, 60.0, False
    for line in r.stderr.splitlines():
        if "Video:" not in line or seen:
            continue
        seen = True
        m = re.search(r"\b(\d{3,5})x(\d{3,5})\b", line.split("Video:", 1)[1])
        if m:
            w, h = int(m.group(1)), int(m.group(2))
        f = re.search(r"(\d+(?:\.\d+)?) fps", line) or re.search(r"(\d+(?:\.\d+)?) tbr", line)
        if f:
            fps = float(f.group(1))
    return w, h, fps, "Audio:" in r.stderr


def heuristic_title(display: str, mood: str, words, focus: float) -> str:
    """Titre de secours sans IA : la phrase prononcee la plus proche du moment fort."""
    emoji = {"drole": "😂", "hype": "🔥", "choc": "😱"}.get(mood, "🎮")
    sents, cur = [], []
    for s, e, w in words:
        cur.append((s, e, w))
        if w.endswith(_SENT_END) or len(cur) >= 12:
            sents.append(cur)
            cur = []
    if cur:
        sents.append(cur)
    best = None
    for sn in sents:
        text = " ".join(w for _s, _e, w in sn).strip()
        if 12 <= len(text) <= 70:
            d = abs((sn[0][0] + sn[-1][1]) / 2.0 - focus)
            if best is None or d < best[0]:
                best = (d, text)
    if best:
        return f"{display} : « {best[1].rstrip('.')} » {emoji}"
    label = {"drole": "le chat explose de rire", "hype": "moment de folie",
             "choc": "personne ne s'y attendait"}.get(mood, "le moment du live")
    return f"{display} : {label} {emoji}"


def safe_format(template: str, vals: dict) -> str:
    try:
        return template.format_map(collections.defaultdict(str, vals))
    except (ValueError, IndexError, KeyError):
        return f"{vals.get('titre', '')} {vals.get('hashtags', '')}"


class ClipStore:
    """Journal des clips produits (clips.jsonl) : sert a la galerie et a la publication."""

    def __init__(self, out_dir: Path):
        self.path = out_dir / "clips.jsonl"
        self.lock = threading.Lock()

    def add(self, rec: dict) -> None:
        with self.lock:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    def load(self, limit: int = 800) -> list[dict]:
        with self.lock:
            if not self.path.exists():
                return []
            lines = self.path.read_text(encoding="utf-8", errors="replace").splitlines()[-limit:]
        out = []
        for ln in lines:
            try:
                d = json.loads(ln)
            except ValueError:
                continue
            if isinstance(d, dict) and d.get("id"):
                out.append(d)
        return out


@dataclass
class Job:
    ev: ClipEvent
    dir: Path
    src: Path
    src_t0: float      # heure d'arrivee du debut de src
    a: float           # debut voulu, en secondes dans src
    b: float
    lo: float          # bornes disponibles pour caler le debut / la fin
    hi: float


class Renderer:
    def __init__(self, cfg: dict, chan_cfgs: dict, transcriber: Transcriber, ai: AIClient,
                 recorders: dict, meters: dict, store: ClipStore, on_clip=None):
        self.cfg, self.cc, self.tr, self.ai = cfg, chan_cfgs, transcriber, ai
        self.recorders, self.meters, self.store, self.on_clip = recorders, meters, store, on_clip
        mode = str(cfg["encode"]["nvenc"]).lower()
        self.nvenc = has_nvenc() if mode == "auto" else mode in ("on", "true", "1")
        log.info("encodage video : %s", "NVENC (GPU)" if self.nvenc else "x264 (CPU)")
        self.out_dir = Path(cfg["general"]["output_dir"])
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.work = Path(cfg["general"]["buffer_dir"]).resolve() / "_work"
        shutil.rmtree(self.work, ignore_errors=True)
        self.work.mkdir(parents=True, exist_ok=True)
        self.csv_lock = threading.Lock()
        self.rejected = 0

    # ----- 1) figer la matiere premiere des que le moment est entierement enregistre
    def prepare(self, ev: ClipEvent) -> Job | None:
        c = self.cc[ev.channel]
        rec = self.recorders[ev.channel]
        a, b = ev.t_start, ev.t_end
        meter = self.meters.get(ev.channel)
        if meter is not None and self.cfg["clip"]["audio_anchor"]:
            t_pk, z = meter.peak(ev.t_on - 12.0, ev.t_on + 1.5)
            ev.audio_z = max(0.0, z)
            if z >= 2.0:  # pic sonore net juste avant la reaction du chat : c'est l'action
                ev.anchor = t_pk
                a = clamp(t_pk - c.lead, ev.t_on - 28.0, ev.t_on - 6.0)
                b = min(max(b, a + c.min_len), a + c.max_len)
        snap = bool(self.cfg["clip"]["snap"]) and self.tr.enabled and not self.tr.failed
        pad = 3.5 if snap else 0.5
        sel = [s for s in rec.timeline() if s.end > a - pad and s.start < b + pad]
        runs, cur = [], []
        for s in sel:  # ne jamais enjamber une coupure du flux (pub, reconnexion)
            if s.stall:
                if cur:
                    runs.append(cur)
                cur = []
                continue
            if s.fresh and cur:
                runs.append(cur)
                cur = []
            cur.append(s)
        if cur:
            runs.append(cur)
        core = next((r for r in runs if r[0].start <= ev.t_on - 4.0 and r[-1].end >= ev.t_peak + 1.0), None)
        if core is None:
            log.warning("[%s] clip abandonne : video absente du tampon ou coupure du flux", ev.channel)
            return None
        t0, t1 = core[0].start, core[-1].end
        a, b = max(a, t0 + 0.1), min(b, t1 - 0.1)
        if b - a < min(c.min_len, 8.0):
            log.warning("[%s] clip abandonne : trop court (%.0f s)", ev.channel, b - a)
            return None
        d = self.work / f"{ev.channel}_{int(ev.t0)}_{random.randint(1000, 9999)}"
        d.mkdir(parents=True, exist_ok=True)
        src = d / "src.ts"
        try:
            with open(src, "wb") as out:
                for s in core:
                    with open(s.path, "rb") as f:
                        shutil.copyfileobj(f, out, 1 << 20)
        except OSError as e:
            log.warning("[%s] clip abandonne : lecture du tampon impossible (%s)", ev.channel, e)
            shutil.rmtree(d, ignore_errors=True)
            return None
        ev.score = base_score(ev.ratio, ev.uniq, ev.hype_share, ev.audio_z)
        return Job(ev, d, src, t0, a - t0, b - t0, max(0.0, a - pad - t0), min(t1 - t0, b + pad - t0))

    # ----- 2) fabriquer le clip
    def render(self, job: Job) -> dict | None:
        try:
            return self._render(job)
        finally:
            shutil.rmtree(job.dir, ignore_errors=True)

    def _frames(self, job: Job, start: float, duration: float, n: int) -> list[tuple[float, bytes]]:
        """n images reparties sur le clip (une seule passe de decodage), pour l'IA."""
        if n <= 0:
            return []
        vf = (f"trim=start={start:.3f}:duration={duration:.3f},setpts=PTS-STARTPTS,"
              f"fps={n / duration:.5f},scale=640:-2")
        try:
            subprocess.run([ffmpeg_bin(), "-v", "error", "-i", str(job.src), "-an", "-vf", vf, "-frames:v", str(n),
                            "-q:v", "6", str(job.dir / "f_%02d.jpg")], capture_output=True, timeout=120)
        except (OSError, subprocess.TimeoutExpired):
            return []
        out = []
        for i in range(n):
            f = job.dir / f"f_{i + 1:02d}.jpg"
            try:
                data = f.read_bytes()
            except OSError:
                continue
            if len(data) > 2000:
                out.append((i * duration / n, data))
        return out

    def _encode_args(self, fps: int, nvenc: bool) -> list[str]:
        cq = str(int(self.cfg["encode"]["cq"]))
        if nvenc:
            v = ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", cq, "-b:v", "0",
                 "-maxrate", "14M", "-bufsize", "28M"]
        else:
            v = ["-c:v", "libx264", "-preset", "veryfast", "-crf", cq]
        a = ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]
        return v + ["-pix_fmt", "yuv420p", "-g", str(fps * 2)] + a + ["-movflags", "+faststart"]

    def _render(self, job: Job) -> dict | None:
        ev, src = job.ev, job.src
        c = self.cc[ev.channel]
        sub = self.cfg["subtitles"]
        src_w, src_h, src_fps, has_audio = probe_video(src)
        on_rel = ev.t_on - job.src_t0          # debut de la reaction du chat, dans src
        peak_rel = ev.t_peak - job.src_t0

        # paroles (sur une plage un peu plus large, pour pouvoir caler le debut et la fin)
        words: list[tuple[float, float, str]] = []
        if self.tr.enabled and not self.tr.failed:
            wav = job.dir / "a.wav"
            r = sh([ffmpeg_bin(), "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{job.lo:.3f}",
                    "-i", str(src), "-t", f"{job.hi - job.lo:.3f}", "-vn", "-ac", "1", "-ar", "16000", str(wav)])
            if r.returncode == 0:
                words = [(s + job.lo, e + job.lo, w) for s, e, w in self.tr.words(str(wav), c.language)]
        a, b = job.a, job.b
        if words and self.cfg["clip"]["snap"]:
            a = snap_start(words, a, max(job.lo, a - 3.0), min(a + 2.5, on_rel - 3.0))
            b = snap_end(words, b, max(b - 2.0, peak_rel + 2.0), min(job.hi, b + 3.0))
        a, b = max(0.0, a), max(b, a + 5.0)

        # IA : note, accroche, titre, recadrage dans le temps
        ai, lang = None, c.language or ""
        if self.ai.enabled:
            frames = self._frames(job, a, b - a, self.ai.frames)
            clip_words = [(s - a, e - a, w) for s, e, w in words if s >= a and e <= b]
            ai = self.ai.analyse(ai_prompt(ev, b - a, on_rel - a, clip_words, [t for t, _ in frames], lang), frames)
        refused = bool(ai and ai.get("refus"))
        if refused:
            ai = None
        if ai and self.cfg["ai"]["trim"]:
            dur = b - a
            na, nb = a, b
            if 0.5 < ai["debut"] <= 0.45 * dur and a + ai["debut"] <= on_rel - 2.0:
                na = a + ai["debut"]
            if ai["fin"] and ai["fin"] < dur - 0.5 and a + ai["fin"] >= peak_rel + 2.0:
                nb = a + ai["fin"]
            if nb - na >= min(c.min_len, 10.0):
                if words:
                    na = snap_start(words, na, max(job.lo, na - 0.8), na + 0.8) if na != a else na
                    nb = snap_end(words, nb, nb - 0.8, min(job.hi, nb + 0.8)) if nb != b else nb
                a, b = na, nb
        duration = b - a
        clip_words = [(s - a, e - a, w) for s, e, w in words if s >= a - 0.05 and e <= b + 0.05]

        base = base_score(ev.ratio, ev.uniq, ev.hype_share, ev.audio_z)
        note = ai["note"] if ai else None
        score = int(round(0.5 * base + 5.0 * note)) if note is not None else base
        stamp = dt.datetime.fromtimestamp(job.src_t0 + a).strftime("%Y%m%d_%H%M%S")
        min_note = int(self.cfg["ai"]["min_note"])
        if note is not None and min_note > 0 and note < min_note:
            self.rejected += 1
            log.info("[%s] clip ecarte par l'IA (note %d/10 : %s)", ev.channel, note, ai["resume"][:90])
            self._csv([stamp, ev.channel, score, f"{ev.ratio:.2f}", ev.uniq, f"{duration:.0f}", "ecarte_ia", ai["resume"]])
            return None

        display = c.display or ev.display or ev.channel
        title = (ai["titre"] if ai and ai["titre"] else "") or heuristic_title(display, ev.mood, clip_words, on_rel - a)
        hook = ai["accroche"] if (ai and self.cfg["ai"]["title_overlay"]) else ""
        hashtags = clean_hashtags(list(c.hashtags) + (ai["hashtags"] if ai else []))
        credit = safe_format(c.credit, {"channel": ev.channel, "streamer": display}) if c.credit else ""

        layout = c.layout
        if layout == "stack" and not (c.facecam and len(c.facecam) == 4):
            log.warning("[%s] layout 'stack' sans facecam configuree : bascule sur 'blur'", ev.channel)
            layout = "blur"
        geom = geometry(layout, src_w, src_h, c.zoom, c.facecam)
        fps = c.fps
        if not isinstance(fps, (int, float)) or isinstance(fps, bool) or fps <= 0:
            fps = min(60, int(round(src_fps))) if 20 <= src_fps <= 130 else 30
        fps = int(fps)
        n_lines = write_ass(job.dir / "subs.ass", geom, clip_words if sub["enabled"] else [], hook, credit, duration, sub)
        graph, vout, aout = build_filter(geom, fps, n_lines > 0, a, duration, has_audio,
                                         bool(self.cfg["clip"]["loudnorm"]))

        out_dir = self.out_dir / ev.channel
        out_dir.mkdir(parents=True, exist_ok=True)
        final = out_dir / f"{stamp}_{ev.channel}_s{score:02d}.mp4"
        part = out_dir / (final.stem + ".part.mp4")
        base_cmd = [ffmpeg_bin(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
                    "-filter_complex", graph, "-map", vout] + (["-map", aout] if aout else [])
        r = sh(base_cmd + self._encode_args(fps, self.nvenc) + [str(part.resolve())], cwd=str(job.dir))
        ok = r.returncode == 0 and part.exists() and part.stat().st_size > 50_000
        if not ok and self.nvenc:
            log.warning("encodage GPU en echec (%s) : bascule sur x264", (r.stderr or "").strip()[-160:])
            self.nvenc = False
            r = sh(base_cmd + self._encode_args(fps, False) + [str(part.resolve())], cwd=str(job.dir))
            ok = r.returncode == 0 and part.exists() and part.stat().st_size > 50_000
        if not ok:
            log.error("[%s] echec du rendu : %s", ev.channel, (r.stderr or "").strip()[-400:])
            part.unlink(missing_ok=True)
            return None
        os.replace(part, final)

        vals = {"titre": title, "hashtags": " ".join(hashtags), "credit": credit, "streamer": display,
                "channel": ev.channel, "jeu": ev.category}
        caption = safe_format(str(self.cfg["post"]["caption"]), vals).strip()
        focus = (ev.anchor - job.src_t0 - a) if ev.anchor else (on_rel - a - 2.0)
        rec = {
            "id": f"{ev.channel}/{final.name}", "file": str(final), "channel": ev.channel, "display": display,
            "made": time.time(), "start": job.src_t0 + a, "duration": round(duration, 1),
            "score": score, "base_score": base, "ai_note": note, "ai_refus": refused,
            "sensible": bool(refused or (ai and ai["sensible"])),
            "ratio": round(ev.ratio, 2), "rate": round(ev.rate, 1), "uniq": ev.uniq,
            "hype_share": round(ev.hype_share, 2), "mood": ev.mood, "audio_z": round(ev.audio_z, 1),
            "category": ev.category, "stream_title": ev.stream_title,
            "title": title, "hook": hook, "summary": ai["resume"] if ai else "",
            "hashtags": hashtags, "credit": credit, "caption": caption, "lang": lang,
            "transcript": " ".join(w for _s, _e, w in clip_words)[:1500],
            "top_chat": ev.top_chat[:6], "cover_ms": int(clamp(focus, 0.5, max(0.6, duration - 0.5)) * 1000),
            "layout": geom.layout, "fps": fps,
        }
        try:
            (final.with_suffix(".txt")).write_text(self._sidecar(rec), encoding="utf-8")
        except OSError:
            pass
        self.store.add(rec)
        self._csv([stamp, ev.channel, score, f"{ev.ratio:.2f}", ev.uniq, f"{duration:.0f}", str(final), title])
        log.info("[%s] CLIP PRET : %s  (note %d%s, %.0f s, %d mots) %s", ev.channel, final.name, score,
                 f", IA {note}/10" if note is not None else "", duration, len(clip_words), title)
        if self.on_clip:
            try:
                self.on_clip(rec)
            except Exception as e:  # noqa: BLE001
                log.debug("on_clip : %s", e)
        return rec

    @staticmethod
    def _sidecar(rec: dict) -> str:
        lines = [
            rec["caption"], "",
            "----------------------------------------",
            f"Titre      : {rec['title']}",
            f"Hashtags   : {' '.join(rec['hashtags'])}",
            f"Credit     : {rec['credit']}",
            f"Note       : {rec['score']}/100" + (f"  (IA {rec['ai_note']}/10)" if rec["ai_note"] is not None else ""),
            f"Chat       : x{rec['ratio']} ({rec['uniq']} personnes, ambiance {rec['mood']})",
        ]
        if rec["summary"]:
            lines.append(f"Resume IA  : {rec['summary']}")
        if rec["sensible"]:
            lines.append("ATTENTION  : contenu signale comme sensible, a verifier avant publication")
        if rec["transcript"]:
            lines += ["", "Paroles :", rec["transcript"]]
        return "\n".join(lines) + "\n"

    def _csv(self, row: list) -> None:
        with self.csv_lock:
            p = self.out_dir / "clips_log.csv"
            new = not p.exists()
            try:
                with open(p, "a", newline="", encoding="utf-8-sig") as f:
                    w = csv.writer(f, delimiter=";")
                    if new:
                        w.writerow(["heure", "streamer", "note", "chat_x", "personnes", "duree_s", "fichier", "titre"])
                    w.writerow(row)
            except OSError:
                pass


class Scheduler(threading.Thread):
    """Attend que la fin du clip soit enregistree, fige la video, puis sert les meilleurs clips d'abord."""

    def __init__(self, renderer: Renderer, workers: int, seg_len: float):
        super().__init__(daemon=True, name="scheduler")
        self.renderer, self.seg_len = renderer, seg_len
        self.pending: list[tuple[float, ClipEvent]] = []
        self.lock = threading.Lock()
        self.q: queue.PriorityQueue = queue.PriorityQueue()
        self.seq = 0
        self.workers = [threading.Thread(target=self._work, daemon=True, name=f"render-{i}")
                        for i in range(max(1, workers))]

    def start(self) -> None:  # type: ignore[override]
        super().start()
        for w in self.workers:
            w.start()

    def add(self, ev: ClipEvent) -> None:
        with self.lock:
            self.pending.append((ev.t_end + 3.5 + self.seg_len + 2.0, ev))

    def run(self) -> None:
        while not STOP.is_set():
            now = time.time()
            with self.lock:
                due = [e for t, e in self.pending if t <= now]
                self.pending = [(t, e) for t, e in self.pending if t > now]
            for ev in due:
                if self.q.qsize() > 40 and ev.score < 50:
                    log.warning("file de rendu saturee : clip moyen ignore (%s)", ev.channel)
                    continue
                try:
                    job = self.renderer.prepare(ev)
                except Exception as e:  # noqa: BLE001
                    log.exception("preparation : %s", e)
                    continue
                if job:
                    self.seq += 1
                    self.q.put((-job.ev.score, self.seq, job))
            STOP.wait(0.5)

    def _work(self) -> None:
        while not STOP.is_set():
            try:
                _prio, _seq, job = self.q.get(timeout=1)
            except queue.Empty:
                continue
            try:
                self.renderer.render(job)
            except Exception as e:  # noqa: BLE001
                log.exception("rendu : %s", e)

# --------------------------------------------------------------------------- galerie de tri (clips/index.html)

GALLERY_HTML = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clips</title>
<style>
:root{color-scheme:dark;--bg:#0f1115;--card:#181b22;--line:#2a2f3a;--txt:#e8eaf0;--mut:#9aa3b2;--acc:#ffe600}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.45 system-ui,Segoe UI,Arial,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
h1{font-size:18px;margin:0 8px 0 0}select,button{background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;cursor:pointer}
#count{color:var(--mut);margin-left:auto}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
video{width:100%;aspect-ratio:9/16;background:#000;display:block}
.body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px}
.top{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.score{font-weight:700;background:var(--acc);color:#111;border-radius:6px;padding:1px 7px}
.tag{border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--mut);font-size:12px}
.warn{border-color:#ff5d5d;color:#ff8d8d}
.title{font-weight:600}.meta{color:var(--mut);font-size:12px}
textarea{width:100%;min-height:74px;background:#10131a;color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:8px;font:13px/1.4 system-ui,Segoe UI,Arial,sans-serif;resize:vertical}
.row{display:flex;gap:8px;flex-wrap:wrap}a{color:#8fc1ff}
.more{grid-column:1/-1;text-align:center}
</style></head><body>
<header><h1>Clips</h1>
<select id="ch" aria-label="Streamer"></select>
<select id="sort" aria-label="Tri"><option value="score">Meilleure note</option><option value="date">Plus récents</option></select>
<select id="day" aria-label="Période"><option value="1">24 dernières heures</option><option value="3">3 jours</option><option value="0">Tout</option></select>
<span id="count"></span></header>
<main id="grid"></main>
<script>
const CLIPS = __CLIPS__;
const PUBS = __PUBS__;
const GEN = __GEN__;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let shown = 40;
function copyText(text, btn) {
  const done = () => { const old = btn.textContent; btn.textContent = "Copié"; setTimeout(() => { btn.textContent = old; }, 1200); };
  const fallback = () => { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) {} t.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); } else { fallback(); }
}
function card(c) {
  const box = el("div", "card");
  const v = el("video"); v.controls = true; v.preload = "none"; v.src = encodeURI(c.id); box.appendChild(v);
  const body = el("div", "body");
  const top = el("div", "top");
  top.appendChild(el("span", "score", String(c.score)));
  top.appendChild(el("span", "tag", c.display || c.channel));
  top.appendChild(el("span", "tag", c.mood));
  if (c.ai_note !== null && c.ai_note !== undefined) top.appendChild(el("span", "tag", "IA " + c.ai_note + "/10"));
  if (c.sensible) top.appendChild(el("span", "tag warn", "à vérifier"));
  body.appendChild(top);
  body.appendChild(el("div", "title", c.title));
  const d = new Date(c.start * 1000);
  body.appendChild(el("div", "meta", d.toLocaleString("fr-FR") + " · " + Math.round(c.duration) + " s · chat x" + c.ratio + " · " + c.uniq + " pers."));
  if (c.summary) body.appendChild(el("div", "meta", c.summary));
  const ta = el("textarea"); ta.value = c.caption; body.appendChild(ta);
  const row = el("div", "row");
  const b = el("button", "", "Copier la légende"); b.onclick = () => copyText(ta.value, b); row.appendChild(b);
  const dl = el("a", "", "Fichier"); dl.href = encodeURI(c.id); dl.download = ""; row.appendChild(dl);
  body.appendChild(row);
  const pubs = PUBS[c.id];
  if (pubs) {
    const pr = el("div", "row");
    for (const p of Object.keys(pubs)) {
      const s = pubs[p];
      if (s.url) { const a = el("a", "", p + " : en ligne"); a.href = s.url; a.target = "_blank"; a.rel = "noopener"; pr.appendChild(a); }
      else pr.appendChild(el("span", "tag" + (s.status === "echec" ? " warn" : ""), p + " : " + s.status));
    }
    body.appendChild(pr);
  }
  box.appendChild(body);
  return box;
}
function render() {
  const ch = $("ch").value, sort = $("sort").value, days = Number($("day").value);
  let list = CLIPS.filter((c) => (!ch || c.channel === ch) && (!days || c.start * 1000 > GEN - days * 864e5));
  list.sort((a, b) => sort === "score" ? (b.score - a.score || b.start - a.start) : b.start - a.start);
  const grid = $("grid"); grid.textContent = "";
  for (const c of list.slice(0, shown)) grid.appendChild(card(c));
  if (list.length > shown) { const w = el("div", "more"); const m = el("button", "", "Afficher plus"); m.onclick = () => { shown += 40; render(); }; w.appendChild(m); grid.appendChild(w); }
  $("count").textContent = list.length + " clip(s)";
}
(function init() {
  const sel = $("ch"); const all = el("option", "", "Tous les streamers"); all.value = ""; sel.appendChild(all);
  for (const n of [...new Set(CLIPS.map((c) => c.channel))].sort()) { const o = el("option", "", n); o.value = n; sel.appendChild(o); }
  for (const id of ["ch", "sort", "day"]) $(id).onchange = () => { shown = 40; render(); };
  render();
})();
</script></body></html>
"""

GALLERY_KEYS = ("id", "channel", "display", "start", "duration", "score", "ai_note", "sensible", "ratio", "uniq",
                "mood", "title", "summary", "caption")
_gallery_lock = threading.Lock()


def build_gallery(out_dir: Path, records: list[dict], pubs: dict | None = None) -> Path:
    """Page statique : s'ouvre d'un double-clic, sans serveur."""
    clips = [{k: r.get(k) for k in GALLERY_KEYS} for r in records if (out_dir / r["id"]).exists()]
    ids = {c["id"] for c in clips}
    pub_view = {}
    for cid, per in (pubs or {}).items():
        if cid in ids:
            pub_view[cid] = {p: {"status": s.get("status", ""), "url": s.get("url", "")} for p, s in per.items()}

    def js(obj) -> str:
        return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    page = (GALLERY_HTML.replace("__CLIPS__", js(clips)).replace("__PUBS__", js(pub_view))
            .replace("__GEN__", str(int(time.time() * 1000))))
    path = out_dir / "index.html"
    with _gallery_lock:
        tmp = out_dir / "index.html.tmp"
        tmp.write_text(page, encoding="utf-8")
        os.replace(tmp, path)
    return path

# --------------------------------------------------------------------------- publication automatique

class PublishError(Exception):
    def __init__(self, msg: str, temporary: bool = False, cooldown: float = 0.0, network: bool = False):
        super().__init__(msg)
        self.temporary = temporary or network   # True : on reessaiera ce clip plus tard
        self.cooldown = cooldown                # pause imposee a toute la plateforme (secondes)
        self.network = network                  # panne de connexion : ne compte pas comme un essai


def parse_windows(specs) -> list[tuple[int, int]]:
    out = []
    for s in specs or []:
        m = re.fullmatch(r"\s*(\d{1,2})[:h](\d{2})\s*-\s*(\d{1,2})[:h](\d{2})\s*", str(s))
        if not m:
            log.warning("creneau illisible ignore : %r (format attendu : \"18:00-21:30\")", s)
            continue
        h1, m1, h2, m2 = (int(x) for x in m.groups())
        out.append(((h1 % 24) * 60 + m1 % 60, (h2 % 24) * 60 + m2 % 60))
    return out


def in_windows(minute: int, windows: list[tuple[int, int]]) -> bool:
    if not windows:
        return True  # aucun creneau = a toute heure
    for a, b in windows:
        if a <= b:
            if a <= minute < b:
                return True
        elif minute >= a or minute < b:  # creneau a cheval sur minuit
            return True
    return False


class Clock:
    """Heure locale dans le fuseau demande (pour les creneaux)."""

    def __init__(self, tzname: str):
        self.tz = None
        if tzname:
            try:
                from zoneinfo import ZoneInfo
                self.tz = ZoneInfo(tzname)
            except Exception:  # noqa: BLE001
                log.warning("fuseau '%s' introuvable (pip install tzdata) : heure du PC utilisee", tzname)

    def minute_of_day(self, ts: float) -> int:
        d = dt.datetime.fromtimestamp(ts, self.tz) if self.tz else dt.datetime.fromtimestamp(ts)
        return d.hour * 60 + d.minute


# ----- Zernio : service tiers deja audite par TikTok / Instagram (2 comptes gratuits)

class ZernioAPI:
    BASE = "https://zernio.com/api/v1"

    def __init__(self, cfg: dict):
        z = cfg["zernio"]
        self.key = (z["api_key"] or os.environ.get("ZERNIO_API_KEY", "")).strip()
        self.base = (z["api_url"] or self.BASE).rstrip("/")
        self._accounts: list[dict] | None = None
        self._accounts_at = 0.0
        self.media: dict[str, tuple[str, float]] = {}
        self.lock = threading.Lock()

    def configured(self) -> bool:
        return bool(self.key)

    def _call(self, method: str, path: str, body=None, headers: dict | None = None, timeout: float = 60.0):
        if not self.key:
            raise PublishError("cle API Zernio manquante ([zernio] api_key)", cooldown=3600)
        h = {"Authorization": "Bearer " + self.key, "Accept": "application/json", "User-Agent": "clipper/" + VERSION}
        h.update(headers or {})
        try:
            code, hd, payload = http_call(method, self.base + path, headers=h, body=body, timeout=timeout)
        except NetError as e:
            raise PublishError(f"reseau : {e}", network=True) from None
        data = as_json(payload)
        data = data if isinstance(data, dict) else {}
        if code in (200, 201, 202, 207):
            return code, data
        msg = str(data.get("error") or payload[:200].decode("utf-8", "replace"))[:300]
        if code == 409:
            existing = (data.get("details") or {}).get("existingPostId")
            if existing:
                return 409, {"post": {"_id": existing}}
            raise PublishError(f"Zernio : contenu deja publie ({msg})")
        if code == 429:
            try:
                wait = float(header(hd, "Retry-After") or 120)
            except ValueError:
                wait = 120.0
            raise PublishError("Zernio : trop de requetes", temporary=True, cooldown=wait)
        if code in (401, 403):
            raise PublishError(f"Zernio refuse la cle API ({code}) : {msg}", cooldown=3600)
        if code == 402:
            raise PublishError(f"Zernio : offre gratuite depassee ou paiement requis : {msg}", cooldown=6 * 3600)
        if code >= 500:
            raise PublishError(f"Zernio indisponible ({code})", temporary=True, cooldown=120)
        raise PublishError(f"Zernio {code} : {msg}")

    def accounts(self, refresh: bool = False) -> list[dict]:
        with self.lock:
            if self._accounts is not None and not refresh and time.time() - self._accounts_at < 600:
                return self._accounts
        _code, data = self._call("GET", "/accounts")
        accs = [a for a in data.get("accounts") or [] if isinstance(a, dict) and a.get("_id")]
        with self.lock:
            self._accounts, self._accounts_at = accs, time.time()
        return accs

    def account(self, platform: str, wanted: str = "") -> dict:
        wanted = wanted.strip().lstrip("@").lower()
        pool = [a for a in self.accounts() if str(a.get("platform", "")).lower() == platform
                and a.get("isActive", True) is not False]
        if wanted:
            pool = [a for a in pool if str(a.get("username") or "").lstrip("@").lower() == wanted]
        if not pool:
            raise PublishError(f"aucun compte {platform}{' @' + wanted if wanted else ''} connecte dans Zernio",
                               cooldown=1800)
        if pool[0].get("needsReconnection"):
            raise PublishError(f"le compte {platform} doit etre reconnecte dans Zernio", cooldown=1800)
        return pool[0]

    def media_url(self, path: str) -> str:
        with self.lock:
            hit = self.media.get(path)
        if hit and time.time() - hit[1] < 5 * 86400:
            return hit[0]
        size = os.path.getsize(path)
        _code, data = self._call("POST", "/media/presign",
                                 {"filename": os.path.basename(path), "contentType": "video/mp4", "size": size})
        up, pub = data.get("uploadUrl"), data.get("publicUrl")
        if not up or not pub:
            raise PublishError("Zernio : reponse d'envoi inattendue (uploadUrl/publicUrl absents)")
        try:
            with open(path, "rb") as f:
                code, _h, payload = http_call("PUT", str(up), body=f, timeout=1200,
                                              headers={"Content-Type": "video/mp4", "Content-Length": str(size)})
        except NetError as e:
            raise PublishError(f"envoi du fichier interrompu : {e}", network=True) from None
        if code not in (200, 201, 204):
            raise PublishError(f"envoi du fichier refuse ({code}) {payload[:120].decode('utf-8', 'replace')}",
                               temporary=code >= 500 or code in (403, 408))
        with self.lock:
            self.media[path] = (str(pub), time.time())
        return str(pub)

    @staticmethod
    def _outcome(post: dict, platform: str) -> dict | None:
        """Resultat final pour cette plateforme, ou None si la publication est encore en cours."""
        entry = next((x for x in post.get("platforms") or []
                      if isinstance(x, dict) and str(x.get("platform", "")).lower() == platform), {})
        status = str(entry.get("status") or post.get("status") or "").lower()
        if status == "published":
            return {"url": str(entry.get("platformPostUrl") or post.get("platformPostUrl") or ""),
                    "pid": str(post.get("_id") or "")}
        if status in ("failed", "cancelled"):
            msg = str(entry.get("errorMessage") or post.get("errorMessage") or "publication refusee")
            src = str(entry.get("errorSource") or "")
            raise PublishError(f"{platform} : {msg}"[:300], temporary=src in ("platform", "system"))
        return None

    def check(self, pid: str, platform: str) -> dict | None:
        _code, data = self._call("GET", "/posts/" + urllib.parse.quote(pid))
        return self._outcome(data.get("post") or {}, platform)

    def publish(self, platform: str, path: str, meta: dict, key: str) -> dict:
        acc = self.account(platform, meta.get("account", ""))
        url = self.media_url(path)
        if platform == "tiktok":
            psd = {"privacyLevel": meta.get("privacy") or "PUBLIC_TO_EVERYONE", "allowComment": True,
                   "allowDuet": True, "allowStitch": True, "contentPreviewConfirmed": True,
                   "expressConsentGiven": True, "videoCoverTimestampMs": int(meta.get("cover_ms", 1000)),
                   "videoMadeWithAi": False}
        elif platform == "instagram":
            psd = {"shareToFeed": True, "thumbOffset": int(meta.get("cover_ms", 0))}
        else:
            psd = {"title": meta["title"], "visibility": meta.get("privacy") or "public", "madeForKids": False,
                   "categoryId": str(meta.get("category") or "20"), "notifySubscribers": True}
            if meta.get("lang"):
                psd["defaultLanguage"] = psd["defaultAudioLanguage"] = meta["lang"]
        body = {"content": meta["caption"], "mediaItems": [{"type": "video", "url": url}],
                "platforms": [{"platform": platform, "accountId": acc["_id"], "platformSpecificData": psd}],
                "publishNow": True}
        if platform == "youtube" and meta.get("tags"):
            body["tags"] = meta["tags"]
        _code, data = self._call("POST", "/posts", body, headers={"Idempotency-Key": key}, timeout=420)
        post = data.get("post") or {}
        pid = str(post.get("_id") or "")
        if not pid:
            raise PublishError("Zernio : reponse sans identifiant de publication", temporary=True)
        res = self._outcome(post, platform)
        deadline = time.time() + 300
        while res is None and time.time() < deadline and not STOP.is_set():
            STOP.wait(8)
            try:
                res = self.check(pid, platform)
            except PublishError as e:
                if not e.temporary:
                    raise
        return res or {"url": "", "pid": pid, "pending": True}


# ----- YouTube : API officielle Google (gratuite, 100 envois par jour)

class YouTubeAPI:
    AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN = "https://oauth2.googleapis.com/token"
    UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos"
    SCOPE = "https://www.googleapis.com/auth/youtube.upload"

    def __init__(self, cfg: dict):
        y = cfg["youtube"]
        self.cid, self.secret = str(y["client_id"]).strip(), str(y["client_secret"]).strip()
        self.auth_url, self.token_url, self.upload_url = (y["auth_url"] or self.AUTH, y["token_url"] or self.TOKEN,
                                                          y["upload_url"] or self.UPLOAD)
        tf = Path(y["token_file"])
        self.token_path = tf if tf.is_absolute() else Path(cfg["_base"]) / tf
        self.lock = threading.Lock()
        self.tok: dict = {}
        try:
            self.tok = json.loads(self.token_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass

    def configured(self) -> bool:
        return bool(self.cid and self.secret)

    def authorized(self) -> bool:
        return bool(self.tok.get("refresh_token"))

    def _save(self) -> None:
        tmp = self.token_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.tok), encoding="utf-8")
        os.replace(tmp, self.token_path)

    def _token_call(self, form: dict) -> tuple[int, dict]:
        try:
            code, _h, payload = http_call("POST", self.token_url, timeout=40,
                                          headers={"Content-Type": "application/x-www-form-urlencoded"},
                                          body=urllib.parse.urlencode(form).encode("ascii"))
        except NetError as e:
            raise PublishError(f"reseau : {e}", network=True) from None
        data = as_json(payload)
        return code, data if isinstance(data, dict) else {}

    def access_token(self, force: bool = False) -> str:
        with self.lock:
            if not force and self.tok.get("access_token") and self.tok.get("expires_at", 0) > time.time() + 90:
                return self.tok["access_token"]
            if not self.configured():
                raise PublishError("YouTube : client_id / client_secret manquants ([youtube])", cooldown=3600)
            if not self.authorized():
                raise PublishError("YouTube non autorise : lance  python clipper.py auth youtube", cooldown=3600)
            code, d = self._token_call({"grant_type": "refresh_token", "refresh_token": self.tok["refresh_token"],
                                        "client_id": self.cid, "client_secret": self.secret})
            if code == 200 and d.get("access_token"):
                self.tok["access_token"] = d["access_token"]
                self.tok["expires_at"] = time.time() + float(d.get("expires_in", 3600))
                self._save()
                return self.tok["access_token"]
            if d.get("error") == "invalid_grant":
                raise PublishError("autorisation YouTube expiree ou revoquee : relance  python clipper.py auth youtube",
                                   cooldown=3600)
            raise PublishError(f"YouTube : jeton refuse ({code} {d.get('error', '')})", temporary=code >= 500,
                               cooldown=600)

    def authorize_interactive(self, timeout: float = 300.0) -> bool:
        if not self.configured():
            print("Renseigne d'abord client_id et client_secret dans la section [youtube] de config.toml.")
            return False
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode()
        state = secrets.token_urlsafe(16)
        got: dict = {}

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                if "code" in q or "error" in q:
                    got.update(code=q.get("code", [""])[0], state=q.get("state", [""])[0],
                               error=q.get("error", [""])[0])
                    msg = "Autorisation recue. Tu peux fermer cette page et revenir au terminal."
                else:
                    msg = "En attente de l'autorisation Google..."
                page = f"<html><body style='font-family:sans-serif'><h2>{msg}</h2></body></html>".encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(page)))
                self.end_headers()
                self.wfile.write(page)

            def log_message(self, *args):  # silence
                pass

        srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        redirect = f"http://127.0.0.1:{srv.server_address[1]}"
        url = self.auth_url + "?" + urllib.parse.urlencode({
            "client_id": self.cid, "redirect_uri": redirect, "response_type": "code", "scope": self.SCOPE,
            "access_type": "offline", "prompt": "consent", "state": state,
            "code_challenge": challenge, "code_challenge_method": "S256"})
        print("Ouvre cette adresse dans ton navigateur si elle ne s'ouvre pas toute seule :\n\n" + url + "\n")
        try:
            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass
        srv.timeout = 1.0
        deadline = time.time() + timeout
        try:
            while "code" not in got and time.time() < deadline:
                srv.handle_request()
        finally:
            srv.server_close()
        if not got.get("code") or got.get("state") != state:
            print("Autorisation non recue" + (f" ({got.get('error')})" if got.get("error") else "") + ".")
            return False
        try:
            code, d = self._token_call({"grant_type": "authorization_code", "code": got["code"],
                                        "client_id": self.cid, "client_secret": self.secret,
                                        "redirect_uri": redirect, "code_verifier": verifier})
        except PublishError as e:
            print(f"Echec : {e}")
            return False
        if code != 200 or not d.get("refresh_token"):
            print(f"Echec de l'echange du code ({code} {d.get('error', '')} {d.get('error_description', '')}).")
            return False
        self.tok = {"refresh_token": d["refresh_token"], "access_token": d.get("access_token", ""),
                    "expires_at": time.time() + float(d.get("expires_in", 3600))}
        self._save()
        print(f"YouTube autorise. Jeton enregistre dans {self.token_path.name} (ne partage pas ce fichier).")
        return True

    @staticmethod
    def _error(code: int, payload: bytes) -> PublishError:
        data = as_json(payload)
        err = data.get("error") if isinstance(data, dict) and isinstance(data.get("error"), dict) else {}
        reason = ""
        if isinstance(err.get("errors"), list) and err["errors"] and isinstance(err["errors"][0], dict):
            reason = str(err["errors"][0].get("reason", ""))
        msg = f"YouTube {code} {reason} {str(err.get('message', ''))[:200]}".strip()
        if reason in ("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"):
            return PublishError(msg, temporary=True, cooldown=6 * 3600)
        if reason == "uploadLimitExceeded":
            return PublishError(msg, temporary=True, cooldown=12 * 3600)
        if code == 401:
            return PublishError(msg, cooldown=3600)
        if code >= 500 or code == 0:
            return PublishError(msg or "YouTube indisponible", temporary=True, cooldown=120)
        return PublishError(msg)

    def publish(self, platform: str, path: str, meta: dict, key: str) -> dict:
        size = os.path.getsize(path)
        privacy = meta.get("privacy") or "public"
        snippet = {"title": meta["title"], "description": meta["caption"], "categoryId": str(meta.get("category") or "20")}
        if meta.get("tags"):
            snippet["tags"] = meta["tags"]
        if meta.get("lang"):
            snippet["defaultLanguage"] = snippet["defaultAudioLanguage"] = meta["lang"]
        body = json.dumps({"snippet": snippet, "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False,
                                                          "embeddable": True}}, ensure_ascii=False).encode("utf-8")
        url = self.upload_url + "?" + urllib.parse.urlencode(
            {"uploadType": "resumable", "part": "snippet,status", "notifySubscribers": "true"})
        code, hd, payload = 0, {}, b""
        for attempt in range(2):
            tok = self.access_token(force=attempt == 1)
            try:
                code, hd, payload = http_call("POST", url, body=body, timeout=60, headers={
                    "Authorization": "Bearer " + tok, "Content-Type": "application/json; charset=UTF-8",
                    "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
            except NetError as e:
                raise PublishError(f"reseau : {e}", network=True) from None
            if code != 401:
                break
        if code != 200:
            raise self._error(code, payload)
        session = header(hd, "Location")
        if not session:
            raise PublishError("YouTube : adresse d'envoi absente de la reponse", temporary=True)

        offset, data = 0, None
        for attempt in range(6):
            code, payload = 0, b""
            try:
                with open(path, "rb") as f:
                    f.seek(offset)
                    h = {"Content-Type": "video/mp4", "Content-Length": str(size - offset)}
                    if offset:
                        h["Content-Range"] = f"bytes {offset}-{size - 1}/{size}"
                    code, hd, payload = http_call("PUT", session, headers=h, body=f, timeout=1200)
            except NetError:
                code = 0
            if code in (200, 201):
                data = as_json(payload)
                break
            if code not in (0, 308, 500, 502, 503, 504):
                raise self._error(code, payload)
            if STOP.wait(min(30, 3 * 2 ** attempt)):
                raise PublishError("arret demande pendant l'envoi", temporary=True)
            try:  # ou en est l'envoi ?
                c2, h2, p2 = http_call("PUT", session, timeout=60, body=b"",
                                       headers={"Content-Range": f"bytes */{size}", "Content-Length": "0"})
            except NetError:
                continue
            if c2 in (200, 201):
                data = as_json(p2)
                break
            if c2 == 308:
                rng = header(h2, "Range")
                m = re.search(r"-(\d+)$", rng)
                offset = int(m.group(1)) + 1 if m else 0
            elif c2 == 404:
                raise PublishError("YouTube : session d'envoi expiree", temporary=True)
        if not isinstance(data, dict) or not data.get("id"):
            raise PublishError("YouTube : envoi interrompu", temporary=True)
        real = str((data.get("status") or {}).get("privacyStatus") or "")
        if real and real != privacy:
            log.warning("YouTube a mis la video en '%s' au lieu de '%s' (reglage de la chaine ou du projet Google)",
                        real, privacy)
        return {"url": f"https://www.youtube.com/shorts/{data['id']}", "pid": str(data["id"])}

    def check(self, pid: str, platform: str) -> dict | None:
        return None


# ----- file de publication

FINAL = ("publie", "echec", "ignore", "encours")


@dataclass
class Target:
    name: str
    via: str
    account: str
    windows: list
    max_per_day: int
    min_gap: float
    caption: str
    privacy: str
    category: str


class Publisher(threading.Thread):
    """Poste les meilleurs clips, plateforme par plateforme, dans les creneaux choisis."""

    def __init__(self, cfg: dict, store: ClipStore, refresh=None):
        super().__init__(daemon=True, name="publisher")
        self.cfg = cfg
        p = cfg["publish"]
        self.enabled = bool(p["enabled"])
        self.dry = bool(p["dry_run"])
        self.min_score = int(p["min_score"])
        self.delay = float(p["delay_minutes"]) * 60
        self.max_age = float(p["max_age_hours"]) * 3600
        self.rush = int(p["rush_score"])
        self.need_ai = bool(p["need_ai"])
        self.clock = Clock(str(p["timezone"]))
        self.out_dir = Path(cfg["general"]["output_dir"])
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.store, self.refresh = store, refresh
        self.backends = {"zernio": ZernioAPI(cfg), "youtube": YouTubeAPI(cfg)}
        self.targets: dict[str, Target] = {}
        for name in PLATFORMS:
            t = p.get(name) or {}
            if not t.get("enabled"):
                continue
            via = str(t.get("via", "zernio")).lower()
            if via not in self.backends or (via == "youtube" and name != "youtube"):
                log.warning("publication %s : 'via = \"%s\"' inconnu, plateforme ignoree", name, via)
                continue
            self.targets[name] = Target(name, via, str(t.get("account", "")), parse_windows(t.get("windows")),
                                        int(t.get("max_per_day", 6)), float(t.get("min_gap_minutes", 60)) * 60,
                                        str(t.get("caption") or "{titre} {hashtags}"), str(t.get("privacy", "")),
                                        str(t.get("category", "20")))
        self.lock = threading.Lock()
        self.state_path = self.out_dir / "publications.json"
        self.state: dict[str, dict[str, dict]] = {}
        try:
            loaded = json.loads(self.state_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                self.state = loaded
        except (OSError, ValueError):
            pass
        self.clips: dict[str, dict] = {}
        now = time.time()
        for rec in store.load():
            if now - float(rec.get("made", 0)) <= self.max_age:
                self.clips[rec["id"]] = rec
        self.backoff: dict[str, float] = {}
        self.fails: dict[str, int] = {}
        self.history: dict[str, list[float]] = {n: [] for n in self.targets}
        for per in self.state.values():
            for name, s in per.items():
                counted = ("publie", "encours", "simule") if self.dry else ("publie", "encours")
                if name in self.history and s.get("status") in counted and now - float(s.get("at", 0)) < 86400:
                    self.history[name].append(float(s.get("at", 0)))
        for h in self.history.values():
            h.sort()

    # ----- etat
    def add_clip(self, rec: dict) -> None:
        with self.lock:
            self.clips[rec["id"]] = rec

    def _set(self, cid: str, name: str, **kw) -> None:
        with self.lock:
            self.state.setdefault(cid, {}).setdefault(name, {}).update(kw)

    def _save(self) -> None:
        with self.lock:
            snapshot = json.dumps(self.state, ensure_ascii=False, indent=1)
        try:
            tmp = self.state_path.with_suffix(".tmp")
            tmp.write_text(snapshot, encoding="utf-8")
            os.replace(tmp, self.state_path)
        except OSError as e:
            log.warning("publication : etat non enregistre (%s)", e)
        if self.refresh:
            try:
                self.refresh()
            except Exception as e:  # noqa: BLE001
                log.debug("galerie : %s", e)

    def _log_csv(self, rec: dict, name: str, url: str) -> None:
        p = self.out_dir / "publications.csv"
        new = not p.exists()
        try:
            with open(p, "a", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f, delimiter=";")
                if new:
                    w.writerow(["heure", "plateforme", "streamer", "note", "lien", "fichier", "titre"])
                w.writerow([dt.datetime.now().isoformat(timespec="seconds"), name, rec["channel"], rec["score"], url,
                            rec["file"], rec["title"]])
        except OSError:
            pass

    # ----- textes par plateforme
    def build_meta(self, t: Target, rec: dict) -> dict:
        tags = list(rec.get("hashtags") or [])
        vals = {"titre": rec["title"], "hashtags": " ".join(tags), "credit": rec.get("credit", ""),
                "streamer": rec.get("display", ""), "channel": rec["channel"], "jeu": rec.get("category", "")}
        caption = re.sub(r"[ \t]+\n", "\n", safe_format(t.caption, vals)).strip()
        limit = 5000 if t.name == "youtube" else 2200
        title = re.sub(r"[<>]", "", rec["title"]).strip() or rec.get("display") or rec["channel"]
        if len(title) > 100:
            title = title[:99].rstrip() + "…"
        return {"caption": caption[:limit], "title": title, "tags": [h.lstrip("#") for h in tags][:15],
                "cover_ms": int(rec.get("cover_ms", 1000)), "lang": rec.get("lang") or "",
                "privacy": t.privacy, "category": t.category, "account": t.account}

    # ----- boucle
    def run(self) -> None:
        if not self.enabled or not self.targets:
            return
        log.info("publication automatique : %s%s", ", ".join(f"{t.name} (via {t.via})" for t in self.targets.values()),
                 "  [SIMULATION : rien n'est envoye]" if self.dry else "")
        while not STOP.wait(15):
            now = time.time()
            for name in list(self.targets):
                try:
                    self.step(name, now)
                except Exception as e:  # noqa: BLE001
                    log.exception("publication %s : %s", name, e)
            try:
                self.resolve_pending(now)
            except Exception as e:  # noqa: BLE001
                log.debug("suivi des publications : %s", e)
            with self.lock:
                for cid in [c for c, r in self.clips.items() if now - float(r.get("made", 0)) > self.max_age + 3600]:
                    del self.clips[cid]

    def step(self, name: str, now: float) -> None:
        t = self.targets[name]
        if now < self.backoff.get(name, 0.0):
            return
        hist = self.history[name]
        while hist and now - hist[0] > 86400:
            hist.pop(0)
        if len(hist) >= t.max_per_day or (hist and now - hist[-1] < t.min_gap):
            return
        in_win = in_windows(self.clock.minute_of_day(now), t.windows)
        with self.lock:
            recs = list(self.clips.values())
        best, changed = None, False
        for rec in recs:
            st = self.state.get(rec["id"], {}).get(name, {})
            status = st.get("status", "")
            if status in FINAL or (status == "simule" and self.dry) or float(st.get("next", 0)) > now:
                continue
            age = now - float(rec.get("made", 0))
            if age > self.max_age:
                self._set(rec["id"], name, status="ignore", error="trop ancien", at=now)
                changed = True
                continue
            if rec.get("sensible"):
                self._set(rec["id"], name, status="ignore", error="contenu a verifier", at=now)
                changed = True
                continue
            if age < self.delay or int(rec.get("score", 0)) < self.min_score:
                continue
            if self.need_ai and rec.get("ai_note") is None:
                continue
            if not os.path.exists(rec["file"]):
                self._set(rec["id"], name, status="ignore", error="fichier supprime", at=now)
                changed = True
                continue
            if not (in_win or (self.rush > 0 and int(rec["score"]) >= self.rush)):
                continue
            k = (int(rec["score"]), float(rec.get("made", 0)))
            if best is None or k > best[0]:
                best = (k, rec)
        if best:
            self.publish_one(t, best[1], now)
        elif changed:
            self._save()

    def publish_one(self, t: Target, rec: dict, now: float) -> dict:
        cid, name = rec["id"], t.name
        meta = self.build_meta(t, rec)
        if self.dry:
            log.info("[simulation] %s : publierait %s (note %d) \"%s\"", name, Path(rec["file"]).name,
                     rec["score"], meta["title"])
            self._set(cid, name, status="simule", at=now, url="")
            self.history.setdefault(name, []).append(now)
            self._save()
            return {"status": "simule"}
        tries = int(self.state.get(cid, {}).get(name, {}).get("tries", 0)) + 1
        key = hashlib.sha1(f"{cid}|{name}".encode("utf-8")).hexdigest()
        log.info("%s : envoi de %s (note %d)...", name, Path(rec["file"]).name, rec["score"])
        try:
            res = self.backends[t.via].publish(name, rec["file"], meta, key)
        except PublishError as e:
            self.fails[name] = self.fails.get(name, 0) + 1
            pause = max(e.cooldown, min(1800.0, 120.0 * self.fails[name]) if e.temporary else 0.0)
            if pause:
                self.backoff[name] = time.time() + pause
            if e.network:
                self._set(cid, name, status="attente", error=str(e), at=now, next=time.time() + 120)
                log.warning("%s : connexion impossible (%s), nouvel essai dans %d min", name, e, int(pause // 60) or 2)
            elif e.temporary and tries < 4:
                self._set(cid, name, status="attente", tries=tries, error=str(e), at=now,
                          next=time.time() + max(300.0 * tries, min(e.cooldown, 3600.0)))
                log.warning("%s : echec temporaire (%s), nouvel essai plus tard", name, e)
            elif e.cooldown and not e.temporary and tries < 4:
                # probleme de compte ou de reglage : on garde le clip pour quand ce sera repare
                self._set(cid, name, status="attente", tries=tries, error=str(e), at=now, next=self.backoff[name])
                log.error("%s : %s  (publication en pause %d min)", name, e, int(e.cooldown // 60))
            else:
                self._set(cid, name, status="echec", tries=tries, error=str(e), at=now)
                log.error("%s : publication abandonnee pour %s (%s)", name, Path(rec["file"]).name, e)
            self._save()
            return {"status": "echec", "error": str(e)}
        done = time.time()
        self.fails[name] = 0
        pending = bool(res.get("pending"))
        self._set(cid, name, status="encours" if pending else "publie", at=done, url=res.get("url", ""),
                  pid=res.get("pid", ""), tries=tries, error="", checked=done)
        self.history.setdefault(name, []).append(done)
        if pending:
            log.info("%s : envoye, traitement en cours chez la plateforme", name)
        else:
            log.info("%s : PUBLIE  %s", name, res.get("url") or "(lien indisponible)")
            self._log_csv(rec, name, res.get("url", ""))
        self._save()
        return {"status": "encours" if pending else "publie", "url": res.get("url", "")}

    def resolve_pending(self, now: float) -> None:
        """Recupere le lien final des publications encore en traitement."""
        todo = []
        with self.lock:
            for cid, per in self.state.items():
                for name, s in per.items():
                    if s.get("status") == "encours" and s.get("pid") and name in self.targets \
                            and now - float(s.get("checked", 0)) > 120:
                        todo.append((cid, name, s["pid"], float(s.get("at", now))))
        for cid, name, pid, at in todo[:5]:
            t = self.targets[name]
            try:
                res = self.backends[t.via].check(pid, name)
            except PublishError as e:
                if e.temporary:
                    self._set(cid, name, checked=now)
                    continue
                self._set(cid, name, status="echec", error=str(e))
                log.error("%s : la plateforme a refuse la publication (%s)", name, e)
                self._save()
                continue
            if res:
                self._set(cid, name, status="publie", url=res.get("url", ""))
                log.info("%s : PUBLIE  %s", name, res.get("url") or "(lien indisponible)")
                rec = self.clips.get(cid)
                if rec:
                    self._log_csv(rec, name, res.get("url", ""))
                self._save()
            elif now - at > 2 * 3600:
                self._set(cid, name, status="publie", error="lien non recupere")
                self._save()
            else:
                self._set(cid, name, checked=now)

    def status_line(self) -> str:
        if not self.enabled or not self.targets:
            return ""
        now = time.time()
        bits = []
        for name, h in self.history.items():
            n = sum(1 for x in h if now - x < 86400)
            pause = self.backoff.get(name, 0) - now
            bits.append(f"{name} {n}/{self.targets[name].max_per_day}" + (f" (pause {int(pause // 60)} min)" if pause > 0 else ""))
        return "publie 24 h : " + ", ".join(bits)

# --------------------------------------------------------------------------- commandes

def setup_logging(cfg: dict) -> None:
    logdir = Path(cfg["general"]["log_dir"])
    logdir.mkdir(parents=True, exist_ok=True)
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # un emoji ne doit jamais faire planter l'affichage
        except (AttributeError, ValueError):
            pass
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for h in (logging.StreamHandler(), logging.FileHandler(logdir / "clipper.log", encoding="utf-8")):
        h.setFormatter(fmt)
        root.addHandler(h)


def keep_awake(cfg: dict) -> None:
    """Windows : empeche la mise en veille tant que le programme tourne."""
    if os.name != "nt" or not cfg["general"]["keep_awake"]:
        return
    try:
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    except Exception:  # noqa: BLE001
        pass


def cmd_run(cfg: dict, detect_only: bool) -> None:
    channels = cfg["channels"]
    if not channels or channels == PLACEHOLDER_CHANNELS:
        sys.exit("Indique d'abord tes streamers dans config.toml (ligne 'channels').")
    setup_logging(cfg)
    keep_awake(cfg)
    log.info("clipper v%s", VERSION)
    chan_cfgs = {ch: make_chan_cfg(cfg, ch) for ch in channels}
    detectors = {ch: Detector(ch, chan_cfgs[ch]) for ch in channels}
    recorders: dict[str, Recorder] = {}
    meters: dict[str, AudioMeter] = {}
    scheduler = publisher = ai = renderer = None

    if not detect_only:
        if not ffmpeg_path():
            sys.exit("ffmpeg introuvable (ni a cote du programme, ni dans le PATH). Lance la verification.")
        out_dir = Path(cfg["general"]["output_dir"])
        out_dir.mkdir(parents=True, exist_ok=True)
        store = ClipStore(out_dir)
        transcriber = Transcriber(cfg)
        transcriber.preload()
        ai = AIClient(cfg)
        if ai.enabled:
            log.info("IA activee : modele %s", ai.model)

        def refresh_gallery() -> None:
            build_gallery(out_dir, store.load(), publisher.state if publisher else {})

        publisher = Publisher(cfg, store, refresh=refresh_gallery)

        def on_clip(rec: dict) -> None:
            publisher.add_clip(rec)
            refresh_gallery()

        for ch in channels:
            recorders[ch] = Recorder(cfg, ch)
            meters[ch] = AudioMeter(recorders[ch])
        renderer = Renderer(cfg, chan_cfgs, transcriber, ai, recorders, meters, store, on_clip)
        scheduler = Scheduler(renderer, int(cfg["general"]["render_workers"]), float(cfg["general"]["segment_seconds"]))
        scheduler.start()
        for ch in channels:
            recorders[ch].start()
            meters[ch].start()
        publisher.start()
        refresh_gallery()
        log.info("page de tri des clips : %s", out_dir / "index.html")

    meta = MetaWatcher(cfg, recorders)
    meta.start()

    def on_message(ch: str, user: str, text: str, ts: float) -> None:
        d = detectors.get(ch.lower())
        if d:
            d.add_message(ts, user, text)

    def on_event(ch: str, kind: str, ts: float) -> None:
        d = detectors.get(ch.lower())
        if d and kind == "raid":
            d.mute(ts)
            log.info("[%s] raid entrant : detection en pause %d s", ch, int(d.c.raid_mute))

    def on_reset() -> None:
        now = time.time()
        for d in detectors.values():
            d.resume(now)

    ChatClient(cfg, on_message, on_event, on_reset).start()
    log.info("surveillance de : %s  (Ctrl+C pour arreter)", ", ".join(channels))
    if cfg["twitch"]["games"]:
        log.info("clips limites aux jeux : %s", ", ".join(cfg["twitch"]["games"]))
    log.info("echauffement du chat : %d s avant les premiers clips", int(cfg["detect"]["warmup_seconds"]))

    last_status = last_clean = started = time.time()
    run_limit = float(os.environ.get("CLIPPER_RUN_SECONDS", "0") or 0)   # arret automatique (tests)
    try:
        while True:
            now = time.time()
            if run_limit and now - started > run_limit:
                log.info("duree de test atteinte, arret")
                break
            for ch, d in detectors.items():
                ev = d.tick(now)
                if not ev:
                    continue
                m = meta.get(ch)
                ev.category, ev.stream_title, ev.display = m.get("category", ""), m.get("title", ""), m.get("author", "")
                rec = recorders.get(ch)
                if not meta.allowed(ch):
                    log.info("[%s] pic de chat ignore (jeu hors filtre : %s)", ch, ev.category)
                    continue
                if rec is not None and not rec.live:
                    log.info("[%s] pic de chat ignore (pas de video en cours)", ch)
                    continue
                log.info("[%s] PIC DE CHAT x%.1f  (%.1f/s contre %.1f, %d personnes, ambiance %s, note provisoire %d)",
                         ch, ev.ratio, ev.rate, ev.baseline, ev.uniq, ev.mood, ev.score)
                if scheduler:
                    scheduler.add(ev)
            if now - last_clean > 20:
                last_clean = now
                keep = float(cfg["general"]["buffer_seconds"]) + 30
                for r in recorders.values():
                    r.cleanup(keep)
            if now - last_status > 60:
                last_status = now
                bits = []
                for ch, d in detectors.items():
                    rec = recorders.get(ch)
                    live = "" if rec is None else (" LIVE" if rec.live else " off")
                    bits.append(f"{ch}{live} {d.cur:.1f}/{d.med:.1f} msg/s ({d.clips} pics)")
                extra = []
                if scheduler and scheduler.q.qsize():
                    extra.append(f"{scheduler.q.qsize()} clip(s) en attente de rendu")
                if ai and ai.usage_line():
                    extra.append(ai.usage_line())
                if publisher and publisher.status_line():
                    extra.append(publisher.status_line())
                log.info("etat : " + " | ".join(bits + extra))
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("arret demande...")
    finally:
        STOP.set()
        for r in recorders.values():   # laisse le temps de fermer proprement streamlink et ffmpeg
            r.join(timeout=8)
        time.sleep(0.5)


def cmd_snapshot(cfg: dict, name: str) -> None:
    name = name.lower()
    out = Path(cfg["_base"]) / f"snapshot_{name}.png"
    print(f"Capture de {name} ... (le streamer doit etre en live)")
    sl = subprocess.Popen(streamlink_cmd(cfg, name, retry=False), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        r = subprocess.run(
            [ffmpeg_bin(), "-y", "-loglevel", "error", "-i", "pipe:0", "-frames:v", "1",
             "-vf", "drawgrid=width=iw/10:height=ih/10:thickness=2:color=white@0.6", str(out)],
            stdin=sl.stdout, capture_output=True, text=True, timeout=120,
        )
    except subprocess.TimeoutExpired:
        r = None
    finally:
        sl.terminate()
    if r is not None and r.returncode == 0 and out.exists():
        print(f"OK : {out}\nGrille de 10 x 10 cases : lis la position de la facecam en dixiemes de l'image.\n"
              f"Exemple pour une facecam en bas a gauche :  facecam = [0.0, 0.7, 0.25, 0.3]   (x, y, largeur, hauteur)")
    else:
        print("Echec :", (r.stderr or "")[-300:] if r is not None else "delai depasse")


def cmd_gallery(cfg: dict) -> None:
    out_dir = Path(cfg["general"]["output_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    pubs = {}
    try:
        pubs = json.loads((out_dir / "publications.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    print("Page de tri :", build_gallery(out_dir, ClipStore(out_dir).load(), pubs))


def cmd_auth(cfg: dict, what: str) -> None:
    if what != "youtube":
        sys.exit("Usage : python clipper.py auth youtube")
    sys.exit(0 if YouTubeAPI(cfg).authorize_interactive() else 1)


def cmd_post(cfg: dict, file: str, to: str, title: str) -> None:
    """Publie un fichier tout de suite, sans attendre les creneaux : sert a tester les comptes."""
    setup_logging(cfg)
    path = Path(file).resolve()
    if not path.exists():
        sys.exit(f"Fichier introuvable : {path}")
    names = [n.strip().lower() for n in to.split(",") if n.strip()]
    bad = [n for n in names if n not in PLATFORMS]
    if bad or not names:
        sys.exit("Indique les plateformes avec --to, parmi : " + ", ".join(PLATFORMS))
    out_dir = Path(cfg["general"]["output_dir"])
    store = ClipStore(out_dir) if out_dir.exists() else None
    rec = next((r for r in (store.load() if store else []) if Path(r["file"]).resolve() == path), None)
    if rec is None:
        tags = clean_hashtags(cfg["post"]["hashtags"])
        rec = {"id": "manuel/" + path.name, "file": str(path), "channel": "manuel", "display": "", "made": time.time(),
               "score": 100, "title": title or path.stem, "hashtags": tags, "credit": "", "cover_ms": 1000,
               "lang": cfg["subtitles"]["language"], "category": ""}
    elif title:
        rec = dict(rec, title=title)
    cfg["publish"]["enabled"] = True
    cfg["publish"]["dry_run"] = False
    for n in names:
        cfg["publish"][n]["enabled"] = True
    out_dir.mkdir(parents=True, exist_ok=True)
    pub = Publisher(cfg, ClipStore(out_dir))
    ok = True
    for n in names:
        if n not in pub.targets:
            print(f"{n} : reglage 'via' invalide dans config.toml")
            ok = False
            continue
        res = pub.publish_one(pub.targets[n], rec, time.time())
        print(f"{n} : {res.get('status')} {res.get('url') or res.get('error') or ''}")
        ok = ok and res.get("status") in ("publie", "encours")
    sys.exit(0 if ok else 1)


def cmd_doctor(cfg: dict) -> None:
    def show(label: str, ok: bool, detail: str = "") -> None:
        print(("[OK]  " if ok else "[!!]  ") + label + (f"  -  {detail}" if detail else ""))

    print(f"clipper v{VERSION}")
    show("Python >= 3.11", sys.version_info >= (3, 11), sys.version.split()[0])
    ff = ffmpeg_path()
    show("ffmpeg", bool(ff), ff or "introuvable : place ffmpeg.exe a cote du programme")
    if ff:
        filters = sh([ff, "-hide_banner", "-filters"]).stdout
        show("ffmpeg : sous-titres incrustes (libass)", " ass " in filters)
        show("encodage GPU NVENC (RTX)", has_nvenc(), "sinon x264 sur CPU, ca marche aussi")
    try:
        sl = sh(streamlink_base(cfg) + ["--version"], timeout=60)
        show("streamlink", sl.returncode == 0, (sl.stdout or sl.stderr).strip()[:60])
    except (OSError, subprocess.TimeoutExpired) as e:
        show("streamlink", False, f"pip install streamlink  ({e})")
    if cfg["subtitles"]["enabled"]:
        try:
            import faster_whisper  # noqa: F401
            show("faster-whisper (sous-titres)", True)
        except Exception as e:  # noqa: BLE001
            show("faster-whisper (sous-titres)", False, f"pip install faster-whisper  ({e})")
    chans = cfg["channels"]
    show("config.toml : streamers", bool(chans), ", ".join(chans))
    tw = cfg["twitch"]
    if chans:
        try:
            raw = socket.create_connection((tw["irc_host"], int(tw["irc_port"])), timeout=10)
            sock = ssl.create_default_context().wrap_socket(raw, server_hostname=tw["irc_host"]) if tw["irc_tls"] else raw
            sock.settimeout(6)
            sock.sendall(f"PASS SCHMOOPIIE\r\nNICK justinfan{random.randint(10000, 99999)}\r\nJOIN #{chans[0]}\r\n".encode())
            data = b""
            t0 = time.time()
            while time.time() - t0 < 6 and b" 366 " not in data and b" JOIN " not in data:
                data += sock.recv(4096)
            sock.close()
            show("chat Twitch (connexion + JOIN)", b" 366 " in data or b" JOIN " in data)
        except Exception as e:  # noqa: BLE001
            show("chat Twitch (connexion + JOIN)", False, str(e))
        m = fetch_meta(cfg, chans[0])
        show(f"streamlink -> {chans[0]}", True,
             f"en live sur {m['category'] or '?'}" if m else "hors ligne ou introuvable (normal s'il ne stream pas)")
    if cfg["ai"]["enabled"]:
        ai = AIClient(cfg)
        ok, detail = ai.ping() if ai.enabled else (False, "cle API absente ([ai] api_key)")
        show("IA (cle API Anthropic)", ok, detail)
    p = cfg["publish"]
    if p["enabled"]:
        wanted = [n for n in PLATFORMS if p[n]["enabled"]]
        show("publication : plateformes actives", bool(wanted), ", ".join(wanted) + ("  [simulation]" if p["dry_run"] else ""))
        via = {n: str(p[n]["via"]).lower() for n in wanted}
        if "zernio" in via.values():
            z = ZernioAPI(cfg)
            try:
                accs = z.accounts()
                show("Zernio : cle API", True, ", ".join(f"{a.get('platform')} @{a.get('username')}" for a in accs) or "aucun compte connecte")
                for n in [n for n, v in via.items() if v == "zernio"]:
                    try:
                        a = z.account(n, str(p[n].get("account", "")))
                        show(f"Zernio : compte {n}", True, "@" + str(a.get("username")))
                    except PublishError as e:
                        show(f"Zernio : compte {n}", False, str(e))
            except PublishError as e:
                show("Zernio : cle API", False, str(e))
        if "youtube" in via.values():
            y = YouTubeAPI(cfg)
            if not y.configured():
                show("YouTube : identifiants Google", False, "client_id / client_secret a remplir dans [youtube]")
            elif not y.authorized():
                show("YouTube : autorisation", False, "lance : python clipper.py auth youtube")
            else:
                try:
                    y.access_token(force=True)
                    show("YouTube : autorisation", True)
                except PublishError as e:
                    show("YouTube : autorisation", False, str(e))
    try:
        free = shutil.disk_usage(cfg["_base"]).free / 1e9
        show("espace disque libre", free > 10, f"{free:.0f} Go")
    except OSError:
        pass


def open_path(path: Path, editor: bool = False) -> None:
    try:
        if os.name == "nt":
            if editor:
                subprocess.Popen(["notepad.exe", str(path)])
            else:
                os.startfile(str(path))  # type: ignore[attr-defined]
        else:
            print("A ouvrir :", path)
    except OSError as e:
        print(f"Impossible d'ouvrir {path} : {e}")


MENU = """
  ==========================  Clipper v{v}  ==========================

   1. Lancer : surveiller les lives, fabriquer les clips, publier
   2. Verifier l'installation et les comptes
   3. Ouvrir les reglages (config.toml)
   4. Ouvrir la page des clips
   5. Capture d'un live avec grille (pour placer la facecam)
   6. Autoriser YouTube (une seule fois)
   7. Detection seule, sans video (pour regler la sensibilite)
   0. Quitter
"""


def menu(conf: Path) -> None:
    """Lancement par double-clic : un petit menu, sans ligne de commande."""
    while True:
        print(MENU.format(v=VERSION))
        try:
            choice = input("  Ton choix : ").strip()
        except (EOFError, KeyboardInterrupt):
            return
        if choice == "0":
            return
        try:
            if choice == "3":
                open_path(conf, editor=True)
                continue
            cfg = load_config(str(conf))
            if choice in ("1", "7"):
                cmd_run(cfg, detect_only=(choice == "7"))
                input("\n  Arrete. Appuie sur Entree pour fermer.")
                return
            if choice == "2":
                cmd_doctor(cfg)
            elif choice == "4":
                out_dir = Path(cfg["general"]["output_dir"])
                cmd_gallery(cfg)
                open_path(out_dir / "index.html")
            elif choice == "5":
                name = input("  Nom du streamer (il doit etre en live) : ").strip().lower()
                if name:
                    cmd_snapshot(cfg, name)
                    shot = Path(cfg["_base"]) / f"snapshot_{name}.png"
                    if shot.exists():
                        open_path(shot)
            elif choice == "6":
                YouTubeAPI(cfg).authorize_interactive()
        except SystemExit as e:
            if isinstance(e.code, str):
                print("\n  " + e.code)
        except KeyboardInterrupt:
            print()
        except Exception as e:  # noqa: BLE001
            print(f"\n  Erreur : {e}")
        try:
            input("\n  Appuie sur Entree pour revenir au menu.")
        except (EOFError, KeyboardInterrupt):
            return


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # un accent ou un emoji ne doit jamais faire planter l'affichage
        except (AttributeError, ValueError):
            pass
    if len(sys.argv) >= 3 and sys.argv[1] == "_cudaprobe":
        sys.exit(cuda_probe_main(sys.argv[2]))
    if len(sys.argv) >= 2 and sys.argv[1] == "_streamlink":
        sys.argv = ["streamlink"] + sys.argv[2:]
        from streamlink_cli.main import main as streamlink_main
        sys.exit(streamlink_main())
    if len(sys.argv) >= 2 and sys.argv[1] == "_template":
        sys.stdout.buffer.write(CONFIG_TEMPLATE.encode("utf-8"))
        return
    if len(sys.argv) == 1:
        conf = Path("config.toml") if Path("config.toml").exists() else app_dir() / "config.toml"
        if not conf.exists():
            conf.write_text(CONFIG_TEMPLATE, encoding="utf-8")
            print(f"\n  Fichier de reglages cree : {conf}\n  Commence par le choix 3 pour indiquer tes streamers.")
        menu(conf.resolve())
        return
    ap = argparse.ArgumentParser(description=f"Clipper Twitch -> verticaux 9:16 (v{VERSION})")
    ap.add_argument("command", choices=["run", "watch", "doctor", "snapshot", "gallery", "auth", "post"])
    ap.add_argument("name", nargs="?", help="streamer (snapshot), 'youtube' (auth) ou fichier .mp4 (post)")
    ap.add_argument("--config", default="")
    ap.add_argument("--to", default="", help="plateformes pour 'post' : tiktok,instagram,youtube")
    ap.add_argument("--title", default="", help="titre pour 'post'")
    a = ap.parse_args()
    conf = a.config
    if not conf:
        here = app_dir() / "config.toml"
        conf = "config.toml" if Path("config.toml").exists() or not here.exists() else str(here)
    cfg = load_config(conf)
    if a.command == "doctor":
        cmd_doctor(cfg)
    elif a.command == "snapshot":
        if not a.name:
            sys.exit("Usage : clipper snapshot NOM_DU_STREAMER")
        cmd_snapshot(cfg, a.name)
    elif a.command == "gallery":
        cmd_gallery(cfg)
    elif a.command == "auth":
        cmd_auth(cfg, (a.name or "").lower())
    elif a.command == "post":
        if not a.name:
            sys.exit("Usage : clipper post FICHIER.mp4 --to tiktok,instagram,youtube")
        cmd_post(cfg, a.name, a.to, a.title)
    else:
        cmd_run(cfg, detect_only=(a.command == "watch"))


if __name__ == "__main__":
    main()
