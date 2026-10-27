"""Read-only verification of the PDF217 delivery package's logical path map."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(package):
    package = Path(package).resolve()
    manifest = json.loads((package / 'path-map.json').read_text(encoding='utf-8'))
    admission = json.loads((package / 'native-inline-field-corrections.p217.root-acceptance.json').read_text(encoding='utf-8'))
    assert manifest['schema'] == 'coac248-p217-delivery-path-map/1'
    assert set(manifest['inputs']) == set(admission['inputs'])
    locations = set()
    for key, item in manifest['inputs'].items():
        source = admission['inputs'][key]
        rel = PurePosixPath(item['packagePath'])
        assert not rel.is_absolute() and '..' not in rel.parts
        assert item['packagePath'] not in locations
        locations.add(item['packagePath'])
        assert item['processingPath'] == source['path']
        assert item['originalPath'] == source['originalPath']
        assert item['sha256'] == source['sha256']
        assert item['originalPackagePath'] == source['path'].removeprefix(manifest['processingPrefix'] + '/')
        assert digest((package / rel).read_bytes()) == source['sha256']
    for item in manifest['unchangedFiles']:
        assert digest((package / item['path']).read_bytes()) == item['sha256']
    with zipfile.ZipFile(package / 'evidence-bundle.zip') as archive:
        assert len(archive.namelist()) == len(set(archive.namelist()))
        assert json.loads(archive.read('path-map.json')) == manifest
        for item in manifest['inputs'].values():
            assert digest(archive.read(item['packagePath'])) == item['sha256']
            if item['packagePath'] != item['originalPackagePath']:
                assert item['originalPackagePath'] not in archive.namelist()
    return {'passed': True, 'inputs': len(locations),
            'renamed': sum(x['packagePath'] != x['originalPackagePath'] for x in manifest['inputs'].values()),
            'immutableFiles': len(manifest['unchangedFiles']), 'modelCalls': 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('package', nargs='?', default=str(Path(__file__).resolve().parent))
    args = parser.parse_args()
    print(json.dumps(verify(args.package)))
