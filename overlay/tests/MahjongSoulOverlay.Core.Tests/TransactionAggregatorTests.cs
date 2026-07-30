using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class TransactionAggregatorTests
{
    [Fact]
    public void Emits_one_transaction_after_two_stable_frames()
    {
        var aggregator = new TransactionAggregator(
            TimeSpan.FromMilliseconds(800),
            stableFramesRequired: 2);
        aggregator.Add(new ObservationDelta(
            Seat.Bottom, 0, 1, 0, 0, 0, false, false,
            DateTimeOffset.UnixEpoch.AddMilliseconds(10)));
        aggregator.Add(new ObservationDelta(
            Seat.Bottom, 0, 0, 0, 0, 1, false, true,
            DateTimeOffset.UnixEpoch.AddMilliseconds(100)));

        Assert.Null(aggregator.TryComplete());

        aggregator.Add(new ObservationDelta(
            Seat.Bottom, 0, 0, 0, 0, 0, false, true,
            DateTimeOffset.UnixEpoch.AddMilliseconds(140)));
        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.Equal(1, transaction.DrawnSlotDelta);
        Assert.Equal(1, transaction.RiverDelta);
    }

    [Fact]
    public void Timeout_returns_conflicted_transaction()
    {
        var aggregator = new TransactionAggregator(
            TimeSpan.FromMilliseconds(100),
            stableFramesRequired: 2);
        aggregator.Add(new ObservationDelta(
            Seat.Left, -1, 0, 0, 0, 0, true, false,
            DateTimeOffset.UnixEpoch));
        aggregator.AdvanceClock(DateTimeOffset.UnixEpoch.AddMilliseconds(101));

        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.True(transaction.IsConflicted);
    }

    [Fact]
    public void Deltas_from_different_seats_produce_a_conflicted_transaction()
    {
        var aggregator = new TransactionAggregator(
            TimeSpan.FromMilliseconds(800),
            stableFramesRequired: 2);
        aggregator.Add(new ObservationDelta(
            Seat.Bottom, 0, 1, 0, 0, 0, false, true,
            DateTimeOffset.UnixEpoch.AddMilliseconds(10)));
        aggregator.Add(new ObservationDelta(
            Seat.Right, 0, 0, 0, 0, 1, false, true,
            DateTimeOffset.UnixEpoch.AddMilliseconds(20)));

        var transaction = aggregator.TryComplete();

        Assert.NotNull(transaction);
        Assert.Equal(Seat.Bottom, transaction.Seat);
        Assert.True(transaction.IsConflicted);
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

    [Fact]
    public void Advance_clock_rejects_time_before_the_latest_observation()
    {
        var aggregator = new TransactionAggregator(
            TimeSpan.FromMilliseconds(100),
            stableFramesRequired: 2);
        aggregator.Add(new ObservationDelta(
            Seat.Top, 0, 1, 0, 0, 0, false, false,
            DateTimeOffset.UnixEpoch.AddMilliseconds(20)));

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            aggregator.AdvanceClock(DateTimeOffset.UnixEpoch.AddMilliseconds(19)));
    }

    [Fact]
    public void Add_rejects_an_observation_older_than_the_latest_observation()
    {
        var aggregator = new TransactionAggregator(
            TimeSpan.FromMilliseconds(100),
            stableFramesRequired: 2);
        aggregator.Add(new ObservationDelta(
            Seat.Top, 0, 1, 0, 0, 0, false, false,
            DateTimeOffset.UnixEpoch.AddMilliseconds(20)));

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            aggregator.Add(new ObservationDelta(
                Seat.Top, 0, 0, 0, 0, 0, false, true,
                DateTimeOffset.UnixEpoch.AddMilliseconds(19))));
    }
}
