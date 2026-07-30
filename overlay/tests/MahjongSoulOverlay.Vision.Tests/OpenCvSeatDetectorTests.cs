using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Vision.Detection;
using MahjongSoulOverlay.Vision.Frames;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Tests;

public sealed class OpenCvSeatDetectorTests
{
    [Fact]
    public void Detect_uses_each_seat_profile_and_keeps_drawn_slot_independent()
    {
        var profile = CreateProfile();
        using var image = EmptyFrame(profile);
        DrawMain(image, profile.Seats[Seat.Bottom], 3);
        DrawMain(image, profile.Seats[Seat.Right], 2);
        DrawMain(image, profile.Seats[Seat.Top], 1);
        DrawMain(image, profile.Seats[Seat.Left], 2);
        Fill(image, profile.Seats[Seat.Right].DrawnSlot);
        using var frame = new PixelFrame(image);
        using var detector = new OpenCvSeatDetector(profile, stableFramesRequired: 1);

        var observation = detector.Detect(frame, DateTimeOffset.UnixEpoch);

        Assert.Equal(Enum.GetValues<Seat>(), observation.Seats.Keys.ToArray());
        Assert.Equal(new[] { 3, 2, 1, 2 },
            Enum.GetValues<Seat>().Select(seat => observation.Seats[seat].MainHandCount));
        Assert.False(observation.Seats[Seat.Bottom].DrawnSlotOccupied);
        Assert.True(observation.Seats[Seat.Right].DrawnSlotOccupied);
        Assert.False(observation.Seats[Seat.Top].DrawnSlotOccupied);
        Assert.False(observation.Seats[Seat.Left].DrawnSlotOccupied);
        Assert.All(observation.Seats.Values, seat => Assert.Equal(3, seat.MainSlots.Count));
    }

    [Fact]
    public void Detect_recognizes_textureless_tile_back_from_table_color_contrast()
    {
        var profile = CreateProfile();
        using var image = EmptyFrame(profile);
        var slot = profile.Seats[Seat.Top].MainSlots[0];
        var points = Points(slot)
            .Select(point => new Point(
                (int)Math.Round(point.X * image.Width),
                (int)Math.Round(point.Y * image.Height)))
            .ToArray();
        Cv2.FillConvexPoly(image, points, new Scalar(30, 145, 225));
        foreach (var seat in Enum.GetValues<Seat>().Where(seat => seat != Seat.Top))
            DrawMain(image, profile.Seats[seat], 1);
        using var frame = new PixelFrame(image);
        using var detector = new OpenCvSeatDetector(profile, 1);

        var top = detector.Detect(frame, DateTimeOffset.UnixEpoch).Seats[Seat.Top];

        Assert.True(top.MainSlots[0]);
        Assert.Equal(1, top.MainHandCount);
    }

    [Fact]
    public void Detect_preserves_ordered_shortened_hand_topology()
    {
        var profile = CreateProfile();
        using var image = EmptyFrame(profile);
        foreach (var seat in Enum.GetValues<Seat>())
            DrawMain(image, profile.Seats[seat], 1);
        Fill(image, profile.Seats[Seat.Top].MainSlots[2]);
        Fill(image, profile.Seats[Seat.Top].DrawnSlot);
        using var frame = new PixelFrame(image);
        using var detector = new OpenCvSeatDetector(profile, 1);

        var top = detector.Detect(frame, DateTimeOffset.UnixEpoch).Seats[Seat.Top];

        Assert.Equal(new[] { true, false, true }, top.MainSlots);
        Assert.Equal(2, top.MainHandCount);
        Assert.True(top.DrawnSlotOccupied);
    }

    [Fact]
    public void Detect_counts_meld_tiles_and_groups_and_ignores_occupied_overlapping_hand_slots()
    {
        var profile = CreateProfile(overlapBottomMeldAndHand: true);
        using var image = EmptyFrame(profile);
        foreach (var seat in Enum.GetValues<Seat>())
            DrawMain(image, profile.Seats[seat], 1);
        Fill(image, profile.Seats[Seat.Bottom].DrawnSlot);
        DrawTiles(image, profile.Seats[Seat.Left].MeldRegion, columns: 6, groupBreakAfter: 3);
        using var frame = new PixelFrame(image);
        using var detector = new OpenCvSeatDetector(profile, 1);

        var observation = detector.Detect(frame, DateTimeOffset.UnixEpoch);

        Assert.Equal(6, observation.Seats[Seat.Left].MeldTiles);
        Assert.Equal(2, observation.Seats[Seat.Left].MeldGroups);
        Assert.Equal(0, observation.Seats[Seat.Bottom].MeldTiles);
    }

    [Fact]
    public void Detect_returns_normalized_confident_river_quads_in_flow_order()
    {
        var profile = CreateProfile();
        using var image = EmptyFrame(profile);
        foreach (var seat in Enum.GetValues<Seat>())
            DrawMain(image, profile.Seats[seat], 1);
        DrawTiles(image, profile.Seats[Seat.Bottom].RiverRegion, columns: 2);
        using var frame = new PixelFrame(image);
        using var detector = new OpenCvSeatDetector(profile, 1);

        var river = detector.Detect(frame, DateTimeOffset.UnixEpoch)
            .Seats[Seat.Bottom].RiverTiles;

        Assert.Equal(2, river.Count);
        Assert.True(Center(river[0].Quad).X < Center(river[1].Quad).X);
        Assert.All(river, tile =>
        {
            Assert.InRange(tile.Confidence, profile.Seats[Seat.Bottom].MinimumTileConfidence, 1d);
            Assert.All(Points(tile.Quad), point =>
            {
                Assert.InRange(point.X, 0d, 1d);
                Assert.InRange(point.Y, 0d, 1d);
            });
        });
    }

    [Fact]
    public void Detect_separates_edge_connected_tiles_by_their_foreground_interiors()
    {
        var profile = CreateProfile();
        using var image = EmptyFrame(profile);
        foreach (var seat in Enum.GetValues<Seat>())
            DrawMain(image, profile.Seats[seat], 1);
        DrawTiles(
            image, profile.Seats[Seat.Bottom].RiverRegion, columns: 3,
            gap: 0);
        using var frame = new PixelFrame(image);
        using var detector = new OpenCvSeatDetector(profile, 1);

        var river = detector.Detect(frame, DateTimeOffset.UnixEpoch)
            .Seats[Seat.Bottom].RiverTiles;

        Assert.Equal(3, river.Count);
    }

    [Fact]
    public void Detect_finds_tile_rectangles_inside_a_connected_outer_cluster()
    {
        var profile = CreateProfile();
        using var image = EmptyFrame(profile);
        foreach (var seat in Enum.GetValues<Seat>())
            DrawMain(image, profile.Seats[seat], 1);
        DrawTiles(
            image, profile.Seats[Seat.Bottom].RiverRegion, columns: 3,
            gap: 0);
        Cv2.Rectangle(image, new Rect(121, 176, 58, 30), Scalar.Black, 2);
        using var frame = new PixelFrame(image);
        using var detector = new OpenCvSeatDetector(profile, 1);

        var river = detector.Detect(frame, DateTimeOffset.UnixEpoch)
            .Seats[Seat.Bottom].RiverTiles;

        Assert.Equal(3, river.Count);
    }

    [Fact]
    public void Equivalent_frames_become_stable_and_change_or_reset_breaks_stability()
    {
        var profile = CreateProfile();
        using var detector = new OpenCvSeatDetector(profile, 3);
        var observations = new List<TableObservation>();
        for (var index = 0; index < 3; index++)
        {
            using var image = BaselineFrame(profile);
            using var frame = new PixelFrame(image);
            observations.Add(detector.Detect(frame, DateTimeOffset.UnixEpoch.AddMilliseconds(index)));
        }

        Assert.All(observations[0].Seats.Values, value => Assert.False(value.IsStable));
        Assert.All(observations[1].Seats.Values, value => Assert.False(value.IsStable));
        Assert.All(observations[2].Seats.Values, value => Assert.True(value.IsStable));
        Assert.True(observations[2].HandBaselineVisible);

        using (var changedImage = BaselineFrame(profile))
        {
            Fill(changedImage, profile.Seats[Seat.Bottom].DrawnSlot);
            using var changed = new PixelFrame(changedImage);
            Assert.False(detector.Detect(changed, DateTimeOffset.UtcNow)
                .Seats[Seat.Bottom].IsStable);
        }

        detector.ResetBaseline();
        using var resetImage = BaselineFrame(profile);
        using var reset = new PixelFrame(resetImage);
        Assert.All(detector.Detect(reset, DateTimeOffset.UtcNow).Seats.Values,
            value => Assert.False(value.IsStable));
    }

    [Fact]
    public void Lifecycle_requires_all_anchors_and_debounces_result_component()
    {
        var profile = CreateProfile();
        using var detector = new OpenCvSeatDetector(profile, 1);
        using (var baselineImage = BaselineFrame(profile))
        using (var baseline = new PixelFrame(baselineImage))
        {
            var visible = detector.Detect(baseline, DateTimeOffset.UnixEpoch);
            Assert.True(visible.TableStructureVisible);
            Assert.True(visible.HandBaselineVisible);
            Assert.False(visible.ResultScreenVisible);
        }

        using var resultImage = EmptyFrame(profile);
        Cv2.Rectangle(resultImage, new Rect(85, 65, 230, 170), Scalar.White, -1);
        using var firstFrame = new PixelFrame(resultImage.Clone());
        using var secondFrame = new PixelFrame(resultImage);

        var first = detector.Detect(firstFrame, DateTimeOffset.UnixEpoch.AddSeconds(1));
        var second = detector.Detect(secondFrame, DateTimeOffset.UnixEpoch.AddSeconds(2));

        Assert.False(first.TableStructureVisible);
        Assert.False(first.HandBaselineVisible);
        Assert.False(first.ResultScreenVisible);
        Assert.True(second.ResultScreenVisible);
    }

    [Fact]
    public void Detect_validates_frame_ownership_dimensions_and_disposal()
    {
        var profile = CreateProfile();
        using var detector = new OpenCvSeatDetector(profile);
        using (var wrongMat = new Mat(299, 400, MatType.CV_8UC3, Scalar.Black))
        using (var wrong = new PixelFrame(wrongMat))
            Assert.Throws<ArgumentException>(() => detector.Detect(wrong, DateTimeOffset.UtcNow));

        var disposedMat = new Mat(300, 400, MatType.CV_8UC3, Scalar.Black);
        var disposedFrame = new PixelFrame(disposedMat);
        disposedFrame.Dispose();
        Assert.Throws<ObjectDisposedException>(
            () => detector.Detect(disposedFrame, DateTimeOffset.UtcNow));

        detector.Dispose();
        using var validMat = EmptyFrame(profile);
        using var valid = new PixelFrame(validMat);
        Assert.Throws<ObjectDisposedException>(
            () => detector.Detect(valid, DateTimeOffset.UtcNow));
        Assert.False(validMat.IsDisposed);
    }

    private static TableProfile CreateProfile(bool overlapBottomMeldAndHand = false)
    {
        var seats = new Dictionary<Seat, SeatProfile>
        {
            [Seat.Bottom] = SeatProfile(Seat.Bottom,
                [Q(40, 250, 70, 290), Q(72, 250, 102, 290), Q(104, 250, 134, 290)],
                Q(150, 250, 180, 290), Q(120, 175, 210, 225),
                overlapBottomMeldAndHand ? Q(40, 250, 180, 290) : Q(235, 250, 390, 295),
                LayoutDirection.LeftToRight, LayoutDirection.RightToLeft),
            [Seat.Right] = SeatProfile(Seat.Right,
                [Q(355, 220, 390, 245), Q(355, 193, 390, 218), Q(355, 166, 390, 191)],
                Q(355, 135, 390, 160), Q(260, 100, 315, 190), Q(355, 5, 395, 125),
                LayoutDirection.BottomToTop, LayoutDirection.TopToBottom),
            [Seat.Top] = SeatProfile(Seat.Top,
                [Q(225, 10, 255, 45), Q(193, 10, 223, 45), Q(161, 10, 191, 45)],
                Q(125, 10, 155, 45), Q(120, 60, 210, 105), Q(5, 5, 115, 45),
                LayoutDirection.RightToLeft, LayoutDirection.LeftToRight),
            [Seat.Left] = SeatProfile(Seat.Left,
                [Q(10, 55, 45, 80), Q(10, 82, 45, 107), Q(10, 109, 45, 134)],
                Q(10, 140, 45, 165), Q(70, 100, 115, 190), Q(5, 200, 170, 245),
                LayoutDirection.TopToBottom, LayoutDirection.LeftToRight)
        };
        return new TableProfile("detector-tests", 400, 300, 1d, seats);
    }

    private static SeatProfile SeatProfile(
        Seat seat,
        IReadOnlyList<NormalizedQuad> slots,
        NormalizedQuad drawn,
        NormalizedQuad river,
        NormalizedQuad meld,
        LayoutDirection flow,
        LayoutDirection meldFlow)
    {
        var occupied = new RegionThresholds(0.008, 0.01);
        return new SeatProfile(
            seat, Bounding(slots), slots, flow, drawn, river, flow, meld, meldFlow,
            new TileScale(20d / 400d, 28d / 300d),
            0.45, 2.2, -180, 180, 0.45,
            occupied, occupied, occupied, occupied, 0.35);
    }

    private static Mat BaselineFrame(TableProfile profile)
    {
        var image = EmptyFrame(profile);
        foreach (var seat in Enum.GetValues<Seat>())
            DrawMain(image, profile.Seats[seat], 1);
        return image;
    }

    private static Mat EmptyFrame(TableProfile profile) =>
        new(profile.Height, profile.Width, MatType.CV_8UC3, new Scalar(25, 35, 45));

    private static void DrawMain(Mat image, SeatProfile profile, int count)
    {
        foreach (var slot in profile.MainSlots.Take(count))
            Fill(image, slot);
    }

    private static void DrawTiles(
        Mat image,
        NormalizedQuad region,
        int columns,
        int? groupBreakAfter = null,
        int gap = 3)
    {
        var bounds = PixelBounds(region);
        var tileWidth = 18;
        var tileHeight = Math.Min(28, bounds.Height - 4);
        var x = bounds.X + 2;
        for (var index = 0; index < columns; index++)
        {
            if (groupBreakAfter == index)
                x += 16;
            Cv2.Rectangle(image, new Rect(x, bounds.Y + 2, tileWidth, tileHeight),
                Scalar.White, -1);
            Cv2.Rectangle(image, new Rect(x, bounds.Y + 2, tileWidth, tileHeight),
                Scalar.Black, 1);
            x += tileWidth + gap;
        }
    }

    private static void Fill(Mat image, NormalizedQuad quad)
    {
        var points = Points(quad)
            .Select(point => new Point(
                (int)Math.Round(point.X * image.Width),
                (int)Math.Round(point.Y * image.Height)))
            .ToArray();
        Cv2.FillConvexPoly(image, points, Scalar.White);
        Cv2.Polylines(image, [points], true, Scalar.Black, 2);
        var center = new Point(
            (int)points.Average(point => point.X),
            (int)points.Average(point => point.Y));
        Cv2.Line(image, new Point(center.X - 5, center.Y), new Point(center.X + 5, center.Y),
            Scalar.Black, 2);
    }

    private static NormalizedQuad Q(int left, int top, int right, int bottom) =>
        new(new(left / 400d, top / 300d), new(right / 400d, top / 300d),
            new(right / 400d, bottom / 300d), new(left / 400d, bottom / 300d));

    private static NormalizedQuad Bounding(IReadOnlyList<NormalizedQuad> quads)
    {
        var points = quads.SelectMany(Points).ToArray();
        return new NormalizedQuad(
            new(points.Min(p => p.X), points.Min(p => p.Y)),
            new(points.Max(p => p.X), points.Min(p => p.Y)),
            new(points.Max(p => p.X), points.Max(p => p.Y)),
            new(points.Min(p => p.X), points.Max(p => p.Y)));
    }

    private static Rect PixelBounds(NormalizedQuad quad)
    {
        var points = Points(quad).ToArray();
        var left = (int)Math.Round(points.Min(point => point.X) * 400);
        var top = (int)Math.Round(points.Min(point => point.Y) * 300);
        var right = (int)Math.Round(points.Max(point => point.X) * 400);
        var bottom = (int)Math.Round(points.Max(point => point.Y) * 300);
        return new Rect(left, top, right - left, bottom - top);
    }

    private static NormalizedPoint Center(NormalizedQuad quad) =>
        new(Points(quad).Average(point => point.X), Points(quad).Average(point => point.Y));

    private static IEnumerable<NormalizedPoint> Points(NormalizedQuad quad) =>
        [quad.TopLeft, quad.TopRight, quad.BottomRight, quad.BottomLeft];
}
