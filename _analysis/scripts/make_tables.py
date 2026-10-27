import json,sys
sys.stdout.reconfigure(encoding='utf-8')
d=json.load(open('_analysis/unified-chapter-register-20261027.json',encoding='utf-8'))
rows=d['rows']
def s(x,n=12): return (x or '-')[:n]
def web_cell(r):
    w=r['approvedWebCorrespondence'] or {}
    if not w: return '-'
    art=w.get('articleId') or '-'
    src=w.get('webSourceId','')
    tier={'body':'body','url-header':'url','title-only':'title-only'}.get(w.get('tier'),w.get('tier') or '-')
    return '%s/%s(%s)'%(src,art,tier)
def cand_cell(r):
    c=r['existingCandidate']
    if not c or not c.get('sha256'): return '-'
    return s(c['sha256'])
def src_cell(r):
    c=r['existingCandidate']
    if not c or not c.get('sourceSha256'): return '-'
    return ('%s✓'%s(c['sourceSha256'],8)) if c.get('sourceBoundCurrent') else ('%s✗'%s(c['sourceSha256'],8))
def audit_cell(r):
    c=r['existingCandidate']
    if not c: return '-'
    a=c.get('auditStatus') or 'no-receipt'
    return {'passed':'passed','needs-repair':'needs-repair','failed':'failed','passed-after-specific-source-correction':'passed*','passed-after-exact-label-translation':'passed*','passed-after-specific-source-editorial-note':'passed*'}.get(a,a)
def allow_cell(r):
    if r['adjudicationGroup']=='legacy-covered': return '-（legacy）'
    w=r['approvedWebCorrespondence'] or {}
    if not w: return '-'
    a=w.get('substitutionAllowed')
    return '是' if a else ('否' if a is False else '-')
def gap_cell(r):
    g=r['gaps']
    miss=g.get('missingProductionBlocks',0)
    pend=g.get('acceptanceGapBlocks',0)
    pp=g.get('acceptanceGapPages') or []
    s1='0' if miss==0 else str(miss)
    s2='0' if pend==0 else '%d块%s'%(pend,('(p'+','.join(str(p) for p in pp[:5])+')') if pp else '')
    return s1+' / '+s2

groups={'reclassified-covered':'A','additional-uncovered-not-in-246':'C','legacy-covered':'D','confirmed-produced-not-covered':'B'}
print('=== A/C/D differences ===')
print('| 组 | 原章ID | 获准网页对应 | 候选SHA12 | 源SHA | 审校 | 允许替代 | 缺失制作块 / 待通过块 |')
print('|---|---|---|---|---|---|---|---|')
for r in rows:
    if r['adjudicationGroup'] in ('reclassified-covered','additional-uncovered-not-in-246','legacy-covered'):
        print('| %s | `%s` | %s | %s | %s | %s | %s | %s |'%(groups[r['adjudicationGroup']],r['chapterId'],web_cell(r),cand_cell(r),src_cell(r),audit_cell(r),allow_cell(r),gap_cell(r)))
print()
print('=== B: 56 confirmed produced-not-covered ===')
print('| 原章ID | 网页对应 | 候选SHA12 | 源SHA | 审校 | 允许替代 | 缺失制作块 / 待通过块 |')
print('|---|---|---|---|---|---|---|')
for r in rows:
    if r['adjudicationGroup']=='confirmed-produced-not-covered':
        print('| `%s` | %s | %s | %s | %s | %s | %s |'%(r['chapterId'],web_cell(r),cand_cell(r),src_cell(r),audit_cell(r),allow_cell(r),gap_cell(r)))
