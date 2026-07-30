using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Vision.Calibration;
using MahjongSoulOverlay.Vision.Profiles;

namespace MahjongSoulOverlay.Vision.Tests;

public sealed class CalibrationSessionTests
{
    [Fact]
    public void Starts_with_bottom_main_hand_and_fixed_point_order()
    {
        var session = new CalibrationSession(1920, 1080);

        Assert.Equal(Seat.Bottom, session.CurrentTarget!.Seat);
        Assert.Equal(CalibrationRegionKind.MainHandRegion, session.CurrentTarget.RegionKind);
        Assert.Null(session.CurrentTarget.MainSlotIndex);
        Assert.Equal(CalibrationCorner.TopLeft, session.CurrentCorner);
        Assert.Equal(
            [Seat.Bottom, Seat.Right, Seat.Top, Seat.Left],
            session.Targets.Select(target => target.Seat).Distinct());
    }

    [Fact]
    public void Every_seat_uses_regions_and_independent_scale_samples_in_fixed_order()
    {
        var session = new CalibrationSession(1920, 1080);

        foreach (var seat in new[] { Seat.Bottom, Seat.Right, Seat.Top, Seat.Left })
        {
            var targets = session.Targets.Where(target => target.Seat == seat).ToArray();
            Assert.Equal(19, targets.Length);
            Assert.Equal(CalibrationRegionKind.MainHandRegion, targets[0].RegionKind);
            Assert.Equal(
                Enumerable.Range(0, 13),
                targets.Skip(1).Take(13).Select(target => target.MainSlotIndex!.Value));
            Assert.Equal(CalibrationRegionKind.DrawnSlot, targets[14].RegionKind);
            Assert.Equal(CalibrationRegionKind.RiverRegion, targets[15].RegionKind);
            Assert.Equal(CalibrationRegionKind.RiverTileSample, targets[16].RegionKind);
            Assert.Equal(CalibrationRegionKind.MeldRegion, targets[17].RegionKind);
            Assert.Equal(CalibrationRegionKind.MeldTileSample, targets[18].RegionKind);
        }
    }

    [Fact]
    public void Canvas_transform_letterboxes_and_maps_points_in_both_directions()
    {
        var transform = CalibrationCanvasTransform.Fit(
            imageWidth: 1920,
            imageHeight: 1080,
            viewportWidth: 1000,
            viewportHeight: 1000);

        Assert.Equal(0d, transform.Left, precision: 8);
        Assert.Equal(218.75d, transform.Top, precision: 8);
        Assert.Equal(1000d, transform.Width, precision: 8);
        Assert.Equal(562.5d, transform.Height, precision: 8);
        Assert.Equal(
            new CalibrationPoint(960, 540),
            transform.ToImage(500, 500));
        Assert.Equal(
            new CalibrationPoint(500, 500),
            transform.ToViewport(960, 540));
        Assert.False(transform.ContainsViewportPoint(500, 100));
        Assert.True(transform.ContainsViewportPoint(500, 500));
    }

    [Fact]
    public void Exactly_four_points_complete_a_quad_and_advance_to_first_main_slot()
    {
        var session = new CalibrationSession(1920, 1080);

        AddQuad(session, 100, 100);

        var completed = Assert.Single(session.CompletedQuads);
        Assert.Equal(CalibrationRegionKind.MainHandRegion, completed.Target.RegionKind);
        Assert.Equal(CalibrationRegionKind.MainSlot, session.CurrentTarget!.RegionKind);
        Assert.Equal(0, session.CurrentTarget.MainSlotIndex);
        Assert.Equal(CalibrationCorner.TopLeft, session.CurrentCorner);
        Assert.Empty(session.CurrentPoints);
    }

    [Fact]
    public void Undo_after_completed_quad_reopens_it_at_the_last_corner()
    {
        var session = new CalibrationSession(1920, 1080);
        AddQuad(session, 100, 100);

        Assert.True(session.UndoLastPoint());

        Assert.Equal(CalibrationRegionKind.MainHandRegion, session.CurrentTarget!.RegionKind);
        Assert.Equal(CalibrationCorner.BottomLeft, session.CurrentCorner);
        Assert.Equal(3, session.CurrentPoints.Count);
        Assert.Empty(session.CompletedQuads);
    }

    [Fact]
    public void Reset_current_seat_removes_only_that_seats_work()
    {
        var session = new CalibrationSession(1920, 1080);
        CompleteSeat(session, Seat.Bottom);
        AddQuad(session, 300, 100);

        session.ResetCurrentSeat();

        Assert.Equal(Seat.Right, session.CurrentTarget!.Seat);
        Assert.Equal(CalibrationRegionKind.MainHandRegion, session.CurrentTarget.RegionKind);
        Assert.All(session.CompletedQuads, quad => Assert.Equal(Seat.Bottom, quad.Target.Seat));
        Assert.Empty(session.CurrentPoints);
    }

    [Fact]
    public void Build_and_save_refuse_an_incomplete_calibration()
    {
        var session = new CalibrationSession(1920, 1080);
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.json");

        Assert.Throws<InvalidOperationException>(() => session.BuildProfile("test"));
        Assert.Throws<InvalidOperationException>(() => session.SaveAndReload(path, "test"));
        Assert.False(File.Exists(path));
    }

    [Fact]
    public void Points_are_normalized_by_the_source_image_dimensions()
    {
        var session = new CalibrationSession(1920, 1080);
        session.AddPoint(192, 108);
        session.AddPoint(384, 108);
        session.AddPoint(384, 216);
        session.AddPoint(192, 216);

        var quad = Assert.Single(session.CompletedQuads).Quad;

        Assert.Equal(new NormalizedPoint(0.1, 0.1), quad.TopLeft);
        Assert.Equal(new NormalizedPoint(0.2, 0.1), quad.TopRight);
        Assert.Equal(new NormalizedPoint(0.2, 0.2), quad.BottomRight);
        Assert.Equal(new NormalizedPoint(0.1, 0.2), quad.BottomLeft);
    }

    [Fact]
    public void Completed_calibration_round_trips_current_profile_and_render_geometry()
    {
        var session = new CalibrationSession(1920, 1080);
        CompleteAll(session);
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.json");

        try
        {
            var reloaded = session.SaveAndReload(path, "calibration-test");
            var secondReload = ProfileLoader.LoadJson(ProfileLoader.Serialize(reloaded));

            Assert.True(session.IsComplete);
            Assert.Null(session.CurrentTarget);
            Assert.Equal(4, secondReload.Seats.Count);
            Assert.All(secondReload.Seats.Values, seat => Assert.Equal(13, seat.MainSlots.Count));
            Assert.Equal(
                session.CompletedQuads
                    .Where(item => !IsScaleSample(item.Target))
                    .Select(item => item.Quad),
                CalibrationProfileGeometry.Enumerate(secondReload).Select(item => item.Quad));
            Assert.Equal(
                session.CompletedQuads
                    .Where(item => !IsScaleSample(item.Target))
                    .Select(item => item.Target),
                CalibrationProfileGeometry.Enumerate(secondReload).Select(item => item.Target));
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void Built_profile_uses_independent_main_river_and_meld_tile_scales()
    {
        var session = new CalibrationSession(1920, 1080);
        CompleteAll(session);

        var seat = session.BuildProfile("scales").Seats[Seat.Bottom];

        AssertScale(seat.MainTileScale, 10d / 1920d, 10d / 1080d);
        AssertScale(seat.RiverTileScale, 20d / 1920d, 30d / 1080d);
        AssertScale(seat.MeldTileScale, 30d / 1920d, 40d / 1080d);
    }

    [Fact]
    public void Built_profile_uses_seat_specific_opposing_meld_expansion_directions()
    {
        var session = new CalibrationSession(1920, 1080);
        CompleteAll(session);

        var profile = session.BuildProfile("directions");

        Assert.Equal(LayoutDirection.RightToLeft,
            profile.Seats[Seat.Bottom].MeldExpansionDirection);
        Assert.Equal(LayoutDirection.TopToBottom,
            profile.Seats[Seat.Right].MeldExpansionDirection);
        Assert.Equal(LayoutDirection.LeftToRight,
            profile.Seats[Seat.Top].MeldExpansionDirection);
        Assert.Equal(LayoutDirection.BottomToTop,
            profile.Seats[Seat.Left].MeldExpansionDirection);
    }

    [Fact]
    public void Rejects_points_outside_the_image_and_non_convex_quads()
    {
        var session = new CalibrationSession(1920, 1080);

        Assert.Throws<ArgumentOutOfRangeException>(() => session.AddPoint(-1, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => session.AddPoint(0, 1081));

        session.AddPoint(100, 100);
        session.AddPoint(200, 200);
        session.AddPoint(100, 200);

        Assert.Throws<ArgumentException>(() => session.AddPoint(200, 100));
        Assert.Equal(3, session.CurrentPoints.Count);
    }

    private static void CompleteAll(CalibrationSession session)
    {
        var sequence = 0;
        while (!session.IsComplete)
        {
            var seatOffset = (int)session.CurrentTarget!.Seat * 350;
            var regionOffset = sequence++ * 2;
            var (width, height) = session.CurrentTarget.RegionKind switch
            {
                CalibrationRegionKind.RiverTileSample => (20d, 30d),
                CalibrationRegionKind.MeldTileSample => (30d, 40d),
                _ => (10d, 10d)
            };
            AddQuad(
                session,
                50 + seatOffset + regionOffset,
                50 + regionOffset,
                width,
                height);
        }
    }

    private static void CompleteSeat(CalibrationSession session, Seat seat)
    {
        var sequence = 0;
        while (session.CurrentTarget?.Seat == seat)
            AddQuad(session, 50 + ((int)seat * 350) + sequence++, 50 + sequence);
    }

    private static bool IsScaleSample(CalibrationTarget target) =>
        target.RegionKind is CalibrationRegionKind.RiverTileSample or
            CalibrationRegionKind.MeldTileSample;

    private static void AssertScale(TileScale actual, double width, double height)
    {
        Assert.Equal(width, actual.Width, precision: 12);
        Assert.Equal(height, actual.Height, precision: 12);
    }

    private static void AddQuad(
        CalibrationSession session,
        double left,
        double top,
        double width = 10,
        double height = 10)
    {
        session.AddPoint(left, top);
        session.AddPoint(left + width, top);
        session.AddPoint(left + width, top + height);
        session.AddPoint(left, top + height);
    }
}
