using System.Drawing;
using System.Drawing.Imaging;
using System.Text.Json;
using System.Text.Json.Serialization;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Events;
using MahjongSoulOverlay.Core.Lifecycle;
using MahjongSoulOverlay.Core.Pipeline;
using MahjongSoulOverlay.Windows.Capture;

namespace MahjongSoulOverlay.Windows.Diagnostics;

public sealed record DiagnosticSnapshot
{
    public DiagnosticSnapshot(
        IReadOnlyList<SeatObservation> observations,
        IReadOnlyList<TableEvent> events,
        IReadOnlyList<CandidateResolution> candidateResolutions,
        IReadOnlyList<OverlayLayer> layers,
        LifecycleState lifecycle)
    {
        ArgumentNullException.ThrowIfNull(observations);
        if (observations.Count != 4)
            throw new ArgumentException("Exactly four seat observations are required.", nameof(observations));
        Observations = observations.ToArray();
        Events = events?.ToArray() ?? throw new ArgumentNullException(nameof(events));
        CandidateResolutions = candidateResolutions?.ToArray()
            ?? throw new ArgumentNullException(nameof(candidateResolutions));
        Layers = layers?.ToArray() ?? throw new ArgumentNullException(nameof(layers));
        Lifecycle = lifecycle;
    }

    public IReadOnlyList<SeatObservation> Observations { get; }
    public IReadOnlyList<TableEvent> Events { get; }
    public IReadOnlyList<CandidateResolution> CandidateResolutions { get; }
    public IReadOnlyList<OverlayLayer> Layers { get; }
    public LifecycleState Lifecycle { get; }

    public static DiagnosticSnapshot From(TableObservation observation, EngineOutput output) =>
        new(
            observation.Seats.Values.OrderBy(seat => seat.Seat).ToArray(),
            output.Events,
            output.CandidateResolutions,
            output.Layers,
            output.Lifecycle);
}

public sealed class DiagnosticRecorder : IAsyncDisposable
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string _root;
    private readonly string _sessionName;
    private readonly object _sync = new();
    private Task _writeTail = Task.CompletedTask;
    private bool _enabled;
    private bool _closing;
    private long _sequence;

    public DiagnosticRecorder(string? diagnosticsRoot = null, string? sessionName = null)
    {
        _root = Path.GetFullPath(diagnosticsRoot ?? ResolveDefaultRoot());
        _sessionName = sessionName ?? DateTimeOffset.UtcNow.ToString("yyyyMMddTHHmmss.fffffffZ");
        if (Path.GetFileName(_sessionName) != _sessionName || _sessionName is "." or "..")
            throw new ArgumentException("Session name must be a safe single path segment.", nameof(sessionName));
    }

    public bool IsEnabled
    {
        get
        {
            lock (_sync)
                return _enabled;
        }
    }

    public void Enable()
    {
        lock (_sync)
        {
            ObjectDisposedException.ThrowIf(_closing, this);
            _enabled = true;
        }
    }

    public void Disable()
    {
        lock (_sync)
            _enabled = false;
    }

    public Task RecordAsync(
        CapturedFrame frame,
        DiagnosticSnapshot snapshot,
        bool keyFrame,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(frame);
        ArgumentNullException.ThrowIfNull(snapshot);
        cancellationToken.ThrowIfCancellationRequested();

        lock (_sync)
        {
            if (!_enabled || _closing)
                return Task.CompletedTask;

            var sequence = ++_sequence;
            var json = JsonSerializer.SerializeToUtf8Bytes(
                new DiagnosticLine(frame.Timestamp, frame.Width, frame.Height, snapshot),
                SerializerOptions);
            var line = new byte[json.Length + 1];
            json.CopyTo(line, 0);
            line[^1] = (byte)'\n';
            var pixels = keyFrame ? frame.Bgra.ToArray() : null;
            _writeTail = AppendAfterAsync(
                _writeTail,
                frame,
                line,
                pixels,
                sequence);
            return _writeTail;
        }
    }

    public async ValueTask DisposeAsync()
    {
        Task tail;
        lock (_sync)
        {
            if (_closing)
            {
                tail = _writeTail;
            }
            else
            {
                _closing = true;
                _enabled = false;
                tail = _writeTail;
            }
        }

        await tail.ConfigureAwait(false);
    }

    private async Task AppendAfterAsync(
        Task predecessor,
        CapturedFrame frame,
        byte[] jsonLine,
        byte[]? pixels,
        long sequence)
    {
        await predecessor.ConfigureAwait(false);
        var session = Path.Combine(_root, _sessionName);
        Directory.CreateDirectory(session);
        var jsonPath = Path.Combine(session, "events.jsonl");
        await using (var stream = new FileStream(
            jsonPath,
            FileMode.Append,
            FileAccess.Write,
            FileShare.Read,
            4096,
            FileOptions.Asynchronous))
        {
            await stream.WriteAsync(jsonLine, CancellationToken.None).ConfigureAwait(false);
            await stream.FlushAsync(CancellationToken.None).ConfigureAwait(false);
        }

        if (pixels is not null)
        {
            var pngPath = Path.Combine(session, $"{sequence:D8}.png");
            SavePng(frame.Width, frame.Height, frame.Stride, pixels, pngPath);
        }
    }

    private static string ResolveDefaultRoot()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Environment.CurrentDirectory })
        {
            var current = new DirectoryInfo(Path.GetFullPath(start));
            while (current is not null)
            {
                if (string.Equals(current.Name, "overlay", StringComparison.OrdinalIgnoreCase))
                    return Path.Combine(current.FullName, "diagnostics");
                current = current.Parent;
            }
        }

        throw new InvalidOperationException(
            "Unable to resolve overlay/diagnostics; pass an explicit diagnostics root.");
    }

    private static void SavePng(int width, int height, int stride, byte[] bgra, string path)
    {
        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        var data = bitmap.LockBits(
            new Rectangle(0, 0, width, height),
            ImageLockMode.WriteOnly,
            PixelFormat.Format32bppArgb);
        try
        {
            for (var y = 0; y < height; y++)
                System.Runtime.InteropServices.Marshal.Copy(
                    bgra,
                    y * stride,
                    data.Scan0 + y * data.Stride,
                    width * 4);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }

        bitmap.Save(path, ImageFormat.Png);
    }

    private sealed record DiagnosticLine(
        [property: JsonPropertyName("timestamp")] DateTimeOffset Timestamp,
        [property: JsonPropertyName("width")] int Width,
        [property: JsonPropertyName("height")] int Height,
        [property: JsonPropertyName("payload")] DiagnosticSnapshot Payload);
}
