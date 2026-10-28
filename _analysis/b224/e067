"""Decode a bound stage image; PNG passes through, JPEG gets an exact RGBA PNG display.

The textbook corpus/MCP image contract remains PNG. This does not modify a candidate.
"""
import base64
import hashlib
import io
import json
import sys
from pathlib import Path
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = False
request = json.load(sys.stdin)
raw = Path(request["path"]).read_bytes()
digest = lambda data: hashlib.sha256(data).hexdigest()
if digest(raw) != request["sha256"]:
    raise ValueError("web_stage_image_identity")
if raw.startswith(b"\x89PNG\r\n\x1a\n"):
    expected_format, mime = "PNG", "image/png"
elif raw.startswith(b"\xff\xd8\xff"):
    expected_format, mime = "JPEG", "image/jpeg"
else:
    raise ValueError("web_stage_image_format")
suffix = Path(request["path"]).suffix.lower()
if suffix not in ({".png"} if mime == "image/png" else {".jpg", ".jpeg"}):
    raise ValueError("web_stage_image_mime_mismatch")
declared = request.get("contentType")
if declared and declared.split(";", 1)[0].strip().lower() != mime:
    raise ValueError("web_stage_image_mime_mismatch")
with Image.open(io.BytesIO(raw)) as check:
    if check.format != expected_format or getattr(check, "n_frames", 1) != 1:
        raise ValueError("web_stage_image_format")
    check.verify()
with Image.open(io.BytesIO(raw)) as image:
    image.load()
    decoded = image.convert("RGBA")
    pixels = decoded.tobytes()
    result = dict(sourceMimeType=mime, sourceSha256=digest(raw), width=decoded.width,
                  height=decoded.height, decodedRgbaSha256=digest(pixels), derived=False)
    if mime == "image/jpeg":
        stream = io.BytesIO()
        decoded.save(stream, format="PNG")
        png = stream.getvalue()
        with Image.open(io.BytesIO(png)) as saved:
            saved.verify()
        with Image.open(io.BytesIO(png)) as saved:
            saved.load()
            if saved.size != decoded.size or saved.convert("RGBA").tobytes() != pixels:
                raise ValueError("web_stage_image_pixels_changed")
        result.update(derived=True, derivedMimeType="image/png", derivedSha256=digest(png),
                      derivedRgbaSha256=digest(pixels), pixelExact=True,
                      method="single-source-jpeg-lossless-decoded-rgba-to-png",
                      pngBase64=base64.b64encode(png).decode("ascii"))
print(json.dumps(result))
