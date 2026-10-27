import json, io
L='.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'
d=json.load(open(L,encoding='utf-8'))
V=json.load(open('_verify_246.json',encoding='utf-8'))
oid='web-chapter:nemata-jp-chapter-237-1'
obj=[o for o in d['objects'] if o['objectId']==oid][0]
parent_p='E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.display.json'
cand_p='E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.rev1.json'
audit_p='E:/AgentData/Coach/knowledge/processing/audit/web/articles/modern-yabejp-ja/chapter04-section016.d14aac65a3d02d8a44bf633bb969f1c057660d875a9aeb792cc022826293bc97.json'
obj.update({
 'parentCandidatePath': parent_p,
 'parentCandidateSha256': '5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959',
 'candidatePath': cand_p,
 'candidateSha256': 'd14aac65a3d02d8a44bf633bb969f1c057660d875a9aeb792cc022826293bc97',
 'auditPath': audit_p,
 'auditSha256': '95e135e344353e5b527a3d9fa251288434317c9c56b642585016507a226c1465',
 'auditStatus': 'passed',
 'issueCount': 0,
 'diskShaVerified': True,
 'currentDisposition': 'resolved-passed-audit-awaiting-250-handoff',
 'resolution': {
  'kind': 'isolated-target-text-revision',
  'scope': 'only block modern-yabejp-ja:chapter04-section016:b0002 emphasis span; all other text blocks and all figures unchanged',
  'issue': 'emphasis scope: source em covers 「供託や積み棒が多ければ和了率重視」; the candidate emphasised only 「重视和牌率」',
  'change': '若供托或积棒较多，优先选择*重视和牌率*的打法 → *若供托或积棒较多，就重视和牌率*（…）优先做出这样的选择',
  'producer': {'callId': '7042ce5f-fb5e-4e6f-85fb-1ff70427a794', 'route': 'textbook-production-web.mjs --revision-from/--revision-notes', 'usage': {'inputTokens': 12776, 'outputTokens': 611}, 'targets': {'textIds': ['modern-yabejp-ja:chapter04-section016:b0002'], 'figureIds': []}},
  'audit': {'callId': '8567f448-7148-422a-b198-751c00f7339c', 'scope': 'textbook-web-target-text-audit', 'usage': {'inputTokens': 13086, 'outputTokens': 410}, 'method': 'independent-target-text-review-plus-unchanged-parent-audit', 'inheritedParentCallIds': ['bc5920f4-5812-48cd-9f02-62aae5a6d500']},
  'parentAuditPreserved': 'audit/web/articles/modern-yabejp-ja/chapter04-section016.5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959.json',
  'chapterComplete': True,
  'chapterNote': 'COAC-246 records this chapter as one unit; the article now passes, so the chapter has no remaining repair object.'
 }
})
d['countsCurrent']['needsRepair']-=1
d['countsCurrent']['resolvedThisStage']+=1
d['breakdown']['web']-=1
d['resolvedThisStage'].append({
 'objectId': oid, 'kind': 'web-article', 'sourceId': 'modern-yabejp-ja', 'articleId': 'chapter04-section016',
 'parentCandidatePath': parent_p, 'parentCandidateSha256': obj['parentCandidateSha256'],
 'repairedCandidatePath': cand_p, 'repairedCandidateSha256': obj['candidateSha256'],
 'auditPath': audit_p, 'auditStatus': 'passed',
 'repairKind': 'isolated-target-text-revision', 'repairModelCalls': 1, 'auditModelCalls': 1,
 'currentDisposition': 'resolved-passed-audit-awaiting-250-handoff',
 'note': 'Emphasis scope restored; parent audit and original candidate preserved; target-text-only re-review plus inherited full-article review.'
})
d['handoff']['web237']={
 'to': 'COAC-250 incremental consumer for complete web chapter',
 'candidatePath': cand_p, 'candidateSha256': obj['candidateSha256'],
 'auditPath': audit_p, 'auditStatus': 'passed',
 'chapterId': 'nemata-jp-chapter-237-1', 'completeChapter': True,
 'note': 'One unit; not present as passed in the repair list before this round. Parent candidate and its full-article audit stay in place.'
}
d['coac246Verification20261027']={
 'checkedAt': '2026-10-27T02:24:00.000Z',
 'source': 'COAC-246 coac246-57-verification-summary.json attachment (57 chapters)',
 'method': 'zero-model re-check against the unified list and the files on disk',
 'repairChapters': V['repairChapters'], 'presentInList': V['inList'], 'shaMatchesTransfer': V['shaVerified'],
 'fileShaMatchesDisk': V['diskVerified'], 'dedupedObjectsSameSha': V['dedupeSameSha'],
 'nonRepairChapters': V['nonRepairCount'], 'nonRepairLeakedIntoRepairObjects': V['nonRepairInList'],
 'failedOverlap': V['failedOverlap'],
 'conclusion': 'All 48 repair chapters are single objects in the list, their candidate SHAs equal both the COAC-246 transfer and the bytes on disk, the 7 deduplicated web objects share one SHA each, the 9 non-repair chapters are outside the repair objects, and no repair object is one of the 2 failed items.'
}
d['latestRound']={
 'at': '2026-10-27T02:32:00.000Z',
 'objects': ['web-chapter:nemata-jp-chapter-237-1'],
 'productionModelCalls': 1, 'auditModelCalls': 1,
 'runtime': 'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
 'note': 'First web chapter out of the COAC-246 repair set completed: isolated target-text revision plus target-text audit; parent full-article audit inherited.'
}
d['refreshedAt']='2026-10-27T02:32:00.000Z'
raw=json.dumps(d,ensure_ascii=False,indent=1)
open(L,'w',encoding='utf-8').write(raw+'\n')
print('needsRepair',d['countsCurrent']['needsRepair'],'web',d['breakdown']['web'],'resolved',d['countsCurrent']['resolvedThisStage'])
