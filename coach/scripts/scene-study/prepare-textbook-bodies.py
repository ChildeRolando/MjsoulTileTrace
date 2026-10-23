"""Extract supplied textbook bodies, not summary cards. No model or network calls."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import fitz

HERE = Path(__file__).resolve().parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepare(source_dir, destination):
    library = json.loads((HERE / 'textbook-library.json').read_text(encoding='utf-8'))
    assets = destination / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    documents = {}
    for source in library['sources']:
        if source['id'] not in ['79-cn', 'nemata-jp']:
            continue
        data = (source_dir / source['filename']).read_bytes()
        if digest(data) != source['sha256']:
            raise ValueError('Source identity changed: ' + source['id'])
        documents[source['id']] = fitz.open(stream=data, filetype='pdf')
    chapters, coverage = [], []
    for chapter in library['chapters']:
        if chapter['sourceId'] != '79-cn':
            continue
        blocks = []
        for number in range(chapter['bodyStartPage'], chapter['endPage'] + 1):
            page = documents['79-cn'][number - 1]
            lower = 250 if number == 114 else 70
            items, expected_lines = [], []
            for block in page.get_text('dict')['blocks']:
                if block['bbox'][1] < lower or block['bbox'][1] >= 775:
                    continue
                if block['type'] == 1:
                    items.append((block['bbox'][1], 'image', block))
                else:
                    for line in block['lines']:
                        text = ''.join(span['text'] for span in line['spans']).strip()
                        if not text or re.fullmatch(r'[-─\s]+', text):
                            items.append((line['bbox'][1], 'break', None))
                        else:
                            expected_lines.append(text)
                            items.append((line['bbox'][1], 'line', {'text': text, 'bbox': line['bbox'], 'emphasis': any(s['color'] not in [0, 16777215] or s['flags'] & 16 for s in line['spans'])}))
            pending = []

            def flush():
                if not pending:
                    return
                text = ''.join(x['text'] for x in pending)
                headings = ['1、6 组对子', '2.5 组对子', '3.4 组对子+1 组暗刻', '1.七对子和面子手的分歧点', '2.七对子的听牌', '-----首先是读听牌', '-----推测打点高还是低', '危险牌是哪些？']
                kind = 'h2' if text in headings else 'p'
                if text.startswith('手役') or text in ['对子手（一）：', '对子手（二）：', '副露的防守：']:
                    kind = 'h2'
                display = '\n'.join(x['text'] for x in pending).removeprefix('-----')
                if text == '2.5 组对子': display = '2．5 组对子'
                if text == '3.4 组对子+1 组暗刻': display = '3．4 组对子＋1 组暗刻'
                blocks.append({'type': kind, 'text': display, 'sourceText': text, 'page': number, 'y': [pending[0]['bbox'][1], pending[-1]['bbox'][3]], 'emphasis': any(x['emphasis'] for x in pending)})
                pending.clear()

            included_lines = []
            figure_count = 0
            for _, kind, item in sorted(items, key=lambda item: item[0]):
                if kind == 'break':
                    flush()
                elif kind == 'line':
                    pending.append(item)
                    included_lines.append(item['text'])
                else:
                    flush()
                    figure_count += 1
                    filename = f'79-p{number}-figure{figure_count}.png'
                    rect = fitz.Rect(item['bbox'])
                    page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), clip=rect).save(assets / filename)
                    figure = {'type': 'figure', 'src': 'assets/' + filename, 'page': number, 'clip': list(rect), 'caption': f'教材原图 · 第 {number} 页 · 图 {figure_count}', 'requiresImage': True}
                    if number == 119 and figure_count == 1:
                        figure['tableText'] = [
                            ['字牌', '听容易被打出的字牌是基础。特别是已经切了 1 张的字牌是绝好的听牌，荣和自摸两不误。'],
                            ['幺九牌', '同样是容易被打出的牌。2、8 也是不错的听牌。'],
                            ['筋引挂', '想要直击的时候，同样是筋引挂，与其切 4 听 7，不如切 4 听 1 有效果。'],
                            ['壁引挂', '比如场上已经切掉了 4 张 3 饼，听 1 饼或者 2 饼，对手会以为 NO CHANCE 而切出。比筋引挂更加有效。也能够期待自摸。'],
                            ['宝牌', '默听有 6400 点，立直自摸就有跳满。想要和大牌的时候就听 DORA 吧。']
                        ]
                    blocks.append(figure)
            flush()
            if sorted(included_lines) != sorted(expected_lines):
                raise ValueError('Missing source text on page ' + str(number))
            coverage.append({'sourceId': '79-cn', 'page': number, 'textLines': len(included_lines), 'figures': figure_count, 'allSelectedTextIncluded': True})
        chapters.append({'chapterId': chapter['id'], 'sourceId': '79-cn', 'translationStatus': 'existing-chinese-edition-transcribed', 'translatorNote': '正文逐行转录所提供的中文 PDF，仅整理换行、分隔线和标题编号；既有译文的结论、条件、措辞与例外均保留。牌图直接提取。图中的ツモ＝摸牌、ドラ＝宝牌、ポン＝碰。此中文版本尚未与日文逐句校勘。', 'blocks': blocks})

    translated = json.loads((HERE / 'textbook-nemata-translation.json').read_text(encoding='utf-8'))
    figures = 0
    for block in translated['blocks']:
        page = documents['nemata-jp'][block['page'] - 1]
        if block['type'] == 'figure':
            figures += 1
            filename = f'nemata-chiitoitsu-example{figures}.png'
            page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(block['clip'])).save(assets / filename)
            block['src'] = 'assets/' + filename
            counts = [len(x) for x in re.findall(r'([0-9]+)[mpsz]', block['hand'])]
            if sum(counts) != 14:
                raise ValueError('Tile transcription must contain 14 tiles: ' + block['hand'])
        else:
            block['sourceText'] = page.get_text(clip=fitz.Rect(35, block['y'][0], 555, block['y'][1])).strip()
            if not block['sourceText']:
                raise ValueError('Translation source anchor empty')
    chapters.append(translated)
    for c in chapters:
        c['sourceSha256'] = next(s['sha256'] for s in library['sources'] if s['id'] == c['sourceId'])
        for i, block in enumerate(c['blocks']):
            block['id'] = c['chapterId'] + '-b' + str(i + 1)
    body = {'schema': 'coach-textbook-bodies/1', 'language': 'zh-CN', 'status': 'pending-user-review', 'modelExperiments': False, 'chapters': chapters}
    (destination / 'textbook-bodies.json').write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding='utf-8')
    receipt = {'sourceDirectory': str(source_dir), 'chapters': len(chapters), 'chineseSourceCoverage': coverage, 'translatedChapter': translated['chapterId'], 'translatedFigures': figures, 'translationSourcePages': [98, 99], 'bodySha256': digest((destination / 'textbook-bodies.json').read_bytes()), 'modelCalls': 0}
    (destination / 'source-extraction.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'chapters': len(chapters), 'figures': sum(b['type'] == 'figure' for c in chapters for b in c['blocks']), 'modelCalls': 0}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source_directory', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    prepare(args.source_directory, args.destination)
