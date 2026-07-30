using System.Diagnostics;
using System.Text.Json;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Core.River;
using MahjongSoulOverlay.Replay;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Tests;

public sealed class ReplayRunnerTests : IDisposable
{
    private readonly List<string> _junctions = [];
    private readonly string _root = Path.Combine(
        Path.GetTempPath(),
        "MahjongSoulOverlay.Replay.Tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public void Missing_input_or_profile_returns_usage_error()
    {
        Directory.CreateDirectory(_root);
        var runner = new ReplayRunner();

        var missingInput = runner.Run(new ReplayOptions(
            Path.Combine(_root, "missing.mp4"),
            StandardProfilePath(),
            Path.Combine(_root, "events.jsonl"),
            null));
        var missingProfile = runner.Run(new ReplayOptions(
            CreateVideo("valid.avi", 1920, 1080, 1),
            Path.Combine(_root, "missing.json"),
            Path.Combine(_root, "other.jsonl"),
            null));

        Assert.Equal(2, missingInput);
        Assert.Equal(2, missingProfile);
        Assert.Empty(Directory.GetFiles(_root, "*.jsonl"));
    }

    [Fact]
    public void Unsupported_dimensions_return_usage_error()
    {
        var runner = new ReplayRunner();
        var input = CreateVideo("small.avi", 320, 180, 1);

        var exitCode = runner.Run(new ReplayOptions(
            input,
            StandardProfilePath(),
            Path.Combine(_root, "events.jsonl"),
            null));

        Assert.Equal(2, exitCode);
        Assert.False(File.Exists(Path.Combine(_root, "events.jsonl")));
    }

    [Fact]
    public void Decode_failure_returns_decode_error()
    {
        Directory.CreateDirectory(_root);
        var input = Path.Combine(_root, "broken.mp4");
        File.WriteAllText(input, "not a video");
        var runner = new ReplayRunner();

        var exitCode = runner.Run(new ReplayOptions(
            input,
            StandardProfilePath(),
            Path.Combine(_root, "events.jsonl"),
            null));

        Assert.Equal(1, exitCode);
    }

    [Fact]
    public void Output_paths_cannot_alias_inputs_or_each_other()
    {
        var input = CreateVideo("input.avi", 1920, 1080, 1);
        var profile = Path.Combine(_root, "profile.json");
        File.Copy(StandardProfilePath(), profile);
        var originalProfile = File.ReadAllBytes(profile);
        var runner = new ReplayRunner();

        var profileAlias = runner.Run(new ReplayOptions(
            input, profile, profile, null));
        var outputAlias = runner.Run(new ReplayOptions(
            input,
            profile,
            Path.Combine(_root, "same-output.avi"),
            Path.Combine(_root, "same-output.avi")));

        Assert.Equal(2, profileAlias);
        Assert.Equal(2, outputAlias);
        Assert.Equal(originalProfile, File.ReadAllBytes(profile));
    }

    [Fact]
    public void Existing_output_is_never_overwritten_implicitly()
    {
        var input = CreateVideo("existing-output.avi", 1920, 1080, 1);
        var events = Path.Combine(_root, "existing.events.jsonl");
        File.WriteAllText(events, "keep");

        var exitCode = new ReplayRunner().Run(new ReplayOptions(
            input, StandardProfilePath(), events, null));

        Assert.Equal(2, exitCode);
        Assert.Equal("keep", File.ReadAllText(events));
    }

    [Fact]
    public void Output_paths_cannot_alias_inputs_through_parent_directory_links()
    {
        Directory.CreateDirectory(_root);
        var real = Path.Combine(_root, "real");
        var alias = Path.Combine(_root, "alias");
        Directory.CreateDirectory(real);
        var junctionStart = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
        };
        junctionStart.ArgumentList.Add("/c");
        junctionStart.ArgumentList.Add("mklink");
        junctionStart.ArgumentList.Add("/J");
        junctionStart.ArgumentList.Add(alias);
        junctionStart.ArgumentList.Add(real);
        using (var junction = Process.Start(junctionStart))
        {
            Assert.NotNull(junction);
            junction.WaitForExit();
            Assert.True(junction.ExitCode == 0, junction.StandardError.ReadToEnd());
        }
        _junctions.Add(alias);
        var input = CreateVideo(Path.Combine("real", "input.avi"), 1920, 1080, 1);
        var profile = Path.Combine(real, "profile.json");
        File.Copy(StandardProfilePath(), profile);
        var original = File.ReadAllBytes(profile);

        var exitCode = new ReplayRunner().Run(new ReplayOptions(
            input,
            profile,
            Path.Combine(alias, "profile.json"),
            null));

        Assert.Equal(2, exitCode);
        Assert.Equal(original, File.ReadAllBytes(profile));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Untrustworthy_frame_counts_are_rejected(double frameCount)
    {
        Assert.False(ReplayFrameCount.IsTrustworthy(frameCount));
    }

    [Fact]
    public void Positive_integral_frame_count_is_trustworthy()
    {
        Assert.True(ReplayFrameCount.IsTrustworthy(12));
    }

    [Fact]
    public void Invalid_profile_and_malformed_paths_return_usage_error()
    {
        var input = CreateVideo("valid.avi", 1920, 1080, 1);
        var invalidProfile = Path.Combine(_root, "invalid.json");
        File.WriteAllText(invalidProfile, "{}");
        var runner = new ReplayRunner();

        Assert.Equal(2, runner.Run(new ReplayOptions(
            input,
            invalidProfile,
            Path.Combine(_root, "invalid-profile.jsonl"),
            null)));
        Assert.Equal(2, runner.Run(new ReplayOptions(
            "bad\0input",
            StandardProfilePath(),
            Path.Combine(_root, "malformed.jsonl"),
            null)));
    }

    [Fact]
    public void Truncated_video_is_not_reported_as_complete()
    {
        var input = CreateVideo("truncated.avi", 1920, 1080, 12);
        using (var stream = new FileStream(input, FileMode.Open, FileAccess.Write))
            stream.SetLength(stream.Length * 3 / 4);
        var events = Path.Combine(_root, "truncated.jsonl");
        var runner = new ReplayRunner();

        var exitCode = runner.Run(new ReplayOptions(
            input, StandardProfilePath(), events, null));

        Assert.Equal(1, exitCode);
    }

    [Fact]
    public void Successful_replay_is_deterministic_and_writes_complete_records()
    {
        var input = CreateVideo("sequence.avi", 1920, 1080, 4);
        var first = Path.Combine(_root, "first.jsonl");
        var second = Path.Combine(_root, "second.jsonl");
        var annotated = Path.Combine(_root, "annotated.avi");
        var runner = new ReplayRunner();

        Assert.Equal(0, runner.Run(new ReplayOptions(
            input, StandardProfilePath(), first, annotated)));
        Assert.Equal(0, runner.Run(new ReplayOptions(
            input, StandardProfilePath(), second, null)));

        Assert.Equal(File.ReadAllText(first), File.ReadAllText(second));
        Assert.True(new FileInfo(annotated).Length > 0);

        var lines = File.ReadLines(first).ToArray();
        Assert.Equal(4, lines.Length);
        var previousFrame = -1;
        DateTimeOffset? previousTimestamp = null;
        foreach (var line in lines)
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            var frame = root.GetProperty("frameNumber").GetInt32();
            var timestamp = root.GetProperty("timestamp").GetDateTimeOffset();

            Assert.True(frame > previousFrame);
            Assert.True(previousTimestamp is null || timestamp > previousTimestamp);
            Assert.Equal(4, root.GetProperty("observations").GetArrayLength());
            Assert.True(root.TryGetProperty("lifecycle", out _));
            Assert.True(root.TryGetProperty("events", out _));
            Assert.True(root.TryGetProperty("candidateResolutions", out _));
            Assert.True(root.TryGetProperty("layers", out var layers));
            Assert.Equal(0, layers.GetArrayLength());

            previousFrame = frame;
            previousTimestamp = timestamp;
        }
    }

    [Fact]
    public void Audit_json_preserves_candidate_source_and_layer_identity()
    {
        var candidateId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var sourceTileId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var timestamp = DateTimeOffset.UnixEpoch.AddSeconds(3);
        var record = new ReplayAuditRecord(
            30,
            timestamp,
            Enum.GetValues<Seat>()
                .Select(seat => SeatObservation.Stable(seat, 13, false, 0, 0, []))
                .ToArray(),
            LifecycleState.HandActive,
            [new TableEvent(TableEventKind.CalledDiscard, Seat.Left, Seat.Top, timestamp, 0.91)],
            [new CandidateResolution(
                candidateId,
                Seat.Left,
                TableEventKind.ChiOrPon,
                TableEventKind.CalledDiscard,
                CandidateResolutionStatus.Confirmed,
                timestamp,
                "confirmed-with-source",
                Seat.Top,
                sourceTileId)],
            [new OverlayLayer(sourceTileId, Seat.Top, Quad(), DiscardKind.Tsumogiri)]);

        var first = ReplayAuditJson.Serialize(record);
        var second = ReplayAuditJson.Serialize(record);

        Assert.Equal(first, second);
        using var document = JsonDocument.Parse(first);
        var root = document.RootElement;
        var resolution = root.GetProperty("candidateResolutions")[0];
        Assert.Equal(candidateId, resolution.GetProperty("candidateId").GetGuid());
        Assert.Equal(sourceTileId, resolution.GetProperty("sourceTileId").GetGuid());
        Assert.Equal("Confirmed", resolution.GetProperty("status").GetString());
        Assert.Equal("CalledDiscard", resolution.GetProperty("outcomeKind").GetString());
        Assert.Equal(
            sourceTileId,
            root.GetProperty("layers")[0].GetProperty("tileId").GetGuid());
    }

    [Fact]
    public void Audit_trace_preserves_resolution_safety_contracts()
    {
        static ReplayAuditRecord ConfirmedTrace()
        {
            var trace = AuditTrace.WithDiscards(Seat.Bottom);
            var candidate = trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
            var removal = trace.Remove(Seat.Bottom, "bottom-1", 150);
            var quiet = trace.Push(250);
            Assert.Empty(candidate.Events);
            Assert.Empty(candidate.CandidateResolutions);
            Assert.Empty(removal.Events);
            Assert.Empty(quiet.CandidateResolutions);
            return trace.Push(251);
        }

        var confirmed = ConfirmedTrace();
        var repeated = ConfirmedTrace();
        Assert.Equal(
            ReplayAuditJson.Serialize(confirmed),
            ReplayAuditJson.Serialize(repeated));
        var resolution = Assert.Single(confirmed.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Confirmed, resolution.Status);
        Assert.NotNull(resolution.SourceTileId);
        Assert.Single(confirmed.Events, item => item.Kind == TableEventKind.ChiOrPon);

        var reuse = AuditTrace.WithDiscards(Seat.Bottom);
        reuse.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        reuse.Remove(Seat.Bottom, "bottom-1", 60);
        var firstConfirmed = reuse.Push(161);
        reuse.DrawAndDiscard(Seat.Bottom, "bottom-2", 170, 180);
        reuse.Call(Seat.Right, TableEventKind.ChiOrPon, 190);
        reuse.Remove(Seat.Bottom, "bottom-2", 200);
        var secondConfirmed = reuse.Push(301);
        var sourceIds = firstConfirmed.CandidateResolutions
            .Concat(secondConfirmed.CandidateResolutions)
            .Select(item => item.SourceTileId)
            .Where(id => id is not null)
            .ToArray();
        Assert.Equal(2, sourceIds.Length);
        Assert.Equal(2, sourceIds.Distinct().Count());
        Assert.Empty(reuse.Push(400).CandidateResolutions);

        var reverse = AuditTrace.WithDiscards(Seat.Bottom);
        reverse.Remove(Seat.Bottom, "bottom-1", 50);
        reverse.Call(Seat.Right, TableEventKind.ChiOrPon, 150);
        reverse.Push(250);
        Assert.Equal(
            CandidateResolutionStatus.Confirmed,
            Assert.Single(reverse.Push(251).CandidateResolutions).Status);

        var expired = AuditTrace.WithDiscards(Seat.Bottom);
        expired.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        var expiredRecord = expired.Remove(Seat.Bottom, "bottom-1", 151);
        var expiredResolution = Assert.Single(expiredRecord.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Expired, expiredResolution.Status);
        Assert.Equal(TableEventKind.Unknown, expiredResolution.OutcomeKind);
        Assert.DoesNotContain(
            expiredRecord.Events, item => item.Kind == TableEventKind.ChiOrPon);

        var ambiguous = AuditTrace.WithDiscards(Seat.Bottom, Seat.Top);
        ambiguous.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        ambiguous.RemoveMany(
            [(Seat.Bottom, "bottom-1"), (Seat.Top, "top-1")], 60);
        var ambiguousRecord = ambiguous.Push(161);
        var ambiguousResolution = Assert.Single(ambiguousRecord.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Ambiguous, ambiguousResolution.Status);
        Assert.Equal(TableEventKind.Unknown, ambiguousResolution.OutcomeKind);
        Assert.Null(ambiguousResolution.SourceTileId);
        Assert.Empty(ambiguousRecord.Events);

        var multipleCandidates = AuditTrace.WithDiscards(Seat.Bottom);
        multipleCandidates.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        multipleCandidates.Call(Seat.Top, TableEventKind.ChiOrPon, 55);
        multipleCandidates.Remove(Seat.Bottom, "bottom-1", 60);
        var candidateAmbiguity = multipleCandidates.Push(161);
        Assert.Equal(2, candidateAmbiguity.CandidateResolutions.Count);
        Assert.All(candidateAmbiguity.CandidateResolutions, item =>
            Assert.Equal(CandidateResolutionStatus.Ambiguous, item.Status));
        Assert.Equal(
            candidateAmbiguity.CandidateResolutions.Count,
            candidateAmbiguity.CandidateResolutions
                .Select(item => item.CandidateId).Distinct().Count());
        Assert.Empty(candidateAmbiguity.Events);

        var boundary = AuditTrace.WithDiscards(Seat.Bottom);
        Assert.NotEmpty(boundary.LastRecord.Layers);
        Assert.All(boundary.LastRecord.Layers, layer =>
            Assert.NotEqual(DiscardKind.Unknown, layer.Kind));
        Assert.Empty(boundary.Push(170, result: true).Layers);
    }

    public void Dispose()
    {
        foreach (var junction in _junctions)
        {
            if (Directory.Exists(junction))
                Directory.Delete(junction);
        }
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    private string CreateVideo(string name, int width, int height, int frames)
    {
        Directory.CreateDirectory(_root);
        var path = Path.Combine(_root, name);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var writer = new VideoWriter(
            path,
            VideoWriter.FourCC('M', 'J', 'P', 'G'),
            10d,
            new Size(width, height));
        Assert.True(writer.IsOpened());
        using var image = new Mat(height, width, MatType.CV_8UC3, new Scalar(140, 90, 40));
        for (var frame = 0; frame < frames; frame++)
        {
            Cv2.Circle(image, new Point(40 + frame, 40), 5, Scalar.White, -1);
            writer.Write(image);
        }
        return path;
    }

    private static string StandardProfilePath()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(
                directory.FullName,
                "overlay",
                "src",
                "MahjongSoulOverlay.Vision",
                "Profiles",
                "yonma-1920x1080.standard.json");
            if (File.Exists(candidate))
                return candidate;
            directory = directory.Parent;
        }

        throw new FileNotFoundException("Could not locate the standard profile.");
    }

    private static NormalizedQuad Quad() =>
        new(
            new(0.1, 0.1),
            new(0.2, 0.1),
            new(0.2, 0.2),
            new(0.1, 0.2));

    private sealed class AuditTrace
    {
        private static readonly TimeSpan Window = TimeSpan.FromMilliseconds(100);
        private readonly Dictionary<Seat, AuditState> _states =
            Enum.GetValues<Seat>().ToDictionary(seat => seat, _ => new AuditState());
        private readonly OverlayEngine _engine;
        private int _frame;

        private AuditTrace()
        {
            _engine = new OverlayEngine(
                new TableLifecycle(1, 1, 2),
                new EventClassifier(),
                Window,
                Enum.GetValues<Seat>().ToDictionary(
                    seat => seat,
                    _ => new TransactionAggregator(TimeSpan.FromSeconds(5), 1)),
                Enum.GetValues<Seat>().ToDictionary(
                    seat => seat,
                    _ => new RiverTracker(0.3)));
        }

        public static AuditTrace WithDiscards(params Seat[] seats)
        {
            var trace = new AuditTrace();
            trace.Push(0, baseline: true);
            trace.Push(1, baseline: true);
            var time = 10;
            foreach (var seat in seats)
            {
                trace._states[seat].Drawn = true;
                trace.Push(time++);
                trace._states[seat].Drawn = false;
                trace._states[seat].River.Add(Tile(
                    $"{seat.ToString().ToLowerInvariant()}-1",
                    0.1));
                trace.Push(time++);
            }
            return trace;
        }

        public ReplayAuditRecord LastRecord { get; private set; } = null!;

        public void DrawAndDiscard(
            Seat seat,
            string id,
            int drawMilliseconds,
            int discardMilliseconds)
        {
            _states[seat].Drawn = true;
            Push(drawMilliseconds);
            _states[seat].Drawn = false;
            _states[seat].River.Add(Tile(id, 0.1 + _states[seat].River.Count * 0.1));
            Push(discardMilliseconds);
        }

        public ReplayAuditRecord Call(Seat actor, TableEventKind kind, int milliseconds)
        {
            var state = _states[actor];
            state.Slots = Enumerable.Repeat(true, state.Slots.Length - 2).ToArray();
            state.MeldGroups++;
            state.MeldTiles += 3;
            return Push(milliseconds);
        }

        public ReplayAuditRecord Remove(Seat seat, string id, int milliseconds)
        {
            _states[seat].River.RemoveAll(tile => tile.DetectionId == id);
            return Push(milliseconds);
        }

        public ReplayAuditRecord RemoveMany(
            IReadOnlyList<(Seat Seat, string Id)> removals,
            int milliseconds)
        {
            foreach (var removal in removals)
                _states[removal.Seat].River.RemoveAll(
                    tile => tile.DetectionId == removal.Id);
            return Push(milliseconds);
        }

        public ReplayAuditRecord Push(
            int milliseconds,
            bool baseline = false,
            bool result = false)
        {
            var timestamp = DateTimeOffset.UnixEpoch.AddMilliseconds(milliseconds);
            var observation = new TableObservation(
                _states.ToDictionary(
                    pair => pair.Key,
                    pair => pair.Value.Observe(pair.Key, timestamp)),
                tableStructureVisible: true,
                handBaselineVisible: baseline,
                resultScreenVisible: result,
                timestamp);
            var output = _engine.Push(observation);
            LastRecord = new ReplayAuditRecord(
                _frame++,
                timestamp,
                observation.Seats.Values.OrderBy(item => item.Seat).ToArray(),
                output.Lifecycle,
                output.Events,
                output.CandidateResolutions,
                output.Layers);
            return LastRecord;
        }

        private static DetectedTile Tile(string id, double x) =>
            new(id, new NormalizedQuad(
                new(x, 0.1),
                new(x + 0.04, 0.1),
                new(x + 0.04, 0.16),
                new(x, 0.16)), 1d);
    }

    private sealed class AuditState
    {
        public bool[] Slots { get; set; } = Enumerable.Repeat(true, 13).ToArray();
        public bool Drawn { get; set; }
        public int MeldGroups { get; set; }
        public int MeldTiles { get; set; }
        public List<DetectedTile> River { get; } = [];

        public SeatObservation Observe(Seat seat, DateTimeOffset timestamp) =>
            new(
                seat,
                Slots.Count(value => value),
                Slots,
                Drawn,
                MeldGroups,
                MeldTiles,
                River,
                isStable: true,
                confidence: 1d,
                timestamp);
    }
}
