"""Verify source pixels, protected human scope, blank checklist and proposal boundaries."""
import copy, hashlib, json
from pathlib import Path
from PIL import Image
import fitz

HERE = Path(__file__).resolve().parent
load = lambda p: json.loads(Path(p).read_bytes())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
packet = load(HERE / 'packet.json')
root = Path(packet['path'])
manifest = load(root / 'manifest.json')
geometry = load(root / 'targets.json')
proposal = load(root / 'trusted-only-proposal.json')
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)

def valid_scope(g):
    expected = load(HERE.parent / 'b35-count311/257-scope.json')['minimalUnresolvedMachinePositions']
    expected = [(p['scope'], p['ordinal'], p['tile']) for p in expected]
    human = {(p['scope'], p['ordinal']) for p in g['protectedHumanPositions']}
    assert len(human) == 9
    assert len(g['targets']) == 20
    assert [t['id'] for t in g['targets']] == [f'T{i:02}' for i in range(1, 21)]
    assert [(t['scope'], t['ordinal'], t['oldTile']) for t in g['targets']] == expected
    for t in g['targets']:
        assert (t['scope'], t['ordinal']) not in human
        assert t['sourceImageBlockId'] == 'nemata-jp-p257-b4'
        assert t['sourceImage']['sha256'] == '6ab134ee5d55cbcf278be7c54723dd0eabb760c811762e5dbd7a7eb4bd3781e8'
        assert t['newTile'] is None and t['existingHumanItem'] is False
        b, c = t['targetBox'], t['cropBox']
        assert 0 <= c[0] <= b[0] < b[2] <= c[2] <= 2109
        assert 0 <= c[1] <= b[1] < b[3] <= c[3] <= 1210
    assert g['targets'][5]['targetBox'] == [1825, 410, 1873, 474]

def valid_proposal(p):
    assert p['proposalOnly'] is True and p['appliedToCandidate'] is False
    assert p['sourceImageMustRemainComplete'] is True
    assert p['trustedPositionCount'] == len(p['trustedPublicPositions']) == 9
    assert p['displayedPublicPositionCount'] == 87
    assert p['independentReviewRequiredBeforeAnyAdmission'] is True
    assert p['reviewDispatched'] is False and p['admissionGranted'] is False
    assert p['wholeChapterPassed'] is False and p['newModelCalls'] == 0

def reject(name, fn, obj, mutation):
    bad = copy.deepcopy(obj)
    mutation(bad)
    try:
        fn(bad)
    except AssertionError:
        checks.append(name)
    else:
        raise AssertionError('negative accepted: ' + name)

check('sealed manifest SHA', sha(root / 'manifest.json') == packet['manifest']['sha256'])
for binding in manifest['files']:
    check('sealed file ' + Path(binding['path']).name, sha(binding['path']) == binding['sha256'])
check('candidate unchanged', sha(geometry['candidate']['path']) == geometry['candidate']['sha256'])
check('parent unchanged', sha(geometry['parent']['path']) == geometry['parent']['sha256'])
valid_scope(geometry); checks.append('exact20 targets exclude nine human positions')
im = Image.open(geometry['sourceImages']['257-results']['path']).convert('RGB')
for t in geometry['targets']:
    crop = Image.open(t['crop']['path']).convert('RGB')
    expected = im.crop(t['cropBox'])
    check(t['id'] + ' original crop pixels', crop.size == expected.size and crop.tobytes() == expected.tobytes())
check('87 region display slots only', sum(r['displayedSlots'] for r in geometry['regions']) == 87)
check('three original image hashes', all(sha(b['path']) == b['sha256'] for b in geometry['sourceImages'].values()))
with fitz.open(packet['pdf']['path']) as doc:
    check('PDF exactly one A3 page', len(doc) == 1 and round(doc[0].rect.width) == 842)
    widgets = list(doc[0].widgets())
    check('20 blank selective fields', len(widgets) == 20 and {w.field_name for w in widgets} == {t['id'] for t in geometry['targets']} and all(not w.field_value for w in widgets))
    check('all target labels extracted', all(t['id'] in doc[0].get_text() for t in geometry['targets']))
valid_proposal(proposal); checks.append('trusted-only proposal is uninstalled and requires independent review')
reject('reject target relabeling', valid_scope, geometry, lambda g: g['targets'][0].update(oldTile='5p'))
reject('reject human position reused', valid_scope, geometry, lambda g: g['targets'][0].update(scope='upper', ordinal=1))
reject('reject source view swap', valid_scope, geometry, lambda g: g['targets'][0].update(sourceImageBlockId='nemata-jp-p257-b3'))
reject('reject uniform box at differently oriented T06', valid_scope, geometry, lambda g: g['targets'][5].update(targetBox=[1826,429,1887,474]))
reject('reject filled tile conclusion', valid_scope, geometry, lambda g: g['targets'][0].update(newTile='4p'))
reject('reject proposal applied', valid_proposal, proposal, lambda p: p.update(appliedToCandidate=True))
reject('reject ordinary pass', valid_proposal, proposal, lambda p: p.update(wholeChapterPassed=True))
reject('reject review dispatch', valid_proposal, proposal, lambda p: p.update(reviewDispatched=True))
reject('reject admission', valid_proposal, proposal, lambda p: p.update(admissionGranted=True))
result = {'passed': True, 'checks': checks, 'count': len(checks), 'negativeCases': 9,
          'newModelCalls': 0, 'candidateModified': False, 'humanPositionsProtected': 9,
          'humanUIChanged': False, 'independentReviewExecuted': False}
(HERE / 'verification.json').write_bytes((json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode())
print(json.dumps({k: v for k, v in result.items() if k != 'checks'}))
