using System.Collections.Immutable;
using System.Security.Cryptography;
using MahjongSoulOverlay.Core.Domain;

namespace MahjongSoulOverlay.Core.Events;

public enum ConfirmationRequirement
{
    None,
    SourceRiverRemoval,
}

public sealed record LocalEventCandidate(
    Guid Id,
    TableEventKind Kind,
    Seat Actor,
    double Confidence,
    ConfirmationRequirement ConfirmationRequirement,
    DateTimeOffset StartedAt,
    DateTimeOffset ObservedAt);

internal sealed record EventClassificationRule(
    TableEventKind Kind,
    ConfirmationRequirement ConfirmationRequirement,
    Func<ObservationTransaction, TableEvent?, bool> IsMatch);

public sealed class EventClassifier
{
    private static readonly ImmutableArray<EventClassificationRule> ProductionRules =
    [
        new(TableEventKind.Draw, ConfirmationRequirement.None, MatchesDraw),
        new(TableEventKind.Tsumogiri, ConfirmationRequirement.None, MatchesTsumogiri),
        new(TableEventKind.Tedashi, ConfirmationRequirement.None, MatchesTedashi),
        new(
            TableEventKind.ChiOrPon,
            ConfirmationRequirement.SourceRiverRemoval,
            (transaction, _) => MatchesMeld(transaction, -2, 1, 3)),
        new(
            TableEventKind.Daiminkan,
            ConfirmationRequirement.SourceRiverRemoval,
            (transaction, _) => MatchesMeld(transaction, -3, 1, 4)),
        new(
            TableEventKind.Ankan,
            ConfirmationRequirement.None,
            (transaction, _) => MatchesMeld(transaction, -4, 1, 4)),
        new(
            TableEventKind.Kakan,
            ConfirmationRequirement.None,
            (transaction, _) => MatchesMeld(transaction, -1, 0, 1)),
    ];

    private readonly double _minimumConfidence;
    private readonly ImmutableArray<EventClassificationRule> _rules;

    public EventClassifier(double minimumConfidence = 0.75)
        : this(minimumConfidence, ProductionRules)
    {
    }

    internal EventClassifier(
        double minimumConfidence,
        IEnumerable<EventClassificationRule> rules)
    {
        if (!double.IsFinite(minimumConfidence) || minimumConfidence is < 0d or > 1d)
        {
            throw new ArgumentOutOfRangeException(
                nameof(minimumConfidence),
                minimumConfidence,
                "Minimum confidence must be within [0, 1].");
        }

        ArgumentNullException.ThrowIfNull(rules);
        _minimumConfidence = minimumConfidence;
        _rules = rules.ToImmutableArray();
        if (_rules.Any(rule => rule is null))
            throw new ArgumentException("Rules cannot contain null elements.", nameof(rules));
    }

    public LocalEventCandidate Classify(
        ObservationTransaction transaction,
        TableEvent? previousConfirmedEvent = null)
    {
        ArgumentNullException.ThrowIfNull(transaction);

        var id = CreateDeterministicId(transaction);
        if (transaction.IsConflicted || transaction.Confidence < _minimumConfidence)
            return Unknown(id, transaction);

        var matches = _rules
            .Where(rule => rule.IsMatch(transaction, previousConfirmedEvent))
            .ToArray();
        if (matches.Length != 1)
            return Unknown(id, transaction);

        var match = matches[0];
        var kind = match.Kind == TableEventKind.Draw &&
            IsSameActorConfirmedKan(previousConfirmedEvent, transaction.Seat)
                ? TableEventKind.RinshanDraw
                : match.Kind;

        return new LocalEventCandidate(
            id,
            kind,
            transaction.Seat,
            transaction.Confidence,
            match.ConfirmationRequirement,
            transaction.StartedAt,
            transaction.CompletedAt);
    }

    private static LocalEventCandidate Unknown(
        Guid id,
        ObservationTransaction transaction) =>
        new(
            id,
            TableEventKind.Unknown,
            transaction.Seat,
            0d,
            ConfirmationRequirement.None,
            transaction.StartedAt,
            transaction.CompletedAt);

    private static bool MatchesDraw(
        ObservationTransaction transaction,
        TableEvent? _) =>
        HasExactTotals(transaction, 0, 1, 0, 0, 0, removed: false) &&
        Evidence(transaction) is [{ DrawnSlotDelta: 1 } delta] &&
        HasOnly(delta, drawn: 1);

    private static bool MatchesTsumogiri(
        ObservationTransaction transaction,
        TableEvent? _)
    {
        if (!HasExactTotals(transaction, 0, -1, 0, 0, 1, removed: false))
            return false;

        var evidence = Evidence(transaction);
        return evidence switch
        {
            [{ DrawnSlotDelta: -1, RiverDelta: 1 } delta] =>
                HasOnly(delta, drawn: -1, river: 1),
            [{ DrawnSlotDelta: -1 } first, { RiverDelta: 1 } second] =>
                HasOnly(first, drawn: -1) && HasOnly(second, river: 1),
            _ => false,
        };
    }

    private static bool MatchesTedashi(
        ObservationTransaction transaction,
        TableEvent? _)
    {
        if (!HasExactTotals(transaction, 0, -1, 0, 0, 1, removed: true))
            return false;

        var evidence = Evidence(transaction);
        return evidence switch
        {
            [{ DrawnSlotDelta: -1, RiverDelta: 1, MainSlotRemoved: true } delta] =>
                HasOnly(delta, drawn: -1, river: 1, removed: true),
            [
                { MainHandDelta: -1, MainSlotRemoved: true } contraction,
                { MainHandDelta: 1, DrawnSlotDelta: -1 } rebalance,
                { RiverDelta: 1 } river
            ] =>
                HasOnly(contraction, hand: -1, removed: true) &&
                HasOnly(rebalance, hand: 1, drawn: -1) &&
                HasOnly(river, river: 1),
            [
                { MainHandDelta: -1, MainSlotRemoved: true } contraction,
                { MainHandDelta: 1, DrawnSlotDelta: -1, RiverDelta: 1 } final
            ] =>
                HasOnly(contraction, hand: -1, removed: true) &&
                HasOnly(final, hand: 1, drawn: -1, river: 1),
            [
                { MainSlotRemoved: true } removal,
                { DrawnSlotDelta: -1 } clear,
                { RiverDelta: 1 } river
            ] =>
                HasOnly(removal, removed: true) &&
                HasOnly(clear, drawn: -1) &&
                HasOnly(river, river: 1),
            [
                { MainSlotRemoved: true } removal,
                { DrawnSlotDelta: -1, RiverDelta: 1 } final
            ] =>
                HasOnly(removal, removed: true) &&
                HasOnly(final, drawn: -1, river: 1),
            _ => false,
        };
    }

    private static bool MatchesMeld(
        ObservationTransaction transaction,
        int hand,
        int meldGroups,
        int meldTiles)
    {
        if (!HasExactTotals(
            transaction,
            hand,
            0,
            meldGroups,
            meldTiles,
            0,
            removed: false))
        {
            return false;
        }

        var evidence = Evidence(transaction);
        if (evidence.Count == 1)
        {
            return HasOnly(
                evidence[0],
                hand: hand,
                meldGroups: meldGroups,
                meldTiles: meldTiles);
        }

        var contractionOnly = HasOnly(evidence[0], hand: hand);
        var contractionWithGroup =
            meldGroups == 1 &&
            HasOnly(evidence[0], hand: hand, meldGroups: 1);
        if (!contractionOnly && !contractionWithGroup)
            return false;

        return meldGroups switch
        {
            0 =>
                evidence.Count == 2 &&
                HasOnly(evidence[1], meldTiles: meldTiles),
            1 =>
                evidence.Count == 2 &&
                    (contractionOnly &&
                        HasOnly(evidence[1], meldGroups: 1, meldTiles: meldTiles) ||
                    contractionWithGroup &&
                    HasOnly(evidence[1], meldTiles: meldTiles)) ||
                evidence.Count == 3 &&
                    contractionOnly &&
                    HasOnly(evidence[1], meldGroups: 1) &&
                    HasOnly(evidence[2], meldTiles: meldTiles),
            _ => false,
        };
    }

    private static bool HasExactTotals(
        ObservationTransaction transaction,
        long hand,
        long drawn,
        long meldGroups,
        long meldTiles,
        long river,
        bool removed) =>
        transaction.MainHandDelta == hand &&
        transaction.DrawnSlotDelta == drawn &&
        transaction.MeldGroupDelta == meldGroups &&
        transaction.MeldTileDelta == meldTiles &&
        transaction.RiverDelta == river &&
        transaction.MainSlotRemoved == removed;

    private static IReadOnlyList<ObservationDelta> Evidence(
        ObservationTransaction transaction)
    {
        if (transaction.Deltas.Any(delta => !delta.HasStructuralChange && !delta.IsStable))
            return [];

        return transaction.Deltas
            .Where(delta => delta.HasStructuralChange)
            .ToArray();
    }

    private static bool HasOnly(
        ObservationDelta delta,
        int hand = 0,
        int drawn = 0,
        int meldGroups = 0,
        int meldTiles = 0,
        int river = 0,
        bool removed = false) =>
        delta.MainHandDelta == hand &&
        delta.DrawnSlotDelta == drawn &&
        delta.MeldGroupDelta == meldGroups &&
        delta.MeldTileDelta == meldTiles &&
        delta.RiverDelta == river &&
        delta.MainSlotRemoved == removed;

    private static bool IsSameActorConfirmedKan(TableEvent? previous, Seat actor) =>
        previous is not null &&
        previous.Actor == actor &&
        previous.Kind is TableEventKind.Daiminkan or TableEventKind.Ankan or TableEventKind.Kakan;

    private static Guid CreateDeterministicId(ObservationTransaction transaction)
    {
        using var stream = new MemoryStream();
        using (var writer = new BinaryWriter(stream, System.Text.Encoding.UTF8, leaveOpen: true))
        {
            writer.Write((int)transaction.Seat);
            WriteTimestamp(writer, transaction.StartedAt);
            WriteTimestamp(writer, transaction.CompletedAt);
            writer.Write(transaction.Deltas.Count);
            foreach (var delta in transaction.Deltas)
            {
                writer.Write((int)delta.Seat);
                writer.Write(delta.MainHandDelta);
                writer.Write(delta.DrawnSlotDelta);
                writer.Write(delta.MeldGroupDelta);
                writer.Write(delta.MeldTileDelta);
                writer.Write(delta.RiverDelta);
                writer.Write(delta.MainSlotRemoved);
                writer.Write(delta.IsStable);
                writer.Write(delta.Confidence);
                WriteTimestamp(writer, delta.Timestamp);
            }
        }

        var hash = SHA256.HashData(stream.GetBuffer().AsSpan(0, checked((int)stream.Length)));
        return new Guid(hash.AsSpan(0, 16));
    }

    private static void WriteTimestamp(BinaryWriter writer, DateTimeOffset timestamp)
    {
        writer.Write(timestamp.Ticks);
        writer.Write((short)timestamp.Offset.TotalMinutes);
    }
}
