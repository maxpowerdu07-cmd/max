import math, random, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import clipper as C

import copy
cfg = copy.deepcopy(C.DEFAULTS); cfg["channels"] = ["a"]; cfg["_base"] = "."
c = C.make_chan_cfg(cfg, "a")
random.seed(11)
T0 = 1_000_000.0

def poisson(lam):
    L = math.exp(-lam); k = 0; p = 1.0
    while p > L:
        k += 1; p *= random.random()
    return k - 1

WORDS = ["hello", "ok", "gg wp", "salut", "il fait quoi", "ah ouais", "tranquille"]
HYPE = ["KEKW", "LUL", "mdrrrr", "PTDR", "OMEGALUL", "wtf ???", "CLIP CA", "noooon mdr", "😂😂"]

def simulate(rate_fn, seconds, name, users=5000, hype_fn=lambda s: 0.05, hooks=None, cc=c):
    d = C.Detector("a", cc, now=T0)
    events = []
    for s in range(seconds):
        now = T0 + s
        if hooks and s in hooks:
            hooks[s](d, now)
        for _ in range(poisson(rate_fn(s))):
            u = "u%d" % random.randint(1, users if not callable(users) else users(s))
            text = random.choice(HYPE) if random.random() < hype_fn(s) else random.choice(WORDS)
            d.add_message(now + random.random() * 0.99, u, text)
        ev = d.tick(now + 1.0)
        if ev:
            events.append(ev)
    print(f"{name}: {len(events)} evenement(s)")
    for e in events:
        print(f"    seuil {e.t0-T0:5.0f}s  debut {e.t_on-T0:5.0f}s  pic {e.t_peak-T0:5.0f}s  x{e.ratio:.1f}  {e.rate:.1f}/s vs {e.baseline:.1f}"
              f"  uniq {e.uniq}  hype {e.hype_share:.2f}  {e.mood}  note {e.score}  fenetre [{e.t_start-T0:.0f},{e.t_end-T0:.0f}]  top {e.top_chat[:2]}")
    return events

# 1) chat stable (30 min) : aucun clip
ev = simulate(lambda s: 10, 1800, "stable 10/s 30 min")
assert not ev
# 2) pic net x3.5 a t=400 pendant 15 s, chat qui rit
ev = simulate(lambda s: 35 if 400 <= s < 415 else 10, 700, "pic x3.5 a 400s", hype_fn=lambda s: 0.6 if 400 <= s < 416 else 0.05)
assert len(ev) == 1 and 398 <= ev[0].t_on - T0 <= 403, ev
assert ev[0].mood == "drole" and ev[0].score >= 50
assert ev[0].t_start - T0 < 388 and ev[0].t_end - T0 >= 415
# 3) deux pics rapproches (70 s d'ecart) : les deux detectes (base robuste)
ev = simulate(lambda s: 40 if (300 <= s < 312 or 370 <= s < 382) else 10, 600, "deux pics a 300s et 370s")
assert len(ev) == 2
# 4) spam de 3 comptes (bots) : 60 msg/s mais 3 personnes -> rien
ev = simulate(lambda s: 60 if 300 <= s < 320 else 8, 500, "spam de 3 comptes", users=lambda s: 3 if 300 <= s < 320 else 5000)
assert not ev
# 5) petit chat (1 msg/s) avec un pic a 9/s : detecte ; petit chat sans pic : rien
ev = simulate(lambda s: 9 if 300 <= s < 312 else 1, 500, "petit chat, pic 9/s")
assert len(ev) == 1
assert not simulate(lambda s: 0.5, 900, "tout petit chat stable")
# 6) raid : le chat explose juste apres un raid -> ignore
ev = simulate(lambda s: 45 if 300 <= s < 330 else 10, 600, "raid a 299s", hooks={299: lambda d, now: d.mute(now)})
assert not ev
# 7) coupure du chat de 40 s (reconnexion) : pas de faux pic au retour
def rate7(s): return 0 if 300 <= s < 340 else 10
ev = simulate(rate7, 700, "coupure 300-340s", hooks={340: lambda d, now: d.resume(now)})
assert not ev
# 8) meme coupure puis vrai pic 80 s apres le retour : detecte
ev = simulate(lambda s: 0 if 300 <= s < 340 else (40 if 420 <= s < 432 else 10), 700, "coupure puis pic a 420s", hooks={340: lambda d, now: d.resume(now)})
assert len(ev) == 1
# 9) montee lente (x2.5 en 60 s) : au plus 1 clip
ev = simulate(lambda s: 10 + max(0, min(15, (s - 300) // 4)) if s < 420 else 10, 700, "montee lente")
assert len(ev) <= 1
# 10) gros chat tres bruite (rafales) : pas de mitraillage
random.seed(3)
burst = [random.choice([0.4, 0.7, 1.0, 1.4, 2.0]) for _ in range(2000)]
ev = simulate(lambda s: 60 * burst[s // 5], 1500, "gros chat en rafales (x0.4 a x2)")
print("   -> %d clips en 25 min sur un chat instable" % len(ev)); assert len(ev) <= 4
# lexique
L = C.Lexicon(["banger"])
for txt, exp in [("KEKW", "drole"), ("mdrrrrrr", "drole"), ("Pog", "hype"), ("CLIP IT", "hype"), ("wtf ???", "choc"), ("hello", None), ("banger", "hype"), ("😂😂😂", "drole"), ("trip", None), ("explosé", "drole")]:
    _n, mask, clip = L.classify(txt)
    got = None if not mask else C.MOOD_NAMES[[m for m in (1, 2, 4) if mask & m][0]]
    assert got == exp, (txt, got, exp)
assert L.classify("clip clip CLIP")[2] and not L.classify("eclipse")[2]
# parse IRC
t, p, cmd, pr = C.parse_irc("@badge-info=;badges=;color=#FF4500;display-name=Foo;emotes=;id=x;user-type= :foo!foo@foo.tmi.twitch.tv PRIVMSG #chan :salut : ca va ?")
assert (cmd, pr, p.split("!")[0], t["display-name"]) == ("PRIVMSG", ["#chan", "salut : ca va ?"], "foo", "Foo")
t, p, cmd, pr = C.parse_irc("@msg-id=raid;msg-param-viewerCount=1500;system-msg=x\\sraiding :tmi.twitch.tv USERNOTICE #chan")
assert cmd == "USERNOTICE" and pr == ["#chan"] and t["msg-id"] == "raid"
assert C.parse_irc("PING :tmi.twitch.tv")[2:] == ("PING", ["tmi.twitch.tv"])
assert C.parse_irc(":foo!foo@foo.tmi.twitch.tv PRIVMSG #chan :hello")[2:] == ("PRIVMSG", ["#chan", "hello"])
assert C.parse_irc(":tmi.twitch.tv RECONNECT")[2] == "RECONNECT"
assert C.parse_irc("")[2] == ""
print("TESTS DETECTION OK")
