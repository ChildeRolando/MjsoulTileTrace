using System.Text.Json;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Replay;

namespace MahjongSoulOverlay.Vision.Tests;

public sealed class AcceptanceComparerTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(),
        "MahjongSoulOverlay.Acceptance.Tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public void Exact_formal_event_match_passes_safety_gate()
    {
        Directory.CreateDirectory(_root);
        var audit = Path.Combine(_root, "audit.jsonl");
        var labels = Path.Combine(_root, "labels.json");
        var report = Path.Combine(_root, "report.json");
        File.WriteAllText(audit, ReplayAuditJson.Serialize(Record(
            events: [new TableEvent(
                TableEventKind.Tsumogiri,
                Seat.Bottom,
                null,
                DateTimeOffset.UnixEpoch,
                1d)])) + Environment.NewLine);
        WriteLabels(
            labels,
            [new
            {
                startFrame = 0,
                endFrame = 2,
                kind = "Tsumogiri",
                actor = "Bottom",
                sourceSeat = (string?)null
            }],
            []);

        var exitCode = new AcceptanceComparer().Run(
            new AcceptanceComparisonOptions(audit, labels, report));

        Assert.Equal(0, exitCode);
        using var document = JsonDocument.Parse(File.ReadAllText(report));
        Assert.Equal(1, document.RootElement.GetProperty("formalConfirmedCorrect").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("formalConfirmedIncorrect").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("unexpectedFormalEvents").GetInt32());
    }

    [Fact]
    public void Incorrect_events_and_reused_or_duplicate_evidence_fail_safety_gate()
    {
        Directory.CreateDirectory(_root);
        var audit = Path.Combine(_root, "audit.jsonl");
        var labels = Path.Combine(_root, "labels.json");
        var report = Path.Combine(_root, "report.json");
        var candidate = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var source = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var ambiguousId = Guid.NewGuid();
        var rejectedId = Guid.NewGuid();
        var expiredId = Guid.NewGuid();
        var resolutions = new[]
        {
            Resolution(candidate, source, CandidateResolutionStatus.Confirmed),
            Resolution(candidate, source, CandidateResolutionStatus.Confirmed),
            Resolution(ambiguousId, null, CandidateResolutionStatus.Ambiguous),
            Resolution(rejectedId, null, CandidateResolutionStatus.Rejected),
            Resolution(expiredId, null, CandidateResolutionStatus.Expired),
        };
        File.WriteAllText(audit, ReplayAuditJson.Serialize(Record(
            events:
            [
                new TableEvent(
                    TableEventKind.Tedashi, Seat.Bottom, null,
                    DateTimeOffset.UnixEpoch, 1d),
                new TableEvent(
                    TableEventKind.Draw, Seat.Right, null,
                    DateTimeOffset.UnixEpoch, 1d)
            ],
            resolutions: resolutions)) + Environment.NewLine);
        WriteLabels(
            labels,
            [
                new
                {
                    startFrame = 0,
                    endFrame = 0,
                    kind = "Tsumogiri",
                    actor = "Bottom",
                    sourceSeat = (string?)null
                },
                new
                {
                    startFrame = 3,
                    endFrame = 4,
                    kind = "Tedashi",
                    actor = "Left",
                    sourceSeat = (string?)null
                }
            ],
            [candidate, ambiguousId, rejectedId, expiredId]);

        var exitCode = new AcceptanceComparer().Run(
            new AcceptanceComparisonOptions(audit, labels, report));

        Assert.Equal(1, exitCode);
        var result = JsonSerializer.Deserialize<AcceptanceReport>(
            File.ReadAllText(report),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.Equal(1, result.FormalConfirmedIncorrect);
        Assert.Equal(1, result.ExpectedButExpired);
        Assert.Equal(1, result.UnexpectedFormalEvents);
        Assert.Equal(1, result.AmbiguousResolutions);
        Assert.Equal(1, result.RejectedResolutions);
        Assert.Equal(1, result.SourceEvidenceReuse);
        Assert.Equal(1, result.DuplicateTerminalResolutions);
    }

    [Fact]
    public void Cli_compare_mode_writes_report()
    {
        Directory.CreateDirectory(_root);
        var audit = Path.Combine(_root, "cli-audit.jsonl");
        var labels = Path.Combine(_root, "cli-labels.json");
        var report = Path.Combine(_root, "cli-report.json");
        File.WriteAllText(
            audit,
            ReplayAuditJson.Serialize(Record()) + Environment.NewLine);
        WriteLabels(labels, [], []);

        var exitCode = global::ReplayCli.Run(
        [
            "--compare-events", audit,
            "--labels", labels,
            "--report", report
        ]);

        Assert.Equal(0, exitCode);
        Assert.True(File.Exists(report));
    }

    [Fact]
    public void Missing_events_array_is_a_usage_error()
    {
        Directory.CreateDirectory(_root);
        var audit = Path.Combine(_root, "invalid-audit.jsonl");
        var labels = Path.Combine(_root, "invalid-labels.json");
        var report = Path.Combine(_root, "invalid-report.json");
        File.WriteAllText(
            audit,
            ReplayAuditJson.Serialize(Record()) + Environment.NewLine);
        File.WriteAllText(labels, "{}");

        Assert.Equal(
            2,
            new AcceptanceComparer().Run(
                new AcceptanceComparisonOptions(audit, labels, report)));
        Assert.False(File.Exists(report));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    private static ReplayAuditRecord Record(
        IReadOnlyList<TableEvent>? events = null,
        IReadOnlyList<CandidateResolution>? resolutions = null) =>
        new(
            0,
            DateTimeOffset.UnixEpoch,
            Enum.GetValues<Seat>()
                .Select(seat => SeatObservation.Stable(seat, 13, false, 0, 0, []))
                .ToArray(),
            LifecycleState.HandActive,
            events ?? [],
            resolutions ?? [],
            []);

    private static CandidateResolution Resolution(
        Guid candidate,
        Guid? source,
        CandidateResolutionStatus status) =>
        new(
            candidate,
            Seat.Bottom,
            TableEventKind.ChiOrPon,
            status == CandidateResolutionStatus.Confirmed
                ? TableEventKind.ChiOrPon
                : TableEventKind.Unknown,
            status,
            DateTimeOffset.UnixEpoch,
            status.ToString(),
            source is null ? null : Seat.Top,
            source);

    private static void WriteLabels(
        string path,
        IReadOnlyList<object> events,
        IReadOnlyList<Guid> candidateIds)
    {
        var riverCounts = Enum.GetValues<Seat>()
            .Select(seat => new
            {
                startFrame = 0,
                endFrame = 0,
                seat = seat.ToString(),
                count = 0
            })
            .ToArray();
        File.WriteAllText(
            path,
            JsonSerializer.Serialize(new
            {
                events,
                candidateIds,
                lifecycle = new[]
                {
                    new { startFrame = 0, endFrame = 0, state = "HandActive" }
                },
                riverCounts
            }));
    }
}
