"""Render one source page for offline visual textbook transcription."""
import argparse
import hashlib
import json
import fitz
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("pdf")
parser.add_argument("page", type=int)
parser.add_argument("output")
args = parser.parse_args()
doc = fitz.open(args.pdf)
page = doc[args.page - 1]
pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
target = Path(args.output)
target.parent.mkdir(parents=True, exist_ok=True)
pix.save(target)
print(json.dumps({"path": str(target), "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "width": pix.width, "height": pix.height}))
