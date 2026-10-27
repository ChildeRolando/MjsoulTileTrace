import hashlib,json,shutil
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing');OUT=Path('.multica/delivery/coac244-inline-text-20261027');STAGE=ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027'
original=Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/stage-web-textbook.mjs')
helper=STAGE/'inline-display.mjs';shutil.copyfile('inline-display.mjs',helper)
before=original.read_bytes();s=before.decode('utf-8');s="import {deriveInlineDisplay} from '"+helper.as_uri()+"';\n"+s
old='let presentation=candidate,definitionBoundary;';assert s.count(old)==1
s=s.replace(old,"let presentation=candidate.provenance.revision?.inlineJapanese?deriveInlineDisplay(candidate):candidate,definitionBoundary;if(candidate.provenance.revision?.inlineJapanese&&definitionSidecarPath)throw Error('inline_display_combined_sidecar_not_supported');")
old='sliceSourceSegments(original.sourceSegments,original.text,offset,offset+text.length)';assert s.count(old)==1
s=s.replace(old,'sliceSourceSegments(original.displaySegments??original.sourceSegments,original.text,offset,offset+text.length)')
sha=lambda b:hashlib.sha256(b).hexdigest()
dest=original.with_name('stage-web-textbook.coac244-inline-'+sha(s.encode())[:16]+'.mjs')
assert not dest.exists();dest.write_text(s,encoding='utf-8',newline='\n');assert original.read_bytes()==before
shutil.copyfile(dest,OUT/'stage-web-textbook.inline-frozen.mjs');shutil.copyfile(helper,OUT/'inline-display.mjs')
manifest={'kind':'display-only-shadow-stager-original-untouched','original':{'path':str(original),'sha256':sha(before)},'module':{'path':str(dest),'sha256':sha(dest.read_bytes())},'helper':{'path':str(helper),'sha256':sha(helper.read_bytes())},'modelCalls':0}
(STAGE/'display-stage-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');shutil.copyfile(STAGE/'display-stage-manifest.json',OUT/'display-stage-manifest.json')
print(json.dumps(manifest))
