"""Losslessly join an existing web figure's ordered original PNGs for display."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image

parser=argparse.ArgumentParser();parser.add_argument("candidate");args=parser.parse_args()
root=Path("E:/AgentData/Coach/knowledge/processing");parent=Path(args.candidate).resolve();parent_bytes=parent.read_bytes();candidate=json.loads(parent_bytes)
if candidate["schema"]!="coach-textbook-web-article-draft/1":raise ValueError("unsupported_web_candidate")
digest=lambda b:hashlib.sha256(b).hexdigest()
output=parent.with_name(parent.stem+".display.json")
if output.exists():raise ValueError("presentation_candidate_already_exists_preserve_it")
render_sha=digest(Path(__file__).read_bytes());folder=root/"web-production/v1/presentations"/candidate["source"]["sourceId"]/candidate["source"]["articleId"]/digest(parent_bytes)[:16]
folder.mkdir(parents=True,exist_ok=True)
for index,figure in enumerate(candidate["figures"]):
 images=[]
 for binding in figure["sourceAssetBindings"]:
  path=(root/binding["path"]).resolve()
  if not path.is_relative_to(root):raise ValueError("asset_outside_processing")
  data=path.read_bytes()
  if digest(data)!=binding["sha256"]:raise ValueError("original_asset_changed")
  original=Image.open(path)
  if getattr(original,"n_frames",1)!=1:raise ValueError("multiframe_source_requires_explicit_processing")
  images.append(original.convert("RGBA"))
 width=sum(im.width for im in images);height=max(im.height for im in images);canvas=Image.new("RGBA",(width,height),(0,0,0,0));x=0
 for im in images:
  canvas.paste(im,(x,height-im.height));x+=im.width
 path=folder/(f"figure-{index+1:04d}.png");canvas.save(path)
 figure["presentationAsset"]={"path":path.relative_to(root).as_posix(),"sha256":digest(path.read_bytes()),"width":width,"height":height,"derivation":{"kind":"single-source-image-rgba-to-png" if len(images)==1 else "lossless-source-images-in-original-horizontal-order","alignment":"original-size" if len(images)==1 else "bottom","sourceAssetBindings":figure["sourceAssetBindings"],"rendererSha256":render_sha}}
candidate["provenance"]["derivedFromCandidate"]={"path":parent.relative_to(root).as_posix(),"sha256":digest(parent_bytes),"reason":"Lossless display images only; translations and source figure sequences unchanged"}
candidate["provenance"]["presentationRendererSha256"]=render_sha
candidate.pop("candidateSha256",None);candidate["candidateSha256"]=digest(json.dumps(candidate,ensure_ascii=False,separators=(",",":")).encode())
output.write_text(json.dumps(candidate,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"candidatePath":str(output),"candidateFileSha256":digest(output.read_bytes()),"figures":len(candidate["figures"]),"modelCalls":0}))
