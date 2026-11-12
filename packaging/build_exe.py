"""Fabrique dist/Clipper/Clipper.exe avec PyInstaller, y ajoute ffmpeg et les fichiers utiles, puis zippe."""
import shutil, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent.parent
pk = root / "packaging"
# icone : triangle "lecture" jaune sur fond sombre arrondi
img = Image.new("RGBA", (256, 256), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
d.rounded_rectangle((8, 8, 248, 248), radius=56, fill=(24, 27, 34, 255))
d.polygon([(96, 70), (96, 186), (196, 128)], fill=(255, 230, 0, 255))
img.save(pk / "clipper.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--console", "--name", "Clipper",
       "--icon", str(pk / "clipper.ico"), "--distpath", str(root / "dist"), "--workpath", str(root / "build"), "--specpath", str(root / "build"),
       "--collect-all", "streamlink", "--collect-submodules", "streamlink_cli", "--hidden-import", "streamlink_cli.main",
       "--collect-all", "pycountry", "--collect-all", "faster_whisper", "--collect-all", "ctranslate2", "--collect-all", "onnxruntime",
       "--collect-all", "av", "--collect-all", "tokenizers", "--collect-all", "huggingface_hub", "--collect-data", "tzdata",
       "--copy-metadata", "streamlink", str(root / "clipper.py")]
subprocess.run(cmd, check=True, cwd=root)
out = root / "dist" / "Clipper"
assert (out / "Clipper.exe").exists()
shutil.copy(root / "tools" / "ffmpeg.exe", out / "ffmpeg.exe")
lic = root / "tools" / "LICENSE"
(out / "ffmpeg-LICENCE.txt").write_text(
    "ffmpeg.exe est un logiciel libre distribue sous licence GNU GPL v3 (build 'essentials' de gyan.dev).\n"
    "Sources et builds : https://www.gyan.dev/ffmpeg/builds/  -  https://ffmpeg.org\n\n" + (lic.read_text(errors="replace") if lic.exists() else ""), encoding="utf-8")
shutil.copy(root / "config.toml", out / "config.toml")
shutil.copy(pk / "LISEZ-MOI.txt", out / "LISEZ-MOI.txt")
size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
print(f"dist/Clipper : {size // 1_000_000} Mo")
