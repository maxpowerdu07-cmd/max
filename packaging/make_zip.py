"""Zippe dist/Clipper (apres les tests : sans les fichiers qu'ils ont crees)."""
import shutil
from pathlib import Path
root = Path(__file__).resolve().parent.parent
out = root / "dist" / "Clipper"
for junk in ("clips", "buffer", "logs", "youtube_token.json"):
    p = out / junk
    shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
shutil.copy(root / "config.toml", out / "config.toml")
z = shutil.make_archive(str(root / "Clipper-Windows"), "zip", root_dir=root / "dist", base_dir="Clipper")
print(f"{z} : {Path(z).stat().st_size // 1_000_000} Mo")
