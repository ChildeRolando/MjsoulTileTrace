namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Fits a one-dimensional projective mapping u(k) = (A*k + B) / (C*k + 1)
/// to observed tile-back instance centre positions.
///
/// Under perspective projection, equal physical spacing on a line produces
/// this rational mapping in image coordinates.  The fit is robust to one
/// missing instance, one extra instance, and one weak/missed boundary.
///
/// Jointly selects the best instance sequence and fits the projective model:
/// over-segmented candidate sets are scored with a combined criterion that
/// penalises implausible instance counts, narrow/wide intervals, and
/// side-face fragments — not just residual.
/// </summary>
public static class ProjectiveTileSequenceFitter
{
    private static readonly ProjectiveSequenceOptions Defaults = new();

    /// <summary>
    /// Jointly selects instances and fits a projective sequence model.
    /// Evaluates multiple candidate sequences and returns the best one.
    /// </summary>
    /// <param name="candidateInstances">All candidate tile instances (may be over-segmented).</param>
    /// <param name="options">Optional config overrides.</param>
    /// <returns>
    /// Tuple of (selected instances, fitted model, selection confidence).
    /// selected instances may be a subset of candidate instances.
    /// </returns>
    public static (IReadOnlyList<BackTileInstance> SelectedInstances,
                  ProjectiveTileSequenceModel? Model)? SelectAndFit(
        IReadOnlyList<BackTileInstance> candidateInstances,
        ProjectiveSequenceOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(candidateInstances);
        var opt = options ?? Defaults;
        int n = candidateInstances.Count;
        if (n < opt.MinInstanceCount) return null;

        // Generate hypotheses: different subsets of instances.
        List<(List<BackTileInstance> Instances, string Label)> hypotheses = [];

        // H0: all instances — ParseTopology will classify terminal extras.
        hypotheses.Add((candidateInstances.ToList(), "all"));

        // H_terminal: try removing first/last if they look like terminal fragments
        // (very low confidence and at the edge).
        if (n > 3)
        {
            double avgConf = candidateInstances.Average(x => x.Confidence);
            // Remove first if it's a weak terminal fragment.
            if (candidateInstances[0].Confidence < avgConf * 0.4)
            {
                var subset = candidateInstances.Skip(1).ToList();
                if (subset.Count >= opt.MinInstanceCount)
                    hypotheses.Add((subset, "remove_first"));
            }
            // Remove last if it's a weak terminal fragment.
            if (candidateInstances[^1].Confidence < avgConf * 0.4)
            {
                var subset = candidateInstances.Take(n - 1).ToList();
                if (subset.Count >= opt.MinInstanceCount)
                    hypotheses.Add((subset, "remove_last"));
            }
        }

        // H_merge: merge adjacent narrow instances.
        if (n > 3)
        {
            double medianWidth = SignalHelpers.Median(
                candidateInstances.Select(i => i.Width).ToList());
            var merged = new List<BackTileInstance>();
            int i = 0;
            while (i < n)
            {
                if (i < n - 1 &&
                    candidateInstances[i].Width < medianWidth * 0.40 &&
                    candidateInstances[i + 1].Width < medianWidth * 0.70)
                {
                    // Merge two narrow adjacent instances.
                    var a = candidateInstances[i];
                    var b = candidateInstances[i + 1];
                    merged.Add(new BackTileInstance(
                        a.ULeft, b.URight, a.Quad,
                        (a.OrangeCoverage + b.OrangeCoverage) * 0.5,
                        a.RidgeSupport && b.RidgeSupport,
                        a.LowerRailSupport && b.LowerRailSupport,
                        (a.Confidence + b.Confidence) * 0.5));
                    i += 2;
                }
                else
                {
                    merged.Add(candidateInstances[i]);
                    i++;
                }
            }
            if (merged.Count != n && merged.Count >= opt.MinInstanceCount)
                hypotheses.Add((merged, "merged"));
        }

        // Evaluate each hypothesis.
        (List<BackTileInstance> Instances, ProjectiveTileSequenceModel Model, double Score)? best = null;

        foreach (var (hypInstances, label) in hypotheses)
        {
            var model = FitInternal(hypInstances, opt);
            if (model is null) continue;

            double score = ScoreSequence(hypInstances, model, opt);
            if (best is null || score > best.Value.Score)
                best = (hypInstances, model, score);
        }

        if (best is null) return null;

        return (best.Value.Instances, best.Value.Model);
    }

    /// <summary>
    /// Scores a sequence of instances with its fitted model.
    /// Higher is better.
    /// </summary>
    private static double ScoreSequence(
        IReadOnlyList<BackTileInstance> instances,
        ProjectiveTileSequenceModel model,
        ProjectiveSequenceOptions opt)
    {
        int n = instances.Count;

        // Model residual component (lower is better, negated).
        double residualScore = 1.0 - Math.Min(1.0, model.Residual / opt.MaxResidual);

        // Instance confidence.
        double avgConf = instances.Average(i => i.Confidence);
        double avgCoverage = instances.Average(i => i.OrangeCoverage);

        // Width plausibility: penalise very narrow or very wide instances.
        double medianWidth = SignalHelpers.Median(instances.Select(i => i.Width).ToList());
        double widthPenalty = 0;
        foreach (var inst in instances)
        {
            double ratio = inst.Width / Math.Max(medianWidth, 0.001);
            if (ratio < 0.35) widthPenalty += 0.5;   // very narrow
            else if (ratio < 0.50) widthPenalty += 0.2;
            else if (ratio > 2.5) widthPenalty += 0.5;  // very wide
            else if (ratio > 1.8) widthPenalty += 0.2;
        }
        widthPenalty = Math.Min(1.0, widthPenalty / Math.Max(1, n));

        // Instance count penalty: encourage plausible counts for full hands.
        // 13 is ideal, but 10-14 is acceptable for partial hands.
        double countScore = n switch
        {
            >= 12 and <= 14 => 1.0,
            >= 10 and <= 11 => 0.7,
            >= 7 and <= 9 => 0.5,
            _ => n > 14 ? Math.Max(0, 1.0 - (n - 14) * 0.3) : 0.3,
        };

        // Combine.
        return residualScore * 0.30 + avgConf * 0.20 + avgCoverage * 0.15 +
               (1.0 - widthPenalty) * 0.20 + countScore * 0.15;
    }

    /// <summary>
    /// Fits a projective sequence model to observed tile instances
    /// (simple fit, without sequence selection).
    /// </summary>
    public static ProjectiveTileSequenceModel? Fit(
        IReadOnlyList<BackTileInstance> instances,
        ProjectiveSequenceOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(instances);
        return FitInternal(instances, options ?? Defaults);
    }

    private static ProjectiveTileSequenceModel? FitInternal(
        IReadOnlyList<BackTileInstance> instances,
        ProjectiveSequenceOptions opt)
    {
        int n = instances.Count;
        if (n < opt.MinInstanceCount) return null;

        // Build (k, u) pairs.
        double[] ks = new double[n];
        double[] us = new double[n];
        for (int i = 0; i < n; i++)
        {
            ks[i] = i;
            us[i] = instances[i].UCenter;
        }

        // ── RANSAC fit ────────────────────────────────────────────
        int bestInliers = 0;
        double bestA = 0, bestB = 0, bestC = 0;
        var rng = new Random(42);

        int maxIter = Math.Min(opt.RansacIterations, n * n * n / 2);
        for (int iter = 0; iter < maxIter; iter++)
        {
            int i1 = rng.Next(n);
            int i2; do { i2 = rng.Next(n); } while (i2 == i1);
            int i3; do { i3 = rng.Next(n); } while (i3 == i1 || i3 == i2);

            if (!Solve3x3(
                    ks[i1], us[i1],
                    ks[i2], us[i2],
                    ks[i3], us[i3],
                    out double a, out double b, out double c))
                continue;

            int inliers = 0;
            for (int j = 0; j < n; j++)
            {
                double pred = (a * ks[j] + b) / (c * ks[j] + 1.0);
                if (Math.Abs(pred - us[j]) <= opt.InlierUTolerance)
                    inliers++;
            }

            if (inliers > bestInliers)
            {
                bestInliers = inliers;
                bestA = a; bestB = b; bestC = c;
            }

            if (bestInliers == n) break;
        }

        if (bestInliers < n * opt.MinInlierFraction ||
            bestInliers < opt.MinInstanceCount)
            return null;

        // ── Refit with inliers only ───────────────────────────────
        List<double> ik = [], iu = [];
        for (int j = 0; j < n; j++)
        {
            double pred = (bestA * ks[j] + bestB) / (bestC * ks[j] + 1.0);
            if (Math.Abs(pred - us[j]) <= opt.InlierUTolerance)
            {
                ik.Add(ks[j]);
                iu.Add(us[j]);
            }
        }

        if (!SolveLeastSquares(ik, iu, out double refA, out double refB, out double refC))
        {
            refA = bestA; refB = bestB; refC = bestC;
        }

        // ── Validate ──────────────────────────────────────────────
        double residual = 0;
        for (int j = 0; j < ik.Count; j++)
        {
            double pred = (refA * ik[j] + refB) / (refC * ik[j] + 1.0);
            residual += Math.Abs(pred - iu[j]);
        }
        residual /= ik.Count;

        if (residual > opt.MaxResidual) return null;

        // Monotonicity check.
        bool monotonic = true;
        for (int k = 0; k < n; k++)
        {
            double denom = refC * k + 1.0;
            double deriv = (refA * denom - (refA * k + refB) * refC) / (denom * denom);
            if (deriv <= 0) { monotonic = false; break; }
        }
        if (!monotonic) return null;

        double inlierFrac = (double)bestInliers / n;
        double residualScore = Math.Max(0, 1.0 - residual / opt.MaxResidual);
        double confidence = Math.Clamp(inlierFrac * 0.6 + residualScore * 0.4, 0, 1);

        return new ProjectiveTileSequenceModel(
            refA, refB, refC, 0,
            residual, monotonic, confidence, ik.Count);
    }

    /// <summary>
    /// Parses topology from (already selected) instances and the fitted model.
    /// Identifies main-hand segments, extra instances, and internal missing tiles.
    /// </summary>
    public static SideHandInstanceTopology? ParseTopology(
        IReadOnlyList<BackTileInstance> instances,
        ProjectiveTileSequenceModel model,
        TemporalTrackerOptions timingOptions)
    {
        ArgumentNullException.ThrowIfNull(instances);
        ArgumentNullException.ThrowIfNull(model);
        if (instances.Count < 1) return null;

        int n = instances.Count;

        // ── Compute gaps between consecutive instances ────────────
        double[] gaps = new double[Math.Max(0, n - 1)];
        for (int i = 0; i < gaps.Length; i++)
            gaps[i] = Math.Max(0, instances[i + 1].ULeft - instances[i].URight);

        // Predict local tile width from the model.
        double[] localWidths = new double[n];
        for (int i = 0; i < n; i++)
            localWidths[i] = model.PredictedWidthAt(i);

        // ── Classify gaps ────────────────────────────────────────
        GapClass[] gapClasses = new GapClass[Math.Max(0, n - 1)];
        for (int i = 0; i < gapClasses.Length; i++)
        {
            double localW = (localWidths[i] + localWidths[Math.Min(i + 1, n - 1)]) * 0.5;

            if (gaps[i] <= localW * timingOptions.NormalGapMaxWidth)
                gapClasses[i] = GapClass.NormalAdjacency;
            else if (gaps[i] <= localW * timingOptions.MissingGapMinWidth + localW * 0.20)
                gapClasses[i] = GapClass.MissingOneTile;
            else if (gaps[i] <= localW * 2.5)
                gapClasses[i] = GapClass.TerminalExtraGap;
            else
                gapClasses[i] = GapClass.InvalidLargeGap;
        }

        // ── Build main segments ──────────────────────────────────
        List<List<BackTileInstance>> segments = [];
        List<BackTileInstance> current = [instances[0]];

        for (int i = 0; i < gapClasses.Length; i++)
        {
            if (gapClasses[i] == GapClass.NormalAdjacency)
            {
                current.Add(instances[i + 1]);
            }
            else
            {
                segments.Add(current);
                current = [instances[i + 1]];
            }
        }
        segments.Add(current);

        // ── Identify main sequence vs extra ──────────────────────
        List<BackTileInstance> mainInstances;
        BackTileInstance? extraInstance = null;
        int? missingOrdinal = null;

        if (segments.Count == 1)
        {
            mainInstances = segments[0];
        }
        else
        {
            // Find the largest contiguous region by merging adjacent segments
            // that are separated by NormalAdjacency or MissingOneTile gaps.
            // Build which gaps are "bridgeable" (normal or missing-one-tile).
            bool[] bridgeable = new bool[Math.Max(0, segments.Count - 1)];
            int segIdx = 0;
            for (int gi = 0; gi < gapClasses.Length; gi++)
            {
                if (gapClasses[gi] != GapClass.NormalAdjacency)
                {
                    // This gap separates two segments.
                    bridgeable[segIdx] = gapClasses[gi] == GapClass.MissingOneTile;
                    segIdx++;
                }
            }

            // Build merged segments list: merge across MissingOneTile gaps.
            List<List<BackTileInstance>> mergedSegments = [];
            List<BackTileInstance> mergeCurrent = new(segments[0]);
            int? firstMissingOrdinalInRun = null;
            int mergeBaseIdx = 0; // index in the original instances

            for (int si = 0; si < segments.Count - 1; si++)
            {
                mergeBaseIdx += segments[si].Count;
                if (bridgeable[si])
                {
                    // MissingOneTile gap: record the missing ordinal.
                    if (firstMissingOrdinalInRun is null)
                        firstMissingOrdinalInRun = mergeBaseIdx;
                    mergeCurrent.AddRange(segments[si + 1]);
                }
                else
                {
                    mergedSegments.Add(mergeCurrent);
                    mergeCurrent = new List<BackTileInstance>(segments[si + 1]);
                    firstMissingOrdinalInRun = null;
                }
            }
            mergedSegments.Add(mergeCurrent);

            // The longest merged segment is the main hand.
            var orderedMerged = mergedSegments
                .OrderByDescending(s => s.Count)
                .ThenByDescending(s => s.Sum(inst => inst.Confidence))
                .ToList();
            mainInstances = orderedMerged[0];

            // Recompute which gap indices fall within the main hand.
            // Find the start/end of the main segment in the original instance list.
            int mainStartInInstances = instances.TakeWhile(
                inst => !ReferenceEquals(inst, mainInstances[0])).Count();
            int mainEndInInstances = mainStartInInstances + mainInstances.Count - 1;

            // Check gaps within the merged main segment for MissingOneTile.
            for (int gi = 0; gi < gapClasses.Length; gi++)
            {
                // gi is the gap between instance gi and gi+1.
                if (gi >= mainStartInInstances && gi < mainEndInInstances &&
                    gapClasses[gi] == GapClass.MissingOneTile)
                {
                    missingOrdinal = gi + 1; // ordinal of the missing tile
                    break;
                }
            }

            // Check for terminal extra instances.
            for (int s = 1; s < orderedMerged.Count; s++)
            {
                var seg = orderedMerged[s];
                if (seg.Count == 1)
                {
                    bool atStart = seg[0].URight < mainInstances[0].ULeft;
                    bool atEnd = seg[0].ULeft > mainInstances[^1].URight;
                    if (atStart || atEnd)
                    {
                        double sep = atStart
                            ? mainInstances[0].ULeft - seg[0].URight
                            : seg[0].ULeft - mainInstances[^1].URight;
                        int nearIdx = atStart ? 0 : mainInstances.Count - 1;
                        double lw = model.PredictedWidthAt(nearIdx);

                        if (sep >= lw * timingOptions.TerminalExtraMinWidth &&
                            sep <= lw * 3.0)
                        {
                            extraInstance = seg[0];
                        }
                    }
                }
            }

            // Also check segments that weren't merged (InvalidLargeGap).
            foreach (var seg in segments)
            {
                if (seg.Count == 1 && !ReferenceEquals(seg[0], extraInstance) &&
                    !mainInstances.Any(i => ReferenceEquals(i, seg[0])))
                {
                    bool atStart = seg[0].URight < mainInstances[0].ULeft;
                    bool atEnd = seg[0].ULeft > mainInstances[^1].URight;
                    if (atStart || atEnd)
                    {
                        double sep = atStart
                            ? mainInstances[0].ULeft - seg[0].URight
                            : seg[0].ULeft - mainInstances[^1].URight;
                        int nearIdx = atStart ? 0 : mainInstances.Count - 1;
                        double lw = model.PredictedWidthAt(nearIdx);
                        if (sep >= lw * timingOptions.TerminalExtraMinWidth &&
                            sep <= lw * 3.0)
                        {
                            extraInstance = seg[0];
                        }
                    }
                }
            }
        }

        double avgInstConf = instances.Count > 0
            ? instances.Average(inst => inst.Confidence)
            : 0;
        double confidence = Math.Clamp(
            model.Confidence * 0.5 + avgInstConf * 0.5, 0, 1);

        return new SideHandInstanceTopology(
            mainInstances, segments, extraInstance, missingOrdinal,
            model, confidence, TopologyStatus.Valid);
    }

    // ── Linear algebra helpers ────────────────────────────────────

    private static bool Solve3x3(
        double k1, double u1,
        double k2, double u2,
        double k3, double u3,
        out double a, out double b, out double c)
    {
        double[,] m = {
            { k1, 1.0, -k1 * u1 },
            { k2, 1.0, -k2 * u2 },
            { k3, 1.0, -k3 * u3 }
        };
        double[] rhs = { u1, u2, u3 };

        if (!SolveLinear3x3(m, rhs, out double[] x))
        {
            a = b = c = 0;
            return false;
        }

        a = x[0]; b = x[1]; c = x[2];

        double maxK = Math.Max(Math.Max(k1, k2), k3);
        for (double k = 0; k <= maxK + 1; k += 1.0)
        {
            if (Math.Abs(c * k + 1.0) < 1e-6)
            {
                a = b = c = 0;
                return false;
            }
        }

        return true;
    }

    private static bool SolveLinear3x3(double[,] m, double[] rhs, out double[] x)
    {
        x = new double[3];

        double det = Determinant3x3(m);
        if (Math.Abs(det) < 1e-12) return false;

        for (int j = 0; j < 3; j++)
        {
            double[,] mj = (double[,])m.Clone();
            for (int i = 0; i < 3; i++)
                mj[i, j] = rhs[i];
            x[j] = Determinant3x3(mj) / det;
        }

        return true;
    }

    private static double Determinant3x3(double[,] m)
    {
        return m[0, 0] * (m[1, 1] * m[2, 2] - m[1, 2] * m[2, 1])
             - m[0, 1] * (m[1, 0] * m[2, 2] - m[1, 2] * m[2, 0])
             + m[0, 2] * (m[1, 0] * m[2, 1] - m[1, 1] * m[2, 0]);
    }

    private static bool SolveLeastSquares(
        List<double> ks, List<double> us,
        out double a, out double b, out double c)
    {
        a = b = c = 0;
        int m = ks.Count;
        if (m < 3) return false;

        double s00 = 0, s01 = 0, s02 = 0, s11 = 0, s12 = 0, s22 = 0;
        double r0 = 0, r1 = 0, r2 = 0;

        for (int i = 0; i < m; i++)
        {
            double ki = ks[i], ui = us[i];
            double col0 = ki;
            double col1 = 1.0;
            double col2 = -ki * ui;

            s00 += col0 * col0;
            s01 += col0 * col1;
            s02 += col0 * col2;
            s11 += col1 * col1;
            s12 += col1 * col2;
            s22 += col2 * col2;

            r0 += col0 * ui;
            r1 += col1 * ui;
            r2 += col2 * ui;
        }

        double[,] ata = {
            { s00, s01, s02 },
            { s01, s11, s12 },
            { s02, s12, s22 }
        };
        double[] atb = { r0, r1, r2 };

        if (!SolveLinear3x3(ata, atb, out double[] x))
            return false;

        a = x[0]; b = x[1]; c = x[2];
        return true;
    }
}
