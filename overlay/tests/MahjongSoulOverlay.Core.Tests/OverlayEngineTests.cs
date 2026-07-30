using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Core.River;

namespace MahjongSoulOverlay.Core.Tests;

public sealed class OverlayEngineTests
{
    private static readonly TimeSpan Window = TimeSpan.FromMilliseconds(100);

    [Fact]
    public void Synthetic_trace_renders_discards_confirms_call_and_clears_at_result()
    {
        var trace = new Trace();

        var beforeHand = trace.Push(0, baseline: true);
        var active = trace.Push(1, baseline: true);
        trace.Draw(Seat.Bottom, 10);
        var bottomDiscard = trace.Discard(Seat.Bottom, DiscardKind.Tsumogiri, "bottom-1", 20);
        trace.Draw(Seat.Right, 30);
        var rightDiscard = trace.Discard(Seat.Right, DiscardKind.Tedashi, "right-1", 40);
        var rightId = rightDiscard.Layers.Single(layer => layer.Seat == Seat.Right).TileId;

        var candidateOnly = trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        var removalOnly = trace.Remove(Seat.Bottom, "bottom-1", 60);
        var confirmed = trace.Push(161);
        var result = trace.Push(170, result: true);

        Assert.Empty(beforeHand.Layers);
        Assert.Equal(LifecycleState.HandActive, active.Lifecycle);
        Assert.Equal(DiscardKind.Tsumogiri,
            Assert.Single(bottomDiscard.Layers).Kind);
        Assert.Equal(2, rightDiscard.Layers.Count);
        Assert.Contains(rightDiscard.Layers,
            layer => layer.Seat == Seat.Right && layer.Kind == DiscardKind.Tedashi);
        Assert.DoesNotContain(candidateOnly.Events,
            item => item.Kind == TableEventKind.ChiOrPon);
        Assert.Empty(candidateOnly.CandidateResolutions);
        Assert.DoesNotContain(removalOnly.Events,
            item => item.Kind == TableEventKind.ChiOrPon);

        var resolution = Assert.Single(confirmed.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Confirmed, resolution.Status);
        Assert.Equal(TableEventKind.ChiOrPon, resolution.CandidateKind);
        Assert.Equal(TableEventKind.ChiOrPon, resolution.OutcomeKind);
        Assert.Equal("unique-source-removal", resolution.Reason);
        Assert.Equal(Seat.Bottom, resolution.SourceSeat);
        Assert.NotNull(resolution.SourceTileId);
        Assert.Equal(Seat.Bottom,
            Assert.Single(confirmed.Events,
                item => item.Kind == TableEventKind.ChiOrPon).SourceSeat);
        Assert.Collection(
            confirmed.Events,
            calledDiscard =>
            {
                Assert.Equal(TableEventKind.CalledDiscard, calledDiscard.Kind);
                Assert.Equal(Seat.Bottom, calledDiscard.Actor);
                Assert.Equal(Seat.Right, calledDiscard.SourceSeat);
            },
            call => Assert.Equal(TableEventKind.ChiOrPon, call.Kind));
        Assert.DoesNotContain(confirmed.Layers, layer => layer.Seat == Seat.Bottom);
        Assert.Equal(rightId,
            Assert.Single(confirmed.Layers, layer => layer.Seat == Seat.Right).TileId);

        Assert.Empty(result.Layers);
        Assert.Empty(result.Events);
        Assert.Empty(result.CandidateResolutions);
        Assert.False(result.ShouldHideOverlay);
        Assert.Equal(LifecycleState.SessionReady, result.Lifecycle);
    }

    [Fact]
    public void Removal_before_candidate_confirms_after_component_quiescence()
    {
        var trace = Trace.WithBottomDiscard();

        trace.Remove(Seat.Bottom, "bottom-1", 50);
        trace.Call(Seat.Right, TableEventKind.ChiOrPon, 150);
        Assert.Empty(trace.Push(250).CandidateResolutions);
        var output = trace.Push(251);

        var resolution = Assert.Single(output.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Confirmed, resolution.Status);
        Assert.Equal(Seat.Bottom, resolution.SourceSeat);
        Assert.Single(output.Events, item => item.Kind == TableEventKind.ChiOrPon);
    }

    [Fact]
    public void Evidence_at_inclusive_boundary_is_connected_and_extends_deadline()
    {
        var trace = Trace.WithBottomDiscard();

        trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        trace.Remove(Seat.Bottom, "bottom-1", 150);
        Assert.Empty(trace.Push(250).CandidateResolutions);
        var output = trace.Push(251);

        Assert.Equal(CandidateResolutionStatus.Confirmed,
            Assert.Single(output.CandidateResolutions).Status);
    }

    [Fact]
    public void Same_seat_removal_is_not_source_evidence()
    {
        var trace = Trace.WithDiscards(Seat.Right);

        trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        trace.Remove(Seat.Right, "right-1", 60);
        var output = trace.Push(151);

        var resolution = Assert.Single(output.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Expired, resolution.Status);
        Assert.Null(resolution.SourceTileId);
        Assert.DoesNotContain(output.Events,
            item => item.Kind == TableEventKind.ChiOrPon);
    }

    [Fact]
    public void Equivalent_traces_preserve_candidate_identity_and_audit_timestamps()
    {
        static CandidateResolution Run(out TableEvent formal)
        {
            var trace = Trace.WithBottomDiscard();
            trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
            trace.Remove(Seat.Bottom, "bottom-1", 60);
            var output = trace.Push(161);
            formal = Assert.Single(
                output.Events,
                item => item.Kind == TableEventKind.ChiOrPon);
            return Assert.Single(output.CandidateResolutions);
        }

        var first = Run(out var firstFormal);
        var second = Run(out var secondFormal);

        Assert.NotEqual(Guid.Empty, first.CandidateId);
        Assert.Equal(first.CandidateId, second.CandidateId);
        Assert.Equal(DateTimeOffset.UnixEpoch.AddMilliseconds(161), first.ResolvedAt);
        Assert.Equal(DateTimeOffset.UnixEpoch.AddMilliseconds(50), firstFormal.Timestamp);
        Assert.Equal(firstFormal.Timestamp, secondFormal.Timestamp);
    }

    [Fact]
    public void Evidence_just_outside_window_expires_without_formal_event()
    {
        var trace = Trace.WithBottomDiscard();

        trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        trace.Remove(Seat.Bottom, "bottom-1", 151);

        var resolution = Assert.Single(trace.LastOutput.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Expired, resolution.Status);
        Assert.Equal(TableEventKind.Unknown, resolution.OutcomeKind);
        Assert.Equal("association-window-expired", resolution.Reason);
        Assert.Null(resolution.SourceSeat);
        Assert.Null(resolution.SourceTileId);
        Assert.DoesNotContain(trace.LastOutput.Events,
            item => item.Kind == TableEventKind.ChiOrPon);
    }

    [Fact]
    public void Multiple_eligible_removals_resolve_candidate_as_ambiguous()
    {
        var trace = Trace.WithDiscards(Seat.Bottom, Seat.Top);

        trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        trace.RemoveMany([(Seat.Bottom, "bottom-1"), (Seat.Top, "top-1")], 60);
        var output = trace.Push(161);

        var resolution = Assert.Single(output.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Ambiguous, resolution.Status);
        Assert.Equal(TableEventKind.Unknown, resolution.OutcomeKind);
        Assert.Equal("multiple-eligible-removals", resolution.Reason);
        Assert.Null(resolution.SourceTileId);
        Assert.DoesNotContain(output.Events,
            item => item.Kind == TableEventKind.ChiOrPon);
    }

    [Fact]
    public void Multiple_eligible_candidates_resolve_all_as_ambiguous_deterministically()
    {
        var trace = Trace.WithBottomDiscard();

        trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);
        trace.Call(Seat.Top, TableEventKind.Daiminkan, 55);
        trace.Remove(Seat.Bottom, "bottom-1", 60);
        var output = trace.Push(161);

        Assert.Equal(2, output.CandidateResolutions.Count);
        Assert.All(output.CandidateResolutions, resolution =>
        {
            Assert.Equal(CandidateResolutionStatus.Ambiguous, resolution.Status);
            Assert.Equal(TableEventKind.Unknown, resolution.OutcomeKind);
            Assert.Equal("multiple-eligible-candidates", resolution.Reason);
            Assert.Null(resolution.SourceTileId);
        });
        Assert.Equal(
            [Seat.Right, Seat.Top],
            output.CandidateResolutions.Select(item => item.Actor).ToArray());
        Assert.DoesNotContain(output.Events,
            item => item.Kind is TableEventKind.ChiOrPon or TableEventKind.Daiminkan);
    }

    [Fact]
    public void One_removal_never_confirms_two_candidates_or_reappears_in_diagnostics()
    {
        var trace = Trace.WithBottomDiscard();

        trace.CallMany(
            [(Seat.Right, TableEventKind.ChiOrPon), (Seat.Top, TableEventKind.ChiOrPon)],
            50);
        trace.Remove(Seat.Bottom, "bottom-1", 60);
        var ambiguous = trace.Push(161);
        trace.Call(Seat.Left, TableEventKind.ChiOrPon, 162);
        var expired = trace.Push(263);

        var firstResolutions = ambiguous.CandidateResolutions;
        var later = Assert.Single(expired.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Expired, later.Status);
        Assert.DoesNotContain(firstResolutions,
            resolution => resolution.SourceTileId is not null);
        Assert.Null(later.SourceTileId);
        Assert.Equal(3,
            firstResolutions.Select(item => item.CandidateId)
                .Append(later.CandidateId)
                .Distinct()
                .Count());
    }

    [Fact]
    public void Unknown_classifier_result_is_rejected_and_never_becomes_formal_or_visible()
    {
        var trace = new Trace();
        trace.Activate();

        trace.SetHand(Seat.Left, 2);
        var output = trace.Push(10);

        var resolution = Assert.Single(output.CandidateResolutions);
        Assert.Equal(CandidateResolutionStatus.Rejected, resolution.Status);
        Assert.Equal(TableEventKind.Unknown, resolution.CandidateKind);
        Assert.Equal(TableEventKind.Unknown, resolution.OutcomeKind);
        Assert.Equal("classifier-rejected", resolution.Reason);
        Assert.Null(resolution.SourceSeat);
        Assert.Null(resolution.SourceTileId);
        Assert.Empty(output.Events);
        Assert.Empty(output.Layers);
    }

    [Fact]
    public void Repeated_unstable_observations_do_not_duplicate_a_structural_delta()
    {
        var trace = new Trace();
        trace.Activate();
        trace.SetDrawn(Seat.Bottom, true);

        Assert.Empty(trace.Push(10, observationsStable: false).Events);
        Assert.Empty(trace.Push(20, observationsStable: false).Events);
        var stable = trace.Push(30);

        Assert.Single(stable.Events, item => item.Kind == TableEventKind.Draw);
        Assert.DoesNotContain(stable.CandidateResolutions,
            item => item.Status == CandidateResolutionStatus.Rejected);
    }

    [Fact]
    public void Only_formal_confirmed_kan_is_used_as_same_actor_rinshan_context()
    {
        var local = new Trace();
        local.Activate();
        var ankan = local.Call(Seat.Bottom, TableEventKind.Ankan, 10);
        var rinshan = local.Draw(Seat.Bottom, 20);

        Assert.Single(ankan.Events, item => item.Kind == TableEventKind.Ankan);
        Assert.Single(rinshan.Events, item => item.Kind == TableEventKind.RinshanDraw);

        var pending = Trace.WithBottomDiscard();
        pending.Call(Seat.Right, TableEventKind.Daiminkan, 50);
        var ordinaryDraw = pending.Draw(Seat.Right, 60);

        Assert.Single(ordinaryDraw.Events, item => item.Kind == TableEventKind.Draw);
        Assert.DoesNotContain(ordinaryDraw.Events,
            item => item.Kind == TableEventKind.RinshanDraw);
    }

    [Fact]
    public void Late_daiminkan_confirmation_does_not_rewind_newer_actor_context()
    {
        var trace = Trace.WithBottomDiscard();
        trace.Call(Seat.Right, TableEventKind.Daiminkan, 50);
        var drawBeforeConfirmation = trace.Draw(Seat.Right, 60);
        trace.SetDrawn(Seat.Right, false);
        trace.Remove(Seat.Bottom, "bottom-1", 70);
        var confirmation = trace.Push(171);

        var drawAfterConfirmation = trace.Draw(Seat.Right, 180);

        Assert.Single(drawBeforeConfirmation.Events,
            item => item.Kind == TableEventKind.Draw);
        Assert.Single(confirmation.Events,
            item => item.Kind == TableEventKind.Daiminkan);
        Assert.Single(drawAfterConfirmation.Events,
            item => item.Kind == TableEventKind.Draw);
        Assert.DoesNotContain(drawAfterConfirmation.Events,
            item => item.Kind == TableEventKind.RinshanDraw);
    }

    [Fact]
    public void Confirmed_daiminkan_becomes_rinshan_context_only_after_resolution()
    {
        var trace = Trace.WithBottomDiscard();
        trace.Call(Seat.Right, TableEventKind.Daiminkan, 50);
        trace.Remove(Seat.Bottom, "bottom-1", 60);
        trace.Push(161);

        var draw = trace.Draw(Seat.Right, 170);

        Assert.Single(draw.Events, item => item.Kind == TableEventKind.RinshanDraw);
    }

    [Fact]
    public void Discard_and_hand_reset_clear_kan_context_and_all_per_hand_state()
    {
        var trace = new Trace();
        trace.Activate();
        trace.Call(Seat.Bottom, TableEventKind.Ankan, 10);
        trace.Draw(Seat.Bottom, 20);
        trace.Discard(Seat.Bottom, DiscardKind.Tsumogiri, "bottom-1", 30);
        var ordinaryAfterDiscard = trace.Draw(Seat.Bottom, 40);
        trace.Call(Seat.Right, TableEventKind.ChiOrPon, 50);

        var reset = trace.ManualReset();
        trace.Push(60, baseline: true);
        trace.Call(Seat.Bottom, TableEventKind.Ankan, 70);
        trace.SetDrawn(Seat.Bottom, false);
        trace.Push(80, result: true);
        trace.Push(90, baseline: true);
        var ordinaryAfterResult = trace.Draw(Seat.Bottom, 100);
        var afterOldPendingWouldExpire = trace.Push(200);

        Assert.Single(ordinaryAfterDiscard.Events,
            item => item.Kind == TableEventKind.Draw);
        Assert.Empty(reset.Layers);
        Assert.Empty(reset.Events);
        Assert.Empty(reset.CandidateResolutions);
        Assert.Single(ordinaryAfterResult.Events,
            item => item.Kind == TableEventKind.Draw);
        Assert.Empty(afterOldPendingWouldExpire.CandidateResolutions);
    }

    [Fact]
    public void Outputs_are_immutable_snapshots_unknown_never_renders_and_absence_hides()
    {
        var trace = Trace.WithBottomDiscard();
        var snapshot = trace.LastOutput;
        var originalLayer = Assert.Single(snapshot.Layers);

        Assert.Throws<NotSupportedException>(() =>
            ((IList<OverlayLayer>)snapshot.Layers).Clear());
        Assert.Throws<NotSupportedException>(() =>
            ((IList<TableEvent>)snapshot.Events).Clear());
        Assert.Throws<NotSupportedException>(() =>
            ((IList<CandidateResolution>)snapshot.CandidateResolutions).Clear());

        trace.SetRiver(Seat.Bottom, [Tile("bottom-1", 0.1), Tile("unknown-new", 0.4)]);
        var unknown = trace.Push(30);
        Assert.Single(unknown.Layers);
        Assert.Equal(originalLayer.TileId, Assert.Single(snapshot.Layers).TileId);

        var transientAbsent = trace.Push(40, visible: false);
        Assert.True(transientAbsent.ShouldHideOverlay);
        Assert.Equal(LifecycleState.HandActive, transientAbsent.Lifecycle);
        var detached = trace.Push(50, visible: false);
        Assert.True(detached.ShouldHideOverlay);
        Assert.Empty(detached.Layers);
        Assert.Equal(LifecycleState.Detached, detached.Lifecycle);
    }

    [Fact]
    public void One_discard_does_not_color_multiple_unmatched_river_detections()
    {
        var trace = new Trace();
        trace.Activate();
        trace.SetRiver(Seat.Bottom, [Tile("bottom-a", 0.1)]);
        trace.Push(5);
        trace.Draw(Seat.Bottom, 10);
        trace.SetDrawn(Seat.Bottom, false);
        trace.SetRiver(
            Seat.Bottom,
            [Tile("bottom-a-moved", 0.5), Tile("bottom-b", 0.2)]);

        var output = trace.Push(20);

        Assert.Single(output.Events,
            item => item.Kind == TableEventKind.Tsumogiri);
        Assert.Empty(output.Layers);
    }

    private sealed class Trace
    {
        private readonly Dictionary<Seat, State> _states =
            Enum.GetValues<Seat>().ToDictionary(seat => seat, _ => new State());

        public Trace()
        {
            var aggregators = Enum.GetValues<Seat>().ToDictionary(
                seat => seat,
                _ => new TransactionAggregator(TimeSpan.FromSeconds(5), 1));
            var trackers = Enum.GetValues<Seat>().ToDictionary(
                seat => seat,
                _ => new RiverTracker(0.3));
            Engine = new OverlayEngine(
                new TableLifecycle(1, 1, 2),
                new EventClassifier(),
                Window,
                aggregators,
                trackers);
        }

        public OverlayEngine Engine { get; }

        public EngineOutput LastOutput { get; private set; } =
            new(
                LifecycleState.Detached,
                Array.Empty<OverlayLayer>(),
                Array.Empty<TableEvent>(),
                Array.Empty<CandidateResolution>(),
                ShouldHideOverlay: true);

        public static Trace WithBottomDiscard() => WithDiscards(Seat.Bottom);

        public static Trace WithDiscards(params Seat[] seats)
        {
            var trace = new Trace();
            trace.Activate();
            var timestamp = 10;
            foreach (var seat in seats)
            {
                trace.Draw(seat, timestamp++);
                trace.Discard(
                    seat,
                    DiscardKind.Tsumogiri,
                    $"{seat.ToString().ToLowerInvariant()}-1",
                    timestamp++);
            }

            return trace;
        }

        public void Activate()
        {
            Push(0, baseline: true);
            Push(1, baseline: true);
        }

        public EngineOutput Draw(Seat seat, int milliseconds)
        {
            _states[seat].Drawn = true;
            return Push(milliseconds);
        }

        public EngineOutput Discard(
            Seat seat,
            DiscardKind kind,
            string id,
            int milliseconds)
        {
            var state = _states[seat];
            state.Drawn = false;
            if (kind == DiscardKind.Tedashi)
            {
                state.Slots = state.Slots
                    .Select((occupied, index) => index == 1 ? false : occupied)
                    .Append(true)
                    .ToArray();
            }
            state.River.Add(Tile(id, 0.1 + state.River.Count * 0.1));
            return Push(milliseconds);
        }

        public EngineOutput Call(Seat actor, TableEventKind kind, int milliseconds)
        {
            ApplyCall(_states[actor], kind);
            return Push(milliseconds);
        }

        public EngineOutput CallMany(
            IReadOnlyList<(Seat Seat, TableEventKind Kind)> calls,
            int milliseconds)
        {
            foreach (var call in calls)
                ApplyCall(_states[call.Seat], call.Kind);
            return Push(milliseconds);
        }

        public EngineOutput Remove(Seat seat, string id, int milliseconds)
        {
            _states[seat].River.RemoveAll(tile => tile.DetectionId == id);
            return Push(milliseconds);
        }

        public EngineOutput RemoveMany(
            IReadOnlyList<(Seat Seat, string Id)> removals,
            int milliseconds)
        {
            foreach (var removal in removals)
                _states[removal.Seat].River.RemoveAll(
                    tile => tile.DetectionId == removal.Id);
            return Push(milliseconds);
        }

        public void SetHand(Seat seat, int count) =>
            _states[seat].Slots = Enumerable.Repeat(true, count).ToArray();

        public void SetDrawn(Seat seat, bool occupied) =>
            _states[seat].Drawn = occupied;

        public void SetRiver(Seat seat, IReadOnlyList<DetectedTile> river)
        {
            _states[seat].River.Clear();
            _states[seat].River.AddRange(river);
        }

        public EngineOutput Push(
            int milliseconds,
            bool baseline = false,
            bool result = false,
            bool visible = true,
            bool observationsStable = true)
        {
            var timestamp = DateTimeOffset.UnixEpoch.AddMilliseconds(milliseconds);
            var observations = _states.ToDictionary(
                pair => pair.Key,
                pair => pair.Value.Observe(pair.Key, timestamp, observationsStable));
            LastOutput = Engine.Push(new TableObservation(
                observations,
                visible,
                baseline,
                result,
                timestamp));
            return LastOutput;
        }

        public EngineOutput ManualReset()
        {
            LastOutput = Engine.ManualReset();
            return LastOutput;
        }

        private static void ApplyCall(State state, TableEventKind kind)
        {
            (var handDelta, var groupDelta, var tileDelta) = kind switch
            {
                TableEventKind.ChiOrPon => (-2, 1, 3),
                TableEventKind.Daiminkan => (-3, 1, 4),
                TableEventKind.Ankan => (-4, 1, 4),
                TableEventKind.Kakan => (-1, 0, 1),
                _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
            };
            state.Slots = Enumerable.Repeat(
                true,
                state.Slots.Count(item => item) + handDelta).ToArray();
            state.MeldGroups += groupDelta;
            state.MeldTiles += tileDelta;
        }
    }

    private sealed class State
    {
        public bool[] Slots { get; set; } = Enumerable.Repeat(true, 13).ToArray();

        public bool Drawn { get; set; }

        public int MeldGroups { get; set; }

        public int MeldTiles { get; set; }

        public List<DetectedTile> River { get; } = [];

        public SeatObservation Observe(
            Seat seat,
            DateTimeOffset timestamp,
            bool isStable) =>
            new(
                seat,
                Slots.Count(item => item),
                Slots,
                Drawn,
                MeldGroups,
                MeldTiles,
                River,
                isStable,
                confidence: 1d,
                timestamp);
    }

    private static DetectedTile Tile(string id, double x) =>
        new(
            id,
            new NormalizedQuad(
                new(x, 0.1),
                new(x + 0.04, 0.1),
                new(x + 0.04, 0.16),
                new(x, 0.16)),
            1d);
}
