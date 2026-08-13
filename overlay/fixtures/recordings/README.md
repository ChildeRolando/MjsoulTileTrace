# Private replay recording matrix

Recordings in this directory are local acceptance evidence and are ignored by
Git. Capture the Mahjong Soul client area losslessly at exactly 1920×1080 with
Windows display scale at 100%. Do not resize, crop, interpolate, or transcode
before replay.

Required files:

1. `normal-discard.mp4`
   - At least two complete turns for Bottom, Right, Top, and Left.
   - Include both tsumogiri and tedashi wherever the visible structure makes
     the distinction observable.
2. `calls-and-kans.mp4`
   - Include chi or pon and the corresponding called river tile.
   - Include every available kan form: daiminkan, ankan, and kakan.
   - Keep enough frames before and after each call for the hand, river, and
     meld regions to settle.
3. `hand-boundaries.mp4`
   - Include one hand result, the next-hand setup, and the full-match result.
   - Keep the result screen visible long enough for lifecycle debounce.

Run a recording with:

```powershell
cd overlay
artifacts/replay-win-x64/MahjongSoulOverlay.Replay.exe `
  --input fixtures/recordings/normal-discard.mp4 `
  --profile src/MahjongSoulOverlay.Vision/Profiles/yonma-1920x1080.standard.json `
  --events artifacts/replay/normal-discard.events.jsonl `
  --annotated artifacts/replay/normal-discard.annotated.mp4
```

The JSONL audit is authoritative. Annotated video is optional and never
changes event processing. Keep hand-labelled expected-event files beside the
ignored recordings; they must contain frame ranges, actor, expected event
kind, and optional source seat/tile evidence.
