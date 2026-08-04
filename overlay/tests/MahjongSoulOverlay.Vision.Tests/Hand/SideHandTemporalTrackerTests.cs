using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Vision.Hand;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Tests.Hand;

/// <summary>
/// Temporal-tracker tests.  These lock in the deal-animation rebase behaviour:
/// an ordinal explosion (stale ordinals from sliding tile backs) must be
/// rebased so stable frames report the full hand, while a genuine single-tile
/// removal (tedashi) must still report a confirmed-missing hole.
/// </summary>
public sealed class SideHandTemporalTrackerTests
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.UnixEpoch;

    private static BackTileInstance Tile(double uLeft, double uRight, double conf = 0.9) =>
        new(uLeft, uRight,
            new NormalizedQuad(new(0, 0), new(0, 0), new(0, 0), new(0, 0)),
            1.0, true, true, conf);

    private static SideHandInstanceTopology Topology(
        IReadOnlyList<BackTileInstance> main,
        BackTileInstance? extra = null,
        int? missing = null,
        double conf = 0.95) =>
        new(main, [main], extra, missing, null, conf, TopologyStatus.Valid);

    [Fact]
    public void Ordinal_explosion_from_sliding_tiles_is_rebased_to_stable_hand()
    {
        var tracker = new SideHandTemporalTracker();

        // Simulate the deal: a sliding hand produces many transient positions,
        // which the tracker accumulates as stale ordinals.
        var t = T0.AddSeconds(1);
        var sliding = new[]
        {
            Tile(0.05, 0.15), Tile(0.15, 0.25), Tile(0.25, 0.35),
            Tile(0.35, 0.45), Tile(0.45, 0.55), Tile(0.55, 0.65),
        };
        // Several animation frames with drifting positions.
        for (int i = 0; i < 5; i++)
        {
            var shifted = sliding
                .Select(inst => Tile(inst.ULeft + 0.01 * i, inst.URight + 0.01 * i))
                .ToArray();
            tracker.Update(Topology(shifted), t.AddMilliseconds(i * 50), motionScore: 0.0);
        }

        // Now a clean, stable 13-tile hand appears.
        var stable = Enumerable.Range(0, 13)
            .Select(k => Tile(0.03 + k * 0.07, 0.10 + k * 0.07))
            .ToArray();

        // The first stable frame should trigger the rebase (stale ordinals ≫ 13),
        // returning the full 13-instance hand with no confirmed missing.
        var result = tracker.Update(Topology(stable), t.AddSeconds(1), motionScore: 0.0);

        Assert.Equal(13, result.OrderedMainInstances.Count);
        Assert.Null(result.MissingMainOrdinal);
        Assert.False(result.TedashiEvidence);
        Assert.Equal(0.95, result.Confidence);
    }

    [Fact]
    public void Genuine_single_removal_still_reports_confirmed_missing_hole()
    {
        var tracker = new SideHandTemporalTracker();
        var t = T0.AddSeconds(1);

        // Establish a stable 13-tile hand.
        var full = Enumerable.Range(0, 13)
            .Select(k => Tile(0.03 + k * 0.07, 0.10 + k * 0.07))
            .ToArray();
        tracker.Update(Topology(full), t, motionScore: 0.0);
        tracker.Update(Topology(full), t.AddMilliseconds(100), motionScore: 0.0);

        // Tile 6 is removed (tedashi): the hand now has 12 tiles.
        var afterRemoval = full.Where((_, i) => i != 6).ToArray();
        tracker.Update(Topology(afterRemoval), t.AddMilliseconds(200), motionScore: 0.0);
        tracker.Update(Topology(afterRemoval), t.AddMilliseconds(600), motionScore: 0.0);

        // Confirmed missing ordinal must be reported (main slot removed).
        var result = tracker.Update(
            Topology(afterRemoval, missing: 6), t.AddMilliseconds(700), motionScore: 0.0);

        Assert.Equal(6, result.MissingMainOrdinal);
        Assert.Equal(12, result.OrderedMainInstances.Count);
    }
}
