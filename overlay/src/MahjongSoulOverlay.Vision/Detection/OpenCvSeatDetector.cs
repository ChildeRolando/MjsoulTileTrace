using System.Text;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Vision.Frames;
using MahjongSoulOverlay.Vision.Hand;
using MahjongSoulOverlay.Vision.Motion;
using MahjongSoulOverlay.Vision.River;
using OpenCvSharp;

namespace MahjongSoulOverlay.Vision.Detection;

public sealed class OpenCvSeatDetector : IDisposable
{
    private readonly TableProfile _profile;
    private readonly int _stableFramesRequired;
    private readonly Dictionary<Seat, PerSeatState> _seatStates = [];
    private readonly Dictionary<Seat, IReadOnlyList<RiverSlot>> _riverSlots = [];
    private int _resultFrames;
    private bool _disposed;

    public OpenCvSeatDetector(TableProfile profile, int stableFramesRequired = 3)
    {
        ArgumentNullException.ThrowIfNull(profile);
        if (stableFramesRequired <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(stableFramesRequired), "Stable frame count must be positive.");

        var expectedSeats = Enum.GetValues<Seat>();
        if (profile.Seats.Count != expectedSeats.Length ||
            expectedSeats.Any(seat => !profile.Seats.ContainsKey(seat)))
        {
            throw new ArgumentException(
                "A detector profile must contain exactly the four seats.", nameof(profile));
        }

        _profile = profile;
        _stableFramesRequired = stableFramesRequired;

        foreach (var seat in expectedSeats)
        {
            _seatStates[seat] = new PerSeatState();
            _riverSlots[seat] = RiverSlotLayout.Generate(seat, profile.Seats[seat]);
        }
    }

    public TableObservation Detect(PixelFrame frame, DateTimeOffset timestamp)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(frame);
        Mat mat = frame.Mat;
        if (frame.Width != _profile.Width || frame.Height != _profile.Height)
        {
            throw new ArgumentException(
                $"Frame dimensions must be {_profile.Width}x{_profile.Height}.", nameof(frame));
        }

        Scalar tableColor = DominantTableColor(mat);
        double tableBrightness = TableBrightness(tableColor);
        Dictionary<Seat, SeatObservation> seats = new();
        Dictionary<Seat, bool> anchorVisibility = new();

        foreach (Seat seat in Enum.GetValues<Seat>())
        {
            SeatProfile profile = _profile.Seats[seat];
            PerSeatState state = _seatStates[seat];
            IReadOnlyList<RiverSlot> slots = _riverSlots[seat];

            // Anchor visibility (unchanged from before — the main-hand region
            // anchor is a separate concern from the dynamic lattice).
            double anchorScore = SlotScore(mat, profile.MainHandRegion, tableColor);
            anchorVisibility.Add(
                seat, anchorScore >= profile.MainHandThresholds.Stable);

            // ── Hand detection ─────────────────────────────────────────
            // Left / Right use the new side-hand calibration + topology pipeline.
            // Bottom / Top keep the existing lattice-estimator path.
            // Only use the side-hand calibration pipeline when the profile
            // has 13 main slots (1920×1080 production profile).  Test profiles
            // with fewer slots use the lattice estimator for all seats.
            bool isSide = (seat is Seat.Left or Seat.Right)
                && profile.MainSlots.Count == 13;

            int mainHandCount;
            IReadOnlyList<bool> mainSlots;
            bool drawnOccupied;
            NormalizedQuad? dynamicDraw = null;
            double handConfidence;
            bool handAnimating = false;
            MotionSource motionSource = MotionSource.Unknown;
            NormalizedQuad[] occupiedMainAreas;
            int mainSlotCount;
            bool mainSlotRemoved = false;

            if (isSide)
            {
                bool calibrated = state.SideCalibration is not null;
                SideHandTopology? topology = null;

                if (calibrated)
                {
                    // Runtime: sample raw mask with frozen calibration.
                    using Mat? sideRawMask = ExtractSideRawMask(mat, profile, state);
                    if (sideRawMask is not null && state.SideCalibration is { } cal)
                    {
                        topology = SideHandTopologyDetector.Detect(
                            sideRawMask, cal,
                            state.LastTopology, mat.Width, mat.Height);
                        state.LastTopology = topology;
                    }
                }
                else
                {
                    // Try to calibrate from a stable frame.
                    TryCalibrateSideHand(mat, profile, seat, state);
                    calibrated = state.SideCalibration is not null;
                }

                if (calibrated && topology is not null)
                {
                    // F: Unknown → resolve from previous observation.
                    bool[] resolved = new bool[13];
                    for (int i = 0; i < 13; i++)
                    {
                        resolved[i] = topology.MainSlotStates[i] switch
                        {
                            SlotState.Occupied => true,
                            SlotState.Empty => false,
                            SlotState.Unknown => state.PreviousResolvedMainSlots is { } prev
                                && i < prev.Count && prev[i],
                            _ => false
                        };
                    }
                    state.PreviousResolvedMainSlots = resolved;
                    mainHandCount = resolved.Count(b => b);
                    mainSlots = resolved;
                    mainSlotCount = 13;
                    drawnOccupied = topology.DrawPresent;
                    dynamicDraw = topology.DrawQuad;
                    handConfidence = topology.Confidence;
                    occupiedMainAreas = topology.OccupiedMainQuads.ToArray();
                    // Only a confidently Empty slot between two Occupied segments.
                    mainSlotRemoved = topology.InternalHoleIndex is not null;
                }
                else
                {
                    // Not yet calibrated — return unknown for this seat.
                    mainHandCount = 0;
                    mainSlots = Array.Empty<bool>();
                    mainSlotCount = 13;
                    drawnOccupied = false;
                    handConfidence = 0;
                    occupiedMainAreas = [];
                }
            }
            else
            {
                // ── Bottom / Top: existing lattice-based path ──────────
                Mat homography = HandRectifier.GetTransform(profile, mat.Width, mat.Height);
                using Mat handStrip = HandRectifier.Warp(mat, profile);
                HandLatticeEstimate lattice = HandLatticeEstimator.Estimate(handStrip);

                motionSource = state.MotionDetector.Detect(handStrip, lattice);
                state.MotionDetector.StoreFrame(handStrip);

                handAnimating = state.Stability.IsAnimating(handStrip);
                state.Stability.StoreFrame(handStrip);

                if (!handAnimating && lattice.MainTileCount > 0)
                    state.LastStableLattice = lattice;

                HandLatticeEstimate effectiveLattice =
                    handAnimating && state.LastStableLattice is { } ll ? ll : lattice;

                dynamicDraw = DynamicDrawEstimator.EstimateDrawQuad(
                    effectiveLattice, homography, mat.Width, mat.Height,
                    profile.MainTileScale);

                drawnOccupied = effectiveLattice.DrawPresent;
                mainHandCount = effectiveLattice.MainTileCount;
                mainSlots = Enumerable.Repeat(true, effectiveLattice.MainTileCount).ToArray();
                mainSlotCount = effectiveLattice.MainTileCount;
                handConfidence = effectiveLattice.Confidence;

                occupiedMainAreas = profile.MainSlots
                    .Take(Math.Min(effectiveLattice.MainTileCount, profile.MainSlots.Count))
                    .ToArray();
            }

            // --- River detection via fixed logical grid ---
            IReadOnlyList<RiverSlotClassifier.RiverCellObservation> riverObservations =
                DetectRiver(mat, profile, slots, state, tableBrightness);

            List<DetectedTile> riverTiles = [];
            for (int i = 0; i < slots.Count; i++)
            {
                RiverSlotClassifier.RiverCellObservation cell = riverObservations[i];
                bool cellStable = state.Stability.IsCellStable(
                    i, cell.State, _stableFramesRequired);

                if (cellStable &&
                    cell.State is RiverCellState.NormalTile or RiverCellState.RiichiRotatedTile)
                {
                    RiverSlot slot = slots[i];
                    riverTiles.Add(new DetectedTile(
                        slot.LogicalId,
                        slot.Quad,
                        cell.Confidence));
                }
            }

            // --- Meld detection (keep existing approach) ---
            bool fullMainHand = mainHandCount >= 13;
            NormalizedQuad[] excludedMeldAreas = occupiedMainAreas
                .Concat(drawnOccupied && dynamicDraw is { } draw && fullMainHand
                    ? [draw]
                    : [])
                .ToArray();

            var meld = DetectTiles(
                mat, profile, profile.MeldRegion, excludedMeldAreas,
                tableColor, profile.MeldThresholds, profile.MeldTileScale,
                isRiver: false);

            int meldGroups;
            int meldTiles;
            if (meld.Count == 0)
            {
                meldGroups = 0;
                meldTiles = 0;
            }
            else
            {
                int contourGroups = CountGroups(meld, profile, profile.MeldTileScale);
                MeldTopology meldTopology = AnalyzeMeldTopology(
                    mat, profile, excludedMeldAreas, tableColor);
                meldGroups = Math.Max(meldTopology.Groups, contourGroups);
                meldTiles = InferMeldTileCount(
                    meld, profile, meldGroups, meldTopology.Tiles);
            }

            // --- Stability signature (includes 18-bit river occupancy) ---

            // Trigger side-hand recalibration when a meld first appears.
            if (isSide && meldGroups > 0 && state.PreviousMeldGroups == 0)
            {
                state.SideCalibration = null;
                state.SideCalibStableCount = 0;
                state.SideCalibCandidate = null;
                state.LastTopology = null;
                state.PreviousResolvedMainSlots = null;
            }
            state.PreviousMeldGroups = meldGroups;

            string sigMain = isSide
                ? string.Join("", mainSlots.Take(mainSlotCount).Select(b => b ? '1' : '0'))
                : new string('1', mainHandCount);
            string signature = $"{sigMain}|{drawnOccupied}|{meldGroups}|{meldTiles}|" +
                string.Join("", riverObservations.Select(
                    o => o.State is RiverCellState.NormalTile or RiverCellState.RiichiRotatedTile ? '1' : '0'));
            bool isStable = state.Stability.UpdateStability(
                signature, _stableFramesRequired);

            // --- Confidence ---
            double confidence;
            if (isSide)
            {
                double riverConf = riverObservations.Count > 0
                    ? riverObservations.Average(o => o.Confidence)
                    : 1;
                confidence = Math.Clamp(handConfidence * 0.7 + riverConf * 0.3, 0, 1);
            }
            else
            {
                var lattice = new HandLatticeEstimate(mainHandCount, drawnOccupied, 60,
                    Enumerable.Range(0, mainHandCount).Select(i => (double)i * 60).ToArray(),
                    null, 1, 900, 900);
                confidence = ObservationConfidence(
                    lattice, drawnOccupied, profile, riverObservations, meld, tableColor);
            }

            // Side-hand topology always produces 13 aligned slots.
            // Bottom/Top pass through as-is.
            IReadOnlyList<bool> finalMainSlots = mainSlots;

            seats.Add(seat, new SeatObservation(
                seat,
                mainHandCount,
                finalMainSlots,
                drawnOccupied,
                meldGroups,
                meldTiles,
                riverTiles,
                isStable,
                confidence,
                timestamp));
        }

        // --- Lifecycle flags ---
        bool tableVisible = anchorVisibility.Values.All(value => value);
        bool baselineVisible =
            tableVisible &&
            seats.Values.All(seat =>
                seat.MainHandCount > 0 &&
                seat.IsStable &&
                seat.RiverTiles.Count == 0);

        if (!tableVisible && HasLargeCentralForeground(mat))
            _resultFrames++;
        else
            _resultFrames = 0;

        return new TableObservation(
            seats,
            tableVisible,
            baselineVisible,
            _resultFrames >= 2,
            timestamp);
    }

    public void ResetBaseline()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        foreach (PerSeatState state in _seatStates.Values)
        {
            state.Stability.Reset();
            state.Background.Reset();
            state.LastStableLattice = null;
            state.SideCalibration = null;
            state.LastTopology = null;
            state.SideCalibStableCount = 0;
            state.SideCalibCandidate = null;
            state.PreviousMeldGroups = 0;
            state.PreviousResolvedMainSlots = null;
        }
        _resultFrames = 0;
    }

    // ─── Side-hand calibration ────────────────────────────────────────

    private void TryCalibrateSideHand(
        Mat frame, SeatProfile profile, Seat seat, PerSeatState state)
    {
        // Expand coarse ROI.
        int fw = frame.Width, fh = frame.Height;
        Point Px(double x, double y) => new((int)(x * fw), (int)(y * fh));
        Point PxN(NormalizedPoint p) => Px(p.X, p.Y);
        var quad = profile.MainHandRegion;
        var pts = new[] { PxN(quad.TopLeft), PxN(quad.TopRight), PxN(quad.BottomRight), PxN(quad.BottomLeft) };
        Rect cropRect = Cv2.BoundingRect(pts);
        int alongPad = (int)(cropRect.Height * 0.12);
        int crossPad = (int)(cropRect.Width * 0.22);
        cropRect = new Rect(
            Math.Max(0, cropRect.X - crossPad), Math.Max(0, cropRect.Y - alongPad),
            Math.Min(fw - Math.Max(0, cropRect.X - crossPad), cropRect.Width + 2 * crossPad),
            Math.Min(fh - Math.Max(0, cropRect.Y - alongPad), cropRect.Height + 2 * alongPad));
        if (cropRect.Width < 10 || cropRect.Height < 10) return;

        RotateFlags rot = seat == Seat.Right ? RotateFlags.Rotate90Clockwise : RotateFlags.Rotate90Counterclockwise;
        using Mat cropped = new Mat(frame, cropRect);
        using Mat rotated = new Mat();
        Cv2.Rotate(cropped, rotated, rot);

        // Calibrate HSV and extract masks.
        var masker = new SideHandBackMask();
        masker.Calibrate(rotated);
        using Mat rawMask = masker.Extract(rotated);
        if (Cv2.CountNonZero(rawMask) < 500) return;

        using Mat cK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(17, 9));
        using Mat closed = new Mat(); Cv2.MorphologyEx(rawMask, closed, MorphTypes.Close, cK);
        using Mat vK = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(1, 3));
        using Mat cleanMask = new Mat(); Cv2.MorphologyEx(closed, cleanMask, MorphTypes.Open, vK);

        var plane = SideHandPlaneFitter.Fit(rawMask, cleanMask);
        if (plane is null) return;

        var calib = HandSeamDetector.BuildCalibration(
            rotated, rawMask, plane, cropRect, seat, rot, masker,
            profile.DrawnSlot, fw, fh);
        if (calib is null) return;

        // ── C: Multi-frame geometry consensus ────────────────────────
        // Require N consecutive candidates whose seam positions, plane
        // corners, and start/end u agree within small tolerances.
        // Reject any candidate that would change the expected count.

        if (calib.TileCount != 13 || calib.BaselineSlotScores.Any(s => s < 0.30))
        {
            state.SideCalibStableCount = 0;
            state.SideCalibCandidate = null;
            return;
        }

        if (state.SideCalibCandidate is { } pending)
        {
            // Check geometry agreement with the pending candidate.
            const double uTol = 0.012; // ~1% of u-range
            bool seamsAgree = true;
            for (int i = 0; i < 13; i++)
            {
                double du = Math.Abs(calib.MainSlots[i].UStart - pending.MainSlots[i].UStart);
                if (du > uTol) { seamsAgree = false; break; }
            }
            double endDu = Math.Abs(calib.MainSlots[12].UEnd - pending.MainSlots[12].UEnd);
            if (endDu > uTol) seamsAgree = false;

            // Plane corner column positions must agree.
            bool planeAgrees =
                Math.Abs(calib.Plane.ColStart - pending.Plane.ColStart) < 5 &&
                Math.Abs(calib.Plane.ColEnd - pending.Plane.ColEnd) < 5;

            if (seamsAgree && planeAgrees)
            {
                state.SideCalibStableCount++;
            }
            else
            {
                // Geometry changed — restart with the new candidate.
                state.SideCalibStableCount = 1;
                state.SideCalibCandidate = calib;
            }
        }
        else
        {
            state.SideCalibStableCount = 1;
            state.SideCalibCandidate = calib;
        }

        if (state.SideCalibStableCount >= _stableFramesRequired)
        {
            // Commit: use the latest candidate (which agrees with pending).
            state.SideCalibration = calib;
            state.SideCalibCandidate = null;
        }
    }

    private static Mat? ExtractSideRawMask(Mat frame, SeatProfile profile, PerSeatState state)
    {
        if (state.SideCalibration is not { } calib) return null;
        var masker = calib.CreateMaskExtractor();
        Rect cr = calib.CoarseRoi;
        if (cr.X < 0 || cr.Y < 0 || cr.Width <= 0 || cr.Height <= 0) return null;
        using Mat cropped = new Mat(frame, cr);
        Mat rotated = new Mat();
        Cv2.Rotate(cropped, rotated, calib.Rotation);
        Mat rawMask = masker.Extract(rotated);
        rotated.Dispose();
        cropped.Dispose(); // Mat(frame, cr) doesn't own — doesn't need dispose
        return rawMask;
    }

    public void Dispose()
    {
        if (_disposed)
            return;
        _disposed = true;
        foreach (PerSeatState state in _seatStates.Values)
        {
            state.MotionDetector.Dispose();
            state.Stability.Dispose();
            state.Background.Dispose();
        }
        _seatStates.Clear();
        _resultFrames = 0;
    }

    // ─── River detection pipeline ──────────────────────────────────────

    private IReadOnlyList<RiverSlotClassifier.RiverCellObservation> DetectRiver(
        Mat frame,
        SeatProfile profile,
        IReadOnlyList<RiverSlot> slots,
        PerSeatState state,
        double tableBrightness)
    {
        int w = frame.Width;
        int h = frame.Height;

        // Warp each cell.
        Mat[] cellPatches = new Mat[slots.Count];
        try
        {
            for (int i = 0; i < slots.Count; i++)
                cellPatches[i] = RiverRectifier.WarpCell(
                    frame, slots[i].EvidenceQuad, w, h);

            // Capture background when empty, or use per-cell deferred capture.
            if (!state.Background.IsCaptured)
            {
                using Mat fullRiver = RiverRectifier.WarpFullRiver(
                    frame, profile, 180, 60);
                Scalar mean, stddev;
                Cv2.MeanStdDev(fullRiver, out mean, out stddev);
                if (stddev.Val0 < 35.0)
                    state.Background.Capture(cellPatches);
            }

            // Use background diffs when available; otherwise use neutral value.
            IReadOnlyList<double> bgDiffs = state.Background.IsCaptured
                ? state.Background.Differences(cellPatches)
                : Enumerable.Repeat(0.5, slots.Count).ToArray();

            IReadOnlyList<double> motionLevels = state.Stability.MotionLevels(cellPatches);

            state.Stability.StoreCells(cellPatches);

            // Slow background update for cells that look empty.
            state.Background.Update(cellPatches);

            return RiverSlotClassifier.ClassifyAll(
                cellPatches, bgDiffs, motionLevels, tableBrightness);
        }
        finally
        {
            foreach (Mat patch in cellPatches)
                patch?.Dispose();
        }
    }

    // ─── Meld helper methods (mostly preserved from the old implementation) ─

    private static List<TileCandidate> DetectTiles(
        Mat frame,
        SeatProfile profile,
        NormalizedQuad region,
        IReadOnlyList<NormalizedQuad> excluded,
        Scalar tableColor,
        RegionThresholds thresholds,
        TileScale tileScale,
        bool isRiver)
    {
        using Mat grayscale = ToGrayscale(frame);
        using Mat blurred = new();
        using Mat edges = new();
        using Mat mask = Mat.Zeros(frame.Size(), MatType.CV_8UC1).ToMat();
        Cv2.FillConvexPoly(mask, ToPixels(region, frame.Width, frame.Height), Scalar.White);
        if (excluded.Count > 0)
        {
            using Mat exclusionMask = Mat.Zeros(frame.Size(), MatType.CV_8UC1).ToMat();
            foreach (NormalizedQuad quad in excluded)
                Cv2.FillConvexPoly(
                    exclusionMask, ToPixels(quad, frame.Width, frame.Height), Scalar.White);
            using Mat exclusionKernel =
                Cv2.GetStructuringElement(MorphShapes.Rect, new Size(5, 5));
            Cv2.Dilate(exclusionMask, exclusionMask, exclusionKernel);
            Cv2.BitwiseNot(exclusionMask, exclusionMask);
            Cv2.BitwiseAnd(mask, exclusionMask, mask);
        }

        Cv2.GaussianBlur(grayscale, blurred, new Size(3, 3), 0);
        double lowEdgeThreshold = Math.Max(1d, thresholds.Occupancy * 255d);
        double highEdgeThreshold = Math.Max(
            lowEdgeThreshold + 1d, thresholds.Stable * 255d);
        Cv2.Canny(blurred, edges, lowEdgeThreshold, highEdgeThreshold);
        Cv2.BitwiseAnd(edges, mask, edges);
        using Mat kernel = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(2, 2));
        Cv2.MorphologyEx(edges, edges, MorphTypes.Close, kernel);
        Cv2.FindContours(
            edges, out Point[][] contours, out _, RetrievalModes.List,
            ContourApproximationModes.ApproxSimple);

        using Mat foreground = CreateForegroundMask(frame, tableColor, thresholds);
        Cv2.BitwiseAnd(foreground, mask, foreground);
        Cv2.FindContours(
            foreground, out Point[][] foregroundContours, out _,
            RetrievalModes.External,
            ContourApproximationModes.ApproxSimple);

        List<TileCandidate> candidates = [];
        foreach (Point[] contour in contours.Concat(foregroundContours))
        {
            if (contour.Length < 4)
                continue;
            RotatedRect rectangle = Cv2.MinAreaRect(contour);
            if (!TryConfidence(
                    rectangle, profile, tileScale, frame.Width, frame.Height,
                    out double confidence))
                continue;

            Point2f[] points = rectangle.Points();
            NormalizedQuad quad = NormalizeQuad(points, frame.Width, frame.Height);
            NormalizedPoint center = new(
                Math.Clamp(rectangle.Center.X / frame.Width, 0d, 1d),
                Math.Clamp(rectangle.Center.Y / frame.Height, 0d, 1d));
            string idPrefix = isRiver ? "river" : "meld";
            string id = FormattableString.Invariant(
                $"{profile.Seat.ToString().ToLowerInvariant()}-{idPrefix}-{center.X:F4}-{center.Y:F4}");
            candidates.Add(new TileCandidate(
                new DetectedTile(id, quad, confidence), center));
        }

        return Order(
            Deduplicate(candidates, tileScale),
            isRiver ? profile.RiverFlowDirection : profile.MeldExpansionDirection);
    }

    private static MeldTopology AnalyzeMeldTopology(
        Mat frame,
        SeatProfile profile,
        IReadOnlyList<NormalizedQuad> excluded,
        Scalar tableColor)
    {
        RegionThresholds thresholds = profile.MeldThresholds;
        using Mat foreground = CreateForegroundMask(frame, tableColor, thresholds);
        using Mat regionMask = Mat.Zeros(frame.Size(), MatType.CV_8UC1).ToMat();
        Cv2.FillConvexPoly(
            regionMask,
            ToPixels(profile.MeldRegion, frame.Width, frame.Height),
            Scalar.White);
        if (excluded.Count > 0)
        {
            using Mat exclusion = Mat.Zeros(frame.Size(), MatType.CV_8UC1).ToMat();
            foreach (NormalizedQuad quad in excluded)
                Cv2.FillConvexPoly(
                    exclusion, ToPixels(quad, frame.Width, frame.Height), Scalar.White);
            using Mat kernel = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(5, 5));
            Cv2.Dilate(exclusion, exclusion, kernel);
            Cv2.BitwiseNot(exclusion, exclusion);
            Cv2.BitwiseAnd(regionMask, exclusion, regionMask);
        }
        Cv2.BitwiseAnd(foreground, regionMask, foreground);

        Rect bounds = Cv2.BoundingRect(
            ToPixels(profile.MeldRegion, frame.Width, frame.Height));
        bounds = bounds.Intersect(new Rect(0, 0, frame.Width, frame.Height));
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return new MeldTopology(0, 0);

        using Mat roi = new(foreground, bounds);
        bool horizontal =
            profile.MeldExpansionDirection is LayoutDirection.LeftToRight or
                LayoutDirection.RightToLeft;
        int axisLength = horizontal ? roi.Width : roi.Height;
        double expectedAxisSpan = horizontal
            ? profile.MeldTileScale.Width * frame.Width
            : profile.MeldTileScale.Height * frame.Height;
        double expectedPerpendicularSpan = horizontal
            ? profile.MeldTileScale.Height * frame.Height
            : profile.MeldTileScale.Width * frame.Width;
        double minimumProjection = Math.Max(1, expectedPerpendicularSpan * 0.18d);
        bool[] occupied = new bool[axisLength];
        for (int index = 0; index < axisLength; index++)
        {
            using Mat slice = horizontal
                ? new Mat(roi, new Rect(index, 0, 1, roi.Height))
                : new Mat(roi, new Rect(0, index, roi.Width, 1));
            occupied[index] = Cv2.CountNonZero(slice) >= minimumProjection;
        }

        double minimumRun = Math.Max(
            2, expectedAxisSpan * (1d - profile.PerspectiveTolerance) * 0.3d);
        (int Start, int End)[] runs = FindRuns(occupied)
            .Where(run => run.End - run.Start + 1 >= minimumRun)
            .ToArray();
        if (runs.Length == 0)
            return new MeldTopology(0, 0);

        int gapGroups = 1;
        double groupGap = Math.Max(3d, expectedAxisSpan * 0.12d);
        for (int index = 1; index < runs.Length; index++)
        {
            if (runs[index].Start - runs[index - 1].End - 1 > groupGap)
                gapGroups++;
        }
        int groups = Math.Max(gapGroups, (int)Math.Ceiling(runs.Length / 4d));
        return new MeldTopology(groups, runs.Length);
    }

    // ─── Scoring and color helpers ─────────────────────────────────────

    private static double SlotScore(Mat frame, NormalizedQuad region, Scalar tableColor)
    {
        double structural = OccupancyScorer.Score(frame, region, baseline: null);
        Scalar regionColor = MeanColor(frame, region);
        double colorDistance = Math.Sqrt(
            Math.Pow(regionColor.Val0 - tableColor.Val0, 2) +
            Math.Pow(regionColor.Val1 - tableColor.Val1, 2) +
            Math.Pow(regionColor.Val2 - tableColor.Val2, 2)) /
            (255d * Math.Sqrt(3d));
        return Math.Clamp(Math.Max(structural, colorDistance), 0d, 1d);
    }

    private static Scalar DominantTableColor(Mat frame)
    {
        using Mat sampled = new();
        Cv2.Resize(frame, sampled, new Size(64, 36), 0, 0, InterpolationFlags.Area);
        Mat[] channels = Cv2.Split(sampled);
        try
        {
            double[] medians = channels.Take(3).Select(Median).ToArray();
            return new Scalar(
                medians.ElementAtOrDefault(0),
                medians.ElementAtOrDefault(1),
                medians.ElementAtOrDefault(2));
        }
        finally
        {
            foreach (Mat channel in channels)
                channel.Dispose();
        }
    }

    private static double TableBrightness(Scalar tableColor) =>
        (tableColor.Val0 + tableColor.Val1 + tableColor.Val2) / (255d * 3d);

    private static double Median(Mat channel)
    {
        byte[] values = new byte[channel.Rows * channel.Cols];
        channel.GetArray(out values);
        Array.Sort(values);
        return values[values.Length / 2];
    }

    private static Scalar MeanColor(Mat frame, NormalizedQuad region)
    {
        Point[] points = ToPixels(region, frame.Width, frame.Height);
        Rect bounds = Cv2.BoundingRect(points);
        bounds = bounds.Intersect(new Rect(0, 0, frame.Width, frame.Height));
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return Scalar.All(0);

        using Mat roi = new(frame, bounds);
        using Mat mask = Mat.Zeros(bounds.Size, MatType.CV_8UC1).ToMat();
        Point[] localPoints = points
            .Select(point => new Point(point.X - bounds.X, point.Y - bounds.Y))
            .ToArray();
        Cv2.FillConvexPoly(mask, localPoints, Scalar.White);
        return Cv2.Mean(roi, mask);
    }

    // ─── Signature (now includes 18-bit river occupancy) ────────────────

    private static string Signature(
        HandLatticeEstimate lattice,
        bool drawn,
        int meldGroups,
        int meldTiles,
        IReadOnlyList<RiverSlotClassifier.RiverCellObservation> river)
    {
        StringBuilder builder = new(32 + RiverSlotLayout.CellCount);
        builder.Append(lattice.MainTileCount)
            .Append('|').Append(drawn ? '1' : '0')
            .Append('|').Append(meldGroups)
            .Append('|').Append(meldTiles)
            .Append('|');
        for (int i = 0; i < river.Count; i++)
        {
            builder.Append(river[i].State is RiverCellState.NormalTile
                or RiverCellState.RiichiRotatedTile
                ? '1' : '0');
        }
        return builder.ToString();
    }

    // ─── Confidence computation ─────────────────────────────────────────

    private static double ObservationConfidence(
        HandLatticeEstimate lattice,
        bool drawn,
        SeatProfile profile,
        IReadOnlyList<RiverSlotClassifier.RiverCellObservation> river,
        IReadOnlyList<TileCandidate> meld,
        Scalar tableColor)
    {
        List<double> confidences =
        [
            lattice.Confidence,
            lattice.MainTileCount > 0
                ? 1d
                : 0d
        ];

        // River confidence: average confidence of occupied cells,
        // weighted toward confidence of empty cells where appropriate.
        double riverConf = 1d;
        if (river.Count > 0)
        {
            double sum = 0d;
            int occupied = 0;
            foreach (RiverSlotClassifier.RiverCellObservation cell in river)
            {
                sum += cell.Confidence;
                if (cell.State is RiverCellState.NormalTile
                    or RiverCellState.RiichiRotatedTile)
                    occupied++;
            }
            // Blend average confidence with occupancy ratio.
            double avg = sum / river.Count;
            double occupancyRatio = (double)occupied / river.Count;
            riverConf = 0.7d * avg + 0.3d * (1d - Math.Abs(occupancyRatio - 0.5d) * 2d);
        }
        confidences.Add(riverConf);

        foreach (TileCandidate candidate in meld)
            confidences.Add(candidate.Tile.Confidence);

        return Math.Clamp(confidences.Min(), 0d, 1d);
    }

    // ─── Static utility methods ─────────────────────────────────────────

    private static List<TileCandidate> Deduplicate(
        IReadOnlyList<TileCandidate> candidates, TileScale tileScale)
    {
        double minimumSeparation =
            Math.Min(tileScale.Width, tileScale.Height) * 0.35d;
        List<TileCandidate> accepted = [];
        foreach (TileCandidate candidate in candidates
            .OrderByDescending(value => value.Tile.Confidence)
            .ThenBy(value => value.Center.X)
            .ThenBy(value => value.Center.Y))
        {
            bool duplicate = accepted.Any(existing =>
                Math.Sqrt(
                    Math.Pow(existing.Center.X - candidate.Center.X, 2) +
                    Math.Pow(existing.Center.Y - candidate.Center.Y, 2)) <
                minimumSeparation);
            if (!duplicate)
                accepted.Add(candidate);
        }
        return accepted;
    }

    private static bool TryConfidence(
        RotatedRect rectangle,
        SeatProfile profile,
        TileScale tileScale,
        int frameWidth,
        int frameHeight,
        out double confidence)
    {
        confidence = 0d;
        double width = Math.Abs(rectangle.Size.Width);
        double height = Math.Abs(rectangle.Size.Height);
        if (width < 2d || height < 2d)
            return false;

        double aspect = width / height;
        double reciprocal = height / width;
        if (!InRange(aspect, profile.MinimumTileAspect, profile.MaximumTileAspect) &&
            !InRange(reciprocal, profile.MinimumTileAspect, profile.MaximumTileAspect))
            return false;

        double angle = NormalizeAngle(rectangle.Angle);
        double alternate = NormalizeAngle(rectangle.Angle + 90d);
        if (!InRange(angle, profile.MinimumAngle, profile.MaximumAngle) &&
            !InRange(alternate, profile.MinimumAngle, profile.MaximumAngle))
            return false;

        double expectedWidth = tileScale.Width * frameWidth;
        double expectedHeight = tileScale.Height * frameHeight;
        double[] actual = [width, height];
        double[] expected = [expectedWidth, expectedHeight];
        Array.Sort(actual);
        Array.Sort(expected);
        double tolerance = profile.PerspectiveTolerance;
        double firstRatio = actual[0] / expected[0];
        double secondRatio = actual[1] / expected[1];
        if (firstRatio < 1d - tolerance || firstRatio > 1d + tolerance ||
            secondRatio < 1d - tolerance || secondRatio > 1d + tolerance)
            return false;

        double sizeError = (Math.Abs(1d - firstRatio) + Math.Abs(1d - secondRatio)) / 2d;
        confidence = Math.Clamp(1d - sizeError, 0d, 1d);
        return confidence >= profile.MinimumTileConfidence;
    }

    private static int CountGroups(
        IReadOnlyList<TileCandidate> candidates,
        SeatProfile profile,
        TileScale tileScale)
    {
        if (candidates.Count == 0)
            return 0;

        bool horizontal =
            profile.MeldExpansionDirection is LayoutDirection.LeftToRight
                or LayoutDirection.RightToLeft;
        double expectedSpan = horizontal ? tileScale.Width : tileScale.Height;
        double[] orderedValues = candidates
            .Select(candidate => horizontal ? candidate.Center.X : candidate.Center.Y)
            .OrderBy(value => value)
            .ToArray();
        int groups = 1;
        for (int index = 1; index < orderedValues.Length; index++)
        {
            if (orderedValues[index] - orderedValues[index - 1] > expectedSpan * 1.65d)
                groups++;
        }
        return groups;
    }

    private static int InferMeldTileCount(
        IReadOnlyList<TileCandidate> candidates,
        SeatProfile profile,
        int expectedGroups,
        int projectedTiles)
    {
        if (expectedGroups == 0)
            return 0;

        IReadOnlyList<IReadOnlyList<TileCandidate>> groups =
            SegmentMeldCandidates(candidates, profile);
        if (groups.Count == expectedGroups &&
            groups.All(group => group.Count is 3 or 4))
            return groups.Sum(group => group.Count);

        if (projectedTiles >= expectedGroups * 3 &&
            projectedTiles <= expectedGroups * 4)
            return projectedTiles;

        return expectedGroups * 3;
    }

    private static IReadOnlyList<IReadOnlyList<TileCandidate>> SegmentMeldCandidates(
        IReadOnlyList<TileCandidate> candidates, SeatProfile profile)
    {
        if (candidates.Count == 0)
            return [];

        bool horizontal =
            profile.MeldExpansionDirection is LayoutDirection.LeftToRight or
                LayoutDirection.RightToLeft;
        double expectedSpan = horizontal
            ? profile.MeldTileScale.Width
            : profile.MeldTileScale.Height;
        TileCandidate[] ordered = candidates
            .OrderBy(candidate => horizontal ? candidate.Center.X : candidate.Center.Y)
            .ToArray();
        List<IReadOnlyList<TileCandidate>> groups = [];
        List<TileCandidate> current = [ordered[0]];
        for (int index = 1; index < ordered.Length; index++)
        {
            double previous = horizontal
                ? ordered[index - 1].Center.X
                : ordered[index - 1].Center.Y;
            double value = horizontal
                ? ordered[index].Center.X
                : ordered[index].Center.Y;
            if (value - previous > expectedSpan * 1.65d)
            {
                groups.Add(current);
                current = [];
            }
            current.Add(ordered[index]);
        }
        groups.Add(current);
        return groups;
    }

    private static IEnumerable<(int Start, int End)> FindRuns(
        IReadOnlyList<bool> occupied)
    {
        int start = -1;
        for (int index = 0; index < occupied.Count; index++)
        {
            if (occupied[index] && start < 0)
                start = index;
            if (!occupied[index] && start >= 0)
            {
                yield return (start, index - 1);
                start = -1;
            }
        }
        if (start >= 0)
            yield return (start, occupied.Count - 1);
    }

    private static Mat CreateForegroundMask(
        Mat frame, Scalar tableColor, RegionThresholds thresholds)
    {
        using Mat table = new(frame.Size(), frame.Type(), tableColor);
        using Mat difference = new();
        Cv2.Absdiff(frame, table, difference);
        Mat[] channels = Cv2.Split(difference);
        try
        {
            Mat maximumDifference = new();
            Cv2.Max(channels[0], channels[1], maximumDifference);
            if (channels.Length > 2)
                Cv2.Max(maximumDifference, channels[2], maximumDifference);
            Cv2.Threshold(
                maximumDifference,
                maximumDifference,
                thresholds.Occupancy * 255d,
                255,
                ThresholdTypes.Binary);
            return maximumDifference;
        }
        finally
        {
            foreach (Mat channel in channels)
                channel.Dispose();
        }
    }

    private bool HasLargeCentralForeground(Mat frame)
    {
        NormalizedPoint[] riverPoints = _profile.Seats.Values
            .SelectMany(seat => Points(seat.RiverRegion))
            .ToArray();
        int left = (int)Math.Floor(riverPoints.Min(point => point.X) * frame.Width);
        int top = (int)Math.Floor(riverPoints.Min(point => point.Y) * frame.Height);
        int right = (int)Math.Ceiling(riverPoints.Max(point => point.X) * frame.Width);
        int bottom = (int)Math.Ceiling(riverPoints.Max(point => point.Y) * frame.Height);
        Rect bounds = new(
            Math.Clamp(left, 0, frame.Width - 1),
            Math.Clamp(top, 0, frame.Height - 1),
            Math.Clamp(right - left, 1, frame.Width - Math.Clamp(left, 0, frame.Width - 1)),
            Math.Clamp(bottom - top, 1, frame.Height - Math.Clamp(top, 0, frame.Height - 1)));

        using Mat grayscale = ToGrayscale(frame);
        using Mat central = new(grayscale, bounds);
        using Mat binary = new();
        Cv2.Threshold(central, binary, 0, 255, ThresholdTypes.Binary | ThresholdTypes.Otsu);
        Cv2.FindContours(
            binary, out Point[][] contours, out _, RetrievalModes.External,
            ContourApproximationModes.ApproxSimple);
        return contours.Any(contour =>
            Cv2.ContourArea(contour) >= bounds.Width * bounds.Height * 0.35d);
    }

    private static List<TileCandidate> Order(
        IEnumerable<TileCandidate> source, LayoutDirection direction)
    {
        IOrderedEnumerable<TileCandidate> ordered = direction switch
        {
            LayoutDirection.LeftToRight => source.OrderBy(value => value.Center.X)
                .ThenBy(value => value.Center.Y),
            LayoutDirection.RightToLeft => source.OrderByDescending(value => value.Center.X)
                .ThenBy(value => value.Center.Y),
            LayoutDirection.TopToBottom => source.OrderBy(value => value.Center.Y)
                .ThenBy(value => value.Center.X),
            LayoutDirection.BottomToTop => source.OrderByDescending(value => value.Center.Y)
                .ThenBy(value => value.Center.X),
            _ => throw new ArgumentOutOfRangeException(nameof(direction))
        };
        return ordered.ToList();
    }

    private static NormalizedQuad NormalizeQuad(Point2f[] points, int width, int height)
    {
        Point2f[] orderedByY = points.OrderBy(point => point.Y).ThenBy(point => point.X).ToArray();
        Point2f[] top = orderedByY.Take(2).OrderBy(point => point.X).ToArray();
        Point2f[] bottom = orderedByY.Skip(2).OrderBy(point => point.X).ToArray();
        return new NormalizedQuad(
            Normalize(top[0], width, height),
            Normalize(top[1], width, height),
            Normalize(bottom[1], width, height),
            Normalize(bottom[0], width, height));
    }

    private static NormalizedPoint Normalize(Point2f point, int width, int height) =>
        new(
            Math.Clamp(point.X / width, 0d, 1d),
            Math.Clamp(point.Y / height, 0d, 1d));

    private static Point[] ToPixels(NormalizedQuad quad, int width, int height) =>
        Points(quad)
            .Select(point => new Point(
                Math.Clamp((int)Math.Round(point.X * width), 0, width - 1),
                Math.Clamp((int)Math.Round(point.Y * height), 0, height - 1)))
            .ToArray();

    private static IEnumerable<NormalizedPoint> Points(NormalizedQuad quad) =>
        [quad.TopLeft, quad.TopRight, quad.BottomRight, quad.BottomLeft];

    private static Mat ToGrayscale(Mat frame)
    {
        if (frame.Channels() == 1)
            return frame.Clone();
        Mat grayscale = new();
        Cv2.CvtColor(
            frame,
            grayscale,
            frame.Channels() == 4
                ? ColorConversionCodes.BGRA2GRAY
                : ColorConversionCodes.BGR2GRAY);
        return grayscale;
    }

    private static bool InRange(double value, double minimum, double maximum) =>
        value >= minimum && value <= maximum;

    private static double NormalizeAngle(double angle)
    {
        while (angle > 180d)
            angle -= 360d;
        while (angle < -180d)
            angle += 360d;
        return angle;
    }

    // ─── Internal types ─────────────────────────────────────────────────

    private sealed class PerSeatState
    {
        public HandMotionSourceDetector MotionDetector { get; } = new();
        public StabilityGate Stability { get; } = new();
        public RiverBackgroundModel Background { get; } = new();
        public HandLatticeEstimate? LastStableLattice { get; set; }
        // Side-hand calibration + topology (Left/Right only).
        public SideHandCalibration? SideCalibration { get; set; }
        public SideHandTopology? LastTopology { get; set; }
        public int SideCalibStableCount { get; set; }
        // C: pending calibration candidate for geometry consensus.
        public SideHandCalibration? SideCalibCandidate { get; set; }
        public int PreviousMeldGroups { get; set; }
        // F: previous frame's resolved slot occupancy for Unknown resolution.
        public IReadOnlyList<bool>? PreviousResolvedMainSlots { get; set; }
    }

    private sealed record TileCandidate(DetectedTile Tile, NormalizedPoint Center);

    private readonly record struct MeldTopology(int Groups, int Tiles);
}
