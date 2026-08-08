package main

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func counts34(tiles ...int) []int {
	counts := make([]int, 34)
	for _, tile := range tiles {
		counts[tile]++
	}
	return counts
}

func intPointer(value int) *int {
	return &value
}

func goldenHandStructureRequest() HandStructureRequestV2 {
	hand := counts34(0, 1, 2, 9, 10, 11, 18, 19, 20, 24, 25, 27, 27)
	return HandStructureRequestV2{
		RequestBase: RequestBase{
			Kind:            "hand_structure",
			RequestID:       "hand-structure-golden",
			ProtocolVersion: protocolVersion,
			ActionRef:       "action:v1:discard:9s:normal:tedashi",
			StateHash:       "sha256:hand-structure-golden",
		},
		SchemaVersion:         handStructureSchemaVersion,
		HandTiles34:           hand,
		Melds:                 []MeldInput{},
		LeftTiles34:           theoreticalLeftTiles34(hand, nil),
		VisibleCountsComplete: true,
		RonContext:            "complete_none",
		YakuContext: YakuContextV2{
			WindsStatus:      "known",
			RoundWindTile34:  intPointer(27),
			SelfWindTile34:   intPointer(28),
			RiichiStatus:     "inactive",
			OpenTanyaoStatus: "enabled",
		},
	}
}

func TestFamilyShantenClosedHands(t *testing.T) {
	tests := []struct {
		name        string
		tiles       []int
		wantNormal  int
		wantChiitoi int
		wantKokushi int
	}{
		{"standard tenpai", counts34(0, 1, 2, 9, 10, 11, 18, 19, 20, 24, 25, 27, 27), 0, 5, 8},
		{"chiitoitsu tenpai", counts34(0, 0, 8, 8, 9, 9, 17, 17, 18, 18, 26, 26, 27), 3, 0, 5},
		{"kokushi thirteen sided", counts34(0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33), 8, 6, 0},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			original := cloneInts(test.tiles)
			got := calculateFamilyShanten(test.tiles, 0)
			if got.Standard != test.wantNormal || got.Chiitoitsu == nil || *got.Chiitoitsu != test.wantChiitoi || got.Kokushi == nil || *got.Kokushi != test.wantKokushi {
				t.Fatalf("family shanten = %#v", got)
			}
			if !reflect.DeepEqual(test.tiles, original) {
				t.Fatalf("family calculation mutated input: got %v, want %v", test.tiles, original)
			}
		})
	}
}

func TestOpenHandMakesSpecialFamiliesNotApplicable(t *testing.T) {
	got := calculateFamilyShanten(counts34(0, 1, 2, 9, 10, 11, 18, 19, 20, 27), 1)
	if got.Chiitoitsu != nil || got.Kokushi != nil {
		t.Fatalf("open special families must be nil: %#v", got)
	}
	if effective := effectiveTilesForFamily(counts34(0, 1, 2, 9, 10, 11, 18, 19, 20, 27), 1, "chiitoitsu"); len(effective) != 0 {
		t.Fatalf("inapplicable family effective tiles = %v, want empty", effective)
	}
}

func TestEveryMeldKindMakesSpecialFamiliesNotApplicable(t *testing.T) {
	for _, meld := range []MeldInput{
		{Kind: "chi", Tiles34: []int{0, 1, 2}},
		{Kind: "pon", Tiles34: []int{27, 27, 27}},
		{Kind: "daiminkan", Tiles34: []int{27, 27, 27, 27}},
		{Kind: "ankan", Tiles34: []int{27, 27, 27, 27}},
		{Kind: "kakan", Tiles34: []int{27, 27, 27, 27}},
	} {
		t.Run(meld.Kind, func(t *testing.T) {
			request := goldenHandStructureRequest()
			request.HandTiles34 = counts34(3, 4, 5, 9, 10, 11, 18, 19, 20, 31)
			request.Melds = []MeldInput{meld}
			request.VisibleCountsComplete = false
			request.LeftTiles34 = nil
			result, err := analyzeHandStructure(request)
			if err != nil {
				t.Fatalf("analyze %s hand: %v", meld.Kind, err)
			}
			for _, family := range result.Families[1:] {
				if family.Applicability != "not_applicable_open_hand" || family.Shanten != nil || len(family.EffectiveTiles) != 0 {
					t.Fatalf("%s family %s must be inapplicable: %#v", meld.Kind, family.Family, family)
				}
			}
		})
	}
}

func TestEffectiveTilesAreFamilySpecificAndSorted(t *testing.T) {
	hand := counts34(0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33)
	original := cloneInts(hand)
	got := effectiveTilesForFamily(hand, 0, "kokushi")
	want := []int{0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("kokushi effective = %v, want %v", got, want)
	}
	if !reflect.DeepEqual(hand, original) {
		t.Fatalf("effective-tile calculation mutated input: got %v, want %v", hand, original)
	}
}

func TestEffectiveTilesSkipPhysicallyExhaustedOwnedKind(t *testing.T) {
	hand := counts34(0, 0, 0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30)
	got := effectiveTilesForFamily(hand, 0, "kokushi")
	for _, tile := range got {
		if tile == 0 {
			t.Fatalf("effective tiles must not add a fifth physical copy: %v", got)
		}
	}
}

func TestValidateHandStructureAcceptsStrictClosedRequest(t *testing.T) {
	if err := validateHandStructureRequest(goldenHandStructureRequest()); err != nil {
		t.Fatalf("valid hand-structure request rejected: %v", err)
	}
}

func handStructureRequestJSON(t *testing.T) map[string]any {
	t.Helper()
	encoded, err := json.Marshal(goldenHandStructureRequest())
	if err != nil {
		t.Fatalf("marshal hand-structure request: %v", err)
	}
	var raw map[string]any
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("decode hand-structure request map: %v", err)
	}
	raw["yakuContext"] = map[string]any{
		"windsStatus":      "known",
		"roundWindTile34":  27,
		"selfWindTile34":   28,
		"riichiStatus":     "inactive",
		"openTanyaoStatus": "enabled",
	}
	return raw
}

func decodeAndValidateHandStructureRequest(raw map[string]any) error {
	encoded, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	var request HandStructureRequestV2
	if err := strictDecode(encoded, &request); err != nil {
		return err
	}
	return validateHandStructureRequest(request)
}

func TestHandStructureYakuContextRequiresEveryStrictJSONField(t *testing.T) {
	t.Run("missing yakuContext", func(t *testing.T) {
		raw := handStructureRequestJSON(t)
		delete(raw, "yakuContext")
		if err := decodeAndValidateHandStructureRequest(raw); err == nil || !strings.Contains(err.Error(), "yakuContext") {
			t.Fatalf("validation error = %v, want yakuContext", err)
		}
	})

	for _, field := range []string{
		"windsStatus", "roundWindTile34", "selfWindTile34", "riichiStatus", "openTanyaoStatus",
	} {
		t.Run("missing "+field, func(t *testing.T) {
			raw := handStructureRequestJSON(t)
			delete(raw["yakuContext"].(map[string]any), field)
			if err := decodeAndValidateHandStructureRequest(raw); err == nil || !strings.Contains(err.Error(), field) {
				t.Fatalf("decode error = %v, want %s", err, field)
			}
		})
	}

	t.Run("unknown nested field", func(t *testing.T) {
		raw := handStructureRequestJSON(t)
		raw["yakuContext"].(map[string]any)["extra"] = true
		if err := decodeAndValidateHandStructureRequest(raw); err == nil || !strings.Contains(err.Error(), "extra") {
			t.Fatalf("decode error = %v, want unknown extra field", err)
		}
	})
}

func TestValidateHandStructureBindsYakuContextSemantics(t *testing.T) {
	t.Run("wind status and values", func(t *testing.T) {
		for _, edit := range []func(map[string]any){
			func(context map[string]any) { context["windsStatus"] = "known"; context["roundWindTile34"] = nil },
			func(context map[string]any) { context["windsStatus"] = "unknown" },
			func(context map[string]any) { context["windsStatus"] = "unknown"; context["roundWindTile34"] = nil },
			func(context map[string]any) { context["roundWindTile34"] = 30 },
			func(context map[string]any) { context["selfWindTile34"] = 31 },
		} {
			raw := handStructureRequestJSON(t)
			edit(raw["yakuContext"].(map[string]any))
			if err := decodeAndValidateHandStructureRequest(raw); err == nil {
				t.Fatalf("invalid wind context accepted: %#v", raw["yakuContext"])
			}
		}

		raw := handStructureRequestJSON(t)
		context := raw["yakuContext"].(map[string]any)
		context["windsStatus"] = "unknown"
		context["roundWindTile34"] = nil
		context["selfWindTile34"] = nil
		if err := decodeAndValidateHandStructureRequest(raw); err != nil {
			t.Fatalf("valid unknown winds rejected: %v", err)
		}
	})

	t.Run("open tanyao states", func(t *testing.T) {
		for _, status := range []string{"enabled", "disabled", "unknown"} {
			raw := handStructureRequestJSON(t)
			raw["yakuContext"].(map[string]any)["openTanyaoStatus"] = status
			if err := decodeAndValidateHandStructureRequest(raw); err != nil {
				t.Fatalf("openTanyaoStatus %s rejected: %v", status, err)
			}
		}
	})

	t.Run("invalid status values", func(t *testing.T) {
		for field, value := range map[string]any{
			"riichiStatus":     "declared",
			"openTanyaoStatus": "optional",
		} {
			raw := handStructureRequestJSON(t)
			raw["yakuContext"].(map[string]any)[field] = value
			if err := decodeAndValidateHandStructureRequest(raw); err == nil || !strings.Contains(err.Error(), field) {
				t.Fatalf("validation error = %v, want %s", err, field)
			}
		}
	})
}

func TestValidateHandStructureRejectsZeroYakuContextDirectly(t *testing.T) {
	request := goldenHandStructureRequest()
	request.YakuContext = YakuContextV2{}
	if err := validateHandStructureRequest(request); err == nil || !strings.Contains(err.Error(), "yakuContext") {
		t.Fatalf("validation error = %v, want direct yakuContext error", err)
	}
}

func TestValidateHandStructureRejectsAcceptedRiichiWithOpenMelds(t *testing.T) {
	for _, meld := range []MeldInput{
		{Kind: "chi", Tiles34: []int{0, 1, 2}},
		{Kind: "pon", Tiles34: []int{27, 27, 27}},
		{Kind: "daiminkan", Tiles34: []int{27, 27, 27, 27}},
		{Kind: "kakan", Tiles34: []int{27, 27, 27, 27}},
	} {
		t.Run(meld.Kind, func(t *testing.T) {
			raw := handStructureRequestJSON(t)
			raw["handTiles34"] = counts34(3, 4, 5, 9, 10, 11, 18, 19, 20, 31)
			raw["melds"] = []MeldInput{meld}
			raw["visibleCountsComplete"] = false
			raw["leftTiles34"] = nil
			raw["yakuContext"].(map[string]any)["riichiStatus"] = "accepted"
			if err := decodeAndValidateHandStructureRequest(raw); err == nil || !strings.Contains(err.Error(), "riichiStatus") {
				t.Fatalf("validation error = %v, want riichiStatus conflict", err)
			}
		})
	}

	raw := handStructureRequestJSON(t)
	raw["handTiles34"] = counts34(3, 4, 5, 9, 10, 11, 18, 19, 20, 31)
	raw["melds"] = []MeldInput{{Kind: "ankan", Tiles34: []int{27, 27, 27, 27}}}
	raw["visibleCountsComplete"] = false
	raw["leftTiles34"] = nil
	raw["yakuContext"].(map[string]any)["riichiStatus"] = "accepted"
	if err := decodeAndValidateHandStructureRequest(raw); err != nil {
		t.Fatalf("accepted riichi with ankan rejected: %v", err)
	}
}

func TestValidateHandStructureUsesPreciseRonContexts(t *testing.T) {
	for _, ronContext := range []string{
		"complete_none", "known_kakan_chankan", "known_ankan_chankan", "known_houtei", "unknown_future",
	} {
		raw := handStructureRequestJSON(t)
		raw["ronContext"] = ronContext
		if err := decodeAndValidateHandStructureRequest(raw); err != nil {
			t.Fatalf("ronContext %s rejected: %v", ronContext, err)
		}
	}
	raw := handStructureRequestJSON(t)
	raw["ronContext"] = "known_chankan"
	if err := decodeAndValidateHandStructureRequest(raw); err == nil || !strings.Contains(err.Error(), "ronContext") {
		t.Fatalf("legacy ron context error = %v", err)
	}
}

func TestValidateHandStructureRejectsInvalidEnvelope(t *testing.T) {
	tests := []struct {
		name string
		edit func(*HandStructureRequestV2)
		want string
	}{
		{"wrong kind", func(request *HandStructureRequestV2) { request.Kind = "hand13" }, "kind"},
		{"wrong schema", func(request *HandStructureRequestV2) { request.SchemaVersion = "hand-structure/v1" }, "schemaVersion"},
		{"missing request id", func(request *HandStructureRequestV2) { request.RequestID = "" }, "requestId"},
		{"wrong protocol", func(request *HandStructureRequestV2) { request.ProtocolVersion = "mahjong-facts/v2" }, "protocol"},
		{"missing action ref", func(request *HandStructureRequestV2) { request.ActionRef = "" }, "actionRef"},
		{"missing state hash", func(request *HandStructureRequestV2) { request.StateHash = "" }, "stateHash"},
		{"unknown ron context", func(request *HandStructureRequestV2) { request.RonContext = "known_haitei" }, "ronContext"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := goldenHandStructureRequest()
			test.edit(&request)
			err := validateHandStructureRequest(request)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("validation error = %v, want field %q", err, test.want)
			}
		})
	}
}

func TestValidateHandStructureRejectsInvalidConcealedCounts(t *testing.T) {
	tests := []struct {
		name string
		edit func(*HandStructureRequestV2)
		want string
	}{
		{"wrong vector length", func(request *HandStructureRequestV2) { request.HandTiles34 = request.HandTiles34[:33] }, "34 counts"},
		{"count above four", func(request *HandStructureRequestV2) { request.HandTiles34[0] = 5 }, "between 0 and 4"},
		{"wrong concealed total", func(request *HandStructureRequestV2) { request.HandTiles34[0]-- }, "13 concealed"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := goldenHandStructureRequest()
			test.edit(&request)
			err := validateHandStructureRequest(request)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("validation error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestValidateHandStructureRequiresStrictMeldsAndOpenConcealedCount(t *testing.T) {
	t.Run("nil meld array", func(t *testing.T) {
		request := goldenHandStructureRequest()
		request.Melds = nil
		if err := validateHandStructureRequest(request); err == nil || !strings.Contains(err.Error(), "melds") {
			t.Fatalf("validation error = %v, want melds error", err)
		}
	})

	t.Run("out-of-range meld tile", func(t *testing.T) {
		request := goldenHandStructureRequest()
		request.Melds = []MeldInput{{Kind: "pon", Tiles34: []int{34, 34, 34}}}
		request.HandTiles34 = counts34(9, 10, 11, 18, 19, 20, 24, 25, 27, 27)
		request.VisibleCountsComplete = false
		request.LeftTiles34 = nil
		if err := validateHandStructureRequest(request); err == nil || !strings.Contains(err.Error(), "invalid Tile34") {
			t.Fatalf("validation error = %v, want Tile34 error", err)
		}
	})

	t.Run("malformed meld", func(t *testing.T) {
		request := goldenHandStructureRequest()
		request.Melds = []MeldInput{{Kind: "chi", Tiles34: []int{0, 1, 3}}}
		request.HandTiles34 = counts34(9, 10, 11, 18, 19, 20, 24, 25, 27, 27)
		request.LeftTiles34 = theoreticalLeftTiles34(request.HandTiles34, request.Melds)
		if err := validateHandStructureRequest(request); err == nil || !strings.Contains(err.Error(), "chi") {
			t.Fatalf("validation error = %v, want chi error", err)
		}
	})

	t.Run("open hand concealed count", func(t *testing.T) {
		request := goldenHandStructureRequest()
		request.Melds = []MeldInput{{Kind: "chi", Tiles34: []int{0, 1, 2}}}
		request.LeftTiles34 = theoreticalLeftTiles34(request.HandTiles34, request.Melds)
		if err := validateHandStructureRequest(request); err == nil || !strings.Contains(err.Error(), "10 concealed") {
			t.Fatalf("validation error = %v, want open concealed-count error", err)
		}
	})

	t.Run("cross-zone ownership over four", func(t *testing.T) {
		request := goldenHandStructureRequest()
		request.Melds = []MeldInput{{Kind: "pon", Tiles34: []int{0, 0, 0}}}
		request.HandTiles34 = counts34(0, 0, 9, 10, 11, 18, 19, 20, 27, 27)
		request.LeftTiles34 = theoreticalLeftTiles34(request.HandTiles34, request.Melds)
		if err := validateHandStructureRequest(request); err == nil || !strings.Contains(err.Error(), "owned tile count") {
			t.Fatalf("validation error = %v, want ownership error", err)
		}
	})
}

func TestValidateHandStructureEnforcesVisibilityCompleteness(t *testing.T) {
	tests := []struct {
		name string
		edit func(*HandStructureRequestV2)
		want string
	}{
		{"complete without counts", func(request *HandStructureRequestV2) { request.LeftTiles34 = nil }, "leftTiles34"},
		{"incomplete with counts", func(request *HandStructureRequestV2) { request.VisibleCountsComplete = false }, "leftTiles34"},
		{"incomplete with empty counts", func(request *HandStructureRequestV2) {
			request.VisibleCountsComplete = false
			request.LeftTiles34 = []int{}
		}, "leftTiles34"},
		{"wrong live vector length", func(request *HandStructureRequestV2) { request.LeftTiles34 = request.LeftTiles34[:33] }, "34 counts"},
		{"live plus owned above four", func(request *HandStructureRequestV2) { request.LeftTiles34[0] = 4 }, "conflicts with owned"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := goldenHandStructureRequest()
			test.edit(&request)
			err := validateHandStructureRequest(request)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("validation error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestAnalyzeHandStructureReturnsCanonicalFamiliesAndRemainingCounts(t *testing.T) {
	request := goldenHandStructureRequest()
	request.LeftTiles34[23] = 0
	request.LeftTiles34[26] = 1
	result, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatalf("analyze hand structure: %v", err)
	}
	if result.Kind != "hand_structure_result" || result.SchemaVersion != handStructureSchemaVersion {
		t.Fatalf("unexpected result envelope: %#v", result)
	}
	wantOrder := []string{"standard", "chiitoitsu", "kokushi"}
	gotOrder := make([]string, 0, len(result.Families))
	for _, family := range result.Families {
		gotOrder = append(gotOrder, family.Family)
		previous := -1
		for _, effective := range family.EffectiveTiles {
			if effective.Tile34 <= previous {
				t.Fatalf("%s effective tiles are not strictly sorted: %v", family.Family, family.EffectiveTiles)
			}
			previous = effective.Tile34
			if effective.RemainingStatus != "calculated" || effective.Remaining == nil || *effective.Remaining != request.LeftTiles34[effective.Tile34] {
				t.Fatalf("%s effective tile remaining mismatch: %#v", family.Family, effective)
			}
		}
	}
	if !reflect.DeepEqual(gotOrder, wantOrder) {
		t.Fatalf("family order = %v, want %v", gotOrder, wantOrder)
	}
	if result.OverallShanten != 0 || !reflect.DeepEqual(result.BestFamilies, []string{"standard"}) {
		t.Fatalf("overall/best = %d/%v, want 0/[standard]", result.OverallShanten, result.BestFamilies)
	}
	standard := result.Families[0]
	foundExhausted := false
	for _, effective := range standard.EffectiveTiles {
		if effective.Tile34 == 23 {
			foundExhausted = true
			if effective.Remaining == nil || *effective.Remaining != 0 {
				t.Fatalf("exhausted effective tile must remain explicit with zero left: %#v", effective)
			}
		}
	}
	if !foundExhausted {
		t.Fatalf("structural effective tile with zero live copies was omitted: %#v", standard.EffectiveTiles)
	}
}

func TestAnalyzeHandStructureFiltersFifthCopyOwnedThroughMeld(t *testing.T) {
	request := goldenHandStructureRequest()
	request.HandTiles34 = counts34(0, 9, 10, 11, 18, 19, 20, 24, 25, 26)
	request.Melds = []MeldInput{{Kind: "pon", Tiles34: []int{0, 0, 0}}}
	request.VisibleCountsComplete = false
	request.LeftTiles34 = nil
	if got := effectiveTilesForFamily(request.HandTiles34, len(request.Melds), "standard"); !reflect.DeepEqual(got, []int{0}) {
		t.Fatalf("test fixture no longer exposes concealed-only fifth-copy edge: %v", got)
	}
	result, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatalf("analyze hand structure: %v", err)
	}
	for _, effective := range result.Families[0].EffectiveTiles {
		if effective.Tile34 == 0 {
			t.Fatalf("result emitted impossible fifth owned copy: %#v", result.Families[0].EffectiveTiles)
		}
	}
}

func TestAnalyzeHandStructureBlocksOnlyRemainingCountsWhenVisibilityIncomplete(t *testing.T) {
	request := goldenHandStructureRequest()
	request.VisibleCountsComplete = false
	request.LeftTiles34 = nil
	result, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatalf("analyze hand structure: %v", err)
	}
	if result.OverallShanten != 0 {
		t.Fatalf("overall shanten = %d, want 0", result.OverallShanten)
	}
	for _, family := range result.Families {
		for _, effective := range family.EffectiveTiles {
			if effective.RemainingStatus != "blocked_missing_facts" || effective.Remaining != nil {
				t.Fatalf("incomplete visibility leaked remaining count: %#v", effective)
			}
		}
	}
}

func TestAnalyzeHandStructureMarshalsEmptyArraysAndBlockedRemainingExplicitly(t *testing.T) {
	request := goldenHandStructureRequest()
	request.VisibleCountsComplete = false
	request.LeftTiles34 = nil
	result, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatalf("analyze hand structure: %v", err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	var object map[string]any
	if err := json.Unmarshal(encoded, &object); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	for _, field := range []string{"bestFamilies", "families", "waits", "diagnostics"} {
		value, ok := object[field].([]any)
		if !ok || value == nil {
			t.Fatalf("%s must marshal as an array, JSON = %s", field, encoded)
		}
	}
	decompositions, ok := object["decompositions"].(map[string]any)
	if !ok {
		t.Fatalf("decompositions must marshal as object, JSON = %s", encoded)
	}
	for _, field := range []string{"items", "invariantClaims", "alternativeClaims"} {
		value, ok := decompositions[field].([]any)
		if !ok || value == nil {
			t.Fatalf("decompositions.%s must marshal as [], JSON = %s", field, encoded)
		}
	}
	families := object["families"].([]any)
	foundEffective := false
	for _, rawFamily := range families {
		family := rawFamily.(map[string]any)
		effectiveTiles, ok := family["effectiveTiles"].([]any)
		if !ok || effectiveTiles == nil {
			t.Fatalf("effectiveTiles must marshal as array, JSON = %s", encoded)
		}
		for _, rawEffective := range effectiveTiles {
			foundEffective = true
			effective := rawEffective.(map[string]any)
			if effective["remainingStatus"] != "blocked_missing_facts" || effective["remaining"] != nil {
				t.Fatalf("blocked remaining must marshal as explicit null: %v", effective)
			}
		}
	}
	if !foundEffective {
		t.Fatalf("fixture unexpectedly has no effective tiles: JSON = %s", encoded)
	}
}
