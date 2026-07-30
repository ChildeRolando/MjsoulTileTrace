namespace MahjongSoulOverlay.Windows.Capture;

public sealed record WindowSnapshot(
    nint Handle,
    string Title,
    string ExecutableName,
    bool Visible,
    bool Minimized,
    int ClientWidth,
    int ClientHeight,
    int Dpi);

public readonly record struct NativeRect(int Left, int Top, int Right, int Bottom);

public readonly record struct ScreenPoint(int X, int Y);

public readonly record struct ScreenRect(int X, int Y, int Width, int Height);

public static class ClientGeometry
{
    public static ScreenRect ToScreen(NativeRect clientRect, ScreenPoint clientOrigin) =>
        new(
            clientOrigin.X + clientRect.Left,
            clientOrigin.Y + clientRect.Top,
            clientRect.Right - clientRect.Left,
            clientRect.Bottom - clientRect.Top);
}

public static class MahjongWindowEligibility
{
    private static readonly string[] AllowedTitles =
    [
        "雀魂麻将",
        "雀魂麻將",
        "Mahjong Soul",
        "MahjongSoul",
    ];

    private static readonly HashSet<string> AllowedExecutables =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "MahjongSoul.exe",
            "Jantama_MahjongSoul.exe",
        };

    public static bool IsEligible(WindowSnapshot snapshot) =>
        snapshot.Visible
        && !snapshot.Minimized
        && snapshot.ClientWidth == 1920
        && snapshot.ClientHeight == 1080
        && snapshot.Dpi == 96
        && (AllowedTitles.Any(
                title => string.Equals(
                    snapshot.Title.Trim(),
                    title,
                    StringComparison.OrdinalIgnoreCase))
            || AllowedExecutables.Contains(snapshot.ExecutableName));

    public static WindowSnapshot? SelectUnique(IEnumerable<WindowSnapshot> snapshots)
    {
        WindowSnapshot? selected = null;
        foreach (var snapshot in snapshots.Where(IsEligible))
        {
            if (selected is not null)
                return null;
            selected = snapshot;
        }

        return selected;
    }
}
