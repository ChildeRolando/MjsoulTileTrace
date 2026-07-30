# Engineering handoff

Last updated: 2026-07-31 (Asia/Shanghai)

## Objective

Deliver a Windows-only, offline Mahjong Soul Steam/desktop companion that
marks all four rivers for the current hand:

- tsumogiri: translucent gray fill;
- tedashi: gold outline/glow;
- unknown/ambiguous: no mark.

Marks persist until the tile is called or the hand/session ends.

## Non-negotiable boundary

No process injection, memory reading, packet capture, input automation,
decision advice, anti-detection behavior, or networking. Capture visible
client pixels only through Windows Graphics Capture. The overlay is
click-through and does not take focus.

## Supported environment

- Windows x64, .NET 8 Desktop Runtime.
- Mahjong Soul four-player Steam/desktop client.
- Client area 1920×1080, Windows scale 100%.
- Profile:
  `src/MahjongSoulOverlay.Vision/Profiles/yonma-1920x1080.standard.json`.

## Architecture

- `MahjongSoulOverlay.Core`: structural observations, transactions, event
  classification, lifecycle, river identity, overlay engine.
- `MahjongSoulOverlay.Vision`: profile loading/calibration, occupancy and
  OpenCV structural detection.
- `MahjongSoulOverlay.Windows`: target location, Windows Graphics Capture,
  single-capacity latest-frame pipeline, tray UI, diagnostics, layered overlay.
- `MahjongSoulOverlay.Replay`: deterministic video replay, JSONL audit,
  annotated output, acceptance comparison.

Detection tracks four independent seat profiles: main-hand slots, separated
draw area, river quads, and meld groups/tile totals. Calls are reconciled as
ordered multi-region transactions; called-discard confirmation requires
cross-seat river-removal evidence.

## Important commits

- `bf99e1c feat: run overlay from Windows tray`
- `615d30c docs: register private tsumogiri stills`
- `0247c8f feat: replay and audit recognition sessions`

Earlier detector/capture/overlay commits and calibration provenance are listed
in Git history and `CALIBRATION.md`.

## Current verification

- Latest full Release suite: 389 passed, 0 failed.
- Task 13 independent final review: no Critical/Important.
- Task 14 independent final review: no Critical/Important.
- Task 15 acceptance comparer review is being retried after reviewer timeout.
- Windows app publish:
  `artifacts/win-x64/MahjongSoulOverlay.Windows.exe`.
- Replay publish:
  `artifacts/replay-win-x64/MahjongSoulOverlay.Replay.exe`.

## Private evidence

Private stills are under ignored `fixtures/private-stills/`; original and
1920×1080 padded hashes are recorded in `CALIBRATION.md`.

User-provided continuous recording:

```text
E:\视频\雀魂测试1.mp4
```

Observed metadata:

- 1920×1080;
- 30 FPS;
- 3346 frames;
- approximately 111.5 seconds;
- 124,162,734 bytes.

Current background replay (check whether it is still alive before restarting):

```text
PID 43140
output: artifacts/replay/雀魂测试1.v2.events.jsonl
```

The runner writes to a unique `.partial-<guid>.jsonl` sibling and atomically
moves it to the final path only on successful complete decode. Never delete or
modify the source video.

Progress check:

```powershell
Get-Process -Id 43140 -ErrorAction SilentlyContinue
Get-ChildItem overlay/artifacts/replay -Filter '雀魂测试1.v2*' -Force
```

## Resume commands

```powershell
.\.tools\dotnet\dotnet.exe test overlay/MahjongSoulOverlay.sln -c Release

.\.tools\dotnet\dotnet.exe publish `
  overlay/src/MahjongSoulOverlay.Windows `
  -c Release -r win-x64 --self-contained false `
  -p:PublishSingleFile=true `
  -o overlay/artifacts/win-x64

.\.tools\dotnet\dotnet.exe publish `
  overlay/src/MahjongSoulOverlay.Replay `
  -c Release -r win-x64 --self-contained false `
  -p:PublishSingleFile=true `
  -o overlay/artifacts/replay-win-x64
```

Replay (output path must not already exist):

```powershell
overlay/artifacts/replay-win-x64/MahjongSoulOverlay.Replay.exe `
  --input 'E:\视频\雀魂测试1.mp4' `
  --profile overlay/src/MahjongSoulOverlay.Vision/Profiles/yonma-1920x1080.standard.json `
  --events overlay/artifacts/replay/雀魂测试1.events.jsonl `
  --annotated overlay/artifacts/replay/雀魂测试1.annotated.mp4
```

Acceptance comparison:

```powershell
overlay/artifacts/replay-win-x64/MahjongSoulOverlay.Replay.exe `
  --compare-events overlay/artifacts/replay/雀魂测试1.events.jsonl `
  --labels overlay/fixtures/recordings/雀魂测试1.labels.json `
  --report overlay/artifacts/replay/雀魂测试1.acceptance.json
```

## Frame throttle (2026-07-31)

Live capture fires the WGC `FrameArrived` callback at the client refresh rate
(typically 60 Hz). Each accepted frame triggers `CreateCopyFromSurfaceAsync`
(GPU→CPU DMA + byte[] copy, ~8 MB per frame) and a full OpenCV detection pass
across all four seats (Canny, findContours, foreground masks, grid detection).

To keep the CPU budget low, `TrayApplicationContext` enforces a minimum interval
between accepted frames. Frames that arrive before the interval elapses are
dropped immediately — the expensive detection and overlay pipeline is skipped
entirely.

**Mechanism** (`src/MahjongSoulOverlay.Windows/Shell/TrayApplicationContext.cs`):

- New field `_minFrameInterval` (default 200 ms, configurable via constructor
  parameter `minFrameInterval`).
- New field `_lastAcceptedQpc` tracks the QPC timestamp of the most recently
  accepted frame.
- `FrameArrived` reads `Stopwatch.GetTimestamp()` and compares against
  `_lastAcceptedQpc + _minFrameInterval` before entering the channel write
  lock.  If the interval has not elapsed the frame is silently discarded.

**Tuning**:

- Default 200 ms → at most 5 detection passes per second.
- Lower: tighter latency, more CPU. Raise: coarser, less CPU.
- The replay tool (`MahjongSoulOverlay.Replay`) is unaffected — it processes
  every frame deterministically regardless of timing.

**Why not throttle inside WGC callback**: throttling at that layer could avoid
the `CreateCopyFromSurfaceAsync` DMA copy as well, but the DMA copy is hardware
path and negligible in CPU terms.  The dominant CPU cost is OpenCV detection.
Throttling at `TrayApplicationContext.FrameArrived` is three lines of
allocation-free code versus a more invasive change in the native interop layer.

**Why not GPU-path detection**: `findContours` (the core river/meld detection
primitive) has no GPU implementation in OpenCV CUDA or OpenCL.  A D3D11 compute
shader could replace `OccupancyScorer` but cannot replace contour-based tile
detection, so the GPU path would only cover ~15 % of the detection budget at
the cost of maintaining two detection backends.

## Detection accuracy tuning (2026-07-31)

The first real-evidence replay (雀魂测试1.mp4, 3346 frames) exposed three
detection gaps that together prevented any formal events from being classified:

1. **Confidence threshold too tight** — `EventClassifier._minimumConfidence`
   was 0.75, but real-frame observation confidence averages 0.42–0.58 across
   seats. Lowered to 0.40 (matches the profile's `minimumTileConfidence`).

2. **One-size-fits-all occupancy thresholds** — the profile applies
   `occupancy: 0.15` to main hand, drawn slot, river, and meld regions alike.
   Drawn-slot and river tiles are semi-transparent and farther from the camera;
   their Canny edge density hovers around 0.08–0.12, below the 0.15 cutoff.
   Every threshold crossing produces a flickering detection that resets the
   stability counter and fragments discard deltas across many noisy frames.

3. **Left-seat confidence drag** — Left averages 0.42 confidence versus
   0.55–0.58 for other seats. Because `ObservationConfidence` takes the
   minimum across all classifications, one low-confidence region on Left
   drags down the entire frame's confidence for all seats.

### Applied changes

**`EventClassifier`** (`src/.../Core/Events/EventClassifier.cs`):
- `_minimumConfidence` default: 0.75 → 0.40.

**`OpenCvSeatDetector`** (`src/.../Vision/Detection/OpenCvSeatDetector.cs`):
- New internal constructor parameter `secondaryOccupancyScale` (default 0.67).
  Applied to drawn-slot, river, and meld thresholds before they are passed to
  `DetectTiles`, `DetectRiverGrid`, and `AnalyzeMeldTopology`.
  Effect: effective occupancy threshold drops from 0.15 → 0.10 for those
  regions. Main-hand thresholds are unchanged.
- `AnalyzeMeldTopology` accepts an optional `RegionThresholds` override.

**Justification**: stronger evidence (the main hand with 13 dense tiles, or a
full meld group) can tolerate a higher threshold. Single tiles (drawn slot,
river cells) need a lower bar because one tile fills a smaller fraction of its
quad. The 0.67 scale is a conservative first estimate; tune per-seat after the
next replay run produces annotated frames.

### Expected impact

The lower occupancy thresholds should reduce flickering in river and drawn-slot
detections, which makes the stability counter advance reliably and allows the
`ObservationDiffer` to produce clean single-tile deltas. The lower classifier
confidence gate stops the blanket "classifier-rejected" outcome observed in the
first replay (107 candidates, 0 formal events).

## Remaining work

1. Re-run replay with updated detector and classifier; verify that formal
   tsumogiri/tedashi events are now produced.
2. Generate annotated output; review frame-by-frame to confirm overlay marks
   align with actual discards.
3. Write hand labels (`雀魂测试1.labels.json`) for the acceptance comparer.
4. Run acceptance comparison against labels.
5. Tune `_secondaryOccupancyScale` per-seat if some seats still flicker.
6. Investigate Left-seat low confidence (may be a region-alignment issue in
   the profile).
7. Resolve Task 15 acceptance comparer review findings.
8. Update `ACCEPTANCE.md` pending metrics with measured results.
9. Publish final Windows and replay builds.
10. Run final independent review and full Release suite.
11. Update this handoff to the final commit/test/artifact state.

## Workspace caution

The shared worktree contains unrelated coach/course work. Preserve
`RESOURCES.md` and all unrelated `coach/` changes. Stage exact overlay files
only. Do not reset, revert broadly, or amend shared commits.
