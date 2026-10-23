"""Render a high-resolution local crop covering one textbook visual row."""
import argparse
import hashlib
import json
import fitz
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("pdf"); p.add_argument("page", type=int)
p.add_argument("x0", type=float); p.add_argument("y0", type=float)
p.add_argument("x1", type=float); p.add_argument("y1", type=float)
p.add_argument("output"); p.add_argument("--scale", type=float, default=5.0)
a = p.parse_args()
doc = fitz.open(a.pdf)
page = doc[a.page - 1]
clip = fitz.Rect(a.x0, a.y0, a.x1, a.y1) & page.rect
pix = page.get_pixmap(matrix=fitz.Matrix(a.scale, a.scale), clip=clip, alpha=False)
target = Path(a.output)
target.parent.mkdir(parents=True, exist_ok=True)
pix.save(target)
print(json.dumps({"path": str(target), "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "width": pix.width, "height": pix.height}))
