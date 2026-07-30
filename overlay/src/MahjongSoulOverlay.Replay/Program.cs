using MahjongSoulOverlay.Replay;

return ReplayCli.Run(args);

public static class ReplayCli
{
    public static int Run(string[] args)
    {
        ArgumentNullException.ThrowIfNull(args);
        if (!TryParse(args, out var options))
        {
            Console.Error.WriteLine(
                "Usage: MahjongSoulOverlay.Replay --input <video> --profile <json> " +
                "--events <jsonl> [--annotated <video>]");
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
}
