import json

W = '.multica/delivery/coac-248-native-inline-correction/'

rec = {
    'schema': 'coac-248-round-record/1',
    'recordedAt': '2026-10-27T09:25:00.000000+00:00',
    'round': '2026-10-27T09:05-09:25Z',
    'receipts': [
        {
            'objectId': 'web-chapter:nemata-jp-chapter-187-1',
            'chapterId': 'nemata-jp-chapter-187-1',
            'articleId': 'chapter03-section006',
            'parent': {
                'candidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.display.json',
                'sha256': 'a09441ee2d656618bcf2ed97e573e4524d62ba5b3c94fbcc7ec714aeb77a4d73',
                'auditPath': 'audit/web/articles/modern-yabejp-ja/chapter03-section006.a09441ee2d656618bcf2ed97e573e4524d62ba5b3c94fbcc7ec714aeb77a4d73.retry-1792980856137-13934817.json',
                'auditSha256': '02b455cc98418b076cc876d98cc3bfdb07be270efca1ec8e5c298c892acdd3d7',
                'auditStatus': 'needs-repair',
            },
            'candidate': {
                'path': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.rev1.json',
                'sha256': '310a9fb99713adf007a7226cc01fcf848b16cf3b164fc1094d2a81a644f2d2e2',
            },
            'audit': {
                'path': 'audit/web/articles/modern-yabejp-ja/chapter03-section006.310a9fb99713adf007a7226cc01fcf848b16cf3b164fc1094d2a81a644f2d2e2.json',
                'sha256': '1dff00c2dad7381519e44ee225d8dcc9550e8cb659aa3a031effc414362e3e45',
                'status': 'passed',
                'method': 'independent-target-text-review-plus-unchanged-parent-audit',
            },
            'targets': ['modern-yabejp-ja:chapter03-section006:b0095'],
            'from': '后，鸣了某张牌，再切出',
            'to': '被切出后，鸣了某张牌，再切出',
            'reason': '原文「を切った後何かを鳴いて」以五筒被切出为前提动作，原译省略前提动作',
            'unchanged': '其余 103 个文本块逐字节不变；48 个图元只去掉渲染步生成的 presentationAsset，其余字段与父稿一致',
            'callIds': {'production': '6d90340a-340f-474d-9cf5-f3655da7b0f7', 'audit': 'c4ff3326-0dac-4080-970a-fd3513460ede'},
            'handoff250': 'integration/coac250-incremental-187-1-198-1-20261027.json',
        },
        {
            'objectId': 'web-chapter:nemata-jp-chapter-198-1',
            'chapterId': 'nemata-jp-chapter-198-1',
            'articleId': 'chapter03-section012',
            'parent': {
                'candidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.display.json',
                'sha256': '62d901f6a2c5b8fb6c4512693cf2c90ad6ed931a9e812449cad5ec3125d5d1f6',
                'auditPath': 'audit/web/articles/modern-yabejp-ja/chapter03-section012.62d901f6a2c5b8fb6c4512693cf2c90ad6ed931a9e812449cad5ec3125d5d1f6.retry-1792983526139-9a68195f.json',
                'auditSha256': '69dc54916a0913ae0c3976130a0ce44f8896187b1a9f05a8a6416d2b47d59ec4',
                'auditStatus': 'needs-repair',
            },
            'candidate': {
                'path': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.rev1.json',
                'sha256': 'af5ea28cb84f84f9006f5c205c7fa4f99431bf7b3bad8e22e47a3a1245820e3b',
            },
            'audit': {
                'path': 'audit/web/articles/modern-yabejp-ja/chapter03-section012.af5ea28cb84f84f9006f5c205c7fa4f99431bf7b3bad8e22e47a3a1245820e3b.json',
                'sha256': 'd930c9ef68a2771347e182c9964ed7c48a9b5aacc3cc90fa72127109be802669',
                'status': 'passed',
                'method': 'independent-target-text-review-plus-unchanged-parent-audit',
            },
            'targets': ['modern-yabejp-ja:chapter03-section012:b0082'],
            'from': '如果先打出的是宝牌，那就更有可能是特殊牌型。',
            'to': '如果先打出的是宝牌，那么特殊牌型的可能性就很高了。',
            'reason': '「いよいよ変則手濃厚」表示特殊牌型可能性很高，原译「更有可能是」只表达相对概率上升，弱化判断力度',
            'unchanged': '其余 81 个文本块逐字节不变；36 个图元只去掉 presentationAsset；同一译块内另有两处措辞收敛（等待发生变化→改变听牌形、失分容易较高→容易损失较多点数），语义不变',
            'callIds': {'production': '1491c6fc-9a6c-47e6-9390-aa351c0ca70f', 'audit': '8ac81b8f-082e-474a-a93e-9ca48271fe5c'},
            'handoff250': 'integration/coac250-incremental-187-1-198-1-20261027.json',
        },
    ],
    'modelCalls': {
        'production': 2,
        'audit': 2,
        'deterministicRejections': 0,
        'usage': {
            'production': {'inputTokens': 24521, 'outputTokens': 759},
            'audit': {'inputTokens': 28413, 'cachedInputTokens': 14592, 'outputTokens': 903},
        },
        'detail': [
            {'chapter': '187-1', 'production': '6d90340a-340f-474d-9cf5-f3655da7b0f7', 'audit': 'c4ff3326-0dac-4080-970a-fd3513460ede'},
            {'chapter': '198-1', 'production': '1491c6fc-9a6c-47e6-9390-aa351c0ca70f', 'audit': '8ac81b8f-082e-474a-a93e-9ca48271fe5c'},
        ],
    },
    'runtimeChanges': [],
    'runtimeRuns': [
        {
            'what': 'frozen runner copy for 187-1',
            'path': 'web-production/v1/runs/coac248-web-187-1-rev1-20261027/frozen-runner/textbook-production-web.mjs',
            'sha256': '4a5ce8ab361e659bf7a8e822d3e013ccf413701cfa604aaa1c58c688beab8ca9',
            'note': 'byte-identical to the 174-1 run; no patch',
        },
        {
            'what': 'frozen runner copy for 198-1',
            'path': 'web-production/v1/runs/coac248-web-198-1-rev1-20261027/frozen-runner/textbook-production-web.mjs',
            'sha256': '4a5ce8ab361e659bf7a8e822d3e013ccf413701cfa604aaa1c58c688beab8ca9',
            'note': 'byte-identical to the 174-1 run; no patch',
        },
    ],
    'untouched': ['nemata-jp-chapter-215-4', 'nemata-jp-chapter-236-1', 'nemata-jp-chapter-283-1'],
    'mergeConfirmation': {
        'objectId': 'web-chapter:nemata-jp-chapter-174-1',
        'pointer': 'accepted-content-preview-2026-10-27T07-16-27-706Z',
        'corpusId': '472db63a58434c11bbbb542d082e66d780300d4527a14fbca9ca4f113ced52d5',
        'chapters': 207,
        'selectedWeb': 178,
        'pendingWeb': 45,
        'note': 'the newest accepted-content-preview is still the 07:16 one; chapter02-section024.display.json is still in pendingWeb, so 174-1 has not been merged and the existing handoff integration/coac250-incremental-174-1-20261027.json stands unchanged (no re-handoff)',
    },
    'handoff250': 'integration/coac250-incremental-187-1-198-1-20261027.json',
    'handoffSha256': '76bfe55dbc7d85f573ba69e81345951abb792b4ed1e692372af0dbaf1d97b5dc',
    'list': {
        'path': '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json',
        'sha256': '6b8c1a4d49f1eec8ab502a4bfc73f7678d9a18676233bf1014abb2db08919ff7',
        'hashConvention': 'sha256 of the LF content, i.e. the committed blob',
    },
    'stillOpen': {
        'needsRepair': 49,
        'list': [
            'nemata-jp-chapter-215-4 (revision entry contract; awaiting owner decision)',
            'nemata-jp-chapter-236-1 (uncertain-only finding; awaiting owner decision)',
            'nemata-jp-chapter-283-1 (b0099 uncertain; no authorisation this round)',
        ],
    },
    'nextBatchWish': '199-1 (chapter03-section013, 5 issues), then 201-1 (chapter03-section015, 3 issues); 215-4/236-1 stay parked until the owner rules on the entry; 283-1 only with new authorisation',
}

p = W + 'round-20261027T0925.json'
open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(rec, ensure_ascii=False, indent=1) + '\n')
print('wrote', p)
