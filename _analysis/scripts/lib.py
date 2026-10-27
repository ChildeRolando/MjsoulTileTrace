import json,hashlib,os,sys
from pathlib import Path
ROOT='E:/AgentData/Coach/knowledge/processing'
def sha_file(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''): h.update(b)
    return h.hexdigest()
def load(p):
    return json.load(open(p,encoding='utf-8'))
def rel(p):
    return Path(os.path.relpath(p,ROOT)).as_posix()
