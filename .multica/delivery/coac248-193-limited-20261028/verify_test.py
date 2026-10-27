"""Zero-call regression checks for this single bound supplement, not a general gate."""
import copy,unittest
from verify import verify,load,bound,validate_conditions,validate_binding,P
class Exact193(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.a=load(P);cls.c=load(cls.a['candidate']['path']);cls.s=load(cls.a['source']['path'])
  cls.m=cls.a['modelReview'];cls.sup=cls.a['sourceVersionSupplement193'];cls.stage=load(cls.sup['stage']+'/textbook-bodies.json')
 def scope(self,c=None,s=None,m=None,sup=None,stage=None):
  return validate_conditions(c or self.c,s or self.s,m or self.m,sup or self.sup,stage or self.stage)
 def test_original(self):
  x=verify();self.assertTrue(x['currentCandidateMeetsIndependentDisplayConditions']);self.assertFalse(x['standardWholeArticlePassed'])
  self.assertEqual(len(x['remainingUncertain']),1)
 def test_unknown_and_red_circle_cannot_disappear(self):
  for kind in ['guess','remove','duplicate','red-circle']:
   c=copy.deepcopy(self.c);f=c['figures'][-1]
   if kind=='guess':f['transcription']=f['transcription'].replace('万子牌（点数未能可靠辨认）','3m')
   if kind=='remove':f['unknowns']=[]
   if kind=='duplicate':f['unknowns']*=2
   if kind=='red-circle':f['transcription']=f['transcription'].replace('上排第2张7p有红圈。','')
   with self.subTest(kind=kind),self.assertRaises(AssertionError):self.scope(c=c)
 def test_author_conditions_and_safety_scope_cannot_change(self):
  for needle in ['初学者','一般情况下','可能','往往','至少']:
   c=copy.deepcopy(self.c);b=next(b for b in c['body']['blocks'] if needle in b.get('text',''));b['text']=b['text'].replace(needle,'绝对',1)
   with self.subTest(needle=needle),self.assertRaises(AssertionError):self.scope(c=c)
 def test_version_fragments_not_filled_from_pdf(self):
  c=copy.deepcopy(self.c);b=next(b for b in c['body']['blocks'] if b.get('sourceBlockIds')==['79-bilibili-cn:cv1765377:b0008']);b['text']+='两面听牌'
  with self.assertRaises(AssertionError):self.scope(c=c)
  stage=copy.deepcopy(self.stage);stage['chapters'][0]['translatorNote']='原文完整'
  with self.assertRaises(AssertionError):self.scope(stage=stage)
  stage=copy.deepcopy(self.stage);stage['chapters'][0]['blocks'][1]['text']+='（主控补充）'
  with self.assertRaises(AssertionError):self.scope(stage=stage)
 def test_independent_uncertain_and_point_not_promoted(self):
  for kind in ['uncertain','point','conclusion']:
   m=copy.deepcopy(self.m)
   if kind=='uncertain':m['contributionChecks'][1]['faithfulWithCurrentExplicitUnknown']='yes'
   if kind=='point':m['pointChecks'][0]['tileCodeOrUnknown']='3m'
   if kind=='conclusion':m['conclusion']='passed'
   with self.subTest(kind=kind),self.assertRaises(AssertionError):self.scope(m=m)
 def test_other_canonical_source_sha_and_coordinate_rejected(self):
  b=self.a['call']['binding'];validate_binding(b)
  for field in ['canonical','productionSha256','sourceFileSha256','originalAuditSha256','targetFigureIds','points']:
   x=copy.deepcopy(b)
   if field=='points':x[field][0]['bbox'][0]+=1
   elif field=='targetFigureIds':x[field]=['other']
   else:x[field]='other'
   with self.subTest(field=field),self.assertRaises(AssertionError):validate_binding(x)
if __name__=='__main__':unittest.main()
