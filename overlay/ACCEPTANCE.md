# Release acceptance

This file records reproducible evidence for the Windows 1920×1080, 100%-scale
release. Safety-first acceptance allows unknown, expired, ambiguous, and
rejected outcomes, but does not allow an incorrect formal confirmation or an
unexpected visible layer.

## Automated evidence

| Check | Result |
|---|---|
| Full Release test suite | 385 passed, 0 failed |
| Tray/live pipeline focused tests | 14 passed, 0 failed |
| Replay and audit focused tests | 16 passed, 0 failed |
| Independent Task 13 review | No Critical or Important findings |
| Independent Task 14 final review | No Critical or Important findings |
| Windows client absent at launch | Process starts and waits without error |
| Exact client capture | Real 320×180 WinForms client captured at exact client size |
| Overlay click-through/no focus theft | Real STA HWND style and foreground-window checks pass |
| Pause/resume and stale-frame suppression | Automated generation/race tests pass |
| Clear/resynchronize | Engine, detector, and overlay reset tests pass |
| Diagnostic opt-in | Disabled writes nothing; enabled writes PNG and valid JSONL |
| Replay determinism | Identical input produces byte-identical audit JSONL |
| Replay input/output safety | Invalid size/profile, truncation, path alias, junction, and existing-output tests pass |
| Candidate association safety | Both evidence orders, inclusive boundary, expiry, ambiguity, source non-reuse, and one terminal resolution are covered |
| Result/hand boundary | Lifecycle clears all layers before the next hand |

Latest command:

```powershell
.\.tools\dotnet\dotnet.exe test overlay/MahjongSoulOverlay.sln -c Release
```

## Real evidence

Private screenshots (not committed) cover:

- early four-seat hand geometry;
- all four late-hand rivers;
- Bottom/Right/Top/Left meld regions;
- one user-labelled tsumogiri still for each seat;
- Bottom's transient hand/arm discard animation.

Their source and padded-copy SHA-256 hashes are recorded in
`CALIBRATION.md`.

The private full recording `E:\视频\雀魂测试1.mp4` is 1920×1080, 30 FPS,
3346 frames, and approximately 111.5 seconds. Deterministic replay and
precision results are recorded below after the run completes.

| Metric | Result |
|---|---:|
| formal confirmed correct | pending hand-label comparison |
| formal confirmed incorrect | pending hand-label comparison |
| expected but expired | pending hand-label comparison |
| ambiguous resolutions | pending replay |
| rejected resolutions | pending replay |
| unexpected formal events | pending hand-label comparison |
| source evidence reuse | pending replay |
| river tracking mismatches | pending annotated review |
| lifecycle mismatches | pending annotated review |

## Runtime checklist

| Scenario | Status |
|---|---|
| Client absent at launch | automated pass |
| Eligible window found | automated locator/pipeline pass |
| Unsupported dimensions or DPI | automated pass |
| Window moved | automated geometry pass |
| Window minimized and restored | automated target-loss/restore pass |
| Pause and resume | automated pass |
| Manual clear and resync | automated pass |
| Result screen and next hand | lifecycle tests pass; real replay pending |
| Client exit | automated disposal pass |
| Diagnostic recording opt-in | automated pass |
| Overlay click-through | real HWND automated pass |
| No network, injection, memory read, packet capture, or input simulation | source/dependency boundary verified |

## Known limits

- Only the fixed four-player 1920×1080 profile is supported.
- A single still can validate geometry or occlusion handling but cannot alone
  prove a tsumogiri/tedashi event; formal classification requires an ordered
  stable-frame sequence.
- Visual themes or post-processing not represented by the supplied evidence
  may reduce confidence and produce unmarked tiles.
- The tool intentionally prefers no mark over guessing.
