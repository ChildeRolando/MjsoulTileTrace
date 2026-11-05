import ast,functools,itertools,pathlib,unittest
p=pathlib.Path(__file__).with_name('public_preflight.py');tree=ast.parse(p.read_text(encoding='utf-8-sig'));namespace={'functools':functools,'itertools':itertools};exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('ti','tid','partitions')],type_ignores=[]),str(p),'exec'),namespace);partitions=namespace['partitions']
class PublicWitnessTest(unittest.TestCase):
 def test_exact_six_block_residual_and_alternate_order(self):
  a=[0]*34
  for i in [0,1,2,15,16,17,20,21,22,23,31,31]:a[i]+=1
  got=partitions(tuple(a),2,2,1);self.assertTrue(got)
  self.assertIn((('顺子',(0,1,2)),('顺子',(15,16,17)),('两面',(20,21)),('两面',(22,23)),('对子',(31,31))),got)
  self.assertEqual(len(got),len(set(got)))
 def test_edge_taatsu_is_not_two_sided(self):
  a=[0]*34
  for i in [0,1,2,15,16,17,18,19,22,23,31,31]:a[i]+=1
  for witness in partitions(tuple(a),2,2,1):
   self.assertNotIn(('两面',(18,19)),witness)
 def test_empty_quota_and_missing_tiles(self):
  self.assertEqual(partitions(tuple([0]*34),0,0,0),((),));self.assertEqual(partitions(tuple([0]*34),2,2,1),())
if __name__=='__main__':unittest.main()
