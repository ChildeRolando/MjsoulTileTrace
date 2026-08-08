package main

import (
	"encoding/json"
	"reflect"
	"sort"
	"testing"

	"github.com/EndlessCheng/mahjong-helper/util/model"
)

func handStructureWaitRequest(hand []int) HandStructureRequestV2 {
	request := goldenHandStructureRequest()
	request.HandTiles34 = cloneInts(hand)
	request.LeftTiles34 = theoreticalLeftTiles34(hand, request.Melds)
	request.RonContext = "complete_none"
	request.YakuContext = YakuContextV2{
		WindsStatus:      "known",
		RoundWindTile34:  intPointer(28),
		SelfWindTile34:   intPointer(29),
		RiichiStatus:     "inactive",
		OpenTanyaoStatus: "enabled",
	}
	return request
}

func waitByTile(t *testing.T, result HandStructureResultV2, tile int) WaitV2 {
	t.Helper()
	for _, wait := range result.Waits {
		if wait.Tile34 == tile {
			return wait
		}
	}
	t.Fatalf("tile %d missing from waits: %#v", tile, result.Waits)
	return WaitV2{}
}

func assertTypedWait(
	t *testing.T,
	hand []int,
	tile int,
	wantFamilies []string,
	wantTypes []string,
) {
	t.Helper()
	request := handStructureWaitRequest(hand)
	result, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatal(err)
	}
	wait := waitByTile(t, result, tile)
	if !reflect.DeepEqual(wait.Families, wantFamilies) {
		t.Fatalf("tile %d families = %v, want %v", tile, wait.Families, wantFamilies)
	}
	if !reflect.DeepEqual(wait.WaitTypes, wantTypes) {
		t.Fatalf("tile %d wait types = %v, want %v", tile, wait.WaitTypes, wantTypes)
	}
	returned := make(map[string]DecompositionV2, len(result.Decompositions.Items))
	for _, item := range result.Decompositions.Items {
		returned[item.DecompositionRef] = item
	}
	if !result.Decompositions.Truncated && len(wait.DecompositionRefs) == 0 {
		t.Fatalf("tile %d did not map a completed division to its returned pre-draw decomposition", tile)
	}
	for _, ref := range wait.DecompositionRefs {
		item, exists := returned[ref]
		if !exists {
			t.Fatalf("tile %d carries dangling decomposition ref %q", tile, ref)
		}
		foundFamily := false
		for _, family := range wait.Families {
			foundFamily = foundFamily || item.Family == family
		}
		if !foundFamily {
			t.Fatalf("tile %d ref %q has unrelated family %q", tile, ref, item.Family)
		}
	}
}

func TestWaitTypesCoverStandardShapes(t *testing.T) {
	commonMeldsAndPair := []int{9, 10, 11, 18, 19, 20, 24, 25, 26, 27, 27}
	tests := []struct {
		name string
		hand []int
		tile int
		kind string
	}{
		{"ryanmen", counts34(append([]int{3, 4}, commonMeldsAndPair...)...), 2, "ryanmen"},
		{"kanchan", counts34(append([]int{0, 2}, commonMeldsAndPair...)...), 1, "kanchan"},
		{"penchan low", counts34(append([]int{0, 1}, commonMeldsAndPair...)...), 2, "penchan"},
		{"penchan high", counts34(append([]int{7, 8}, commonMeldsAndPair...)...), 6, "penchan"},
		{
			"shanpon",
			counts34(0, 1, 2, 9, 10, 11, 18, 19, 20, 4, 4, 14, 14),
			4,
			"shanpon",
		},
		{
			"tanki",
			counts34(0, 1, 2, 9, 10, 11, 18, 19, 20, 24, 25, 26, 27),
			27,
			"tanki",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assertTypedWait(t, test.hand, test.tile, []string{"standard"}, []string{test.kind})
		})
	}
}

func TestCompositeWaitUnionsLabelsFromEveryCompletedDivision(t *testing.T) {
	// Winning 7s can complete either 567s from a 56s ryanmen or 789s
	// from an 89s penchan in the same completed division.
	hand := counts34(11, 11, 19, 20, 21, 22, 23, 24, 25, 26, 33, 33, 33)
	request := handStructureWaitRequest(hand)
	first, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatal(err)
	}
	second, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatal(err)
	}
	wait := waitByTile(t, first, 24)
	if !reflect.DeepEqual(wait.WaitTypes, []string{"ryanmen", "penchan"}) {
		t.Fatalf("composite wait types = %v", wait.WaitTypes)
	}
	if len(wait.DecompositionRefs) != 2 {
		t.Fatalf("composite wait refs = %v, want both pre-draw partitions", wait.DecompositionRefs)
	}
	firstJSON, _ := json.Marshal(first)
	secondJSON, _ := json.Marshal(second)
	if string(firstJSON) != string(secondJSON) {
		t.Fatalf("wait derivation is unstable:\n%s\n%s", firstJSON, secondJSON)
	}
}

func TestSpecialFamilyWaitTypes(t *testing.T) {
	assertTypedWait(
		t,
		counts34(0, 0, 8, 8, 9, 9, 17, 17, 18, 18, 26, 26, 27),
		27,
		[]string{"chiitoitsu"},
		[]string{"tanki"},
	)
	assertTypedWait(
		t,
		counts34(0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32),
		33,
		[]string{"kokushi"},
		[]string{"kokushi_single"},
	)

	thirteenSided := counts34(0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33)
	for _, tile := range kokushiTiles34 {
		assertTypedWait(t, thirteenSided, tile, []string{"kokushi"}, []string{"kokushi_thirteen_sided"})
	}
}

func TestWaitFamiliesAreMergedInCanonicalOrder(t *testing.T) {
	// 1122334455667m is tenpai as both standard and chiitoitsu on 7m.
	hand := counts34(0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6)
	result, err := analyzeHandStructure(handStructureWaitRequest(hand))
	if err != nil {
		t.Fatal(err)
	}
	wait := waitByTile(t, result, 6)
	if !reflect.DeepEqual(wait.Families, []string{"standard", "chiitoitsu"}) {
		t.Fatalf("tied-family wait = %v", wait.Families)
	}
	if !reflect.DeepEqual(wait.WaitTypes, []string{"ryanmen", "tanki"}) {
		t.Fatalf("tied-family labels = %v", wait.WaitTypes)
	}
}

func TestWaitEligibilityUsesAnyLegalFamilyPath(t *testing.T) {
	hand := counts34(3, 4, 9, 10, 11, 18, 19, 20, 24, 25, 26, 27, 27)
	request := handStructureWaitRequest(hand)
	request.RonContext = "known_ankan_chankan"
	owned := ownedTileCounts34(hand, request.Melds)
	zero := 0
	standard := familyResult(request, "standard", &zero, owned)
	kokushi := familyResult(request, "kokushi", &zero, owned)
	// Exercise the aggregation boundary directly: the fixture shape is standard,
	// while the injected kokushi family models a second legal-family proof for
	// the same tile. Ankan chankan rejects ordinary hands but admits kokushi.
	kokushi.EffectiveTiles = []EffectiveTileV2{standard.EffectiveTiles[0]}
	families := []HandFamilyResultV2{
		standard,
		familyResult(request, "chiitoitsu", intPointer(4), owned),
		kokushi,
	}
	decompositions := buildDecompositionSet([]DecompositionV2{
		nonDominatedStandardDecompositions(hand, 0)[0],
		syntheticFamilyDecomposition(hand, "kokushi", 0),
	})
	waits, err := deriveWaits(request, families, decompositions)
	if err != nil {
		t.Fatal(err)
	}
	wait := waitByTile(t, HandStructureResultV2{Waits: waits}, standard.EffectiveTiles[0].Tile34)
	if wait.BaseRonEligibility != "eligible" {
		t.Fatalf("one legal family path must make ron eligible: %#v", wait)
	}
	if got := mergeEligibility([]string{"ineligible", "eligible"}); got != "eligible" {
		t.Fatalf("eligibility OR merge = %q", got)
	}
}

func TestWaitOrderingDeduplicationRemainingAndDiagnostics(t *testing.T) {
	hand := counts34(3, 4, 9, 10, 11, 18, 19, 20, 24, 25, 26, 27, 27)
	original := cloneInts(hand)
	request := handStructureWaitRequest(hand)
	request.VisibleCountsComplete = false
	request.LeftTiles34 = nil
	request.YakuContext.WindsStatus = "unknown"
	request.YakuContext.RoundWindTile34 = nil
	request.YakuContext.SelfWindTile34 = nil
	result, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(hand, original) {
		t.Fatalf("wait analysis mutated input: got %v want %v", hand, original)
	}
	ids := make([]int, len(result.Waits))
	for index, wait := range result.Waits {
		ids[index] = wait.Tile34
		if wait.RemainingStatus != "blocked_missing_facts" || wait.Remaining != nil {
			t.Fatalf("unknown visibility leaked remaining count: %#v", wait)
		}
		if !sort.StringsAreSorted(wait.DecompositionRefs) || len(wait.DecompositionRefs) != len(uniqueStrings(wait.DecompositionRefs)) {
			t.Fatalf("refs are not sorted/deduplicated: %v", wait.DecompositionRefs)
		}
		if len(wait.Families) != len(uniqueStrings(wait.Families)) || len(wait.WaitTypes) != len(uniqueStrings(wait.WaitTypes)) {
			t.Fatalf("families/types are not deduplicated: %#v", wait)
		}
	}
	if !sort.IntsAreSorted(ids) {
		t.Fatalf("wait tiles are not sorted: %v", ids)
	}
	if !reflect.DeepEqual(result.Diagnostics, []string{"ron_eligibility_missing_situational_context"}) {
		t.Fatalf("diagnostics = %v", result.Diagnostics)
	}
}

func TestTruncationMayOmitAWaitRefButNeverEmitsADanglingRef(t *testing.T) {
	hand := counts34(11, 11, 19, 20, 21, 22, 23, 24, 25, 26, 33, 33, 33)
	request := handStructureWaitRequest(hand)
	shanten := calculateFamilyShanten(hand, 0)
	owned := ownedTileCounts34(hand, request.Melds)
	standard := shanten.Standard
	families := []HandFamilyResultV2{
		familyResult(request, "standard", &standard, owned),
		familyResult(request, "chiitoitsu", shanten.Chiitoitsu, owned),
		familyResult(request, "kokushi", shanten.Kokushi, owned),
	}
	// Simulate a capped response where every matching pre-draw partition for
	// this wait fell beyond the returned prefix. Labels remain calculated, but
	// refs must be empty rather than pointing at omitted items.
	truncated := DecompositionSetV2{
		Status:            "calculated",
		TotalNonDominated: maxNonDominatedDecompositions + 1,
		Truncated:         true,
		Items:             []DecompositionV2{},
		InvariantClaims:   []ShapeGroup{},
		AlternativeClaims: []AlternativeClaimV2{},
	}
	waits, err := deriveWaits(request, families, truncated)
	if err != nil {
		t.Fatal(err)
	}
	wait := waitByTile(t, HandStructureResultV2{Waits: waits}, 24)
	if !reflect.DeepEqual(wait.WaitTypes, []string{"ryanmen", "penchan"}) || len(wait.DecompositionRefs) != 0 {
		t.Fatalf("truncated wait evidence = %#v", wait)
	}
}

func TestNonTenpaiHasNoWaitsAndNoEligibilityDiagnostic(t *testing.T) {
	request := handStructureWaitRequest(counts34(0, 1, 3, 5, 8, 9, 12, 16, 18, 21, 26, 27, 31))
	result, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatal(err)
	}
	if result.OverallShanten == 0 || len(result.Waits) != 0 {
		t.Fatalf("non-tenpai result carries waits: shanten=%d waits=%#v", result.OverallShanten, result.Waits)
	}
	if !reflect.DeepEqual(result.Diagnostics, decompositionDiagnostics(result.Decompositions)) {
		t.Fatalf("non-tenpai diagnostics = %v", result.Diagnostics)
	}
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

func eligibilityPlayer(hand []int, melds []MeldInput, winTile int) *model.PlayerInfo {
	if melds == nil {
		melds = []MeldInput{}
	}
	converted, err := convertMelds(melds)
	if err != nil {
		panic(err)
	}
	return &model.PlayerInfo{
		HandTiles34: cloneInts(hand),
		Melds:       converted,
		DoraTiles:   []int{},
		NumRedFives: []int{0, 0, 0},
		IsTsumo:     false,
		WinTile:     winTile,
	}
}

func knownYakuContext(roundWind, selfWind int) YakuContextV2 {
	return YakuContextV2{
		WindsStatus:      "known",
		RoundWindTile34:  intPointer(roundWind),
		SelfWindTile34:   intPointer(selfWind),
		RiichiStatus:     "inactive",
		OpenTanyaoStatus: "enabled",
	}
}

func TestRonEligibilityEnumeratesWindAndRiichiContext(t *testing.T) {
	eastTriplet := eligibilityPlayer(
		counts34(0, 1, 2, 3, 4, 5, 15, 16, 17, 22, 22, 27, 27, 27),
		nil,
		2,
	)
	if got := baseRonEligibility(eastTriplet, knownYakuContext(27, 28), "complete_none", false); got != "eligible" {
		t.Fatalf("round-wind east triplet = %q", got)
	}
	if got := baseRonEligibility(eastTriplet, knownYakuContext(28, 29), "complete_none", false); got != "ineligible" {
		t.Fatalf("guest east triplet = %q", got)
	}
	unknownWinds := knownYakuContext(28, 29)
	unknownWinds.WindsStatus = "unknown"
	unknownWinds.RoundWindTile34 = nil
	unknownWinds.SelfWindTile34 = nil
	if got := baseRonEligibility(eastTriplet, unknownWinds, "complete_none", false); got != "unknown_missing_situational_yaku_context" {
		t.Fatalf("unknown winds with mixed outcomes = %q", got)
	}

	noYaku := eligibilityPlayer(
		counts34(0, 1, 2, 3, 4, 5, 13, 13, 15, 16, 17, 19, 20, 21),
		nil,
		2,
	)
	known := knownYakuContext(28, 29)
	if got := baseRonEligibility(noYaku, known, "complete_none", false); got != "ineligible" {
		t.Fatalf("closed inactive no-yaku = %q", got)
	}
	accepted := known
	accepted.RiichiStatus = "accepted"
	if got := baseRonEligibility(noYaku, accepted, "complete_none", false); got != "eligible" {
		t.Fatalf("accepted riichi must prove yaku = %q", got)
	}
	unknownRiichi := known
	unknownRiichi.RiichiStatus = "unknown"
	if got := baseRonEligibility(noYaku, unknownRiichi, "complete_none", false); got != "unknown_missing_situational_yaku_context" {
		t.Fatalf("unknown riichi with mixed outcomes = %q", got)
	}
}

func TestRonEligibilityHandlesOpenTanyaoWithoutOverclaiming(t *testing.T) {
	openTanyao := eligibilityPlayer(
		counts34(2, 3, 4, 12, 13, 14, 23, 24, 25, 13, 13),
		[]MeldInput{{Kind: "chi", Tiles34: []int{1, 2, 3}}},
		4,
	)
	known := knownYakuContext(28, 29)
	if got := baseRonEligibility(openTanyao, known, "complete_none", false); got != "eligible" {
		t.Fatalf("enabled open tanyao = %q", got)
	}
	disabled := known
	disabled.OpenTanyaoStatus = "disabled"
	if got := baseRonEligibility(openTanyao, disabled, "complete_none", false); got != "unknown_missing_situational_yaku_context" {
		t.Fatalf("disabled open tanyao helper-positive result = %q", got)
	}
	unknown := known
	unknown.OpenTanyaoStatus = "unknown"
	if got := baseRonEligibility(openTanyao, unknown, "complete_none", false); got != "unknown_missing_situational_yaku_context" {
		t.Fatalf("unknown open tanyao rule = %q", got)
	}

	openAllSimplesToitoi := eligibilityPlayer(
		counts34(4, 4, 12, 12, 12, 14, 14, 14, 21, 21, 21),
		[]MeldInput{{Kind: "pon", Tiles34: []int{1, 1, 1}}},
		4,
	)
	if got := baseRonEligibility(openAllSimplesToitoi, disabled, "complete_none", false); got != "unknown_missing_situational_yaku_context" {
		t.Fatalf("disabled kuitan cannot erase possible toitoi = %q", got)
	}

	openYakuhai := eligibilityPlayer(
		counts34(0, 1, 2, 3, 4, 5, 15, 16, 17, 22, 22),
		[]MeldInput{{Kind: "pon", Tiles34: []int{31, 31, 31}}},
		2,
	)
	if got := baseRonEligibility(openYakuhai, disabled, "complete_none", false); got != "eligible" {
		t.Fatalf("terminal/honor-bearing open independent yaku = %q", got)
	}
}

func TestOpenHandCannotGainRiichiFromAnIncompatibleContext(t *testing.T) {
	openNoYaku := eligibilityPlayer(
		counts34(3, 4, 5, 13, 13, 15, 16, 17, 19, 20, 21),
		[]MeldInput{{Kind: "chi", Tiles34: []int{0, 1, 2}}},
		17,
	)
	accepted := knownYakuContext(28, 29)
	accepted.RiichiStatus = "accepted"
	accepted.OpenTanyaoStatus = "disabled"
	if got := baseRonEligibility(openNoYaku, accepted, "complete_none", false); got != "ineligible" {
		t.Fatalf("open hand was allowed to gain riichi yaku = %q", got)
	}
}

func TestRonEligibilityRonContextsAndDoraExclusion(t *testing.T) {
	noYaku := eligibilityPlayer(
		counts34(0, 1, 2, 3, 4, 5, 13, 13, 15, 16, 17, 19, 20, 21),
		nil,
		2,
	)
	known := knownYakuContext(28, 29)
	if got := baseRonEligibility(noYaku, known, "known_kakan_chankan", false); got != "eligible" {
		t.Fatalf("known kakan chankan = %q", got)
	}
	if got := baseRonEligibility(noYaku, known, "known_houtei", false); got != "eligible" {
		t.Fatalf("known houtei = %q", got)
	}
	if got := baseRonEligibility(noYaku, known, "known_ankan_chankan", false); got != "ineligible" {
		t.Fatalf("ordinary ankan chankan = %q", got)
	}
	if got := baseRonEligibility(nil, known, "known_ankan_chankan", true); got != "eligible" {
		t.Fatalf("kokushi ankan chankan = %q", got)
	}

	independentYaku := eligibilityPlayer(
		counts34(1, 2, 3, 3, 4, 5, 12, 13, 14, 23, 24, 25, 13, 13),
		nil,
		3,
	)
	allUnknown := known
	allUnknown.WindsStatus = "unknown"
	allUnknown.RoundWindTile34 = nil
	allUnknown.SelfWindTile34 = nil
	allUnknown.RiichiStatus = "unknown"
	allUnknown.OpenTanyaoStatus = "unknown"
	if got := baseRonEligibility(independentYaku, allUnknown, "complete_none", false); got != "eligible" {
		t.Fatalf("unrelated missing context obscured a baseline yaku = %q", got)
	}
	if got := baseRonEligibility(independentYaku, known, "unknown_future", false); got != "eligible" {
		t.Fatalf("future context must preserve proven baseline yaku = %q", got)
	}
	if got := baseRonEligibility(noYaku, known, "unknown_future", false); got != "unknown_missing_situational_yaku_context" {
		t.Fatalf("future no-yaku context = %q", got)
	}

	// A notional dora indicator must never turn a no-yaku hand into eligible.
	noYaku.DoraTiles = []int{2, 2}
	noYaku.NumRedFives = []int{1, 1, 1}
	before := append([]int(nil), noYaku.DoraTiles...)
	if got := baseRonEligibility(noYaku, known, "complete_none", false); got != "ineligible" {
		t.Fatalf("dora-only hand = %q", got)
	}
	if !reflect.DeepEqual(noYaku.DoraTiles, before) {
		t.Fatalf("eligibility mutated source player: got %v want %v", noYaku.DoraTiles, before)
	}
}
