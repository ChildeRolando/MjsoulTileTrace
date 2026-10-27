import json
R='E:/AgentData/Coach/knowledge/processing/'
summary={
 "schema": "coac248-round-20261027/1",
 "recordedAt": "2026-10-27T02:34:00.000Z",
 "round": "COAC-246 merge verification + first web chapter completed (237-1)",
 "productionModelCalls": 1,
 "auditModelCalls": 1,
 "runtime": "audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49",
 "nativeModuleChanges": False,
 "coac246MergeVerification": {
  "source": "COAC-246 comment attachment coac246-57-verification-summary.json (57 chapters)",
  "method": "zero-model re-check of the unified list against the transfer file and the bytes on disk",
  "repairChapters": 48,
  "presentInUnifiedList": 48,
  "candidateShaMatchesTransfer": 48,
  "fileShaMatchesDisk": 48,
  "dedupedWebObjects": 7,
  "dedupedSingleShaEach": True,
  "nonRepairChapters": 9,
  "nonRepairLeakedIntoRepairObjects": 0,
  "failedOverlap": 0,
  "record": ".multica/delivery/coac-248-native-inline-correction/scripts/../../_verify_246.json (run output reproduced in this summary)"
 },
 "completed": {
  "objectId": "web-chapter:nemata-jp-chapter-237-1",
  "articleId": "chapter04-section016",
  "sourceId": "modern-yabejp-ja",
  "parent": {"path": "web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.display.json",
             "sha256": "5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959",
             "audit": "audit/web/articles/modern-yabejp-ja/chapter04-section016.5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959.json",
             "auditSha256": "26e737619dfca6c940aeac348645802e2feebb240a6d38a2d917e4ef5b1fc41c",
             "auditStatus": "needs-repair"},
  "candidate": {"path": "web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.rev1.json",
                "sha256": "d14aac65a3d02d8a44bf633bb969f1c057660d875a9aeb792cc022826293bc97"},
  "issue": "emphasis scope: source em spans 「供託や積み棒が多ければ和了率重視」, the candidate emphasised only 「重视和牌率」",
  "productionCall": {"callId": "7042ce5f-fb5e-4e6f-85fb-1ff70427a794", "route": "textbook-production-web.mjs --revision-from/--revision-notes", "targets": {"textIds": ["modern-yabejp-ja:chapter04-section016:b0002"], "figureIds": []}, "usage": {"inputTokens": 12776, "outputTokens": 611}},
  "auditReceipt": {"path": "audit/web/articles/modern-yabejp-ja/chapter04-section016.d14aac65a3d02d8a44bf633bb969f1c057660d875a9aeb792cc022826293bc97.json",
                   "sha256": "95e135e344353e5b527a3d9fa251288434317c9c56b642585016507a226c1465",
                   "status": "passed",
                   "method": "independent-target-text-review-plus-unchanged-parent-audit",
                   "callId": "8567f448-7148-422a-b198-751c00f7339c",
                   "usage": {"inputTokens": 13086, "outputTokens": 410},
                   "inheritedParentCallIds": ["bc5920f4-5812-48cd-9f02-62aae5a6d500"]},
  "unchanged": "all other text blocks, all figure entries, source bindings, parent candidate and parent full-article audit",
  "chapterComplete": True,
  "handoff": "COAC-250"
 },
 "listAfter": {"needsRepair": 55, "web": 47, "oldPdfRemaining": 3, "metadataFrontMatter": 4, "protectedSupplement": 1, "failedSeparate": 2},
 "coac249Handoff": {
  "116-1": {"state": "open", "finding": "candidate 6f251511 b0016 still carries 「（同上）」; no audit receipt exists for this SHA, so the isolated-revision route (which requires a needs-repair parent receipt) cannot start it — it needs either a first audit after the block repair or a root-accepted correction entry", "modelCalls": 0},
  "131-1": {"state": "open", "finding": "candidate 470217d7 b0123 「七対子のロス」 issue is eligible for the isolated-revision route (parent receipt is needs-repair and its source bytes were confirmed unchanged by COAC-249)", "modelCalls": 0},
  "183-1": {"state": "decision recorded", "finding": "keep 「１枚切れ１枚見え」 as the author wrote it; no rewriting to 持ち and no in-body editorial note in this round. The ambiguity is the author's, the surrounding table carries the counts, and the repair list keeps the item open until the annotation wording is agreed.", "modelCalls": 0},
  "283-1": {"state": "root cause located", "finding": "figure b0785 provenance.callId 8b122484-82db-4a79-a3e3-4202d0f72ade has no raw call anywhere in the data root, while raw-call d43a772e-04c1-4b41-8218-e5b5aaf89759 (a batch call already listed in the candidate's own attempts) contains exactly the same b0785 transcription text. The wiring points at a call that never existed; the bytes came from d43a772e.", "modelCalls": 0}
 },
 "method": {
  "revisionRoute": "web text repairs go through textbook-production-web.mjs with --revision-from/--revision-notes: one bounded call for the target blocks only, then a target-text audit that inherits the parent full-article review. Hand-edited translation text is rejected by web_production_translation_not_from_bound_output, so the revision must come from a bound production call.",
  "presentation": "a revision candidate must either keep derivedFromCandidate null (no figures with presentation assets) or carry a matching display-chain parent; the parent's own presentation is re-verified against the parent receipt."
 }
}
open('.multica/delivery/coac-248-native-inline-correction/summary-web237-20261027.json','w',encoding='utf-8').write(json.dumps(summary,ensure_ascii=False,indent=1)+'\n')
print('written')
