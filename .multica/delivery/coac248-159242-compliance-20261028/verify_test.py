import copy,json,pathlib,unittest,tempfile
from verify import R,PINS,load,anchors,verify,exact_bytes
class Checks(unittest.TestCase):
 def fixture(self,k):
  e=load(R/f'integration/coac249-next3-{k}-limited-fidelity-evidence-20261028.json')
  return [k,load(e['candidate']['path']),load(e['source']['path']),load(e['raw']['path'])['output'],e]
 def test_exact_current_files(self):
  for key in PINS:self.assertTrue(verify(key)['independentConditionsAlreadySatisfied'])
 def test_missing_or_guessed_unknown(self):
  for key in PINS:
   for field in ['unknowns','transcription']:
    f=self.fixture(key);figure=next(x for x in f[1]['figures'] if x['figureId']==PINS[key]['figureId'])
    if field=='unknowns':figure['unknowns']=[]
    else:figure['transcription']=figure['transcription'].replace(PINS[key]['unknownLiteral'],'3m')
    with self.assertRaises(AssertionError):anchors(*f)
 def test_critical_author_conditions(self):
  for key,needle in [('159','1500'),('159','（当然5万的碰是不行的= =）'),('159','ALL LAST有微弱的差距'),('242','上家的3万'),('242','也许'),('242','基本'),('242','当和自己争TOP的玩家是亲家时')]:
   f=self.fixture(key)
   for b in f[1]['body']['blocks']:
    if b['type']=='text':b['text']=b['text'].replace(needle,'删除')
   with self.assertRaises(AssertionError):anchors(*f)
 def test_no_uncertain_relabel(self):
  for key in PINS:
   f=self.fixture(key);next(p for p in f[3]['propositions'] if p['dependsOnExactTile']=='uncertain')['dependsOnExactTile']='no'
   with self.assertRaises(AssertionError):anchors(*f)
 def test_wrong_position_or_conclusion(self):
  for key in PINS:
   for field in ['bbox','conclusion']:
    f=self.fixture(key)
    if field=='bbox':f[4]['target']['bbox'][0]+=1
    else:f[3]['conclusion']='must-read-before-acceptance'
    with self.assertRaises(AssertionError):anchors(*f)
 def test_exact_sha_rejects_other_bytes(self):
  with tempfile.TemporaryDirectory(prefix='coac248-exact-sha-') as folder:
   p=pathlib.Path(folder)/'candidate.json';p.write_bytes(b'{}')
   for key in PINS:
    with self.assertRaises(AssertionError):exact_bytes(p,PINS[key]['candidateSha256'])
 def test_other_canonical_rejected(self):
  for key in PINS:
   f=self.fixture(key);f[4]['canonical']='79-cn-chapter-217-4'
   with self.assertRaises(AssertionError):anchors(*f)
if __name__=='__main__':unittest.main(verbosity=2)
