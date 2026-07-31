using MahjongSoulOverlay.Core.Domain;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>Which end of the hand the drawn tile sits on.</summary>
public enum SideHandEnd { NearStart, FarEnd, Unknown }

/// <summary>Single main-hand slot geometry within the rotated ROI.</summary>
public sealed record SideHandSlotGeometry(
    double UStart, double UEnd,
    Point2f TopStart, Point2f TopEnd,
    Point2f BottomStart, Point2f BottomEnd);

/// <summary>
/// Immutable calibration for one side-hand (Left / Right).
/// Acquired from several consecutive high-confidence baseline frames
/// and frozen for the remainder of the hand.
/// </summary>
public sealed record SideHandCalibration
{
    public Seat Seat { get; }
    public Rect CoarseRoi { get; }
    public RotateFlags Rotation { get; }
    public SideHandPlaneFitter.PlaneFitResult Plane { get; }
    public int HueMin { get; }
    public int HueMax { get; }
    public int SaturationMin { get; }
    public int SaturationMax { get; }
    public int ValueMin { get; }
    public int ValueMax { get; }
    public double OuterStartU { get; }
    public double PitchU { get; }
    public IReadOnlyList<SideHandSlotGeometry> MainSlots { get; }
    public SideHandEnd DrawSide { get; }
    public double Confidence { get; }

    public int TileCount => MainSlots.Count;

    public SideHandCalibration(
        Seat seat,
        Rect coarseRoi,
        RotateFlags rotation,
        SideHandPlaneFitter.PlaneFitResult plane,
        int hMin, int hMax, int sMin, int sMax, int vMin, int vMax,
        double outerStartU,
        double pitchU,
        IReadOnlyList<SideHandSlotGeometry> mainSlots,
        SideHandEnd drawSide,
        double confidence)
    {
        if (seat is not (Seat.Left or Seat.Right))
            throw new ArgumentException("SideHandCalibration only supports Left and Right.", nameof(seat));
        // After calls the hand shortens: chi→10, pon→11, closed-kan→9,
        // open-kan→10, add-a-kan→12, initial→13.  Accept 9–13 so seam-detection
        // jitter (e.g. 8 seams from a 10-tile hand) doesn't reject calibration.
        if (mainSlots.Count is < 9 or > 13)
            throw new ArgumentException(
                $"Calibration requires 9–13 main slots, got {mainSlots.Count}.", nameof(mainSlots));
        if (confidence is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(confidence));

        Seat = seat;
        CoarseRoi = coarseRoi;
        Rotation = rotation;
        Plane = plane;
        HueMin = hMin; HueMax = hMax;
        SaturationMin = sMin; SaturationMax = sMax;
        ValueMin = vMin; ValueMax = vMax;
        OuterStartU = outerStartU;
        PitchU = pitchU;
        MainSlots = mainSlots;
        DrawSide = drawSide;
        Confidence = confidence;
    }

    /// <summary>
    /// Produces a mask extractor with frozen HSV thresholds.
    /// </summary>
    public SideHandBackMask CreateMaskExtractor()
    {
        return new SideHandBackMask
        {
            HueMin = HueMin, HueMax = HueMax,
            SaturationMin = SaturationMin, SaturationMax = SaturationMax,
            ValueMin = ValueMin, ValueMax = ValueMax,
            IsCalibrated = true
        };
    }
}
