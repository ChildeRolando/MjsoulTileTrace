using MahjongSoulOverlay.Core.Lifecycle;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class TableLifecycleTests
{
    [Fact]
    public void Five_visible_table_frames_attach_the_session_once()
    {
        var lifecycle = new TableLifecycle();

        AssertAll(
            lifecycle,
            Visible(),
            count: 4,
            LifecycleState.Detached,
            LifecycleAction.None);

        Assert.Equal(
            new LifecycleResult(LifecycleState.SessionReady, LifecycleAction.None),
            lifecycle.Push(Visible()));
        Assert.Equal(
            new LifecycleResult(LifecycleState.SessionReady, LifecycleAction.None),
            lifecycle.Push(Visible()));
    }

    [Fact]
    public void Three_baseline_frames_activate_the_hand_once_after_attachment()
    {
        var lifecycle = AttachedLifecycle();

        AssertAll(
            lifecycle,
            Baseline(),
            count: 2,
            LifecycleState.SessionReady,
            LifecycleAction.None);

        Assert.Equal(
            new LifecycleResult(LifecycleState.HandActive, LifecycleAction.None),
            lifecycle.Push(Baseline()));
        Assert.Equal(
            new LifecycleResult(LifecycleState.HandActive, LifecycleAction.None),
            lifecycle.Push(Baseline()));
    }

    [Fact]
    public void Baseline_frames_seen_while_detached_do_not_pre_activate_a_hand()
    {
        var lifecycle = new TableLifecycle(
            visibleTableThreshold: 2,
            handBaselineThreshold: 2,
            absentTableThreshold: 2);

        Assert.Equal(
            LifecycleState.Detached,
            lifecycle.Push(Baseline()).State);
        Assert.Equal(
            LifecycleState.SessionReady,
            lifecycle.Push(Baseline()).State);
        Assert.Equal(
            LifecycleState.SessionReady,
            lifecycle.Push(Baseline()).State);
        Assert.Equal(
            LifecycleState.HandActive,
            lifecycle.Push(Baseline()).State);
    }

    [Fact]
    public void Result_screen_immediately_clears_an_active_hand_only_once()
    {
        var lifecycle = ActiveLifecycle();

        Assert.Equal(
            new LifecycleResult(
                LifecycleState.SessionReady,
                LifecycleAction.ClearOverlay),
            lifecycle.Push(ResultScreen()));
        Assert.Equal(
            new LifecycleResult(LifecycleState.SessionReady, LifecycleAction.None),
            lifecycle.Push(ResultScreen()));
    }

    [Fact]
    public void Ten_absent_table_frames_detach_and_hide_once()
    {
        var lifecycle = ActiveLifecycle();

        AssertAll(
            lifecycle,
            Absent(),
            count: 9,
            LifecycleState.HandActive,
            LifecycleAction.None);

        Assert.Equal(
            new LifecycleResult(
                LifecycleState.Detached,
                LifecycleAction.HideOverlay),
            lifecycle.Push(Absent()));
        Assert.Equal(
            new LifecycleResult(LifecycleState.Detached, LifecycleAction.None),
            lifecycle.Push(Absent()));
    }

    [Fact]
    public void Transient_absence_recovers_without_ending_the_session()
    {
        var lifecycle = ActiveLifecycle();

        Assert.Equal(LifecycleState.HandActive, lifecycle.Push(Absent()).State);
        Assert.Equal(LifecycleState.HandActive, lifecycle.Push(Absent()).State);
        Assert.Equal(LifecycleState.HandActive, lifecycle.Push(Visible()).State);

        AssertAll(
            lifecycle,
            Absent(),
            count: 9,
            LifecycleState.HandActive,
            LifecycleAction.None);
    }

    [Fact]
    public void Opposite_signals_reset_attach_and_baseline_counters()
    {
        var lifecycle = new TableLifecycle(
            visibleTableThreshold: 2,
            handBaselineThreshold: 2,
            absentTableThreshold: 2);

        Assert.Equal(LifecycleState.Detached, lifecycle.Push(Visible()).State);
        Assert.Equal(LifecycleState.Detached, lifecycle.Push(Absent()).State);
        Assert.Equal(LifecycleState.Detached, lifecycle.Push(Visible()).State);
        Assert.Equal(LifecycleState.SessionReady, lifecycle.Push(Visible()).State);

        Assert.Equal(LifecycleState.SessionReady, lifecycle.Push(Baseline()).State);
        Assert.Equal(LifecycleState.SessionReady, lifecycle.Push(Visible()).State);
        Assert.Equal(LifecycleState.SessionReady, lifecycle.Push(Baseline()).State);
        Assert.Equal(LifecycleState.HandActive, lifecycle.Push(Baseline()).State);
    }

    [Fact]
    public void Result_screen_resets_in_progress_baseline_count()
    {
        var lifecycle = new TableLifecycle(
            visibleTableThreshold: 1,
            handBaselineThreshold: 2,
            absentTableThreshold: 2);
        lifecycle.Push(Visible());
        lifecycle.Push(Baseline());

        Assert.Equal(
            new LifecycleResult(LifecycleState.SessionReady, LifecycleAction.None),
            lifecycle.Push(ResultScreen()));
        Assert.Equal(LifecycleState.SessionReady, lifecycle.Push(Baseline()).State);
        Assert.Equal(LifecycleState.HandActive, lifecycle.Push(Baseline()).State);
    }

    [Fact]
    public void Manual_reset_from_active_clears_and_requires_a_fresh_baseline()
    {
        var lifecycle = new TableLifecycle(
            visibleTableThreshold: 1,
            handBaselineThreshold: 2,
            absentTableThreshold: 2);
        lifecycle.Push(Visible());
        lifecycle.Push(Baseline());
        lifecycle.Push(Baseline());

        Assert.Equal(
            new LifecycleResult(
                LifecycleState.SessionReady,
                LifecycleAction.ClearOverlay),
            lifecycle.ManualReset());
        Assert.Equal(LifecycleState.SessionReady, lifecycle.Push(Baseline()).State);
        Assert.Equal(LifecycleState.HandActive, lifecycle.Push(Baseline()).State);
    }

    [Fact]
    public void Manual_reset_while_attached_is_an_explicit_repeatable_clear_signal()
    {
        var lifecycle = new TableLifecycle(
            visibleTableThreshold: 1,
            handBaselineThreshold: 1,
            absentTableThreshold: 2);
        lifecycle.Push(Visible());

        Assert.Equal(
            new LifecycleResult(
                LifecycleState.SessionReady,
                LifecycleAction.ClearOverlay),
            lifecycle.ManualReset());
        Assert.Equal(
            new LifecycleResult(
                LifecycleState.SessionReady,
                LifecycleAction.ClearOverlay),
            lifecycle.ManualReset());
        Assert.Equal(
            new LifecycleResult(LifecycleState.SessionReady, LifecycleAction.None),
            lifecycle.Push(Visible()));
    }

    [Fact]
    public void Manual_reset_while_detached_stays_detached_without_an_action()
    {
        var lifecycle = new TableLifecycle();

        Assert.Equal(
            new LifecycleResult(LifecycleState.Detached, LifecycleAction.None),
            lifecycle.ManualReset());
    }

    [Theory]
    [InlineData(0, 1, 1)]
    [InlineData(-1, 1, 1)]
    [InlineData(1, 0, 1)]
    [InlineData(1, -1, 1)]
    [InlineData(1, 1, 0)]
    [InlineData(1, 1, -1)]
    public void Constructor_rejects_non_positive_thresholds(
        int visibleTableThreshold,
        int handBaselineThreshold,
        int absentTableThreshold)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new TableLifecycle(
                visibleTableThreshold,
                handBaselineThreshold,
                absentTableThreshold));
    }

    private static TableLifecycle AttachedLifecycle()
    {
        var lifecycle = new TableLifecycle();
        AssertAll(
            lifecycle,
            Visible(),
            count: 5,
            LifecycleState.SessionReady,
            LifecycleAction.None,
            expectedStateBeforeLast: LifecycleState.Detached);
        return lifecycle;
    }

    private static TableLifecycle ActiveLifecycle()
    {
        var lifecycle = AttachedLifecycle();
        AssertAll(
            lifecycle,
            Baseline(),
            count: 3,
            LifecycleState.HandActive,
            LifecycleAction.None,
            expectedStateBeforeLast: LifecycleState.SessionReady);
        return lifecycle;
    }

    private static void AssertAll(
        TableLifecycle lifecycle,
        LifecycleInput input,
        int count,
        LifecycleState expectedState,
        LifecycleAction expectedAction,
        LifecycleState? expectedStateBeforeLast = null)
    {
        for (var index = 0; index < count; index++)
        {
            var state = expectedStateBeforeLast is not null && index < count - 1
                ? expectedStateBeforeLast.Value
                : expectedState;
            Assert.Equal(
                new LifecycleResult(state, expectedAction),
                lifecycle.Push(input));
        }
    }

    private static LifecycleInput Visible() =>
        new(TableVisible: true, HandBaselineVisible: false, ResultScreenVisible: false);

    private static LifecycleInput Baseline() =>
        new(TableVisible: true, HandBaselineVisible: true, ResultScreenVisible: false);

    private static LifecycleInput Absent() =>
        new(TableVisible: false, HandBaselineVisible: false, ResultScreenVisible: false);

    private static LifecycleInput ResultScreen() =>
        new(TableVisible: true, HandBaselineVisible: false, ResultScreenVisible: true);
}
