"""Isolate long ASCII paragraph separators in derived reader HTML only.

No global JSON/HTML replacement: HTMLParser selects author-body text nodes using
the existing body block IDs. All original tags, attributes and source JSON stay
byte-identical. This module uses only the Python standard library.
"""
import argparse
import hashlib
import json
import pathlib
import re
from html.parser import HTMLParser

SEPARATOR = re.compile(r'(?<!-)-{64,}(?!-)')
URL = re.compile(r'(?:[A-Za-z][A-Za-z0-9+.-]*://|www\.)[^\s<>"\']+')
INLINE_CODE = re.compile(r'(?P<ticks>`+)[^`\r\n]*(?P=ticks)')
ASCII_TOKEN = re.compile(r'[A-Za-z0-9_./%#?&=:+@~\\-]')
FENCE = re.compile(r'^[ \t]*(`{3,}|~{3,})')
STYLE_ID = 'ascii-separator-layout'
CLASS = 'ascii-separator-line'
CSS = '<style id="'+STYLE_ID+'">.chapter-body .'+CLASS+'{display:block;white-space:pre;max-width:100%;overflow-x:auto}</style>'

def protected_ranges(text):
    ranges = [(m.start(), m.end()) for rx in (URL, INLINE_CODE) for m in rx.finditer(text)]
    offset = 0
    fence = None
    for line in text.splitlines(keepends=True):
        marker = FENCE.match(line)
        if fence or marker:
            ranges.append((offset, offset+len(line)))
            if fence and marker and marker.group()[0:].lstrip()[0] == fence[0] and len(marker.group().lstrip()) >= fence[1]:
                fence = None
            elif not fence:
                token = marker.group().lstrip()
                fence = (token[0], len(token))
        # Protect Markdown table rows, including alignment rows, conservatively.
        if '|' in line:
            ranges.append((offset, offset+len(line)))
        offset += len(line)
    return ranges

def separator_matches(text):
    protected = protected_ranges(text)
    result = []
    for match in SEPARATOR.finditer(text):
        a, b = match.span()
        if any(a < end and b > start for start, end in protected):
            continue
        if (a and ASCII_TOKEN.fullmatch(text[a-1])) or (b < len(text) and ASCII_TOKEN.fullmatch(text[b])):
            continue
        result.append(match)
    return result

def isolate_separator_lines(text):
    """Whitespace-only plain-text transform; preserve existing LF/CRLF and runs."""
    eol = '\r\n' if '\r\n' in text else '\n'
    pieces, cursor = [], 0
    for match in separator_matches(text):
        a, b = match.span()
        pieces.append(text[cursor:a])
        if a and text[a-1] not in '\r\n':
            pieces.append(eol)
        pieces.append(match.group())
        if b < len(text) and text[b] not in '\r\n':
            pieces.append(eol)
        cursor = b
    return ''.join(pieces)+text[cursor:]

def render_separator_lines(text):
    eol = '\r\n' if '\r\n' in text else '\n'
    pieces, cursor = [], 0
    for match in separator_matches(text):
        a, b = match.span()
        pieces.append(text[cursor:a])
        if a and text[a-1] not in '\r\n':
            pieces.append(eol)
        pieces.append('<span class="'+CLASS+'">'+match.group()+'</span>')
        if b < len(text) and text[b] not in '\r\n':
            pieces.append(eol)
        cursor = b
    return ''.join(pieces)+text[cursor:]

class BodySeparatorParser(HTMLParser):
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    EXCLUDED = {'a','code','pre','script','style','textarea','table','figure','figcaption'}

    def __init__(self, html, block_ids):
        super().__init__(convert_charrefs=False)
        self.html, self.block_ids = html, block_ids
        self.stack, self.edits, self.hits = [], [], []
        self.head_end = None
        self.style_present = False
        self.line_offsets = [0]
        self.line_offsets.extend(m.end() for m in re.finditer('\n', html))

    def absolute_offset(self):
        line, column = self.getpos()
        return self.line_offsets[line-1]+column

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id') == STYLE_ID:
            self.style_present = True
        if tag not in self.VOID:
            self.stack.append((tag, attrs))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag == 'head':
            self.head_end = self.absolute_offset()
        for i in range(len(self.stack)-1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, text):
        if not any('chapter-body' in attrs.get('class','').split() for _,attrs in self.stack):
            return
        if any(tag in self.EXCLUDED or CLASS in attrs.get('class','').split() for tag,attrs in self.stack):
            return
        block_id = next((attrs['id'] for _,attrs in reversed(self.stack) if attrs.get('id') in self.block_ids), None)
        if block_id is None:
            return
        matches = separator_matches(text)
        if not matches:
            return
        start = self.absolute_offset()
        assert self.html[start:start+len(text)] == text
        self.edits.append((start, start+len(text), render_separator_lines(text)))
        self.hits.extend({'blockId':block_id, 'length':len(m.group())} for m in matches)

def transform_html(html, bodies):
    # Keep source tables, non-author annotations and figure/caption/transcription
    # fields out of this formatting scope. Only p/h2/list author-body IDs qualify.
    ids = {b['id'] for c in bodies['chapters'] for b in c['blocks']
           if b['type'] in ('p','h2','list') and b.get('authorText') is not False
           and not b.get('tableCell') and not b.get('tableCaptionFor')}
    parser = BodySeparatorParser(html, ids)
    parser.feed(html)
    edits = list(parser.edits)
    if edits and not parser.style_present:
        assert parser.head_end is not None
        edits.append((parser.head_end, parser.head_end, CSS))
    for start,end,replacement in sorted(edits, reverse=True):
        html = html[:start]+replacement+html[end:]
    return html, parser.hits

def apply(directory):
    directory = pathlib.Path(directory)
    path = directory/'knowledge.html'
    before = path.read_bytes()
    bodies = json.loads((directory/'textbook-bodies.json').read_text(encoding='utf-8-sig'))
    after, hits = transform_html(before.decode('utf8'), bodies)
    after_bytes = after.encode('utf8')
    again, second_hits = transform_html(after, bodies)
    assert again == after and not second_hits, 'non-idempotent HTML formatting'
    if after_bytes != before:
        temporary = path.with_name(path.name+'.separator-layout.tmp')
        temporary.write_bytes(after_bytes)
        temporary.replace(path)
    return {'schema':'coach-ascii-separator-layout/1','regularExpression':SEPARATOR.pattern,
            'minimumLength':64,'changed':after_bytes!=before,'groupsChanged':len(hits),
            'blocksChanged':len({x['blockId'] for x in hits}),'hits':hits,
            'beforeHtmlSha256':hashlib.sha256(before).hexdigest(),
            'afterHtmlSha256':hashlib.sha256(after_bytes).hexdigest(),
            'secondApplyChanges':0,'bodyJsonChanged':False,'newModelCalls':0}

if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('directory')
    cli.add_argument('--report')
    args = cli.parse_args()
    report = apply(args.directory)
    if args.report:
        pathlib.Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='hits'}))
