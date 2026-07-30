# Mahjong Soul discard overlay

Windows-only, offline companion for the Mahjong Soul Steam/desktop client. It
observes visible client pixels and marks river tiles for the current hand:

- translucent gray fill: tsumogiri (the separated drawn tile was discarded);
- gold outline/glow: tedashi (a tile was removed from the main hand);
- no mark: unknown or insufficient evidence.

Unknown and ambiguous observations never produce a coloured overlay.

## Supported setup

- Windows 10 1903 or later, x64.
- Mahjong Soul four-player table in the Steam/desktop client.
- Client area exactly 1920×1080.
- Windows display scale 100%.
- Standard table geometry represented by
  `Profiles/yonma-1920x1080.standard.json`.

Other resolutions, display scales, sanma layouts, resized captures, and
alternate geometry are rejected rather than guessed.

## Run

Install the .NET 8 Desktop Runtime, then launch:

```powershell
overlay/artifacts/win-x64/MahjongSoulOverlay.Windows.exe
```

The program lives in the notification area. Its menu provides status,
pause/resume, clear hand and resynchronize, diagnostic visibility/recording,
and exit. Start order does not matter: when Mahjong Soul is absent the program
waits; when an eligible client appears it attaches automatically.

Pause stops recognition and hides the overlay. Clear/resynchronize discards
all in-hand evidence and waits for a fresh stable hand baseline. Diagnostic
recording is off by default and writes local PNG/JSONL evidence only after the
operator explicitly enables it.

## Build

```powershell
.\.tools\dotnet\dotnet.exe test overlay/MahjongSoulOverlay.sln -c Release

.\.tools\dotnet\dotnet.exe publish `
  overlay/src/MahjongSoulOverlay.Windows `
  -c Release -r win-x64 --self-contained false `
  -p:PublishSingleFile=true `
  -o overlay/artifacts/win-x64
```

The deterministic replay/audit tool is published separately:

```powershell
.\.tools\dotnet\dotnet.exe publish `
  overlay/src/MahjongSoulOverlay.Replay `
  -c Release -r win-x64 --self-contained false `
  -p:PublishSingleFile=true `
  -o overlay/artifacts/replay-win-x64
```

Replay output paths must not already exist. This prevents any input, profile,
or prior evidence from being overwritten through path aliases.

## Privacy and safety boundary

The companion uses Windows Graphics Capture and OpenCV on visible pixels. It
does not inject code, read process memory, capture packets, automate input,
identify tiles hidden in opponents' hands, recommend moves, evade detection,
or contact a network service. The overlay window is click-through and never
takes keyboard focus.

Recognition is structural: it tracks hand occupancy, separated draw
occupancy, river geometry, meld counts, and table lifecycle. It does not learn
character or skin animations. Calls require matching hand/meld changes and,
for another player's called discard, cross-seat river-removal evidence.

## Troubleshooting

- `Unsupported size/DPI`: restore a 1920×1080 client area and 100% scaling.
- `Synchronizing`: leave the complete table visible until structural
  observations stabilize.
- Wrong or stale marks: use **Clear hand / resynchronize** and enable
  diagnostics for a short local recording.
- Overlay missing after minimizing: restore the client and wait for the
  eligible window status.
- Never submit private diagnostic recordings to Git; recording and artifact
  directories are ignored.

Calibration provenance is documented in [CALIBRATION.md](CALIBRATION.md).
Release evidence and known limits are documented in
[ACCEPTANCE.md](ACCEPTANCE.md).
