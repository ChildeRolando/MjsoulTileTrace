"""Bind original figure bytes and deterministic nearest-neighbor reading views."""
import hashlib,json,sys
from pathlib import Path
from PIL import Image

root=Path("E:/AgentData/Coach/knowledge/processing").resolve()
sha=lambda b:hashlib.sha256(b).hexdigest()
def bound(value):
 path=(root/value).resolve()
 if not path.is_relative_to(root):raise ValueError("visual_input_outside_processing")
 return path
request=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
renderer_sha=sha(Path(__file__).read_bytes());folder=root/"web-production/v1/reading-views"/renderer_sha
folder.mkdir(parents=True,exist_ok=True);records=[];seen=set()
for binding in request["sourceAssetBindings"]:
 if binding["assetId"] in seen:continue
 seen.add(binding["assetId"]);source=bound(binding["path"]);data=source.read_bytes()
 if sha(data)!=binding["sha256"]:raise ValueError("visual_original_changed")
 image=Image.open(source)
 if getattr(image,"n_frames",1)!=1:raise ValueError("visual_multiframe_requires_explicit_handling")
 rgba=image.convert("RGBA")
 common={"assetId":binding["assetId"],"sourcePath":binding["path"],"sourceSha256":binding["sha256"],"rendererSha256":renderer_sha}
 records.append({**common,"path":binding["path"],"sha256":binding["sha256"],"role":"original","scale":1,"resampling":"none","width":rgba.width,"height":rgba.height})
 scale=4 if max(rgba.size)<=1000 and rgba.height<=256 else 2 if max(rgba.size)<=1600 and rgba.height<=600 else 1
 if scale==1:continue
 path=folder/(binding["sha256"]+f".x{scale}.png");zoom=rgba.resize((rgba.width*scale,rgba.height*scale),Image.Resampling.NEAREST)
 if path.exists():
  saved=Image.open(path).convert("RGBA")
  if saved.size!=zoom.size or saved.tobytes()!=zoom.tobytes():raise ValueError("visual_existing_zoom_changed")
 else:zoom.save(path)
 records.append({**common,"path":path.relative_to(root).as_posix(),"sha256":sha(path.read_bytes()),"role":"nearest-neighbor-enlargement","scale":scale,"resampling":"nearest","width":zoom.width,"height":zoom.height})
print(json.dumps({"visualInputs":records,"rendererSha256":renderer_sha}))
