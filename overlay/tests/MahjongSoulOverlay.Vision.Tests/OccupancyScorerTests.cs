using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Vision.Detection;
using MahjongSoulOverlay.Vision.Frames;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Tests;

public sealed class OccupancyScorerTests
{
    [Fact]
    public void Synthetic_fixture_pngs_are_deterministic_and_have_expected_dimensions()
    {
        using var expectedEmpty = SyntheticFixtureCatalog.CreateEmpty();
        using var expectedOccupied = SyntheticFixtureCatalog.CreateOccupied();
        using var actualEmpty = Cv2.ImRead(FixturePath("synthetic-empty-table.png"));
        using var actualOccupied = Cv2.ImRead(FixturePath("synthetic-occupied-slots.png"));
        using var emptyDifference = new Mat();
        using var occupiedDifference = new Mat();

        Cv2.Absdiff(expectedEmpty, actualEmpty, emptyDifference);
        Cv2.Absdiff(expectedOccupied, actualOccupied, occupiedDifference);

        Assert.Equal(1920, actualEmpty.Width);
        Assert.Equal(1080, actualEmpty.Height);
        Assert.Equal(0, Cv2.CountNonZero(emptyDifference.Reshape(1)));
        Assert.Equal(0, Cv2.CountNonZero(occupiedDifference.Reshape(1)));
    }

    [Theory]
    [InlineData(Seat.Bottom)]
    [InlineData(Seat.Right)]
    [InlineData(Seat.Top)]
    [InlineData(Seat.Left)]
    public void Distinct_seat_regions_score_occupied_above_empty(Seat seat)
    {
        var profile = ProfileLoaderTests.ValidProfile().Seats[seat];
        using var empty = Cv2.ImRead(FixturePath("synthetic-empty-table.png"));
        using var occupied = Cv2.ImRead(FixturePath("synthetic-occupied-slots.png"));

        var emptyScore = OccupancyScorer.Score(empty, profile.MainSlots[0], empty);
        var occupiedScore = OccupancyScorer.Score(occupied, profile.MainSlots[0], empty);

        Assert.True(occupiedScore >= profile.MainHandThresholds.Occupancy,
            $"Expected occupied score {occupiedScore} to meet {profile.MainHandThresholds.Occupancy}.");
        Assert.True(emptyScore < profile.MainHandThresholds.Occupancy,
            $"Expected empty score {emptyScore} below {profile.MainHandThresholds.Occupancy}.");
    }

    [Fact]
    public void Score_is_deterministic()
    {
        var region = ProfileLoaderTests.ValidProfile().Seats[Seat.Bottom].MainSlots[0];
        using var empty = Cv2.ImRead(FixturePath("synthetic-empty-table.png"));
        using var occupied = Cv2.ImRead(FixturePath("synthetic-occupied-slots.png"));

        var first = OccupancyScorer.Score(occupied, region, empty);
        var second = OccupancyScorer.Score(occupied, region, empty);

        Assert.Equal(first, second);
    }

    [Fact]
    public void Score_does_not_mutate_frame_or_baseline()
    {
        var region = ProfileLoaderTests.ValidProfile().Seats[Seat.Right].MainSlots[0];
        using var frame = Cv2.ImRead(FixturePath("synthetic-occupied-slots.png"));
        using var baseline = Cv2.ImRead(FixturePath("synthetic-empty-table.png"));
        using var frameBefore = frame.Clone();
        using var baselineBefore = baseline.Clone();
        using var frameDifference = new Mat();
        using var baselineDifference = new Mat();

        _ = OccupancyScorer.Score(frame, region, baseline);
        Cv2.Absdiff(frame, frameBefore, frameDifference);
        Cv2.Absdiff(baseline, baselineBefore, baselineDifference);

        Assert.Equal(0, Cv2.CountNonZero(frameDifference.Reshape(1)));
        Assert.Equal(0, Cv2.CountNonZero(baselineDifference.Reshape(1)));
    }

    [Fact]
    public void Invalid_or_zero_area_quads_return_zero()
    {
        using var frame = Cv2.ImRead(FixturePath("synthetic-occupied-slots.png"));
        var zeroArea = new NormalizedQuad(
            new(0.1, 0.1), new(0.2, 0.1), new(0.2, 0.1), new(0.1, 0.1));
        var crossed = new NormalizedQuad(
            new(0.1, 0.1), new(0.2, 0.2), new(0.2, 0.1), new(0.1, 0.2));

        Assert.Equal(0d, OccupancyScorer.Score(frame, zeroArea, null));
        Assert.Equal(0d, OccupancyScorer.Score(frame, crossed, null));
    }

    [Fact]
    public void PixelFrame_owns_and_disposes_its_mat()
    {
        var owned = new Mat(3, 5, MatType.CV_8UC4, Scalar.All(1));
        var frame = new PixelFrame(owned);

        Assert.Equal(5, frame.Width);
        Assert.Equal(3, frame.Height);
        Assert.Same(owned, frame.Mat);

        frame.Dispose();
        frame.Dispose();

        Assert.Throws<ObjectDisposedException>(() => frame.Width);
        Assert.Throws<ObjectDisposedException>(() => frame.Mat);
        Assert.True(owned.IsDisposed);
    }

    private static string FixturePath(string name) =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", name);
}

internal static class SyntheticFixtureCatalog
{
    private static readonly (Point[] Polygon, Scalar Outline)[] Slots =
    [
        ([new(403, 896), new(520, 896), new(520, 984), new(403, 984)], new Scalar(25, 74, 55)),
        ([new(1594, 346), new(1710, 338), new(1721, 475), new(1605, 482)], new Scalar(22, 68, 51)),
        ([new(845, 97), new(947, 97), new(947, 164), new(845, 164)], new Scalar(28, 76, 58)),
        ([new(211, 454), new(326, 447), new(338, 584), new(222, 591)], new Scalar(23, 70, 52))
    ];

    public static Mat CreateEmpty()
    {
        var image = new Mat(1080, 1920, MatType.CV_8UC3, new Scalar(45, 112, 76));
        foreach (var (polygon, outline) in Slots)
            Cv2.Polylines(image, [polygon], true, outline, 3, LineTypes.AntiAlias);
        return image;
    }

    public static Mat CreateOccupied()
    {
        var image = CreateEmpty();
        foreach (var (polygon, _) in Slots)
        {
            Cv2.FillConvexPoly(image, polygon, new Scalar(218, 235, 240), LineTypes.AntiAlias);
            Cv2.Polylines(image, [polygon], true, new Scalar(80, 92, 96), 3, LineTypes.AntiAlias);
        }
        return image;
    }
}
