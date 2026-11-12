"""Telecharge ffmpeg pour Windows (build 'essentials' de gyan.dev, publie sur GitHub) dans tools/."""
import shutil, subprocess, sys, zipfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
dl, tools = root / "ffdl", root / "tools"
dl.mkdir(exist_ok=True); tools.mkdir(exist_ok=True)
r = subprocess.run(["gh", "release", "download", "--repo", "GyanD/codexffmpeg", "--pattern", "*essentials_build.zip", "--dir", str(dl), "--clobber"])
zips = sorted(dl.glob("*.zip"))
if r.returncode == 0 and zips:
    with zipfile.ZipFile(zips[-1]) as z:
        names = [n for n in z.namelist() if n.endswith(("bin/ffmpeg.exe", "LICENSE", "README.txt"))]
        for n in names:
            (tools / Path(n).name).write_bytes(z.read(n))
    print("ffmpeg :", zips[-1].name)
else:
    print("telechargement GitHub impossible, essai avec chocolatey")
    subprocess.run(["choco", "install", "ffmpeg", "-y", "--no-progress"], check=True)
    found = sorted(Path("C:/ProgramData/chocolatey/lib").glob("ffmpeg*/tools/**/bin/ffmpeg.exe"))
    if not found:
        sys.exit("ffmpeg introuvable apres installation")
    shutil.copy(found[0], tools / "ffmpeg.exe")
size = (tools / "ffmpeg.exe").stat().st_size
assert size > 30_000_000, size
print(f"tools/ffmpeg.exe : {size // 1_000_000} Mo")
