import copy
import hashlib
import unittest
import numpy as np
from pair_learn import fit_pairs, select_rows, weights


class PairRegressionTests(unittest.TestCase):
    def request(self, nonlinear=False):
        rows = []
        for g in range(36):
            for i in range(3):
                x = (g % 12 - 5.5) / 3 + i * .02
                y = x * x - 1 if nonlinear else x * .8 + .2
                rows.append({'pairId': hashlib.sha256(f'{g}-{i}'.encode()).hexdigest(), 'sampleId': str(g), 'groupId': str(g),
                             'split': 'test' if g >= 27 else 'train', 'features': {'x': x, 'noise': g % 3}, 'y': y})
        return {'rows': rows, 'allFeatures': ['x', 'noise'], 'featureSets': {'full': ['x', 'noise']},
                'options': {'maxTrainPairs': 6000, 'sensitiveGap': .01}, 'evaluate': True}

    def test_linear_boundary_and_serialized_predictions(self):
        result = fit_pairs(self.request()); m = result['models']['full']
        self.assertEqual(m['model']['kernel'], 'linear')
        self.assertLess(m['test']['mae'], .05)
        self.assertGreater(m['test']['signAccuracy'], .95)
        self.assertEqual(len(m['oof']), len(result['trainingPairIds']))

    def test_nonlinear_boundary(self):
        m = fit_pairs(self.request(True))['models']['full']
        self.assertEqual(m['model']['kernel'], 'rbf')
        self.assertLess(m['test']['mae'], .15)

    def test_holdout_cannot_change_fit_selection_explanation_or_oof(self):
        a = self.request(); a['evaluate'] = False
        b = copy.deepcopy(a)
        for r in b['rows']:
            if r['split'] == 'test':
                r['y'] = 10000
                r['features']['x'] = 9999
        self.assertEqual(fit_pairs(a), fit_pairs(b))

    def test_caps_and_equal_group_weights_cover_states_before_extra_pairs(self):
        rows = self.request()['rows']
        rows += [dict(rows[0], pairId=hashlib.sha256(str(i).encode()).hexdigest()) for i in range(20)]
        chosen = select_rows(rows, 36)
        self.assertEqual(len({r['sampleId'] for r in chosen}), 36)
        w = weights(rows)
        mass = [sum(weight for r, weight in zip(rows, w) if r['groupId'] == str(g)) for g in range(36)]
        self.assertTrue(np.allclose(mass, mass[0]))

    def test_insufficient_groups_and_overlap_fail_closed(self):
        request = self.request(); request['rows'] = request['rows'][:6]
        self.assertEqual(fit_pairs(request)['models']['full']['status'], 'insufficient_evidence')
        request = self.request(); request['rows'][-1]['groupId'] = '0'
        with self.assertRaisesRegex(ValueError, 'group_leakage'):
            fit_pairs(request)


if __name__ == '__main__':
    unittest.main()
