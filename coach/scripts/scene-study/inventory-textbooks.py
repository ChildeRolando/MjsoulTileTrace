"""Inventory every supplied PDF page, text span and image. No inference or model calls."""
import argparse
import hashlib
import json
from pathlib import Path
import fitz

HERE = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def inventory(source_directory, destination):
    library = json.loads((HERE / 'textbook-library.json').read_text(encoding='utf-8'))
    sources, assets = [], {}
    for source in library['sources']:
        if source['format'] != 'pdf':
            continue
        data = (source_directory / source['filename']).read_bytes()
        if sha(data) != source['sha256']:
            raise ValueError('Source changed: ' + source['id'])
        doc = fitz.open(stream=data, filetype='pdf')
        directory = destination / source['id']
        pages, toc = [], []
        for index, (level, title, number) in enumerate(doc.get_toc()):
            toc.append({'id': f"{source['id']}-toc-{index + 1}", 'level': level, 'title': title, 'page': number})
        for number, page in enumerate(doc, 1):
            plain = page.get_text()
            blocks, image_count = [], 0
            for i, b in enumerate(page.get_text('dict')['blocks']):
                block = {'id': f"{source['id']}-p{number}-b{i+1}", 'bbox': list(b['bbox'])}
                if b['type'] == 0:
                    block.update(type='text', lines=[{'bbox': list(line['bbox']), 'text': ''.join(s['text'] for s in line['spans']),
                        'spans': [{'text': s['text'], 'size': s['size'], 'font': s['font'], 'flags': s['flags'], 'color': s['color']} for s in line['spans']]} for line in b['lines']])
                elif b['type'] == 1:
                    pix = fitz.Pixmap(b['image'])
                    if pix.colorspace and pix.colorspace.n != 3:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    png = pix.tobytes('png')
                    digest = sha(png)
                    path = destination / 'assets' / (digest + '.png')
                    path.parent.mkdir(parents=True, exist_ok=True)
                    if path.exists():
                        if sha(path.read_bytes()) != digest:
                            raise ValueError('Existing asset changed: ' + digest)
                    else:
                        path.write_bytes(png)
                    block.update(type='image', imageSha256=digest, asset=f'assets/{digest}.png', width=b['width'], height=b['height'], transform=list(b['transform']))
                    image_count += 1
                    assets.setdefault(digest, {'sha256': digest, 'width': b['width'], 'height': b['height'], 'bytes': len(png), 'occurrences': 0})['occurrences'] += 1
                else:
                    raise ValueError('Unhandled source block')
                blocks.append(block)
            record = {'sourceId': source['id'], 'sourceSha256': source['sha256'], 'page': number, 'size': list(page.rect), 'plainText': plain, 'blocks': blocks}
            save(directory / 'pages' / f'{number:03}.json', record)
            pages.append({'page': number, 'characters': len(plain), 'textBlocks': sum(b['type'] == 'text' for b in blocks), 'imageBlocks': image_count,
                          'pageData': f"{source['id']}/pages/{number:03}.json", 'pageDataSha256': sha((directory / 'pages' / f'{number:03}.json').read_bytes())})
        item = {'sourceId': source['id'], 'filename': source['filename'], 'sha256': source['sha256'], 'language': source['language'], 'pages': pages, 'toc': toc,
                'status': 'source-inventory-only-not-published', 'sourceBytes': len(data)}
        save(directory / 'inventory.json', item)
        sources.append(item)
        print(json.dumps({'source': source['id'], 'pages': len(pages), 'characters': sum(p['characters'] for p in pages), 'images': sum(p['imageBlocks'] for p in pages)}, ensure_ascii=False), flush=True)
    result = {'schema': 'coach-textbook-source-inventory/1', 'scope': 'two-complete-supplied-pdfs', 'sourceDirectory': str(source_directory),
              'extractorSha256': sha(Path(__file__).read_bytes()), 'sources': sources, 'assets': list(assets.values()),
              'modelExperiments': False, 'processingModelCalls': 0, 'reviewStatus': 'source-inventory-only-not-published'}
    save(destination / 'source-inventory.json', result)
    print(json.dumps({'pages': sum(len(s['pages']) for s in sources), 'uniqueImages': len(assets), 'imageBytes': sum(a['bytes'] for a in assets.values())}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source_directory', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    inventory(args.source_directory, args.destination)
