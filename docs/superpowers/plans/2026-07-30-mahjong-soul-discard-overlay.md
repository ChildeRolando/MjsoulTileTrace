# Mahjong Soul Discard Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-only, offline Mahjong Soul companion that classifies each visible discard as tsumogiri or tedashi from structural table changes and draws persistent, click-through river overlays.

**Architecture:** A pure .NET core converts per-seat occupancy observations into stable transactions, table events, tracked river tiles, and lifecycle state. A Windows/OpenCV shell captures only the Mahjong Soul window, applies four independent calibrated seat profiles, and renders the confirmed state through a transparent overlay. Recorded frame sequences and deterministic observation traces drive most verification before live-table acceptance.

**Tech Stack:** C# 12, local .NET 8 SDK, WinForms, Windows Graphics Capture, OpenCvSharp 4, xUnit, JSON fixtures.

---

## Scope and delivery sequence

This is one integrated product, but implementation proceeds through three executable milestones:

1. **Deterministic core:** synthetic observation streams correctly classify discards, calls, kans, river changes, and hand boundaries.
2. **Offline visual replay:** recorded 1920×1080 frames produce observations and an auditable JSON event trace.
3. **Windows companion:** live capture, tray controls, click-through rendering, diagnostics, and real-table acceptance.

No task adds process injection, memory inspection, packet capture, input automation, game advice, or anti-detection behavior.

## File structure

```text
.gitignore
overlay/
  global.json
  MahjongSoulOverlay.sln
  Directory.Build.props
  src/
    MahjongSoulOverlay.Core/
      MahjongSoulOverlay.Core.csproj
      Domain/Geometry.cs
      Domain/Observations.cs
      Domain/TableEvents.cs
      Profiles/SeatProfile.cs
      Events/ObservationDiffer.cs
      Events/TransactionAggregator.cs
      Events/EventClassifier.cs
      River/RiverTracker.cs
      Lifecycle/TableLifecycle.cs
      Pipeline/OverlayEngine.cs
    MahjongSoulOverlay.Vision/
      MahjongSoulOverlay.Vision.csproj
      Frames/PixelFrame.cs
      Detection/OpenCvSeatDetector.cs
      Detection/OccupancyScorer.cs
      Profiles/ProfileLoader.cs
      Profiles/yonma-1920x1080.standard.json
    MahjongSoulOverlay.Windows/
      MahjongSoulOverlay.Windows.csproj
      Program.cs
      Capture/MahjongWindowLocator.cs
      Capture/WindowsCaptureSource.cs
      Overlay/OverlayForm.cs
      Overlay/OverlayRenderer.cs
      Shell/TrayApplicationContext.cs
      Diagnostics/DiagnosticRecorder.cs
    MahjongSoulOverlay.Replay/
      MahjongSoulOverlay.Replay.csproj
      Program.cs
      ReplayRunner.cs
    MahjongSoulOverlay.Calibrator/
      MahjongSoulOverlay.Calibrator.csproj
      Program.cs
      CalibrationForm.cs
  tests/
    MahjongSoulOverlay.Core.Tests/
      MahjongSoulOverlay.Core.Tests.csproj
      ObservationDifferTests.cs
      TransactionAggregatorTests.cs
      EventClassifierTests.cs
      RiverTrackerTests.cs
      TableLifecycleTests.cs
      OverlayEngineTests.cs
    MahjongSoulOverlay.Vision.Tests/
      MahjongSoulOverlay.Vision.Tests.csproj
      ProfileLoaderTests.cs
      OccupancyScorerTests.cs
      OpenCvSeatDetectorTests.cs
      Fixtures/
        synthetic-empty-table.png
        synthetic-occupied-slots.png
    MahjongSoulOverlay.Windows.Tests/
      MahjongSoulOverlay.Windows.Tests.csproj
      WindowGeometryTests.cs
      OverlayRendererTests.cs
      TrayApplicationContextTests.cs
  fixtures/
    traces/
      tsumogiri.json
      tedashi.json
      chi-then-discard.json
      pon-then-discard.json
      daiminkan.json
      ankan.json
      kakan.json
      called-river-tile.json
      hand-boundary.json
    recordings/
      README.md
  tools/
    install-dotnet.ps1
```

Core has no dependency on WinForms or OpenCV. Vision depends on Core. Windows depends on Core and Vision. Replay depends on Core and Vision. Calibrator depends on Core, Vision, and WinForms.

### Task 1: Bootstrap the isolated .NET 8 solution

**Files:**
- Create: `.gitignore`
- Create: `overlay/global.json`
- Create: `overlay/Directory.Build.props`
- Create: `overlay/tools/install-dotnet.ps1`
- Create: `overlay/MahjongSoulOverlay.sln`
- Create: all project files listed in the file structure

- [ ] **Step 1: Add repository-local ignore rules**

Create `.gitignore`:

```gitignore
.superpowers/
.tools/
**/bin/
**/obj/
TestResults/
overlay/fixtures/recordings/*.mp4
overlay/fixtures/recordings/*.mkv
overlay/fixtures/recordings/*.jsonl
overlay/diagnostics/
```

- [ ] **Step 2: Add a repeatable local SDK installer**

Create `overlay/tools/install-dotnet.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$installDir = Join-Path $PSScriptRoot '..\..\.tools\dotnet'
$installDir = [System.IO.Path]::GetFullPath($installDir)
$scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) 'dotnet-install-overlay.ps1'
Invoke-WebRequest 'https://dot.net/v1/dotnet-install.ps1' -OutFile $scriptPath
& $scriptPath -Version '8.0.100' -InstallDir $installDir
& (Join-Path $installDir 'dotnet.exe') --info
```

- [ ] **Step 3: Install the local SDK and pin the build**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\overlay\tools\install-dotnet.ps1
```

Expected: `.tools\dotnet\dotnet.exe --info` reports SDK `8.0.100`.

Create `overlay/global.json`:

```json
{
  "sdk": {
    "version": "8.0.100",
    "rollForward": "latestPatch"
  }
}
```

Create `overlay/Directory.Build.props`:

```xml
<Project>
  <PropertyGroup>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>12.0</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <Deterministic>true</Deterministic>
  </PropertyGroup>
</Project>
```

- [ ] **Step 4: Create the solution and projects**

Run from the repository root:

```powershell
$dotnet = Resolve-Path '.\.tools\dotnet\dotnet.exe'
Push-Location overlay
& $dotnet new sln -n MahjongSoulOverlay
& $dotnet new classlib -n MahjongSoulOverlay.Core -o src/MahjongSoulOverlay.Core -f net8.0
& $dotnet new classlib -n MahjongSoulOverlay.Vision -o src/MahjongSoulOverlay.Vision -f net8.0
& $dotnet new winforms -n MahjongSoulOverlay.Windows -o src/MahjongSoulOverlay.Windows -f net8.0-windows
& $dotnet new console -n MahjongSoulOverlay.Replay -o src/MahjongSoulOverlay.Replay -f net8.0
& $dotnet new winforms -n MahjongSoulOverlay.Calibrator -o src/MahjongSoulOverlay.Calibrator -f net8.0-windows
& $dotnet new xunit -n MahjongSoulOverlay.Core.Tests -o tests/MahjongSoulOverlay.Core.Tests -f net8.0
& $dotnet new xunit -n MahjongSoulOverlay.Vision.Tests -o tests/MahjongSoulOverlay.Vision.Tests -f net8.0
& $dotnet new xunit -n MahjongSoulOverlay.Windows.Tests -o tests/MahjongSoulOverlay.Windows.Tests -f net8.0-windows
& $dotnet sln add (Get-ChildItem -Recurse -Filter '*.csproj' | ForEach-Object FullName)
& $dotnet add src/MahjongSoulOverlay.Vision reference src/MahjongSoulOverlay.Core
& $dotnet add src/MahjongSoulOverlay.Windows reference src/MahjongSoulOverlay.Core src/MahjongSoulOverlay.Vision
& $dotnet add src/MahjongSoulOverlay.Replay reference src/MahjongSoulOverlay.Core src/MahjongSoulOverlay.Vision
& $dotnet add src/MahjongSoulOverlay.Calibrator reference src/MahjongSoulOverlay.Core src/MahjongSoulOverlay.Vision
& $dotnet add tests/MahjongSoulOverlay.Core.Tests reference src/MahjongSoulOverlay.Core
& $dotnet add tests/MahjongSoulOverlay.Vision.Tests reference src/MahjongSoulOverlay.Core src/MahjongSoulOverlay.Vision
& $dotnet add tests/MahjongSoulOverlay.Windows.Tests reference src/MahjongSoulOverlay.Core src/MahjongSoulOverlay.Windows
Pop-Location
```

Set the target framework in the Windows, Calibrator, and Windows.Tests project files to:

```xml
<TargetFramework>net8.0-windows10.0.19041.0</TargetFramework>
```

- [ ] **Step 5: Add packages**

Run:

```powershell
$dotnet = Resolve-Path '.\.tools\dotnet\dotnet.exe'
Push-Location overlay
& $dotnet add src/MahjongSoulOverlay.Vision package OpenCvSharp4 -v 4.10.0.20241108
& $dotnet add src/MahjongSoulOverlay.Vision package OpenCvSharp4.runtime.win -v 4.10.0.20241108
& $dotnet add src/MahjongSoulOverlay.Replay package OpenCvSharp4 -v 4.10.0.20241108
& $dotnet add src/MahjongSoulOverlay.Replay package OpenCvSharp4.runtime.win -v 4.10.0.20241108
& $dotnet restore MahjongSoulOverlay.sln
& $dotnet test MahjongSoulOverlay.sln --no-restore
Pop-Location
```

Expected: restore succeeds and template tests pass.

- [ ] **Step 6: Commit the bootstrap**

```powershell
git add .gitignore overlay
git commit -m "build: bootstrap Mahjong Soul overlay solution"
```

### Task 2: Define geometry, observations, profiles, and table events

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Core/Domain/Geometry.cs`
- Create: `overlay/src/MahjongSoulOverlay.Core/Domain/Observations.cs`
- Create: `overlay/src/MahjongSoulOverlay.Core/Domain/TableEvents.cs`
- Create: `overlay/src/MahjongSoulOverlay.Core/Profiles/SeatProfile.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Core.Tests/ObservationDifferTests.cs`

- [ ] **Step 1: Write the failing geometry and observation test**

Create `ObservationDifferTests.cs`:

```csharp
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class ObservationDifferTests
{
    [Fact]
    public void Diff_reports_each_structural_change_independently()
    {
        var before = SeatObservation.Stable(Seat.Bottom, mainHandCount: 13, drawnOccupied: false,
            meldGroups: 0, meldTiles: 0, river: []);
        var after = SeatObservation.Stable(Seat.Bottom, mainHandCount: 13, drawnOccupied: true,
            meldGroups: 0, meldTiles: 0, river: []);

        var delta = ObservationDiffer.Diff(before, after);

        Assert.Equal(0, delta.MainHandDelta);
        Assert.Equal(1, delta.DrawnSlotDelta);
        Assert.Equal(0, delta.RiverDelta);
        Assert.True(delta.IsStable);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter ObservationDifferTests
```

Expected: FAIL because domain types and `ObservationDiffer` do not exist.

- [ ] **Step 3: Add the domain contracts**

Create `Geometry.cs`:

```csharp
namespace MahjongSoulOverlay.Core.Domain;

public readonly record struct NormalizedPoint(double X, double Y);

public sealed record NormalizedQuad(
    NormalizedPoint TopLeft,
    NormalizedPoint TopRight,
    NormalizedPoint BottomRight,
    NormalizedPoint BottomLeft);

public sealed record DetectedTile(string DetectionId, NormalizedQuad Quad, double Confidence);
```

Create `Observations.cs`:

```csharp
namespace MahjongSoulOverlay.Core.Domain;

public enum Seat { Bottom, Right, Top, Left }

public sealed record SeatObservation(
    Seat Seat,
    int MainHandCount,
    IReadOnlyList<bool> MainSlots,
    bool DrawnSlotOccupied,
    int MeldGroups,
    int MeldTiles,
    IReadOnlyList<DetectedTile> RiverTiles,
    bool IsStable,
    double Confidence,
    DateTimeOffset Timestamp)
{
    public static SeatObservation Stable(
        Seat seat, int mainHandCount, bool drawnOccupied, int meldGroups,
        int meldTiles, IReadOnlyList<DetectedTile> river) =>
        new(seat, mainHandCount, Enumerable.Repeat(true, mainHandCount).ToArray(),
            drawnOccupied, meldGroups, meldTiles, river, true, 1d, DateTimeOffset.UnixEpoch);
}

public sealed record TableObservation(
    IReadOnlyDictionary<Seat, SeatObservation> Seats,
    bool TableStructureVisible,
    bool HandBaselineVisible,
    bool ResultScreenVisible,
    DateTimeOffset Timestamp);
```

Create `TableEvents.cs`:

```csharp
namespace MahjongSoulOverlay.Core.Domain;

public enum TableEventKind
{
    Draw, Tsumogiri, Tedashi, ChiOrPon, Daiminkan, Ankan, Kakan,
    RinshanDraw, CalledDiscard, Unknown
}

public sealed record TableEvent(
    TableEventKind Kind,
    Seat Actor,
    Seat? SourceSeat,
    DateTimeOffset Timestamp,
    double Confidence);

public enum DiscardKind { Tsumogiri, Tedashi, Unknown }

public sealed record RiverTile(
    Guid Id,
    Seat Seat,
    NormalizedQuad Quad,
    DiscardKind Kind,
    bool WasCalled,
    double Confidence,
    DateTimeOffset FirstSeen);
```

Create `SeatProfile.cs`:

```csharp
using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Profiles;

public enum LayoutDirection
{
    LeftToRight,
    RightToLeft,
    TopToBottom,
    BottomToTop
}

public sealed record TileScale
{
    public TileScale(double width, double height);
    public double Width { get; }
    public double Height { get; }
}

public sealed record RegionThresholds
{
    public RegionThresholds(double occupancy, double stable);
    public double Occupancy { get; }
    public double Stable { get; }
}

public sealed record SeatProfile
{
    public SeatProfile(
        Seat seat,
        NormalizedQuad mainHandRegion,
        IReadOnlyList<NormalizedQuad> mainSlots,
        LayoutDirection mainHandDirection,
        NormalizedQuad drawnSlot,
        NormalizedQuad riverRegion,
        LayoutDirection riverFlowDirection,
        NormalizedQuad meldRegion,
        LayoutDirection meldExpansionDirection,
        TileScale expectedTileScale,
        double minimumTileAspect,
        double maximumTileAspect,
        double minimumAngle,
        double maximumAngle,
        double perspectiveTolerance,
        RegionThresholds mainHandThresholds,
        RegionThresholds drawnSlotThresholds,
        RegionThresholds riverThresholds,
        RegionThresholds meldThresholds,
        double minimumTileConfidence);

    public Seat Seat { get; }
    public NormalizedQuad MainHandRegion { get; }
    public IReadOnlyList<NormalizedQuad> MainSlots { get; }
    public LayoutDirection MainHandDirection { get; }
    public NormalizedQuad DrawnSlot { get; }
    public NormalizedQuad RiverRegion { get; }
    public LayoutDirection RiverFlowDirection { get; }
    public NormalizedQuad MeldRegion { get; }
    public LayoutDirection MeldExpansionDirection { get; }
    public TileScale ExpectedTileScale { get; }
    public double MinimumTileAspect { get; }
    public double MaximumTileAspect { get; }
    public double MinimumAngle { get; }
    public double MaximumAngle { get; }
    public double PerspectiveTolerance { get; }
    public RegionThresholds MainHandThresholds { get; }
    public RegionThresholds DrawnSlotThresholds { get; }
    public RegionThresholds RiverThresholds { get; }
    public RegionThresholds MeldThresholds { get; }
    public double MinimumTileConfidence { get; }
}

public sealed record TableProfile
{
    public TableProfile(
        string id,
        int width,
        int height,
        double displayScale,
        IReadOnlyDictionary<Seat, SeatProfile> seats);

    public string Id { get; }
    public int Width { get; }
    public int Height { get; }
    public double DisplayScale { get; }
    public IReadOnlyDictionary<Seat, SeatProfile> Seats { get; }
}
```

- [ ] **Step 4: Implement observation differencing**

Create `Events/ObservationDiffer.cs`:

```csharp
using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Events;

public sealed record ObservationDelta
{
    public ObservationDelta(
        Seat seat, int mainHandDelta, int drawnSlotDelta,
        int meldGroupDelta, int meldTileDelta, int riverDelta,
        bool mainSlotRemoved, bool isStable, double confidence,
        DateTimeOffset timestamp);

    public Seat Seat { get; }
    public int MainHandDelta { get; }
    public int DrawnSlotDelta { get; }
    public int MeldGroupDelta { get; }
    public int MeldTileDelta { get; }
    public int RiverDelta { get; }
    public bool MainSlotRemoved { get; }
    public bool IsStable { get; }
    public double Confidence { get; }
    public DateTimeOffset Timestamp { get; }
    public bool HasStructuralChange { get; }
}

public static class ObservationDiffer
{
    public static ObservationDelta Diff(SeatObservation before, SeatObservation after)
    {
        if (before.Seat != after.Seat)
            throw new ArgumentException("Observations must belong to the same seat.");

        var removed = Enumerable.Range(0, before.MainSlots.Count)
            .Any(index => before.MainSlots[index] &&
                (index >= after.MainSlots.Count || !after.MainSlots[index]));

        return new ObservationDelta(
            after.Seat,
            after.MainHandCount - before.MainHandCount,
            Convert.ToInt32(after.DrawnSlotOccupied) - Convert.ToInt32(before.DrawnSlotOccupied),
            after.MeldGroups - before.MeldGroups,
            after.MeldTiles - before.MeldTiles,
            after.RiverTiles.Count - before.RiverTiles.Count,
            removed,
            before.IsStable && after.IsStable,
            Math.Min(before.Confidence, after.Confidence),
            after.Timestamp);
    }
}
```

- [ ] **Step 5: Run the full core test project**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests
```

Expected: PASS.

- [ ] **Step 6: Commit the domain model**

```powershell
git add overlay/src/MahjongSoulOverlay.Core overlay/tests/MahjongSoulOverlay.Core.Tests
git commit -m "feat: define overlay observation model"
```

### Task 3: Aggregate unstable frames into structural transactions

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Core/Events/TransactionAggregator.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Core.Tests/TransactionAggregatorTests.cs`

- [ ] **Step 1: Write failing stream tests for stability, timeout, and bounds**

Create `TransactionAggregatorTests.cs` with realistic ordered streams covering:

- Zero-change stable frames while idle do not open a transaction or count toward later stability.
- Once a structural delta opens a transaction, consecutive stable zero-change frames confirm it; an unstable frame resets that count.
- Timeout is inclusive (`elapsed >= timeout`) and is evaluated by both `Add` and `AdvanceClock`.
- Mixed-seat input preserves its complete ordered payload and produces a conflicted transaction without waiting for stability.
- The transaction exposes an immutable ordered delta snapshot, minimum confidence, every summed field, removal state, and `long` totals.
- Timestamps remain monotonic across completed transactions; `Reset()` clears that history and `Reset(baseline)` reseeds it.
- `maxDeltas` is positive, bounds retained storage, and reaching it completes a conflict without waiting for stable frames.
- Conflict completion clears all in-flight state so the aggregator can be reused.

- [ ] **Step 2: Verify the tests fail**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter TransactionAggregatorTests
```

Expected: FAIL because the bounded stream and immutable transaction contracts do not exist.

- [ ] **Step 3: Implement the aggregator**

Create `TransactionAggregator.cs` with these public contracts:

```csharp
public sealed class ObservationTransaction
{
    public ObservationTransaction(
        IReadOnlyList<ObservationDelta> deltas,
        bool isConflicted,
        DateTimeOffset completedAt);

    public Seat Seat { get; }
    public long MainHandDelta { get; }
    public long DrawnSlotDelta { get; }
    public long MeldGroupDelta { get; }
    public long MeldTileDelta { get; }
    public long RiverDelta { get; }
    public bool MainSlotRemoved { get; }
    public bool IsConflicted { get; }
    public DateTimeOffset StartedAt { get; }
    public DateTimeOffset CompletedAt { get; }
    public IReadOnlyList<ObservationDelta> Deltas { get; }
    public double Confidence { get; }
    public long ConcealedDelta { get; }
}

public sealed class TransactionAggregator
{
    public TransactionAggregator(
        TimeSpan timeout, int stableFramesRequired, int maxDeltas = 512);
    public void Add(ObservationDelta delta);
    public void AdvanceClock(DateTimeOffset now);
    public ObservationTransaction? TryComplete();
    public void Reset(DateTimeOffset? baselineTimestamp = null);
}
```

`ObservationTransaction` defensively copies deltas and derives every aggregate from that snapshot using `long` accumulation. The aggregator ignores zero-change frames while idle except for advancing its global monotonic timestamp. After a structural change, all frames participate in stability. Mixed-seat input, reaching the inclusive timeout, or reaching the delta limit marks conflict and permits immediate completion; no further payloads are retained after overflow. `TryComplete` clears in-flight state in a `finally` path while preserving the global timestamp until an explicit lifecycle reset.

- [ ] **Step 4: Run and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter TransactionAggregatorTests
git add overlay/src/MahjongSoulOverlay.Core/Events overlay/tests/MahjongSoulOverlay.Core.Tests
git commit -m "feat: aggregate structural table changes"
```

Expected: all transaction stream and contract tests PASS before commit.

### Task 4: Classify draws, discards, calls, and kans

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Core/Events/EventClassifier.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Core.Tests/EventClassifierTests.cs`
- Create: `overlay/fixtures/traces/*.json`

- [ ] **Step 1: Define the local-candidate boundary**

`EventClassifier` does not emit a final `TableEvent`. It returns an immutable local
candidate based only on one actor's transaction:

```csharp
public enum ConfirmationRequirement
{
    None,
    SourceRiverRemoval
}

public sealed record LocalEventCandidate(
    Guid Id,
    TableEventKind Kind,
    Seat Actor,
    double Confidence,
    ConfirmationRequirement ConfirmationRequirement,
    DateTimeOffset StartedAt,
    DateTimeOffset ObservedAt);

public sealed class EventClassifier
{
    public EventClassifier(double minimumConfidence = 0.75);

    public LocalEventCandidate Classify(
        ObservationTransaction transaction,
        TableEvent? previousConfirmedEvent = null);
}
```

Validate `minimumConfidence` within `[0, 1]`. Keep the production rule set
immutable. An internal constructor may accept an immutable rule list for the
single ambiguity-resolution contract test; it is not part of application
composition.

Candidate IDs must be stable across identical replay runs. Derive the `Guid`
deterministically from the actor, transaction start/completion timestamps, and
the complete ordered delta payload; do not use `Guid.NewGuid()`. `StartedAt` and
`ObservedAt` copy the transaction timestamps and are the authoritative
correlation/audit times.

`previousConfirmedEvent` must come from the engine's formal event history. A draw
can become `RinshanDraw` only when that event is a confirmed `Daiminkan`, `Ankan`,
or `Kakan` by the same actor. A prior local candidate is never sufficient context.

- [ ] **Step 2: Add ordered, fixture-driven failing cases**

Write RED tests for:

- Valid single-delta and valid multi-delta draw, tsumogiri, tedashi, chi/pon,
  daiminkan, ankan, and kakan streams.
- Stable zero-change confirmation deltas interleaved between evidence steps;
  these are ignored for evidence ordering.
- Reversed evidence and non-permitted intermediate structural deltas.
- Exact totals with one incomplete required total or any unrelated nonzero total.
- Conflicted transactions and transactions below configurable minimum confidence.
- A synthetic ambiguous transaction evaluated against two matching test rules:
  collecting more than one match must return `Unknown`; classification must
  never depend on rule order.
- `ChiOrPon` and `Daiminkan` use
  `ConfirmationRequirement.SourceRiverRemoval`; all other kinds, including
  `Ankan` and `Kakan`, use `None`.
- Identical transactions produce identical candidate IDs and timestamps; a
  changed actor, timestamp, or ordered delta payload changes the ID.
- Rinshan classification with a same-actor confirmed kan, and rejection when
  the prior event is unconfirmed, non-kan, or belongs to another actor.

Every recognized rule requires exact totals. Fields not named by a rule must be
zero and `MainSlotRemoved` must have the exact required value:

| Candidate | Main | Drawn | Meld groups | Meld tiles | River | Removed | Confirmation |
|---|---:|---:|---:|---:|---:|---|---|
| Draw | 0 | +1 | 0 | 0 | 0 | false | None |
| Tsumogiri | 0 | −1 | 0 | 0 | +1 | false | None |
| Tedashi | 0 | −1 | 0 | 0 | +1 | true | None |
| ChiOrPon | −2 | 0 | +1 | +3 | 0 | false | SourceRiverRemoval |
| Daiminkan | −3 | 0 | +1 | +4 | 0 | false | SourceRiverRemoval |
| Ankan | −4 | 0 | +1 | +4 | 0 | false | None |
| Kakan | −1 | 0 | 0 | +1 | 0 | false | None |

After removing stable zero-change deltas, permitted ordered evidence is:

- Draw: one `DrawnSlotDelta +1` step.
- Tsumogiri: drawn-slot removal before river addition, or both in one delta.
- Tedashi: a removed main slot first; any `MainHandDelta -1` must be balanced by
  a later `MainHandDelta +1` that also clears the drawn slot; river addition is
  last. The compact form may combine the removal, drawn-slot clear, and river
  addition in one delta.
- Chi/pon and every kan: concealed-hand contraction precedes meld growth, or
  both occur in one delta. Splitting meld-group and meld-tile growth is allowed
  only in that order. No actor-river change is permitted.

Within nonzero evidence, a field may change only in a step explicitly permitted
above. Opposite deltas that merely cancel to an exact aggregate still invalidate
the candidate. An unstable zero-change delta is also not a confirmation and
invalidates the ordered evidence.

The test helper builds `ObservationTransaction` from an ordered
`IReadOnlyList<ObservationDelta>`; it must not bypass ordering by constructing
only aggregate totals.

- [ ] **Step 3: Verify the tests fail**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter EventClassifierTests
```

Expected: FAIL because `EventClassifier` does not exist.

- [ ] **Step 4: Implement exact, ordered, ambiguity-safe rules**

Reject conflicted or low-confidence transactions before evaluating rules. Each
rule checks both exact aggregate totals and the filtered ordered delta sequence.
Evaluate every rule and collect matches; return a zero-confidence `Unknown`
candidate with requirement `None` when the match count is not exactly one.
Otherwise return the sole candidate with `transaction.Confidence`.

Rule evaluation remains pure. It does not inspect another seat, mutate event
history, remove river tiles, or convert a candidate into `TableEvent`.

- [ ] **Step 5: Add complete observation-trace fixtures**

Each file under `overlay/fixtures/traces/` is a JSON array of `SeatObservation` values. Use ISO-8601 timestamps and all four seats. `tsumogiri.json` must contain: stable 13-tile baseline, drawn slot occupied, drawn slot cleared, and one new bottom river quad. `tedashi.json` must contain: stable baseline, drawn slot occupied, one main slot cleared, compacted main hand, drawn slot cleared, and one new river quad. Call and kan files must encode the exact net changes listed in the classifier test.

Validate every fixture:

```powershell
Get-ChildItem overlay/fixtures/traces/*.json | ForEach-Object {
  Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null
}
```

Expected: no parse errors.

- [ ] **Step 6: Run and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter EventClassifierTests
git add overlay/src/MahjongSoulOverlay.Core/Events overlay/tests/MahjongSoulOverlay.Core.Tests overlay/fixtures/traces
git commit -m "feat: classify local Mahjong event candidates"
```

### Task 5: Track physical river tiles without reflow errors

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Core/River/RiverTracker.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Core.Tests/RiverTrackerTests.cs`

- [ ] **Step 1: Write failing tests for new, moved, and called tiles**

Create tests that use axis-aligned normalized quads:

```csharp
[Fact]
public void Called_tile_is_removed_without_shifting_remaining_ids()
{
    var tracker = new RiverTracker(minimumIntersectionOverUnion: 0.45);
    var first = Tile("a", 0.10, 0.10);
    var second = Tile("b", 0.16, 0.10);
    tracker.Update(Seat.Top, [first, second], DiscardKind.Tsumogiri, DateTimeOffset.UnixEpoch);
    var originalSecondId = tracker.Tiles.Single(tile => tile.Quad == second.Quad).Id;

    tracker.Update(Seat.Top, [second], null, DateTimeOffset.UnixEpoch.AddSeconds(1),
        callConfirmed: true);

    Assert.Single(tracker.Tiles);
    Assert.Equal(originalSecondId, tracker.Tiles[0].Id);
}

private static DetectedTile Tile(string id, double x, double y) =>
    new(id, new NormalizedQuad(
        new(x, y), new(x + .04, y), new(x + .04, y + .06), new(x, y + .06)), 1d);
```

Also add:

- A new unmatched quad creates one `RiverTile` with the supplied discard kind.
- A horizontally widened quad with sufficient overlap retains the same ID.
- A disappeared quad without `callConfirmed` is marked uncertain and removed rather than reassigned.

- [ ] **Step 2: Verify the tests fail**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter RiverTrackerTests
```

Expected: FAIL because `RiverTracker` does not exist.

- [ ] **Step 3: Implement deterministic overlap matching**

Implement `RiverTracker.Update` as follows:

1. Build all existing/detected pairs with intersection-over-union at or above the constructor threshold.
2. Sort pairs descending by intersection-over-union.
3. Greedily assign pairs only when neither side is already assigned.
4. Update matched quads and confidence while preserving IDs and discard kinds.
5. Create `RiverTile` values for unmatched detections only when a non-null discard kind is supplied.
6. Remove unmatched existing tiles. Set `WasCalled` in the returned removal list when `callConfirmed` is true.

Expose:

```csharp
public IReadOnlyList<RiverTile> Tiles { get; }
public RiverUpdateResult Update(
    Seat seat,
    IReadOnlyList<DetectedTile> detections,
    DiscardKind? newDiscardKind,
    DateTimeOffset timestamp,
    bool callConfirmed = false);
```

`RiverUpdateResult` contains `Added`, `Updated`, and `Removed` lists. Put quad area, intersection, union, and intersection-over-union in private pure methods and cover zero-area quads with a test.

- [ ] **Step 4: Run and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter RiverTrackerTests
git add overlay/src/MahjongSoulOverlay.Core/River overlay/tests/MahjongSoulOverlay.Core.Tests
git commit -m "feat: track physical river tile positions"
```

### Task 6: Implement session and hand lifecycle

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Core/Lifecycle/TableLifecycle.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Core.Tests/TableLifecycleTests.cs`

- [ ] **Step 1: Write the lifecycle sequence tests**

Cover these exact sequences:

- Five stable visible-table frames transition `Detached → SessionReady`.
- Three stable baseline frames transition `SessionReady → HandActive`.
- One result-screen frame transitions `HandActive → SessionReady` and emits `ClearOverlay`.
- Ten absent-table frames transition to `Detached` and emits `HideOverlay`.
- Two absent frames followed by a visible frame do not end the session.
- A manual reset from `HandActive` emits `ClearOverlay` and returns to `SessionReady`.

Use:

```csharp
public sealed record LifecycleInput(
    bool TableVisible,
    bool HandBaselineVisible,
    bool ResultScreenVisible);
```

- [ ] **Step 2: Verify failure**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter TableLifecycleTests
```

Expected: FAIL because lifecycle types do not exist.

- [ ] **Step 3: Implement the debounced state machine**

Create:

```csharp
public enum LifecycleState { Detached, SessionReady, HandActive }
public enum LifecycleAction { None, ClearOverlay, HideOverlay }
public sealed record LifecycleResult(LifecycleState State, LifecycleAction Action);
```

`TableLifecycle.Push` maintains consecutive counters. Result-screen detection has immediate priority. Visible-table and baseline thresholds are constructor arguments with defaults `5`, `3`, and `10`. Reset counters whenever the opposite signal appears. `ManualReset()` clears all counters, returns `SessionReady` when attached, and emits `ClearOverlay`.

- [ ] **Step 4: Run and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter TableLifecycleTests
git add overlay/src/MahjongSoulOverlay.Core/Lifecycle overlay/tests/MahjongSoulOverlay.Core.Tests
git commit -m "feat: manage Mahjong table lifecycle"
```

### Task 7: Compose the deterministic overlay engine

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Core/Pipeline/OverlayEngine.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Core.Tests/OverlayEngineTests.cs`

- [ ] **Step 1: Write an end-to-end synthetic trace test**

Feed a four-seat baseline, a bottom draw, a bottom tsumogiri, a right draw, a right tedashi, a call that removes the bottom discard, and a result-screen frame. Assert in order:

1. No layers before `HandActive`.
2. One gray bottom layer after tsumogiri.
3. One gold right layer after tedashi.
4. A right `ChiOrPon` local candidate does not enter formal history before a
   bottom river removal is observed, regardless of which evidence arrives first.
5. The uniquely correlated bottom removal confirms the right call, emits the
   formal event with `SourceSeat.Bottom`, and removes the bottom layer while the
   right layer retains its ID.
6. Candidate-before-removal and removal-before-candidate both confirm; a pair
   separated by exactly the association window confirms.
7. A pair just outside the window expires. Multiple eligible removals or
   candidates resolve ambiguous. No removal tile can confirm two candidates.
8. All layers and internal pending evidence are cleared on result screen.

Use an output contract:

```csharp
public sealed record OverlayLayer(Guid TileId, Seat Seat, NormalizedQuad Quad, DiscardKind Kind);

public enum CandidateResolutionStatus
{
    Confirmed,
    Expired,
    Ambiguous,
    Rejected
}

public sealed record CandidateResolution(
    Guid CandidateId,
    Seat Actor,
    TableEventKind CandidateKind,
    TableEventKind OutcomeKind,
    CandidateResolutionStatus Status,
    DateTimeOffset ResolvedAt,
    string Reason,
    Seat? SourceSeat,
    Guid? SourceTileId);

public sealed record EngineOutput(
    LifecycleState Lifecycle,
    IReadOnlyList<OverlayLayer> Layers,
    IReadOnlyList<TableEvent> Events,
    IReadOnlyList<CandidateResolution> CandidateResolutions,
    bool ShouldHideOverlay);
```

`CandidateResolution` is an immutable audit record. `OutcomeKind` equals the
candidate kind only for `Confirmed`; it is `Unknown` for `Expired`,
`Ambiguous`, and `Rejected`. `Reason` is a stable machine-readable value such as
`unique-source-removal`, `association-window-expired`,
`multiple-eligible-removals`, `multiple-eligible-candidates`, or
`classifier-rejected`. Optional source fields are populated only for a unique
confirmed match.

- [ ] **Step 2: Verify failure**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests --filter OverlayEngineTests
```

Expected: FAIL because `OverlayEngine` does not exist.

- [ ] **Step 3: Implement orchestration**

`OverlayEngine.Push(TableObservation)` must:

1. Update lifecycle first.
2. Clear trackers and aggregators on `ClearOverlay`.
3. Return no layers unless state is `HandActive`.
4. Diff each seat against its previous stable observation.
5. Aggregate deltas independently per seat.
6. Classify completed transactions into `LocalEventCandidate` values.
7. Immediately formalize candidates whose confirmation requirement is `None`;
   associate only formal `Tsumogiri` or `Tedashi` events with the same seat's
   unmatched new river detection.
8. Buffer both `SourceRiverRemoval` candidates and recent unmatched river
   removals. A removal record contains its stable tile ID, seat, and observed
   timestamp. Process all evidence from a frame before running correlation.
9. Correlate in either arrival order. An edge is eligible only when seats differ
   and the absolute timestamp difference is less than or equal to the
   association window. Sort evidence by timestamp and then stable ID so frame
   batching cannot change the result.
10. Build connected components of the eligible candidate/removal bipartite
    graph, including isolated candidates. A component remains open through
    `max(evidence.ObservedAt) + associationWindow`; evidence arriving exactly at
    that boundary is included and can extend the deadline. Resolve only after a
    full window of component quiescence, which makes candidate-first and
    removal-first streams equivalent:
    - No removal edge: resolve candidate nodes `Expired` with
      `OutcomeKind.Unknown`.
    - Exactly one candidate, one removal, and one edge: emit `Confirmed`.
    - Any component with multiple eligible candidates or removals: resolve all
      candidate nodes `Ambiguous` with `OutcomeKind.Unknown`.
    Consume every resolved component record. Confirmed removals are additionally
    tombstoned for the hand and can never be reused; unmatched isolated removals
    age out silently after their own inclusive window.
11. On confirmation, emit the call/daiminkan `TableEvent` with the removed tile's
   seat as `SourceSeat`, emit the called-discard river update, and only then add
   the event to formal history. A pending candidate never enters history.
12. Convert classifier `Unknown` output to a `Rejected` resolution. Expired,
    ambiguous, and rejected resolutions never create a formal event, alter kan
    context, reuse river evidence, or add an overlay.
13. Return immutable snapshots of formal events, candidate resolutions, and
    layers. Pending candidate/removal buffers use immutable internal snapshots
    and are exposed only through optional diagnostic-region rendering.

Rinshan context comes only from the latest formal, confirmed kan event for the
same actor. `Ankan` and `Kakan` become formal immediately; `Daiminkan` becomes
context only after cross-seat source-river confirmation. Clear context on that
actor's discard, hand reset, or lifecycle reset. Inject lifecycle, classifier,
the association-window duration, four aggregators, and four river trackers
through the constructor so tests can use deterministic short thresholds.

Add focused deterministic tests for candidate-before-removal,
removal-before-candidate, an exact-boundary match, a just-outside expiry,
multiple eligible removals, multiple eligible candidates, and attempted evidence
reuse. Assert every terminal candidate emits exactly one resolution diagnostic,
only `Confirmed` emits a formal event, and all non-confirmed outcomes serialize
as `OutcomeKind.Unknown`.

- [ ] **Step 4: Run the complete deterministic suite**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Core.Tests
```

Expected: all core tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add overlay/src/MahjongSoulOverlay.Core/Pipeline overlay/tests/MahjongSoulOverlay.Core.Tests
git commit -m "feat: compose overlay recognition engine"
```

### Task 8: Load four independent profiles and score slot occupancy

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Vision/Frames/PixelFrame.cs`
- Create: `overlay/src/MahjongSoulOverlay.Vision/Profiles/ProfileLoader.cs`
- Create: `overlay/src/MahjongSoulOverlay.Vision/Detection/OccupancyScorer.cs`
- Create: `overlay/tests/MahjongSoulOverlay.Vision.Tests/ProfileLoaderTests.cs`
- Create: `overlay/tests/MahjongSoulOverlay.Vision.Tests/OccupancyScorerTests.cs`
- Create: `overlay/tests/MahjongSoulOverlay.Vision.Tests/Fixtures/*.png`

- [ ] **Step 1: Generate deterministic synthetic fixtures**

Write a small test helper using OpenCvSharp that creates two 1920×1080 PNGs: a green table with empty slot polygons, and the same table with ivory quadrilaterals in selected slots. Save them under the exact fixture paths in the file structure. Generation must use fixed coordinates and no randomness.

- [ ] **Step 2: Write failing profile validation tests**

Assert that `ProfileLoader.Load` rejects:

- Any width other than 1920.
- Any height other than 1080.
- Any display scale other than 1.0.
- Missing seat profiles.
- Duplicate seat profiles.
- Normalized points outside `[0, 1]`.
- Bottom and top profiles with identical main-hand regions.

The final assertion enforces independent visual geometry rather than a shared pattern.

- [ ] **Step 3: Write failing occupancy tests**

For each of the four seats, load a distinct quad from an in-memory `SeatProfile`, run the scorer on the synthetic fixtures, and assert:

```csharp
Assert.True(occupiedScore >= profile.MainHandThresholds.Occupancy);
Assert.True(emptyScore < profile.MainHandThresholds.Occupancy);
```

- [ ] **Step 4: Implement frame ownership and profile loading**

`PixelFrame` owns an OpenCvSharp `Mat`, exposes width and height, and implements `IDisposable`. `ProfileLoader` uses `System.Text.Json` with `JsonStringEnumConverter`, validates every constraint from Step 2, and returns a `TableProfile`.

- [ ] **Step 5: Implement occupancy scoring**

For a normalized quad:

1. Convert its four points to pixel coordinates.
2. Perspective-warp it into a fixed grayscale patch.
3. Apply Gaussian blur and Canny edges.
4. Compute edge-pixel ratio and foreground contrast against a rolling empty-table baseline.
5. Return `0.65 * edgeRatio + 0.35 * contrast`, clamped to `[0, 1]`.

Expose a pure `Score(Mat frame, NormalizedQuad region, Mat? baseline)` method. Add tests for invalid or zero-area quads returning zero.

- [ ] **Step 6: Run and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Vision.Tests --filter "ProfileLoaderTests|OccupancyScorerTests"
git add overlay/src/MahjongSoulOverlay.Vision overlay/tests/MahjongSoulOverlay.Vision.Tests
git commit -m "feat: load seat profiles and score occupancy"
```

### Task 9: Build the calibrator and create the standard four-seat profile

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Calibrator/CalibrationForm.cs`
- Modify: `overlay/src/MahjongSoulOverlay.Calibrator/Program.cs`
- Create: `overlay/src/MahjongSoulOverlay.Vision/Profiles/yonma-1920x1080.standard.json`
- Test: `overlay/tests/MahjongSoulOverlay.Vision.Tests/ProfileLoaderTests.cs`

- [ ] **Step 1: Implement the calibration workflow**

The form opens one 1920×1080 PNG and guides the operator through this fixed order for each seat: main-hand region, each main slot, drawn slot, river region, and meld region. Four clicks define each quadrilateral. Seat order is Bottom, Right, Top, Left.

The form must:

- Draw the current quad and all completed regions.
- Support Undo Last Point and Reset Current Seat.
- Refuse save until all four seats are complete.
- Normalize all points by image width and height.
- Save a `TableProfile` through `System.Text.Json`.
- Reload the saved profile and render it for visual verification.

- [ ] **Step 2: Add a profile round-trip test**

Load the saved JSON, serialize it, reload it, and assert every normalized point, threshold, seat, and slot count is unchanged.

- [ ] **Step 3: Acquire one clean calibration frame**

Use the calibrator's Open Image command with a lossless screenshot captured from a 1920×1080, 100%-scaled Mahjong Soul four-player table. The image must show all four hands, empty or nearly empty rivers, and visible meld regions. Do not commit the screenshot.

This is the first live-game checkpoint: the user only needs to open a qualifying table or provide one qualifying lossless screenshot; all point selection and profile generation remain engineering work.

- [ ] **Step 4: Generate and verify the profile**

Save `yonma-1920x1080.standard.json`, then run:

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Vision.Tests --filter ProfileLoaderTests
```

Expected: profile validation and round-trip tests PASS, and the four main-hand regions are geometrically distinct.

- [ ] **Step 5: Commit**

```powershell
git add overlay/src/MahjongSoulOverlay.Calibrator overlay/src/MahjongSoulOverlay.Vision/Profiles overlay/tests/MahjongSoulOverlay.Vision.Tests
git commit -m "feat: calibrate four independent seat profiles"
```

### Task 10: Convert frames into stable four-seat observations

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Vision/Detection/OpenCvSeatDetector.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Vision.Tests/OpenCvSeatDetectorTests.cs`

- [ ] **Step 1: Write contract tests**

Given synthetic frames and a four-seat profile, assert:

- Exactly four `SeatObservation` values are returned.
- Each observation uses its own profile's regions.
- Main-hand count equals occupied main slots.
- Drawn-slot occupancy is independent of main-hand count.
- Meld group and tile counts are derived from connected components in the meld region.
- River detections include quadrilaterals and confidence.
- Three consecutive equivalent frames become stable; one changed frame is unstable.

- [ ] **Step 2: Verify failure**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Vision.Tests --filter OpenCvSeatDetectorTests
```

Expected: FAIL because detector does not exist.

- [ ] **Step 3: Implement the detector**

Expose:

```csharp
public sealed class OpenCvSeatDetector
{
    public OpenCvSeatDetector(TableProfile profile, int stableFramesRequired = 3);
    public TableObservation Detect(PixelFrame frame, DateTimeOffset timestamp);
    public void ResetBaseline();
}
```

For each seat:

- Score every main slot and the separate drawn slot.
- Count occupied main slots.
- In river and meld ROIs, threshold edges, close small gaps morphologically, find contours, reject components outside that seat's aspect/angle bounds, and map accepted rotated rectangles back to normalized quads.
- Track consecutive equal discrete counts to set `IsStable`.
- Set confidence to the minimum accepted confidence among required regions.

For table lifecycle signals:

- `TableStructureVisible` is true only when all four profile anchor regions pass their minimum structural score.
- `HandBaselineVisible` is true when all four hands are stable and all four rivers are empty.
- `ResultScreenVisible` is true when table anchors disappear while a large central foreground component covers the river center for two frames.

- [ ] **Step 4: Run and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Vision.Tests
git add overlay/src/MahjongSoulOverlay.Vision/Detection overlay/tests/MahjongSoulOverlay.Vision.Tests
git commit -m "feat: detect structural Mahjong observations"
```

### Task 11: Locate and capture only the Mahjong Soul window

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Windows/Capture/MahjongWindowLocator.cs`
- Create: `overlay/src/MahjongSoulOverlay.Windows/Capture/WindowsCaptureSource.cs`
- Create: `overlay/src/MahjongSoulOverlay.Windows/Diagnostics/DiagnosticRecorder.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Windows.Tests/WindowGeometryTests.cs`

- [ ] **Step 1: Write pure window-validation tests**

Move all eligibility rules into a pure method:

```csharp
public sealed record WindowSnapshot(
    nint Handle, string Title, bool Visible, bool Minimized,
    int ClientWidth, int ClientHeight, int Dpi);
```

Assert eligibility requires visible, not minimized, 1920×1080 client pixels, DPI 96, and a title or executable name from an explicit allowlist. Assert unrelated windows are rejected.

- [ ] **Step 2: Implement window location**

Use `EnumWindows`, `IsWindowVisible`, `IsIconic`, `GetClientRect`, `GetDpiForWindow`, and `GetWindowThreadProcessId`. Reading the executable name is allowed only to identify the target window; do not open the process for memory access.

Return no target when more than one eligible window exists. Poll every second and emit target-found, geometry-changed, minimized, and target-lost events.

- [ ] **Step 3: Implement Windows Graphics Capture**

Create a `GraphicsCaptureItem` for the selected HWND using `IGraphicsCaptureItemInterop`. Use a D3D11 device and `Direct3D11CaptureFramePool`. Copy each delivered frame into an owned BGRA buffer, then immediately release the capture frame. Expose:

```csharp
public interface IFrameSource : IAsyncDisposable
{
    event EventHandler<CapturedFrame>? FrameArrived;
    Task StartAsync(nint windowHandle, CancellationToken cancellationToken);
    Task StopAsync();
}

public sealed record CapturedFrame(
    int Width, int Height, int Stride, ReadOnlyMemory<byte> Bgra,
    DateTimeOffset Timestamp);
```

Set the frame pool to two buffers and BGRA8. Drop a frame when processing is still busy; never queue unbounded frames.

- [ ] **Step 4: Add an explicit local diagnostic recorder**

`DiagnosticRecorder` is disabled by default. When enabled, it writes:

- One PNG per selected key frame.
- A JSONL line containing timestamp, window dimensions, four observations,
  formal events, candidate-resolution diagnostics, layers, and lifecycle state.
- Files under `overlay/diagnostics/<UTC timestamp>/`.

It must never start from detection errors alone; only the tray command enables it.

- [ ] **Step 5: Run Windows tests and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Windows.Tests
git add overlay/src/MahjongSoulOverlay.Windows/Capture overlay/src/MahjongSoulOverlay.Windows/Diagnostics overlay/tests/MahjongSoulOverlay.Windows.Tests
git commit -m "feat: capture Mahjong Soul window frames"
```

### Task 12: Render scheme A through a click-through overlay

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Windows/Overlay/OverlayRenderer.cs`
- Create: `overlay/src/MahjongSoulOverlay.Windows/Overlay/OverlayForm.cs`
- Test: `overlay/tests/MahjongSoulOverlay.Windows.Tests/OverlayRendererTests.cs`

- [ ] **Step 1: Write renderer tests against an off-screen bitmap**

Use a known 200×200 bitmap and one axis-aligned quad. Assert:

- Tsumogiri changes the center pixel toward RGB `(38, 43, 47)` with alpha `143`.
- Tedashi leaves the center transparent and draws a gold border near RGB `(255, 213, 102)`.
- Unknown produces no changed pixels.
- A normalized quad is scaled by client width and height.
- `Clear` removes every layer.

- [ ] **Step 2: Implement scheme A**

`OverlayRenderer.Render(Graphics graphics, Size clientSize, IReadOnlyList<OverlayLayer> layers)`:

- Uses `CompositingMode.SourceOver` and anti-aliasing.
- Fills tsumogiri polygons with `Color.FromArgb(143, 38, 43, 47)`.
- Draws tedashi polygons with a 3-pixel `Color.FromArgb(255, 255, 213, 102)` pen.
- Draws one wider, low-alpha gold pen first to create the light glow.
- Draws nothing for unknown.

- [ ] **Step 3: Implement the transparent form**

The form:

- Is borderless, non-activating, topmost, and transparent.
- Adds `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`.
- Returns `HTTRANSPARENT` for `WM_NCHITTEST`.
- Tracks the target client rectangle using `ClientToScreen`.
- Hides when the target is minimized, lost, ineligible, or lifecycle output requests hiding.
- Invalidates only when layers or target geometry change.

- [ ] **Step 4: Run and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/tests/MahjongSoulOverlay.Windows.Tests --filter OverlayRendererTests
git add overlay/src/MahjongSoulOverlay.Windows/Overlay overlay/tests/MahjongSoulOverlay.Windows.Tests
git commit -m "feat: render click-through discard overlays"
```

### Task 13: Add tray controls and the live pipeline

**Files:**
- Modify: `overlay/src/MahjongSoulOverlay.Windows/Program.cs`
- Create: `overlay/src/MahjongSoulOverlay.Windows/Shell/TrayApplicationContext.cs`
- Modify: `overlay/src/MahjongSoulOverlay.Windows/MahjongSoulOverlay.Windows.csproj`
- Test: `overlay/tests/MahjongSoulOverlay.Windows.Tests/TrayApplicationContextTests.cs`

- [ ] **Step 1: Add a composition smoke test**

Instantiate the application context with fake `IFrameSource`, fake window locator, in-memory detector, and off-screen overlay. Assert:

- Pause stops frames from reaching the detector and hides the overlay.
- Resume resets detector baseline and lifecycle before accepting frames.
- Clear Hand calls `ManualReset` and clears layers.
- Diagnostic toggle starts and stops local recording.
- Exit awaits capture shutdown and disposes the tray icon.

- [ ] **Step 2: Implement tray commands**

Create menu items with these exact labels:

- `状态: 等待雀魂窗口` (disabled status row)
- `暂停识别`
- `恢复识别`
- `清除本局并重新同步`
- `显示诊断区域`
- `保存诊断关键帧`
- `退出`

Only Pause or Resume is enabled at a time. The status row reports unsupported size/DPI, waiting, synchronizing, active hand, paused, or lost window.

- [ ] **Step 3: Compose the live pipeline**

On each accepted frame:

1. Wrap BGRA data as `PixelFrame`.
2. Run `OpenCvSeatDetector.Detect`.
3. Push the result into `OverlayEngine`.
4. Marshal immutable layers to the UI thread.
5. Render or hide based on `EngineOutput`.
6. Send the same frame and complete `EngineOutput`—including formal events and
   candidate-resolution diagnostics—to `DiagnosticRecorder` only when explicitly
   enabled. Preserve candidate IDs, source tile IDs, resolution timestamps,
   outcome kinds, statuses, and reason strings verbatim in JSONL.

Use a single-capacity channel between capture and detection. `TryWrite` replaces a stale frame rather than growing memory.

- [ ] **Step 4: Publish a local smoke build**

```powershell
.\.tools\dotnet\dotnet.exe publish overlay/src/MahjongSoulOverlay.Windows `
  -c Release -r win-x64 --self-contained false `
  -p:PublishSingleFile=true `
  -o overlay/artifacts/win-x64
```

Expected: `MahjongSoulOverlay.Windows.exe` launches, shows a tray icon, waits without error when Mahjong Soul is closed, and exits cleanly.

- [ ] **Step 5: Commit**

```powershell
git add overlay/src/MahjongSoulOverlay.Windows
git commit -m "feat: run overlay from Windows tray"
```

### Task 14: Build deterministic replay and audit output

**Files:**
- Create: `overlay/src/MahjongSoulOverlay.Replay/ReplayRunner.cs`
- Modify: `overlay/src/MahjongSoulOverlay.Replay/Program.cs`
- Create: `overlay/fixtures/recordings/README.md`
- Test: `overlay/tests/MahjongSoulOverlay.Vision.Tests/OpenCvSeatDetectorTests.cs`

- [ ] **Step 1: Define the replay command**

Support:

```powershell
MahjongSoulOverlay.Replay.exe `
  --input overlay/fixtures/recordings/normal-discard.mp4 `
  --profile overlay/src/MahjongSoulOverlay.Vision/Profiles/yonma-1920x1080.standard.json `
  --events overlay/artifacts/replay/normal-discard.events.jsonl `
  --annotated overlay/artifacts/replay/normal-discard.annotated.mp4
```

Reject non-1920×1080 input and missing profiles with exit code 2. Return exit code 1 for decode errors and 0 for successful replay.

- [ ] **Step 2: Implement replay**

Use OpenCvSharp `VideoCapture` and the source frame rate. For every frame:

- Detect observations.
- Push the engine.
- Write one JSONL record with frame number, timestamp, observations, lifecycle,
  formal events, candidate-resolution diagnostics, and layers. Resolution
  records preserve candidate/source IDs, actor, candidate and outcome kinds,
  status, resolved timestamp, reason, and optional source seat/tile.
- Optionally draw seat regions, tile quads, confidence, and scheme-A layers into an annotated video.

Never skip event processing when annotated output is disabled.

- [ ] **Step 3: Document the recording matrix**

`README.md` requires three private, uncommitted recordings:

1. `normal-discard.mp4`: at least two turns for every seat, including both discard types where observable.
2. `calls-and-kans.mp4`: chi or pon, a called river tile, and each available kan type.
3. `hand-boundaries.mp4`: one hand end, next-hand setup, and full match result.

Record at 1920×1080 with 100% display scale and no post-capture resizing. Keep recordings ignored by Git.

- [ ] **Step 4: Add JSONL assertions**

For a checked-in synthetic frame sequence, assert the replay JSONL:

- Has monotonically increasing frame numbers and timestamps.
- Contains exactly four observations per frame.
- Contains no layer before `HandActive`.
- Contains no unknown layer.
- Produces stable candidate IDs across two identical replay runs.
- Confirms candidate-before-removal and removal-before-candidate traces,
  including equality at the inclusive association-window boundary.
- Emits `Expired` with `OutcomeKind.Unknown` just outside the window.
- Emits `Ambiguous` with `OutcomeKind.Unknown` for multiple eligible removals
  or candidates, with no corresponding formal event or overlay.
- Never repeats a non-null source tile ID across confirmed resolutions.
- Emits exactly one terminal resolution per candidate ID and never emits a
  formal call/daiminkan before its `Confirmed` resolution.
- Clears layers at the hand boundary.

- [ ] **Step 5: Run and commit**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/MahjongSoulOverlay.sln
git add overlay/src/MahjongSoulOverlay.Replay overlay/fixtures/recordings/README.md overlay/tests
git commit -m "feat: replay and audit recognition sessions"
```

### Task 15: Calibrate with real recordings and complete acceptance

**Files:**
- Modify: `overlay/src/MahjongSoulOverlay.Vision/Profiles/yonma-1920x1080.standard.json`
- Create: `overlay/ACCEPTANCE.md`
- Create: `overlay/README.md`

- [ ] **Step 1: Collect the real fixture matrix**

Use the explicit diagnostic recorder or an external lossless recorder while the user plays or spectates. This is the second live-game checkpoint: the user supplies only the qualifying visible table activity; the engineering worker operates diagnostics and extracts frames.

- [ ] **Step 2: Tune each seat independently**

For Bottom, Right, Top, and Left:

1. Run annotated replay.
2. Inspect main-hand slot, drawn-slot, river, and meld detections.
3. Adjust only that seat's polygons, aspect/angle limits, and thresholds.
4. Re-run all three recordings.
5. Accept the seat when no other seat's profile regresses.

Keep every numeric calibration value in the JSON profile, not in detector code.

- [ ] **Step 3: Measure event precision**

Create a hand-labeled JSON file beside each ignored recording with frame ranges and expected events. Add a replay comparison command that reports:

```text
formal confirmed correct
formal confirmed incorrect
expected but expired
ambiguous resolutions
rejected resolutions
unexpected formal events
source evidence reuse
river tracking mismatches
lifecycle mismatches
```

Release acceptance requires zero `formal confirmed incorrect`, zero unexpected
formal events, zero source-evidence reuse, exactly one terminal resolution per
candidate ID, zero retained overlays after hand end, and zero shifted IDs after
a called discard. Expired, ambiguous, and rejected `Unknown` outcomes are
reported but do not fail the safety-first acceptance rule.

- [ ] **Step 4: Verify runtime behavior**

Record results in `overlay/ACCEPTANCE.md` for:

- Client absent at launch.
- Eligible window found.
- Unsupported dimensions or DPI.
- Window moved.
- Window minimized and restored.
- Pause and resume.
- Manual clear and resync.
- Result screen and next hand.
- Client exit.
- Diagnostic recording opt-in.
- Overlay click-through.
- No network use, process injection, memory reading, packet capture, or input simulation.

- [ ] **Step 5: Write operator documentation**

`overlay/README.md` must include:

- Supported display conditions.
- Build and run commands.
- Meaning of gray, gold, and unmarked tiles.
- Tray commands.
- How unknown classifications behave.
- Diagnostic file location and deletion.
- Explicit technical boundaries.
- A warning that the project is unofficial and users must check current Mahjong Soul rules.

- [ ] **Step 6: Run final verification**

```powershell
.\.tools\dotnet\dotnet.exe test overlay/MahjongSoulOverlay.sln -c Release
.\.tools\dotnet\dotnet.exe publish overlay/src/MahjongSoulOverlay.Windows `
  -c Release -r win-x64 --self-contained false `
  -p:PublishSingleFile=true `
  -o overlay/artifacts/win-x64
git diff --check
git status --short
```

Expected:

- All tests PASS.
- Publish succeeds.
- `git diff --check` prints nothing.
- Only intentional source, tests, profile, and documentation changes remain.
- `RESOURCES.md` remains outside every overlay commit unless the user separately requests it.

- [ ] **Step 7: Commit the accepted MVP**

```powershell
git add overlay/src/MahjongSoulOverlay.Vision/Profiles overlay/ACCEPTANCE.md overlay/README.md
git commit -m "docs: record overlay MVP acceptance"
```

## Final implementation review

Before calling the MVP complete:

- Compare every section of `docs/superpowers/specs/2026-07-30-mahjong-soul-discard-overlay-design.md` to Tasks 1–15.
- Run the full Release test command and the three real replays.
- Inspect the annotated videos for all four seat orientations.
- Confirm an unknown event never produces a layer.
- Confirm result screens, minimize, target loss, and manual reset clear or hide layers.
- Confirm the application has no code path that opens Mahjong Soul for memory access or sends input.
- Perform a focused code review of capture lifetime, unmanaged resource disposal, overlay click-through, event association, and profile independence.
