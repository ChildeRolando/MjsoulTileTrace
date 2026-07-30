using System.Text.Json;
using System.Text.Json.Serialization;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;

namespace MahjongSoulOverlay.Replay;

public sealed record AcceptanceComparisonOptions(
    string AuditPath,
    string LabelsPath,
    string ReportPath);

public sealed record AcceptanceReport(
    int FormalConfirmedCorrect,
    int FormalConfirmedIncorrect,
    int ExpectedButExpired,
    int AmbiguousResolutions,
    int RejectedResolutions,
    int UnexpectedFormalEvents,
    int SourceEvidenceReuse,
    int DuplicateTerminalResolutions,
    int CandidateTerminalCoverageMismatches,
    int RiverTrackingMismatches,
    int LifecycleMismatches)
{
    public bool Passed =>
        FormalConfirmedIncorrect == 0 &&
        UnexpectedFormalEvents == 0 &&
        SourceEvidenceReuse == 0 &&
        DuplicateTerminalResolutions == 0 &&
        CandidateTerminalCoverageMismatches == 0 &&
        RiverTrackingMismatches == 0 &&
        LifecycleMismatches == 0;
}

public sealed class AcceptanceComparer
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    public int Run(AcceptanceComparisonOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        string? temporaryReport = null;
        try
        {
            var auditPath = Path.GetFullPath(options.AuditPath);
            var labelsPath = Path.GetFullPath(options.LabelsPath);
            var reportPath = Path.GetFullPath(options.ReportPath);
            if (!File.Exists(auditPath) ||
                !File.Exists(labelsPath) ||
                File.Exists(reportPath) ||
                new[] { auditPath, labelsPath, reportPath }
                    .Distinct(StringComparer.OrdinalIgnoreCase).Count() != 3)
            {
                return 2;
            }

            var records = ReadAudit(auditPath);
            var labels = JsonSerializer.Deserialize<AcceptanceLabels>(
                File.ReadAllText(labelsPath), Options);
            if (!Validate(labels))
                return 2;

            var report = Compare(records, labels!);
            var parent = Path.GetDirectoryName(reportPath);
            if (!string.IsNullOrEmpty(parent))
                Directory.CreateDirectory(parent);
            temporaryReport = Path.Combine(
                parent ?? string.Empty,
                $"{Path.GetFileName(reportPath)}.partial-{Guid.NewGuid():N}");
            File.WriteAllText(
                temporaryReport,
                JsonSerializer.Serialize(report, Options),
                new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            File.Move(temporaryReport, reportPath);
            temporaryReport = null;
            return report.Passed ? 0 : 1;
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or
            JsonException or ArgumentException or NullReferenceException)
        {
            return 2;
        }
        finally
        {
            if (temporaryReport is not null)
            {
                try
                {
                    File.Delete(temporaryReport);
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
        }
    }

    private static ReplayAuditRecord[] ReadAudit(string path)
    {
        var records = new List<ReplayAuditRecord>();
        foreach (var line in File.ReadLines(path))
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;
            var record = JsonSerializer.Deserialize<ReplayAuditRecord>(line, Options)
                ?? throw new InvalidDataException("Audit record cannot be null.");
            if (record.Observations is null ||
                record.Events is null ||
                record.CandidateResolutions is null ||
                record.Layers is null ||
                record.Observations.Any(item => item is null) ||
                record.Events.Any(item => item is null) ||
                record.CandidateResolutions.Any(item => item is null) ||
                record.Layers.Any(item => item is null))
            {
                throw new InvalidDataException("Audit record contains null collections or elements.");
            }
            records.Add(record);
        }
        return records.ToArray();
    }

    private static bool Validate(AcceptanceLabels? labels)
    {
        if (labels?.Events is null ||
            labels.CandidateIds is null ||
            labels.Lifecycle is null ||
            labels.RiverCounts is null ||
            labels.Events.Any(item => item is null) ||
            labels.Lifecycle.Any(item => item is null) ||
            labels.RiverCounts.Any(item => item is null))
        {
            return false;
        }

        if (labels.CandidateIds.Count != labels.CandidateIds.Distinct().Count())
            return false;
        if (labels.Events.Any(label =>
                label.StartFrame < 0 ||
                label.EndFrame < label.StartFrame ||
                !Enum.IsDefined(label.Kind) ||
                !Enum.IsDefined(label.Actor) ||
                label.SourceSeat is { } source && !Enum.IsDefined(source)) ||
            labels.Lifecycle.Any(label =>
                label.StartFrame < 0 ||
                label.EndFrame < label.StartFrame ||
                !Enum.IsDefined(label.State)) ||
            labels.RiverCounts.Any(label =>
                label.StartFrame < 0 ||
                label.EndFrame < label.StartFrame ||
                label.Count < 0 ||
                !Enum.IsDefined(label.Seat)))
        {
            return false;
        }

        return !HasOverlap(labels.Events, item => item.Actor) &&
               !HasOverlap(labels.Lifecycle, _ => 0) &&
               !HasOverlap(labels.RiverCounts, item => item.Seat);
    }

    private static bool HasOverlap<T, TKey>(
        IReadOnlyList<T> labels,
        Func<T, TKey> key)
        where T : IFrameRange
        where TKey : notnull =>
        labels
            .GroupBy(key)
            .Any(group =>
            {
                var ordered = group.OrderBy(item => item.StartFrame).ToArray();
                return ordered.Zip(ordered.Skip(1))
                    .Any(pair => pair.First.EndFrame >= pair.Second.StartFrame);
            });

    private static AcceptanceReport Compare(
        IReadOnlyList<ReplayAuditRecord> records,
        AcceptanceLabels labels)
    {
        var matched = new bool[labels.Events.Count];
        var correct = 0;
        var incorrect = 0;
        var unexpected = 0;
        foreach (var record in records)
        {
            foreach (var formal in record.Events)
            {
                var labelIndex = FindEventLabel(
                    labels.Events, matched, record.FrameNumber, formal);
                if (labelIndex < 0)
                {
                    unexpected++;
                    continue;
                }

                matched[labelIndex] = true;
                var expected = labels.Events[labelIndex];
                if (expected.Kind == formal.Kind &&
                    expected.SourceSeat == formal.SourceSeat)
                {
                    correct++;
                }
                else
                {
                    incorrect++;
                }
            }
        }

        var resolutions = records.SelectMany(record => record.CandidateResolutions).ToArray();
        var confirmedSources = resolutions
            .Where(item =>
                item.Status == CandidateResolutionStatus.Confirmed &&
                item.SourceTileId is not null)
            .Select(item => item.SourceTileId!.Value)
            .ToArray();
        var sourceReuse = confirmedSources.Length - confirmedSources.Distinct().Count();
        var terminalCounts = resolutions
            .GroupBy(item => item.CandidateId)
            .ToDictionary(group => group.Key, group => group.Count());
        var duplicateTerminals = terminalCounts.Values.Sum(count => Math.Max(0, count - 1));
        var expectedCandidates = labels.CandidateIds.ToHashSet();
        var actualCandidates = terminalCounts.Keys.ToHashSet();
        var terminalCoverage =
            expectedCandidates.Except(actualCandidates).Count() +
            actualCandidates.Except(expectedCandidates).Count();

        var lifecycleMismatches = 0;
        var riverMismatches = 0;
        foreach (var record in records)
        {
            var lifecycle = labels.Lifecycle.SingleOrDefault(
                item => item.StartFrame <= record.FrameNumber &&
                        record.FrameNumber <= item.EndFrame);
            if (lifecycle is null || lifecycle.State != record.Lifecycle)
                lifecycleMismatches++;

            foreach (var seat in Enum.GetValues<Seat>())
            {
                var expectedRiver = labels.RiverCounts.SingleOrDefault(
                    item => item.Seat == seat &&
                            item.StartFrame <= record.FrameNumber &&
                            record.FrameNumber <= item.EndFrame);
                var actual = record.Observations.SingleOrDefault(item => item.Seat == seat);
                if (expectedRiver is null ||
                    actual is null ||
                    actual.RiverTiles.Count != expectedRiver.Count)
                {
                    riverMismatches++;
                }
            }
        }

        return new AcceptanceReport(
            correct,
            incorrect,
            matched.Count(value => !value),
            resolutions.Count(item => item.Status == CandidateResolutionStatus.Ambiguous),
            resolutions.Count(item => item.Status == CandidateResolutionStatus.Rejected),
            unexpected,
            sourceReuse,
            duplicateTerminals,
            terminalCoverage,
            riverMismatches,
            lifecycleMismatches);
    }

    private static int FindEventLabel(
        IReadOnlyList<ExpectedEventLabel> labels,
        IReadOnlyList<bool> matched,
        int frame,
        TableEvent formal)
    {
        for (var index = 0; index < labels.Count; index++)
        {
            var label = labels[index];
            if (!matched[index] &&
                label.Actor == formal.Actor &&
                label.StartFrame <= frame &&
                frame <= label.EndFrame)
            {
                return index;
            }
        }
        return -1;
    }

    private interface IFrameRange
    {
        int StartFrame { get; }
        int EndFrame { get; }
    }

    private sealed record AcceptanceLabels(
        IReadOnlyList<ExpectedEventLabel> Events,
        IReadOnlyList<Guid> CandidateIds,
        IReadOnlyList<ExpectedLifecycleLabel> Lifecycle,
        IReadOnlyList<ExpectedRiverCountLabel> RiverCounts);

    private sealed record ExpectedEventLabel(
        int StartFrame,
        int EndFrame,
        TableEventKind Kind,
        Seat Actor,
        Seat? SourceSeat) : IFrameRange;

    private sealed record ExpectedLifecycleLabel(
        int StartFrame,
        int EndFrame,
        LifecycleState State) : IFrameRange;

    private sealed record ExpectedRiverCountLabel(
        int StartFrame,
        int EndFrame,
        Seat Seat,
        int Count) : IFrameRange;
}
