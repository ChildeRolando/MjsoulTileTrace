using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Core.Profiles;
using MahjongSoulOverlay.Vision.Profiles;

namespace MahjongSoulOverlay.Vision.Tests;

public sealed class ProfileLoaderTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DictionaryKeyPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    [Fact]
    public void LoadJson_round_trips_every_profile_value()
    {
        var expected = ValidProfile();

        var serialized = ProfileLoader.Serialize(expected);
        var actual = ProfileLoader.LoadJson(serialized);

        Assert.Equal(expected.Id, actual.Id);
        Assert.Equal(expected.Width, actual.Width);
        Assert.Equal(expected.Height, actual.Height);
        Assert.Equal(expected.DisplayScale, actual.DisplayScale);
        Assert.Equal(Enum.GetValues<Seat>(), actual.Seats.Keys.OrderBy(seat => seat));
        foreach (var seat in Enum.GetValues<Seat>())
            AssertSeatProfileEqual(expected.Seats[seat], actual.Seats[seat]);
    }

    [Fact]
    public void Load_reads_a_valid_profile_from_disk()
    {
        var path = Path.GetTempFileName();
        try
        {
            File.WriteAllText(path, JsonSerializer.Serialize(ValidProfile(), JsonOptions));

            var profile = ProfileLoader.Load(path);

            Assert.Equal("synthetic-four-seat", profile.Id);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Theory]
    [InlineData("width", "1919")]
    [InlineData("height", "1079")]
    [InlineData("displayScale", "0.999")]
    [InlineData("id", "\" \"")]
    public void LoadJson_rejects_invalid_table_metadata(string property, string jsonValue)
    {
        var root = ValidNode();
        root[property] = JsonNode.Parse(jsonValue);

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Fact]
    public void LoadJson_requires_exactly_four_seats()
    {
        var root = ValidNode();
        root["seats"]!.AsObject().Remove("left");

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Fact]
    public void LoadJson_rejects_duplicate_seat_keys()
    {
        var root = ValidNode();
        var seats = root["seats"]!.AsObject();
        var bottom = seats["bottom"]!.ToJsonString();
        var right = seats["right"]!.ToJsonString();
        var top = seats["top"]!.ToJsonString();
        var left = seats["left"]!.ToJsonString();
        var json = "{\"id\":\"duplicate\",\"width\":1920,\"height\":1080," +
            "\"displayScale\":1,\"seats\":{\"bottom\":" + bottom +
            ",\"bottom\":" + bottom + ",\"right\":" + right +
            ",\"top\":" + top + ",\"left\":" + left + "}}";

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(json));
    }

    [Fact]
    public void LoadJson_rejects_seat_key_and_profile_seat_mismatch()
    {
        var root = ValidNode();
        root["seats"]!["bottom"]!["seat"] = "top";

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Fact]
    public void LoadJson_rejects_non_independent_main_hand_geometry()
    {
        var root = ValidNode();
        root["seats"]!["top"]!["mainHandRegion"] =
            root["seats"]!["bottom"]!["mainHandRegion"]!.DeepClone();

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Fact]
    public void LoadJson_rejects_same_main_hand_geometry_with_cyclic_vertex_assignment()
    {
        var root = ValidNode();
        var bottom = root["seats"]!["bottom"]!["mainHandRegion"]!;
        root["seats"]!["top"]!["mainHandRegion"] = new JsonObject
        {
            ["topLeft"] = bottom["topRight"]!.DeepClone(),
            ["topRight"] = bottom["bottomRight"]!.DeepClone(),
            ["bottomRight"] = bottom["bottomLeft"]!.DeepClone(),
            ["bottomLeft"] = bottom["topLeft"]!.DeepClone()
        };

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Theory]
    [InlineData("mainHandRegion")]
    [InlineData("drawnSlot")]
    [InlineData("riverRegion")]
    [InlineData("meldRegion")]
    public void LoadJson_rejects_zero_area_regions(string property)
    {
        var root = ValidNode();
        root["seats"]!["bottom"]![property] = ZeroAreaQuadNode();

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Fact]
    public void LoadJson_rejects_zero_area_main_slot()
    {
        var root = ValidNode();
        root["seats"]!["bottom"]!["mainSlots"]![0] = ZeroAreaQuadNode();

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Fact]
    public void LoadJson_rejects_empty_main_slots()
    {
        var root = ValidNode();
        root["seats"]!["bottom"]!["mainSlots"] = new JsonArray();

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Fact]
    public void LoadJson_rejects_points_outside_normalized_range()
    {
        var root = ValidNode();
        root["seats"]!["right"]!["riverRegion"]!["topLeft"]!["x"] = 1.01;

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Theory]
    [InlineData("mainHandRegion")]
    [InlineData("mainSlots")]
    [InlineData("drawnSlot")]
    [InlineData("riverRegion")]
    [InlineData("meldRegion")]
    [InlineData("expectedTileScale")]
    [InlineData("mainHandThresholds")]
    [InlineData("drawnSlotThresholds")]
    [InlineData("riverThresholds")]
    [InlineData("meldThresholds")]
    public void LoadJson_rejects_null_required_seat_profile_members(string property)
    {
        var root = ValidNode();
        root["seats"]!["bottom"]![property] = null;

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Theory]
    [InlineData("mainHandDirection")]
    [InlineData("riverFlowDirection")]
    [InlineData("meldExpansionDirection")]
    public void LoadJson_rejects_unknown_layout_directions(string property)
    {
        var root = ValidNode();
        root["seats"]!["bottom"]![property] = 999;

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Theory]
    [InlineData("expectedTileScale", "width", "0")]
    [InlineData("expectedTileScale", "height", "1.1")]
    [InlineData("", "minimumTileAspect", "0")]
    [InlineData("", "maximumTileAspect", "0.1")]
    [InlineData("", "minimumAngle", "100")]
    [InlineData("", "maximumAngle", "-100")]
    [InlineData("", "perspectiveTolerance", "-0.1")]
    [InlineData("mainHandThresholds", "occupancy", "1.1")]
    [InlineData("drawnSlotThresholds", "stable", "-0.1")]
    [InlineData("", "minimumTileConfidence", "1.1")]
    public void LoadJson_enforces_current_profile_numeric_invariants(
        string container, string property, string jsonValue)
    {
        var root = ValidNode();
        var seat = root["seats"]!["bottom"]!;
        var target = string.IsNullOrEmpty(container) ? seat : seat[container]!;
        target[property] = JsonNode.Parse(jsonValue);

        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(root.ToJsonString()));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("null")]
    [InlineData("{")]
    [InlineData("[]")]
    public void LoadJson_rejects_null_or_malformed_json(string? json)
    {
        Assert.Throws<InvalidDataException>(() => ProfileLoader.LoadJson(json!));
    }

    private static JsonObject ValidNode() =>
        JsonNode.Parse(JsonSerializer.Serialize(ValidProfile(), JsonOptions))!.AsObject();

    private static JsonObject ZeroAreaQuadNode() =>
        JsonNode.Parse("""{"topLeft":{"x":0.1,"y":0.1},"topRight":{"x":0.2,"y":0.1},"bottomRight":{"x":0.2,"y":0.1},"bottomLeft":{"x":0.1,"y":0.1}}""")!.AsObject();

    internal static TableProfile ValidProfile()
    {
        var seats = new Dictionary<Seat, SeatProfile>
        {
            [Seat.Bottom] = SeatProfile(Seat.Bottom, Quad(0.20, 0.82, 0.55, 0.92),
                LayoutDirection.LeftToRight),
            [Seat.Right] = SeatProfile(Seat.Right, Quad(0.82, 0.25, 0.90, 0.65),
                LayoutDirection.BottomToTop),
            [Seat.Top] = SeatProfile(Seat.Top, Quad(0.38, 0.08, 0.65, 0.16),
                LayoutDirection.RightToLeft),
            [Seat.Left] = SeatProfile(Seat.Left, Quad(0.10, 0.30, 0.18, 0.70),
                LayoutDirection.TopToBottom)
        };
        return new TableProfile("synthetic-four-seat", 1920, 1080, 1d, seats);
    }

    private static SeatProfile SeatProfile(
        Seat seat, NormalizedQuad mainRegion, LayoutDirection direction)
    {
        var thresholds = new RegionThresholds(0.15, 0.25);
        var slot = seat switch
        {
            Seat.Bottom => Quad(0.21, 0.83, 0.27, 0.91),
            Seat.Right => Quad(0.83, 0.32, 0.89, 0.44),
            Seat.Top => Quad(0.44, 0.09, 0.49, 0.15),
            Seat.Left => Quad(0.11, 0.42, 0.17, 0.54),
            _ => throw new ArgumentOutOfRangeException(nameof(seat))
        };
        return new SeatProfile(
            seat,
            mainRegion,
            [slot],
            direction,
            slot,
            slot,
            direction,
            slot,
            direction,
            new TileScale(0.04, 0.08),
            0.4,
            2.5,
            -90,
            90,
            0.2,
            thresholds,
            new RegionThresholds(0.16, 0.26),
            new RegionThresholds(0.17, 0.27),
            new RegionThresholds(0.18, 0.28),
            0.4);
    }

    private static NormalizedQuad Quad(double left, double top, double right, double bottom) =>
        new(new(left, top), new(right, top), new(right, bottom), new(left, bottom));

    private static void AssertSeatProfileEqual(SeatProfile expected, SeatProfile actual)
    {
        Assert.Equal(expected.Seat, actual.Seat);
        Assert.Equal(expected.MainHandRegion, actual.MainHandRegion);
        Assert.Equal(expected.MainSlots, actual.MainSlots);
        Assert.Equal(expected.MainHandDirection, actual.MainHandDirection);
        Assert.Equal(expected.DrawnSlot, actual.DrawnSlot);
        Assert.Equal(expected.RiverRegion, actual.RiverRegion);
        Assert.Equal(expected.RiverFlowDirection, actual.RiverFlowDirection);
        Assert.Equal(expected.MeldRegion, actual.MeldRegion);
        Assert.Equal(expected.MeldExpansionDirection, actual.MeldExpansionDirection);
        Assert.Equal(expected.ExpectedTileScale, actual.ExpectedTileScale);
        Assert.Equal(expected.MinimumTileAspect, actual.MinimumTileAspect);
        Assert.Equal(expected.MaximumTileAspect, actual.MaximumTileAspect);
        Assert.Equal(expected.MinimumAngle, actual.MinimumAngle);
        Assert.Equal(expected.MaximumAngle, actual.MaximumAngle);
        Assert.Equal(expected.PerspectiveTolerance, actual.PerspectiveTolerance);
        Assert.Equal(expected.MainHandThresholds, actual.MainHandThresholds);
        Assert.Equal(expected.DrawnSlotThresholds, actual.DrawnSlotThresholds);
        Assert.Equal(expected.RiverThresholds, actual.RiverThresholds);
        Assert.Equal(expected.MeldThresholds, actual.MeldThresholds);
        Assert.Equal(expected.MinimumTileConfidence, actual.MinimumTileConfidence);
    }
}
