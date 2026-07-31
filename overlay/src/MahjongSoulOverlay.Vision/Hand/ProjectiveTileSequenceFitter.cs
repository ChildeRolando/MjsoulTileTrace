namespace MahjongSoulOverlay.Vision.Hand;

/// <summary>
/// Fits a one-dimensional projective mapping u(k) = (A*k + B) / (C*k + 1)
/// to observed tile-back instance centre positions.
///
/// Under perspective projection, equal physical spacing on a line produces
/// this rational mapping in image coordinates.  The fit is robust to one
/// missing instance, one extra instance, and one weak/missed boundary.
/// </summary>
public static class ProjectiveTileSequenceFitter
{
    private static readonly ProjectiveSequenceOptions Defaults = new();

    /// <summary>
    /// Fits a projective sequence model to observed tile instances.
    /// </summary>
    /// <param name="instances">Ordered tile instances (left→right).</param>
    /// <param name="options">Optional config overrides.</param>
    /// <returns>Fitted model, or null if fit fails.</returns>
    public static ProjectiveTileSequenceModel? Fit(
        IReadOnlyList<BackTileInstance> instances,
        ProjectiveSequenceOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(instances);

        var opt = options ?? Defaults;
        int n = instances.Count;
        if (n < opt.MinInstanceCount)
            return null;

        // Build (k, u) pairs.
        double[] ks = new double[n];
        double[] us = new double[n];
        for (int i = 0; i < n; i++)
        {
            ks[i] = i;           // zero-based ordinal
            us[i] = instances[i].UCenter;
        }

        // ── RANSAC fit ────────────────────────────────────────────
        int bestInliers = 0;
        double bestA = 0, bestB = 0, bestC = 0;
        var rng = new Random(42);

        int maxIter = Math.Min(opt.RansacIterations, n * n * n / 2);
        for (int iter = 0; iter < maxIter; iter++)
        {
            // Pick 3 distinct points.
            int i1 = rng.Next(n);
            int i2; do { i2 = rng.Next(n); } while (i2 == i1);
            int i3; do { i3 = rng.Next(n); } while (i3 == i1 || i3 == i2);

            // Solve 3x3 linear system: A*k + B - C*k*u = u
            if (!Solve3x3(
                    ks[i1], us[i1],
                    ks[i2], us[i2],
                    ks[i3], us[i3],
                    out double a, out double b, out double c))
                continue;

            // Count inliers.
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

            // Early exit if all points are inliers.
            if (bestInliers == n)
                break;
        }

        if (bestInliers < n * opt.MinInlierFraction ||
            bestInliers < opt.MinInstanceCount)
            return null;

        // ── Refit with inliers only ───────────────────────────────
        // Build overdetermined system for inliers.
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

        if (residual > opt.MaxResidual)
            return null;

        // Check monotonicity: du/dk > 0 for all k in [0, n-1].
        bool monotonic = true;
        for (int k = 0; k < n; k++)
        {
            double denom = refC * k + 1.0;
            double deriv = (refA * denom - (refA * k + refB) * refC) / (denom * denom);
            if (deriv <= 0) { monotonic = false; break; }
        }

        if (!monotonic)
            return null;

        // Confidence: based on inlier fraction and residual.
        double inlierFrac = (double)bestInliers / n;
        double residualScore = Math.Max(0, 1.0 - residual / opt.MaxResidual);
        double confidence = Math.Clamp(inlierFrac * 0.6 + residualScore * 0.4, 0, 1);

        return new ProjectiveTileSequenceModel(
            refA, refB, refC, 0, // K0 = 0 (first detected is ordinal 0)
            residual, monotonic, confidence, ik.Count);
    }

    /// <summary>
    /// Parses topology from detected instances and the fitted projective model.
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
        // Gap = space between instance[i].URight and instance[i+1].ULeft.
        double[] gaps = new double[n - 1];
        for (int i = 0; i < n - 1; i++)
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
        // The longest segment is the main sequence.
        // An isolated segment at a terminal end is the extra.
        List<BackTileInstance> mainInstances;
        BackTileInstance? extraInstance = null;
        int? missingOrdinal = null;

        if (segments.Count == 1)
        {
            mainInstances = segments[0];
        }
        else
        {
            // Longest segment is main.
            var ordered = segments
                .OrderByDescending(s => s.Count)
                .ThenByDescending(s => s.Sum(inst => inst.Confidence))
                .ToList();
            var mainSeg = ordered[0];
            mainInstances = mainSeg;

            // Check for extra at end.
            for (int s = 1; s < ordered.Count; s++)
            {
                var seg = ordered[s];
                if (seg.Count == 1)
                {
                    // Is it at a terminal end?
                    bool atStart = seg[0].URight < mainInstances[0].ULeft;
                    bool atEnd = seg[0].ULeft > mainInstances[^1].URight;
                    if (atStart || atEnd)
                    {
                        // Check separation from nearest main.
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

            // Check for internal missing tile between two main segments.
            if (segments.Count >= 2)
            {
                // Find the gap between the two main segments.
                // If there's exactly one missing ordinal, note it.
                int mainSegEnd = -1;
                foreach (var seg in segments)
                {
                    if (mainSegEnd >= 0)
                    {
                        // This is a second segment after a gap.
                        // The missing ordinal is mainSegEnd + 1.
                        int gapIdx = mainSegEnd;
                        if (gapIdx < gapClasses.Length &&
                            gapClasses[gapIdx] == GapClass.MissingOneTile)
                        {
                            missingOrdinal = mainSegEnd + 1;
                        }
                        break;
                    }
                    mainSegEnd += seg.Count;
                }
            }
        }

        // ── Confidence ────────────────────────────────────────────
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

    /// <summary>
    /// Solves the 3x3 system A*k + B - C*k*u = u for three (k,u) pairs.
    /// </summary>
    private static bool Solve3x3(
        double k1, double u1,
        double k2, double u2,
        double k3, double u3,
        out double a, out double b, out double c)
    {
        // Matrix: [k1, 1, -k1*u1] * [A,B,C]^T = [u1]
        //         [k2, 1, -k2*u2]              = [u2]
        //         [k3, 1, -k3*u3]              = [u3]
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

        // Check: denominator C*k + 1 must not be near zero for any k.
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

        // Gaussian elimination with partial pivoting.
        double det = Determinant3x3(m);
        if (Math.Abs(det) < 1e-12) return false;

        // Cramer's rule.
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

    /// <summary>
    /// Least-squares solution for overdetermined system.
    /// A*k_i + B - C*k_i*u_i = u_i
    /// </summary>
    private static bool SolveLeastSquares(
        List<double> ks, List<double> us,
        out double a, out double b, out double c)
    {
        a = b = c = 0;
        int m = ks.Count;
        if (m < 3) return false;

        // Build normal equations A^T A x = A^T b
        // Row i: [k_i, 1, -k_i*u_i] * [A,B,C]^T = u_i
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
