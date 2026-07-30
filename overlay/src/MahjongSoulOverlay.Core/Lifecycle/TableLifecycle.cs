namespace MahjongSoulOverlay.Core.Lifecycle;

public enum LifecycleState
{
    Detached,
    SessionReady,
    HandActive
}

public enum LifecycleAction
{
    None,
    ClearOverlay,
    HideOverlay
}

public sealed record LifecycleInput(
    bool TableVisible,
    bool HandBaselineVisible,
    bool ResultScreenVisible);

public sealed record LifecycleResult(
    LifecycleState State,
    LifecycleAction Action);

public sealed class TableLifecycle
{
    private readonly int _visibleTableThreshold;
    private readonly int _handBaselineThreshold;
    private readonly int _absentTableThreshold;
    private int _visibleTableCount;
    private int _handBaselineCount;
    private int _absentTableCount;

    public TableLifecycle(
        int visibleTableThreshold = 5,
        int handBaselineThreshold = 3,
        int absentTableThreshold = 10)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(visibleTableThreshold);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(handBaselineThreshold);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(absentTableThreshold);

        _visibleTableThreshold = visibleTableThreshold;
        _handBaselineThreshold = handBaselineThreshold;
        _absentTableThreshold = absentTableThreshold;
    }

    public LifecycleState State { get; private set; } = LifecycleState.Detached;

    public LifecycleResult Push(LifecycleInput input)
    {
        ArgumentNullException.ThrowIfNull(input);

        if (input.ResultScreenVisible)
            return HandleResultScreen();

        if (!input.TableVisible)
            return HandleAbsentTable();

        _absentTableCount = 0;

        if (State == LifecycleState.Detached)
            return HandleVisibleDetachedTable();

        _visibleTableCount = 0;

        if (State == LifecycleState.SessionReady)
            return HandleHandBaseline(input.HandBaselineVisible);

        _handBaselineCount = 0;
        return CurrentResult();
    }

    public LifecycleResult ManualReset()
    {
        ResetCounters();

        if (State == LifecycleState.Detached)
            return CurrentResult();

        State = LifecycleState.SessionReady;
        return CurrentResult(LifecycleAction.ClearOverlay);
    }

    private LifecycleResult HandleResultScreen()
    {
        ResetCounters();

        if (State != LifecycleState.HandActive)
            return CurrentResult();

        State = LifecycleState.SessionReady;
        return CurrentResult(LifecycleAction.ClearOverlay);
    }

    private LifecycleResult HandleAbsentTable()
    {
        _visibleTableCount = 0;
        _handBaselineCount = 0;

        if (State == LifecycleState.Detached)
        {
            _absentTableCount = 0;
            return CurrentResult();
        }

        _absentTableCount = IncrementUpTo(
            _absentTableCount,
            _absentTableThreshold);
        if (_absentTableCount < _absentTableThreshold)
            return CurrentResult();

        State = LifecycleState.Detached;
        ResetCounters();
        return CurrentResult(LifecycleAction.HideOverlay);
    }

    private LifecycleResult HandleVisibleDetachedTable()
    {
        _handBaselineCount = 0;
        _visibleTableCount = IncrementUpTo(
            _visibleTableCount,
            _visibleTableThreshold);
        if (_visibleTableCount < _visibleTableThreshold)
            return CurrentResult();

        State = LifecycleState.SessionReady;
        _visibleTableCount = 0;
        return CurrentResult();
    }

    private LifecycleResult HandleHandBaseline(bool handBaselineVisible)
    {
        if (!handBaselineVisible)
        {
            _handBaselineCount = 0;
            return CurrentResult();
        }

        _handBaselineCount = IncrementUpTo(
            _handBaselineCount,
            _handBaselineThreshold);
        if (_handBaselineCount < _handBaselineThreshold)
            return CurrentResult();

        State = LifecycleState.HandActive;
        _handBaselineCount = 0;
        return CurrentResult();
    }

    private LifecycleResult CurrentResult(
        LifecycleAction action = LifecycleAction.None) =>
        new(State, action);

    private void ResetCounters()
    {
        _visibleTableCount = 0;
        _handBaselineCount = 0;
        _absentTableCount = 0;
    }

    private static int IncrementUpTo(int value, int maximum) =>
        value < maximum ? value + 1 : maximum;
}
