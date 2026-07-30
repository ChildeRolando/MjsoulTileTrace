using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class EventClassifierTests
{
    public static TheoryData<TableEventKind, ObservationDelta[]> ValidSingleDeltaCases => new()
    {
        { TableEventKind.Draw, [Delta(drawn: 1)] },
        { TableEventKind.Tsumogiri, [Delta(drawn: -1, river: 1)] },
        { TableEventKind.Tedashi, [Delta(drawn: -1, river: 1, removed: true)] },
        { TableEventKind.ChiOrPon, [Delta(hand: -2, meldGroups: 1, meldTiles: 3)] },
        { TableEventKind.Daiminkan, [Delta(hand: -3, meldGroups: 1, meldTiles: 4)] },
        { TableEventKind.Ankan, [Delta(hand: -4, meldGroups: 1, meldTiles: 4)] },
        { TableEventKind.Kakan, [Delta(hand: -1, meldTiles: 1)] },
    };

    public static TheoryData<TableEventKind, ObservationDelta[]> ValidMultiDeltaCases => new()
    {
        {
            TableEventKind.Draw,
            [Delta(drawn: 1), StableZero(1), StableZero(2)]
        },
        {
            TableEventKind.Tsumogiri,
            [Delta(drawn: -1), StableZero(1), Delta(river: 1, milliseconds: 2)]
        },
        {
            TableEventKind.Tedashi,
            [
                Delta(hand: -1, removed: true),
                StableZero(1),
                Delta(hand: 1, drawn: -1, milliseconds: 2),
                Delta(river: 1, milliseconds: 3),
            ]
        },
        {
            TableEventKind.ChiOrPon,
            [
                Delta(hand: -2),
                StableZero(1),
                Delta(meldGroups: 1, milliseconds: 2),
                Delta(meldTiles: 3, milliseconds: 3),
            ]
        },
        {
            TableEventKind.Daiminkan,
            [
                Delta(hand: -3),
                Delta(meldGroups: 1, milliseconds: 1),
                Delta(meldTiles: 4, milliseconds: 2),
            ]
        },
        {
            TableEventKind.Ankan,
            [
                Delta(hand: -4),
                Delta(meldGroups: 1, meldTiles: 4, milliseconds: 1),
            ]
        },
        {
            TableEventKind.Kakan,
            [Delta(hand: -1), Delta(meldTiles: 1, milliseconds: 1)]
        },
    };

    [Theory]
    [MemberData(nameof(ValidSingleDeltaCases))]
    public void Classifies_valid_single_delta_evidence(
        TableEventKind expected,
        ObservationDelta[] deltas)
    {
        var candidate = new EventClassifier().Classify(Transaction(deltas));

        Assert.Equal(expected, candidate.Kind);
        Assert.Equal(Seat.Bottom, candidate.Actor);
        Assert.Equal(0.9, candidate.Confidence);
    }

    [Theory]
    [MemberData(nameof(ValidMultiDeltaCases))]
    public void Classifies_valid_ordered_multi_delta_evidence_while_ignoring_stable_zero_changes(
        TableEventKind expected,
        ObservationDelta[] deltas)
    {
        var candidate = new EventClassifier().Classify(Transaction(deltas));

        Assert.Equal(expected, candidate.Kind);
    }

    [Fact]
    public void Tsumogiri_rejects_reversed_evidence()
    {
        var transaction = Transaction(
            Delta(river: 1),
            Delta(drawn: -1, milliseconds: 1));

        AssertUnknown(transaction);
    }

    [Fact]
    public void Call_rejects_meld_growth_before_concealed_hand_contraction()
    {
        var transaction = Transaction(
            Delta(meldGroups: 1),
            Delta(meldTiles: 3, milliseconds: 1),
            Delta(hand: -2, milliseconds: 2));

        AssertUnknown(transaction);
    }

    [Fact]
    public void Call_rejects_meld_tile_growth_before_meld_group_growth()
    {
        var transaction = Transaction(
            Delta(hand: -2),
            Delta(meldTiles: 3, milliseconds: 1),
            Delta(meldGroups: 1, milliseconds: 2));

        AssertUnknown(transaction);
    }

    [Fact]
    public void Tedashi_rejects_unbalanced_main_hand_contraction()
    {
        var transaction = Transaction(
            Delta(hand: -1, removed: true),
            Delta(drawn: -1, river: 1, milliseconds: 1));

        AssertUnknown(transaction);
    }

    [Fact]
    public void Tedashi_rejects_river_addition_before_drawn_slot_clear()
    {
        var transaction = Transaction(
            Delta(hand: -1, removed: true),
            Delta(river: 1, milliseconds: 1),
            Delta(hand: 1, drawn: -1, milliseconds: 2));

        AssertUnknown(transaction);
    }

    [Fact]
    public void Opposite_deltas_that_cancel_to_exact_totals_are_not_valid_evidence()
    {
        var transaction = Transaction(
            Delta(drawn: 1),
            Delta(drawn: -1, milliseconds: 1),
            Delta(drawn: 1, milliseconds: 2));

        Assert.Equal(1L, transaction.DrawnSlotDelta);
        AssertUnknown(transaction);
    }

    [Fact]
    public void Non_permitted_intermediate_structural_delta_invalidates_evidence()
    {
        var transaction = Transaction(
            Delta(drawn: -1),
            Delta(meldTiles: 1, milliseconds: 1),
            Delta(meldTiles: -1, milliseconds: 2),
            Delta(river: 1, milliseconds: 3));

        Assert.Equal(-1L, transaction.DrawnSlotDelta);
        Assert.Equal(1L, transaction.RiverDelta);
        Assert.Equal(0L, transaction.MeldTileDelta);
        AssertUnknown(transaction);
    }

    [Fact]
    public void Unstable_zero_change_is_not_confirmation_and_invalidates_ordered_evidence()
    {
        var transaction = Transaction(
            Delta(drawn: -1),
            Delta(milliseconds: 1),
            Delta(river: 1, milliseconds: 2));

        AssertUnknown(transaction);
    }

    [Theory]
    [MemberData(nameof(InexactTotals))]
    public void Every_rule_requires_exact_totals_and_no_unrelated_nonzero_field(
        ObservationDelta[] deltas)
    {
        AssertUnknown(Transaction(deltas));
    }

    public static TheoryData<ObservationDelta[]> InexactTotals => new()
    {
        { [Delta(drawn: 0)] },
        { [Delta(drawn: -1, river: 2)] },
        { [Delta(drawn: -1, river: 1, meldTiles: 1)] },
        { [Delta(hand: -2, meldGroups: 1, meldTiles: 2)] },
        { [Delta(hand: -3, meldGroups: 1, meldTiles: 3)] },
        { [Delta(hand: -4, meldGroups: 1, meldTiles: 3)] },
        { [Delta(hand: -1, meldTiles: 1, river: 1)] },
        { [Delta(drawn: 1, removed: true)] },
    };

    [Fact]
    public void Conflicted_transaction_is_unknown()
    {
        AssertUnknown(Transaction([Delta(drawn: 1)], isConflicted: true));
    }

    [Fact]
    public void Transaction_below_configurable_minimum_confidence_is_unknown()
    {
        var classifier = new EventClassifier(minimumConfidence: 0.8);

        var candidate = classifier.Classify(
            Transaction(Delta(drawn: 1, confidence: 0.79)));

        Assert.Equal(TableEventKind.Unknown, candidate.Kind);
        Assert.Equal(0d, candidate.Confidence);
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Constructor_rejects_invalid_minimum_confidence(double confidence)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new EventClassifier(confidence));
    }

    [Fact]
    public void Multiple_matching_rules_return_unknown_independent_of_rule_order()
    {
        static bool Matches(ObservationTransaction _, TableEvent? __) => true;
        var first = new EventClassificationRule(
            TableEventKind.Draw, ConfirmationRequirement.None, Matches);
        var second = new EventClassificationRule(
            TableEventKind.Kakan, ConfirmationRequirement.None, Matches);
        var transaction = Transaction(Delta(drawn: 1));

        var forward = new EventClassifier(0.75, [first, second]).Classify(transaction);
        var reverse = new EventClassifier(0.75, [second, first]).Classify(transaction);

        Assert.Equal(TableEventKind.Unknown, forward.Kind);
        Assert.Equal(TableEventKind.Unknown, reverse.Kind);
        Assert.Equal(0d, forward.Confidence);
        Assert.Equal(ConfirmationRequirement.None, forward.ConfirmationRequirement);
    }

    [Theory]
    [InlineData(TableEventKind.ChiOrPon)]
    [InlineData(TableEventKind.Daiminkan)]
    public void Calls_require_source_river_removal_confirmation(TableEventKind kind)
    {
        var deltas = kind == TableEventKind.ChiOrPon
            ? new[] { Delta(hand: -2, meldGroups: 1, meldTiles: 3) }
            : new[] { Delta(hand: -3, meldGroups: 1, meldTiles: 4) };

        var candidate = new EventClassifier().Classify(Transaction(deltas));

        Assert.Equal(ConfirmationRequirement.SourceRiverRemoval, candidate.ConfirmationRequirement);
    }

    [Theory]
    [InlineData(TableEventKind.Draw)]
    [InlineData(TableEventKind.Tsumogiri)]
    [InlineData(TableEventKind.Tedashi)]
    [InlineData(TableEventKind.Ankan)]
    [InlineData(TableEventKind.Kakan)]
    public void Local_events_require_no_cross_seat_confirmation(TableEventKind kind)
    {
        ObservationDelta[] deltas = kind switch
        {
            TableEventKind.Draw => [Delta(drawn: 1)],
            TableEventKind.Tsumogiri => [Delta(drawn: -1, river: 1)],
            TableEventKind.Tedashi => [Delta(drawn: -1, river: 1, removed: true)],
            TableEventKind.Ankan => [Delta(hand: -4, meldGroups: 1, meldTiles: 4)],
            TableEventKind.Kakan => [Delta(hand: -1, meldTiles: 1)],
            _ => throw new ArgumentOutOfRangeException(nameof(kind)),
        };

        var candidate = new EventClassifier().Classify(Transaction(deltas));

        Assert.Equal(ConfirmationRequirement.None, candidate.ConfirmationRequirement);
    }

    [Fact]
    public void Candidate_identity_and_audit_timestamps_are_deterministic()
    {
        var transaction = Transaction(
            [
                Delta(drawn: -1, milliseconds: 10),
                StableZero(15),
                Delta(river: 1, milliseconds: 20),
            ],
            completedMilliseconds: 30);
        var classifier = new EventClassifier();

        var first = classifier.Classify(transaction);
        var second = classifier.Classify(transaction);

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(transaction.StartedAt, first.StartedAt);
        Assert.Equal(transaction.CompletedAt, first.ObservedAt);
        Assert.Equal(first.StartedAt, second.StartedAt);
        Assert.Equal(first.ObservedAt, second.ObservedAt);
    }

    [Fact]
    public void Candidate_id_changes_with_actor_timestamp_or_ordered_payload()
    {
        var baseline = Transaction(
            Delta(drawn: -1, milliseconds: 10),
            Delta(river: 1, milliseconds: 20));
        var actorChanged = Transaction(
            Delta(drawn: -1, seat: Seat.Left, milliseconds: 10),
            Delta(river: 1, seat: Seat.Left, milliseconds: 20));
        var timestampChanged = Transaction(
            Delta(drawn: -1, milliseconds: 11),
            Delta(river: 1, milliseconds: 20));
        var payloadChangedWithoutChangingTotals = Transaction(
            Delta(drawn: -1, milliseconds: 10),
            StableZero(15),
            Delta(river: 1, milliseconds: 20));
        var classifier = new EventClassifier();

        var baselineId = classifier.Classify(baseline).Id;

        Assert.NotEqual(baselineId, classifier.Classify(actorChanged).Id);
        Assert.NotEqual(baselineId, classifier.Classify(timestampChanged).Id);
        Assert.NotEqual(baselineId, classifier.Classify(payloadChangedWithoutChangingTotals).Id);
    }

    [Theory]
    [InlineData(TableEventKind.Daiminkan)]
    [InlineData(TableEventKind.Ankan)]
    [InlineData(TableEventKind.Kakan)]
    public void Draw_after_same_actor_formally_confirmed_kan_is_rinshan(
        TableEventKind kanKind)
    {
        var previous = ConfirmedEvent(kanKind, Seat.Bottom);

        var candidate = new EventClassifier().Classify(
            Transaction(Delta(drawn: 1)),
            previous);

        Assert.Equal(TableEventKind.RinshanDraw, candidate.Kind);
    }

    [Fact]
    public void Local_kan_candidate_without_a_formal_confirmed_event_is_not_rinshan_context()
    {
        var unconfirmed = new EventClassifier().Classify(
            Transaction(Delta(hand: -4, meldGroups: 1, meldTiles: 4)));
        Assert.Equal(TableEventKind.Ankan, unconfirmed.Kind);

        var draw = new EventClassifier().Classify(
            Transaction(Delta(drawn: 1)),
            previousConfirmedEvent: null);

        Assert.Equal(TableEventKind.Draw, draw.Kind);
    }

    [Theory]
    [InlineData(TableEventKind.Draw, Seat.Bottom)]
    [InlineData(TableEventKind.Tedashi, Seat.Bottom)]
    [InlineData(TableEventKind.Ankan, Seat.Left)]
    public void Non_kan_or_other_actor_formal_event_is_not_rinshan_context(
        TableEventKind priorKind,
        Seat priorActor)
    {
        var candidate = new EventClassifier().Classify(
            Transaction(Delta(drawn: 1)),
            ConfirmedEvent(priorKind, priorActor));

        Assert.Equal(TableEventKind.Draw, candidate.Kind);
    }

    private static void AssertUnknown(ObservationTransaction transaction)
    {
        var candidate = new EventClassifier().Classify(transaction);

        Assert.Equal(TableEventKind.Unknown, candidate.Kind);
        Assert.Equal(0d, candidate.Confidence);
        Assert.Equal(ConfirmationRequirement.None, candidate.ConfirmationRequirement);
    }

    private static TableEvent ConfirmedEvent(TableEventKind kind, Seat actor) =>
        new(kind, actor, null, DateTimeOffset.UnixEpoch, 1d);

    private static ObservationTransaction Transaction(
        params ObservationDelta[] deltas) =>
        Transaction(deltas, isConflicted: false);

    private static ObservationTransaction Transaction(
        IReadOnlyList<ObservationDelta> deltas,
        bool isConflicted = false,
        int? completedMilliseconds = null) =>
        new(
            deltas,
            isConflicted,
            completedMilliseconds is null
                ? deltas[^1].Timestamp
                : DateTimeOffset.UnixEpoch.AddMilliseconds(completedMilliseconds.Value));

    private static ObservationDelta StableZero(int milliseconds) =>
        Delta(stable: true, milliseconds: milliseconds);

    private static ObservationDelta Delta(
        int hand = 0,
        int drawn = 0,
        int meldGroups = 0,
        int meldTiles = 0,
        int river = 0,
        bool removed = false,
        bool stable = false,
        double confidence = 0.9,
        Seat seat = Seat.Bottom,
        int milliseconds = 0) =>
        new(
            seat,
            hand,
            drawn,
            meldGroups,
            meldTiles,
            river,
            removed,
            stable,
            confidence,
            DateTimeOffset.UnixEpoch.AddMilliseconds(milliseconds));
}
