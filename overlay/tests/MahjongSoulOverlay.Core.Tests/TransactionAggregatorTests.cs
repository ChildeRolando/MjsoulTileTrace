using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class TransactionAggregatorTests
{
    [Fact]
    public void Idle_zero_change_frames_do_not_open_a_transaction()
    {
        var aggregator = Aggregator();

        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 10));
        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 20));

        Assert.Null(aggregator.TryComplete());
    }

    [Fact]
    public void Stable_idle_frames_before_a_change_do_not_count_as_confirmations()
    {
        var aggregator = Aggregator();
        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 10));
        aggregator.Add(Delta(
            Seat.Bottom, drawn: 1, stable: false, timestampMilliseconds: 20));
        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 30));

        Assert.Null(aggregator.TryComplete());

        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 40));

        Assert.NotNull(aggregator.TryComplete());
    }

    [Fact]
    public void Two_stable_frames_after_a_change_complete_one_transaction()
    {
        var aggregator = Aggregator();
        aggregator.Add(Delta(
            Seat.Bottom, drawn: 1, stable: false, timestampMilliseconds: 10));
        aggregator.Add(Delta(
            Seat.Bottom, river: 1, stable: true, timestampMilliseconds: 100));

        Assert.Null(aggregator.TryComplete());

        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 140));
        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.Equal(1, transaction.DrawnSlotDelta);
        Assert.Equal(1, transaction.RiverDelta);
    }

    [Fact]
    public void An_unstable_frame_interrupts_stable_confirmation()
    {
        var aggregator = Aggregator();
        aggregator.Add(Delta(
            Seat.Bottom, drawn: 1, stable: false, timestampMilliseconds: 10));
        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 20));
        aggregator.Add(Delta(Seat.Bottom, stable: false, timestampMilliseconds: 30));
        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 40));

        Assert.Null(aggregator.TryComplete());

        aggregator.Add(Delta(Seat.Bottom, stable: true, timestampMilliseconds: 50));

        Assert.NotNull(aggregator.TryComplete());
    }

    [Fact]
    public void Exact_timeout_boundary_completes_a_conflicted_transaction()
    {
        var aggregator = Aggregator(timeoutMilliseconds: 100);
        aggregator.Add(Delta(
            Seat.Left, hand: -1, removed: true, timestampMilliseconds: 0));
        aggregator.AdvanceClock(DateTimeOffset.UnixEpoch.AddMilliseconds(100));

        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.True(transaction.IsConflicted);
        Assert.Equal(DateTimeOffset.UnixEpoch.AddMilliseconds(100), transaction.CompletedAt);
    }

    [Fact]
    public void Add_evaluates_timeout_during_a_continuous_unstable_stream()
    {
        var aggregator = Aggregator(timeoutMilliseconds: 100);
        aggregator.Add(Delta(
            Seat.Left, hand: -1, timestampMilliseconds: 0));
        aggregator.Add(Delta(
            Seat.Left, meldGroups: 1, timestampMilliseconds: 50));
        aggregator.Add(Delta(
            Seat.Left, meldTiles: 3, timestampMilliseconds: 100));

        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.True(transaction.IsConflicted);
        Assert.Equal(3, transaction.Deltas.Count);
    }

    [Fact]
    public void Mixed_seat_transaction_preserves_full_ordered_payload_and_minimum_confidence()
    {
        var first = Delta(
            Seat.Bottom,
            hand: -2,
            drawn: 1,
            meldGroups: 1,
            meldTiles: 3,
            river: -1,
            removed: true,
            stable: true,
            confidence: 0.8,
            timestampMilliseconds: 10);
        var second = Delta(
            Seat.Right,
            hand: 1,
            drawn: -1,
            meldGroups: -2,
            meldTiles: 4,
            river: 2,
            stable: true,
            confidence: 0.45,
            timestampMilliseconds: 20);
        var aggregator = Aggregator();

        aggregator.Add(first);
        aggregator.Add(second);
        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.Equal(Seat.Bottom, transaction.Seat);
        Assert.Equal(-1L, transaction.MainHandDelta);
        Assert.Equal(0L, transaction.DrawnSlotDelta);
        Assert.Equal(-1L, transaction.MeldGroupDelta);
        Assert.Equal(7L, transaction.MeldTileDelta);
        Assert.Equal(1L, transaction.RiverDelta);
        Assert.True(transaction.MainSlotRemoved);
        Assert.True(transaction.IsConflicted);
        Assert.Equal(0.45, transaction.Confidence);
        Assert.Equal([first, second], transaction.Deltas);
        Assert.Equal(-1L, transaction.ConcealedDelta);
    }

    [Fact]
    public void Mixed_seat_conflict_completes_without_waiting_for_stability()
    {
        var aggregator = Aggregator(stableFramesRequired: 10);
        aggregator.Add(Delta(
            Seat.Bottom, drawn: 1, timestampMilliseconds: 10));
        aggregator.Add(Delta(
            Seat.Right, river: 1, timestampMilliseconds: 20));

        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.True(transaction.IsConflicted);
    }

    [Fact]
    public void Completed_transaction_owns_an_immutable_delta_snapshot()
    {
        var aggregator = Aggregator(stableFramesRequired: 1);
        var delta = Delta(
            Seat.Bottom, drawn: 1, stable: true, timestampMilliseconds: 10);
        aggregator.Add(delta);
        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.Throws<NotSupportedException>(() =>
            ((IList<ObservationDelta>)transaction.Deltas).Add(delta));

        aggregator.Add(Delta(
            Seat.Bottom, river: 1, stable: true, timestampMilliseconds: 20));
        Assert.NotNull(aggregator.TryComplete());
        Assert.Equal([delta], transaction.Deltas);
    }

    [Fact]
    public void Observation_transaction_rejects_out_of_order_deltas()
    {
        var later = Delta(Seat.Bottom, drawn: 1, timestampMilliseconds: 20);
        var earlier = Delta(Seat.Bottom, river: 1, timestampMilliseconds: 10);

        Assert.Throws<ArgumentException>(() =>
            new ObservationTransaction(
                [later, earlier],
                isConflicted: false,
                DateTimeOffset.UnixEpoch.AddMilliseconds(30)));
    }

    [Fact]
    public void Long_totals_do_not_overflow_when_int_deltas_accumulate()
    {
        var aggregator = Aggregator(stableFramesRequired: 2);
        aggregator.Add(Delta(
            Seat.Top,
            hand: int.MaxValue,
            drawn: int.MaxValue,
            meldGroups: int.MaxValue,
            meldTiles: int.MaxValue,
            river: int.MaxValue,
            stable: true,
            timestampMilliseconds: 10));
        aggregator.Add(Delta(
            Seat.Top,
            hand: int.MaxValue,
            drawn: int.MaxValue,
            meldGroups: int.MaxValue,
            meldTiles: int.MaxValue,
            river: int.MaxValue,
            stable: true,
            timestampMilliseconds: 20));

        var transaction = aggregator.TryComplete();
        var expected = 2L * int.MaxValue;

        Assert.NotNull(transaction);
        Assert.Equal(expected, transaction.MainHandDelta);
        Assert.Equal(expected, transaction.DrawnSlotDelta);
        Assert.Equal(expected, transaction.MeldGroupDelta);
        Assert.Equal(expected, transaction.MeldTileDelta);
        Assert.Equal(expected, transaction.RiverDelta);
        Assert.Equal(2L * expected, transaction.ConcealedDelta);
    }

    [Fact]
    public void Reuse_after_completion_preserves_global_timestamp_monotonicity()
    {
        var aggregator = Aggregator(stableFramesRequired: 1);
        aggregator.Add(Delta(
            Seat.Bottom, drawn: 1, stable: true, timestampMilliseconds: 20));
        Assert.NotNull(aggregator.TryComplete());

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            aggregator.Add(Delta(
                Seat.Bottom, river: 1, stable: true, timestampMilliseconds: 19)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            aggregator.AdvanceClock(DateTimeOffset.UnixEpoch.AddMilliseconds(19)));
    }

    [Fact]
    public void Reset_clears_in_flight_state_and_monotonic_history()
    {
        var aggregator = Aggregator(stableFramesRequired: 1);
        aggregator.Add(Delta(
            Seat.Bottom, drawn: 1, stable: true, timestampMilliseconds: 20));

        aggregator.Reset();

        Assert.Null(aggregator.TryComplete());
        aggregator.Add(Delta(
            Seat.Bottom, river: 1, stable: true, timestampMilliseconds: 10));
        Assert.NotNull(aggregator.TryComplete());
    }

    [Fact]
    public void Reset_can_reseed_the_monotonic_timestamp_baseline()
    {
        var aggregator = Aggregator(stableFramesRequired: 1);

        aggregator.Reset(DateTimeOffset.UnixEpoch.AddMilliseconds(50));

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            aggregator.Add(Delta(
                Seat.Bottom, river: 1, stable: true, timestampMilliseconds: 49)));
        aggregator.Add(Delta(
            Seat.Bottom, river: 1, stable: true, timestampMilliseconds: 50));
        Assert.NotNull(aggregator.TryComplete());
    }

    [Fact]
    public void Reaching_delta_limit_completes_a_bounded_conflicted_transaction()
    {
        var aggregator = Aggregator(stableFramesRequired: 10, maxDeltas: 2);
        var first = Delta(
            Seat.Bottom, drawn: 1, timestampMilliseconds: 10);
        var second = Delta(
            Seat.Bottom, river: 1, timestampMilliseconds: 20);
        aggregator.Add(first);
        aggregator.Add(second);
        aggregator.Add(Delta(
            Seat.Bottom, meldTiles: 1, timestampMilliseconds: 30));

        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.True(transaction.IsConflicted);
        Assert.Equal([first, second], transaction.Deltas);
        Assert.Equal(2, transaction.Deltas.Count);
        Assert.Equal(DateTimeOffset.UnixEpoch.AddMilliseconds(30), transaction.CompletedAt);
    }

    [Fact]
    public void Conflict_completion_clears_overflow_state_for_reuse()
    {
        var aggregator = Aggregator(stableFramesRequired: 1, maxDeltas: 1);
        aggregator.Add(Delta(
            Seat.Bottom, drawn: 1, timestampMilliseconds: 10));
        Assert.True(aggregator.TryComplete()!.IsConflicted);

        aggregator.Add(Delta(
            Seat.Bottom, river: 1, timestampMilliseconds: 20));

        var second = aggregator.TryComplete();
        Assert.NotNull(second);
        Assert.Single(second.Deltas);
        Assert.Equal(1L, second.RiverDelta);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Constructor_rejects_non_positive_timeout(int timeoutMilliseconds)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new TransactionAggregator(
                TimeSpan.FromMilliseconds(timeoutMilliseconds),
                stableFramesRequired: 2));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Constructor_rejects_non_positive_stable_frame_count(int stableFramesRequired)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new TransactionAggregator(
                TimeSpan.FromMilliseconds(100),
                stableFramesRequired));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Constructor_rejects_non_positive_delta_limit(int maxDeltas)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new TransactionAggregator(
                TimeSpan.FromMilliseconds(100),
                stableFramesRequired: 2,
                maxDeltas));
    }

    [Fact]
    public void Add_and_advance_clock_reject_timestamps_before_the_global_latest_timestamp()
    {
        var aggregator = Aggregator();
        aggregator.Add(Delta(
            Seat.Top, timestampMilliseconds: 20));

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            aggregator.Add(Delta(Seat.Top, timestampMilliseconds: 19)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            aggregator.AdvanceClock(DateTimeOffset.UnixEpoch.AddMilliseconds(19)));
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Observation_delta_rejects_invalid_confidence(double confidence)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            Delta(Seat.Bottom, confidence: confidence));
    }

    private static TransactionAggregator Aggregator(
        int timeoutMilliseconds = 800,
        int stableFramesRequired = 2,
        int maxDeltas = 512) =>
        new(
            TimeSpan.FromMilliseconds(timeoutMilliseconds),
            stableFramesRequired,
            maxDeltas);

    private static ObservationDelta Delta(
        Seat seat,
        int hand = 0,
        int drawn = 0,
        int meldGroups = 0,
        int meldTiles = 0,
        int river = 0,
        bool removed = false,
        bool stable = false,
        double confidence = 1d,
        int timestampMilliseconds = 0) =>
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
            DateTimeOffset.UnixEpoch.AddMilliseconds(timestampMilliseconds));
}
