import copy,unittest
from verify import inputs,build_overlay,assemble_preview,validate_overlay,verify
class ExactOverlay(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.a,_,cls.c,*_=inputs();cls.o=build_overlay(cls.a,cls.c)
 def test_all_six_and_original_order(self):
  x=verify();self.assertEqual(len(x['limitations']),6);self.assertFalse(x['libraryOverlayInstalledClaimed'])
  b=assemble_preview(self.o,self.a,self.c);self.assertEqual(b[20],self.c['body']['blocks'][20]);self.assertEqual(b[27],self.c['body']['blocks'][21])
 def test_drop_duplicate_reorder_or_reword_notes(self):
  for kind in ['drop','duplicate','reorder','reword']:
   o=copy.deepcopy(self.o)
   if kind=='drop':o['notes'].pop()
   if kind=='duplicate':o['notes'][1]=o['notes'][0]
   if kind=='reorder':o['notes'].reverse()
   if kind=='reword':o['notes'][1]['text']='此牌绝对安全'
   with self.subTest(kind=kind),self.assertRaises(AssertionError):validate_overlay(o,self.a,self.c)
 def test_no_author_source_or_false_pass(self):
  for kind in ['author','marker','receipt','source','candidate','canonical','pass']:
   o=copy.deepcopy(self.o)
   if kind=='author':o['notes'][0]['authorText']=True
   if kind=='marker':o['notes'][0]['text']=o['notes'][0]['text'].replace('（非原文）','')
   if kind=='receipt':o['independentReceipt']['sha256']='wrong'
   if kind=='source':o['source']['sha256']='wrong'
   if kind=='candidate':o['candidate']['sha256']='wrong'
   if kind=='canonical':o['canonical']='79-cn-chapter-215-4'
   if kind=='pass':o['admissionGranted']=True
   with self.subTest(kind=kind),self.assertRaises(AssertionError):validate_overlay(o,self.a,self.c)
 def test_no_mid_argument_or_wrong_boundary(self):
  for key in ['afterCandidatePointer','afterSourceBlockId','afterFullBlockSha256','beforeSourceBlockId']:
   o=copy.deepcopy(self.o);o['placement'][key]='wrong'
   with self.subTest(key=key),self.assertRaises(AssertionError):validate_overlay(o,self.a,self.c)
 def test_candidate_unknown_body_and_original_uncertain_preserved(self):
  for kind in ['unknown','body','uncertain']:
   a,c=copy.deepcopy(self.a),copy.deepcopy(self.c)
   if kind=='unknown':c['figures'][1]['unknowns']=[]
   if kind=='body':c['body']['blocks'][20]['text']='已知对手没有听牌'
   if kind=='uncertain':a['modelReview']['issues']=[]
   with self.subTest(kind=kind),self.assertRaises(AssertionError):validate_overlay(self.o,a,c)
if __name__=='__main__':unittest.main()
