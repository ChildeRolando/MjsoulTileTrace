import copy,unittest
from verify import verify,load,D,conditions,validate_binding,PINS
class ExactPair(unittest.TestCase):
 def inputs(self,k):
  a=load(D/f'receipt-{k}.json');return load(a['candidate']['path']),load(a['source']['path']),a['modelReview'],load(D/f'current-binding-{k}.json')
 def reject(self,k,mutate):
  args=list(self.inputs(k));mutate(*args)
  with self.assertRaises(AssertionError):conditions(k,*args)
 def test_exact_originals(self):
  for k in PINS:
   x=verify(k);self.assertFalse(x['standardWholeChapterPassed']);self.assertFalse(x['admissionGranted'])
 def test_unknown_cannot_be_guessed_removed_or_duplicated(self):
  for k in PINS:
   for kind in ['guess','remove','duplicate']:
    def mutate(c,s,m,b):
     f=c['figures'][0]
     if kind=='guess':f['transcription']+=' 3m'
     elif kind=='remove':f['unknowns']=[]
     else:f['unknowns']*=2
    with self.subTest(k=k,kind=kind):self.reject(k,mutate)
 def test_body_order_segments_marks_href_context_and_caption_retained(self):
  for k in PINS:
   for field in ['order','sourceSegments','tableContext','caption','sourceNotes']:
    def mutate(c,s,m,b):
     if field=='order':c['body']['blocks'].reverse()
     elif field=='sourceSegments':c['body']['blocks'][0]['sourceSegments']=[{'text':'changed','marks':['strong'],'href':'changed'}]
     elif field=='tableContext':c['body']['blocks'][0]['tableContext']={'changed':True}
     else:c['figures'][-1][field]=[] if field=='sourceNotes' else 'changed'
    with self.subTest(k=k,field=field):self.reject(k,mutate)
 def test_author_conditions_not_deleted_or_strengthened(self):
  for k,words in [('208',['没有人立直','一向听','可以考虑','危险牌','七对子']),('276',['11600','6索','平和','进张','基本'])]:
   for word in words:
    def mutate(c,s,m,b):
     z=next(x for x in c['body']['blocks'] if word in x.get('text',''));z['text']=z['text'].replace(word,'绝对安全',1)
    with self.subTest(k=k,word=word):self.reject(k,mutate)
 def test_independent_decision_not_promoted(self):
  for k in PINS:
   for field in ['conclusion','point','contribution','limitations']:
    def mutate(c,s,m,b):
     if field=='conclusion':m['conclusion']='passed'
     elif field=='point':m['pointChecks'][0]['tileCodeOrUnknown']='3m'
     elif field=='contribution':m['contributionChecks'][0]['requiresExactPointForAuthorArgument']='uncertain'
     else:b['mandatoryDisplayLimits']=b['mandatoryDisplayLimits'][:-1]
    with self.subTest(k=k,field=field):self.reject(k,mutate)
 def test_exact_candidate_source_audit_canonical_and_bbox(self):
  for k in PINS:
   b=load(D/f'receipt-{k}.json')['call']['binding'];validate_binding(k,b)
   for field in ['canonical','productionSha256','sourceFileSha256','originalAuditSha256','points']:
    z=copy.deepcopy(b)
    if field=='points':z[field][0]['bbox'][0]+=1
    else:z[field]='wrong'
    with self.subTest(k=k,field=field),self.assertRaises(AssertionError):validate_binding(k,z)
if __name__=='__main__':unittest.main()
