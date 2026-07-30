using MahjongSoulOverlay.Replay;

return ReplayCli.Run(args);

public static class ReplayCli
{
    public static int Run(string[] args)
    {
        ArgumentNullException.ThrowIfNull(args);
        if (TryParseComparison(args, out var comparison))
            return new AcceptanceComparer().Run(comparison);

        if (!TryParse(args, out var options))
        {
            Console.Error.WriteLine(
                "Usage: MahjongSoulOverlay.Replay --input <video> --profile <json> " +
                "--events <jsonl> [--annotated <video>]\n" +
                "   or: MahjongSoulOverlay.Replay --compare-events <jsonl> " +
                "--labels <json> --report <json>");
            return 2;
        }

        return new ReplayRunner().Run(options);
    }

    private static bool TryParse(string[] args, out ReplayOptions options)
    {
        options = new ReplayOptions(string.Empty, string.Empty, string.Empty, null);
        if (args.Length is < 6 or > 8 || args.Length % 2 != 0)
            return false;

        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = 0; index < args.Length; index += 2)
        {
            var name = args[index];
            if (name is not ("--input" or "--profile" or "--events" or "--annotated") ||
                string.IsNullOrWhiteSpace(args[index + 1]) ||
                !values.TryAdd(name, args[index + 1]))
            {
                return false;
            }
        }

        if (!values.TryGetValue("--input", out var input) ||
            !values.TryGetValue("--profile", out var profile) ||
            !values.TryGetValue("--events", out var events))
        {
            return false;
        }

        values.TryGetValue("--annotated", out var annotated);
        options = new ReplayOptions(input, profile, events, annotated);
        return true;
    }

    private static bool TryParseComparison(
        string[] args,
        out AcceptanceComparisonOptions options)
    {
        options = new AcceptanceComparisonOptions(string.Empty, string.Empty, string.Empty);
        if (args.Length != 6)
            return false;

        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = 0; index < args.Length; index += 2)
        {
            if (args[index] is not ("--compare-events" or "--labels" or "--report") ||
                string.IsNullOrWhiteSpace(args[index + 1]) ||
                !values.TryAdd(args[index], args[index + 1]))
            {
                return false;
            }
        }

        if (!values.TryGetValue("--compare-events", out var audit) ||
            !values.TryGetValue("--labels", out var labels) ||
            !values.TryGetValue("--report", out var report))
        {
            return false;
        }

        options = new AcceptanceComparisonOptions(audit, labels, report);
        return true;
    }
}
