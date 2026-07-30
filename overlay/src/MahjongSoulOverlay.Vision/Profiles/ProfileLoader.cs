using System.Text.Json;
using System.Text.Json.Serialization;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;

namespace MahjongSoulOverlay.Vision.Profiles;

public static class ProfileLoader
{
    private const int RequiredWidth = 1920;
    private const int RequiredHeight = 1080;
    private const double RequiredDisplayScale = 1d;

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DictionaryKeyPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters =
        {
            new NormalizedPointJsonConverter(),
            new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)
        }
    };

    public static TableProfile Load(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new InvalidDataException("A profile path is required.");

        return LoadJson(File.ReadAllText(path));
    }

    public static TableProfile LoadJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
            throw new InvalidDataException("Profile JSON is required.");

        try
        {
            using var document = JsonDocument.Parse(json);
            ValidateJsonShape(document.RootElement);
            var profile = JsonSerializer.Deserialize<TableProfile>(json, Options)
                ?? throw new InvalidDataException("Profile JSON cannot be null.");
            Validate(profile);
            return profile;
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception exception) when (
            exception is JsonException or ArgumentException or InvalidOperationException)
        {
            throw new InvalidDataException("Profile JSON is invalid.", exception);
        }
    }

    public static string Serialize(TableProfile profile)
    {
        ArgumentNullException.ThrowIfNull(profile);
        Validate(profile);
        return JsonSerializer.Serialize(profile, Options);
    }

    private static void ValidateJsonShape(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object ||
            !TryGetProperty(root, "seats", out var seats) ||
            seats.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("Profile must be an object with a seats object.");
        }

        var seen = new HashSet<Seat>();
        foreach (var property in seats.EnumerateObject())
        {
            if (!Enum.TryParse<Seat>(property.Name, true, out var seat) ||
                !Enum.IsDefined(seat) ||
                !seen.Add(seat))
            {
                throw new InvalidDataException(
                    $"Seat key '{property.Name}' is unknown or duplicated.");
            }
        }
    }

    private static bool TryGetProperty(
        JsonElement element, string name, out JsonElement value)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static void Validate(TableProfile profile)
    {
        if (string.IsNullOrWhiteSpace(profile.Id))
            throw new InvalidDataException("Profile ID is required.");
        if (profile.Width != RequiredWidth || profile.Height != RequiredHeight)
            throw new InvalidDataException("Profile dimensions must be exactly 1920x1080.");
        if (!double.IsFinite(profile.DisplayScale) ||
            profile.DisplayScale != RequiredDisplayScale)
        {
            throw new InvalidDataException("Profile display scale must be exactly 1.0.");
        }

        var requiredSeats = Enum.GetValues<Seat>();
        if (profile.Seats.Count != requiredSeats.Length ||
            requiredSeats.Any(seat => !profile.Seats.ContainsKey(seat)))
        {
            throw new InvalidDataException("Profile must contain exactly four seats.");
        }

        foreach (var (key, seatProfile) in profile.Seats)
        {
            if (seatProfile is null)
                throw new InvalidDataException($"Seat profile '{key}' cannot be null.");
            if (key != seatProfile.Seat)
                throw new InvalidDataException($"Seat key '{key}' does not match its profile.");

            ValidateSeat(seatProfile);
        }

        var mainRegions = profile.Seats.Values.Select(seat => seat.MainHandRegion).ToArray();
        if (mainRegions
            .SelectMany((region, index) => mainRegions.Skip(index + 1)
                .Select(other => (Region: region, Other: other)))
            .Any(pair => HasSameVertices(pair.Region, pair.Other)))
        {
            throw new InvalidDataException(
                "Every seat must use independent main-hand geometry.");
        }
    }

    private static void ValidateSeat(SeatProfile profile)
    {
        if (!Enum.IsDefined(profile.Seat) ||
            !Enum.IsDefined(profile.MainHandDirection) ||
            !Enum.IsDefined(profile.RiverFlowDirection) ||
            !Enum.IsDefined(profile.MeldExpansionDirection))
        {
            throw new InvalidDataException("Profile contains an unknown enum value.");
        }

        if (profile.MainSlots.Count == 0)
            throw new InvalidDataException("Every seat requires at least one main-hand slot.");

        ValidateQuad(profile.MainHandRegion, nameof(profile.MainHandRegion));
        foreach (var slot in profile.MainSlots)
            ValidateQuad(slot, nameof(profile.MainSlots));
        ValidateQuad(profile.DrawnSlot, nameof(profile.DrawnSlot));
        ValidateQuad(profile.RiverRegion, nameof(profile.RiverRegion));
        ValidateQuad(profile.MeldRegion, nameof(profile.MeldRegion));
    }

    private static void ValidateQuad(NormalizedQuad quad, string name)
    {
        ArgumentNullException.ThrowIfNull(quad);
        var points = new[]
        {
            quad.TopLeft, quad.TopRight, quad.BottomRight, quad.BottomLeft
        };

        var signedCrossProducts = new double[points.Length];
        var twiceArea = 0d;
        for (var index = 0; index < points.Length; index++)
        {
            var current = points[index];
            var next = points[(index + 1) % points.Length];
            var following = points[(index + 2) % points.Length];
            twiceArea += current.X * next.Y - next.X * current.Y;
            signedCrossProducts[index] =
                (next.X - current.X) * (following.Y - next.Y) -
                (next.Y - current.Y) * (following.X - next.X);
        }

        const double epsilon = 1e-12;
        var allPositive = signedCrossProducts.All(value => value > epsilon);
        var allNegative = signedCrossProducts.All(value => value < -epsilon);
        if (Math.Abs(twiceArea) <= epsilon || (!allPositive && !allNegative))
            throw new InvalidDataException(
                $"{name} must be a non-zero convex quadrilateral: " +
                string.Join(";", points.Select(point => $"{point.X},{point.Y}")));
    }

    private static bool HasSameVertices(NormalizedQuad first, NormalizedQuad second)
    {
        const double tolerance = 1e-9;
        var firstPoints = OrderedPoints(first);
        var secondPoints = OrderedPoints(second);
        return firstPoints.Zip(secondPoints).All(pair =>
            Math.Abs(pair.First.X - pair.Second.X) <= tolerance &&
            Math.Abs(pair.First.Y - pair.Second.Y) <= tolerance);
    }

    private static NormalizedPoint[] OrderedPoints(NormalizedQuad quad) =>
    [
        .. new[] { quad.TopLeft, quad.TopRight, quad.BottomRight, quad.BottomLeft }
            .OrderBy(point => point.X)
            .ThenBy(point => point.Y)
    ];

    private sealed class NormalizedPointJsonConverter : JsonConverter<NormalizedPoint>
    {
        public override NormalizedPoint Read(
            ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            using var document = JsonDocument.ParseValue(ref reader);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                !TryGetProperty(root, "x", out var xElement) ||
                !TryGetProperty(root, "y", out var yElement) ||
                xElement.ValueKind != JsonValueKind.Number ||
                yElement.ValueKind != JsonValueKind.Number)
            {
                throw new JsonException("Normalized point requires numeric x and y values.");
            }

            return new NormalizedPoint(xElement.GetDouble(), yElement.GetDouble());
        }

        public override void Write(
            Utf8JsonWriter writer, NormalizedPoint value, JsonSerializerOptions options)
        {
            writer.WriteStartObject();
            writer.WriteNumber("x", value.X);
            writer.WriteNumber("y", value.Y);
            writer.WriteEndObject();
        }
    }
}
