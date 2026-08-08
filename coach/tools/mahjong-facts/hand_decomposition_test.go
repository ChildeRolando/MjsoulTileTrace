package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"reflect"
	"strings"
	"testing"

	"github.com/EndlessCheng/mahjong-helper/util"
)

func groupCount(groups []ShapeGroup, want ShapeGroup) int {
	count := 0
	for _, group := range groups {
		if group.Kind == want.Kind && reflect.DeepEqual(group.Tiles34, want.Tiles34) {
			count++
		}
	}
	return count
}

func containsGroup(groups []ShapeGroup, want ShapeGroup) bool {
	return groupCount(groups, want) > 0
}

func TestDecompositionRetainsSequenceAndPairAlternativesFor112233m(t *testing.T) {
	// 1122334567789m can remain tenpai either as 123m twice plus 456m/789m,
	// or with 11m as the head and a different exact-minimum block assignment.
	hand := counts34(0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 8)
	results := nonDominatedStandardDecompositions(hand, 0)
	sequence123 := ShapeGroup{Kind: "sequence", Tiles34: []int{0, 1, 2}}
	pair11 := ShapeGroup{Kind: "pair_candidate", Tiles34: []int{0, 0}}
	sequenceHeavy := false
	pairHeavy := false
	for _, result := range results {
		if result.Shanten != 0 {
			t.Fatalf("non-minimum decomposition escaped oracle filter: %#v", result)
		}
		sequenceHeavy = sequenceHeavy || groupCount(result.Groups, sequence123) == 2
		pairHeavy = pairHeavy || containsGroup(result.Groups, pair11)
	}
	if !sequenceHeavy || !pairHeavy {
		t.Fatalf("112233m alternatives lost: sequence-heavy=%v pair-heavy=%v results=%#v", sequenceHeavy, pairHeavy, results)
	}
}

func TestDecompositionPreserves456789sAsTwoMelds(t *testing.T) {
	// Exact post-draw motif from the motivating review: 456789s is two complete
	// melds, not a shape from which 6s may be called an efficiency redundancy.
	hand := counts34(21, 22, 23, 24, 25, 26, 27, 27, 31, 31, 32, 32, 33)
	original := append([]int(nil), hand...)
	results := nonDominatedStandardDecompositions(hand, 0)
	wantA := ShapeGroup{Kind: "sequence", Tiles34: []int{21, 22, 23}}
	wantB := ShapeGroup{Kind: "sequence", Tiles34: []int{24, 25, 26}}
	found := false
	for _, result := range results {
		if containsGroup(result.Groups, wantA) && containsGroup(result.Groups, wantB) {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("no non-dominated decomposition preserved both 456s and 789s")
	}
	if !reflect.DeepEqual(hand, original) {
		t.Fatalf("decomposition mutated input: got %v want %v", hand, original)
	}
}

func TestDecompositionPreservesHonorQuadsUnderPinnedForcedDiscardClamp(t *testing.T) {
	hand := counts34(27, 27, 27, 27, 28, 28, 28, 28, 29, 29, 29, 29, 30)
	target := util.CalculateShantenOfNormal(append([]int(nil), hand...), 13)
	if target != 3 {
		t.Fatalf("pinned helper quad fixture changed: target=%d", target)
	}
	results := nonDominatedStandardDecompositions(hand, 0)
	if len(results) == 0 {
		t.Fatal("forced-discard oracle clamp must not erase every physical decomposition")
	}
	foundPhysicalQuadShape := false
	for _, result := range results {
		if result.Shanten != target {
			t.Fatalf("decomposition must carry pinned oracle shanten %d: %#v", target, result)
		}
		allQuadsPhysical := true
		for _, tile := range []int{27, 28, 29} {
			if groupCount(result.Groups, ShapeGroup{Kind: "pair_candidate", Tiles34: []int{tile, tile}}) > 1 {
				t.Fatalf("quad %d was falsely treated as two independent pair candidates: %#v", tile, result)
			}
			allQuadsPhysical = allQuadsPhysical &&
				containsGroup(result.Groups, ShapeGroup{Kind: "triplet", Tiles34: []int{tile, tile, tile}}) &&
				containsGroup(result.Groups, ShapeGroup{Kind: "floating", Tiles34: []int{tile}})
		}
		foundPhysicalQuadShape = foundPhysicalQuadShape || allQuadsPhysical
	}
	if !foundPhysicalQuadShape {
		t.Fatalf("honor quad triplet+forced-floating structure was erased: %#v", results)
	}
}

func TestNonDominatedDecompositionsAreDeduplicatedAndStable(t *testing.T) {
	hand := counts34(0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 8)
	original := append([]int(nil), hand...)
	first := nonDominatedStandardDecompositions(hand, 0)
	second := nonDominatedStandardDecompositions(hand, 0)
	firstJSON, err := json.Marshal(first)
	if err != nil {
		t.Fatal(err)
	}
	secondJSON, err := json.Marshal(second)
	if err != nil {
		t.Fatal(err)
	}
	if string(firstJSON) != string(secondJSON) {
		t.Fatalf("repeated runs differ:\n%s\n%s", firstJSON, secondJSON)
	}
	if !reflect.DeepEqual(hand, original) {
		t.Fatalf("repeated runs mutated input: got %v want %v", hand, original)
	}
	refs := map[string]bool{}
	groupKeys := map[string]bool{}
	for _, item := range first {
		if refs[item.DecompositionRef] {
			t.Fatalf("duplicate decomposition ref %q", item.DecompositionRef)
		}
		refs[item.DecompositionRef] = true
		key := partitionKey(item.Groups)
		if groupKeys[key] {
			t.Fatalf("duplicate canonical partition %q", key)
		}
		groupKeys[key] = true
	}
}

func TestTruncatedClaimsUseFullSetButReferenceOnlyReturnedItems(t *testing.T) {
	all := make([]DecompositionV2, 0, maxNonDominatedDecompositions+1)
	for index := 0; index < maxNonDominatedDecompositions; index++ {
		groups := []ShapeGroup{{Kind: "floating", Tiles34: []int{0}}}
		for repeat := 0; repeat <= index; repeat++ {
			groups = append(groups, ShapeGroup{Kind: "floating", Tiles34: []int{1}})
		}
		all = append(all, DecompositionV2{
			DecompositionRef: fmt.Sprintf("standard:%03d", index),
			Family:           "standard",
			Shanten:          1,
			Groups:           groups,
		})
	}
	all = append(all, DecompositionV2{
		DecompositionRef: "standard:omitted",
		Family:           "standard",
		Shanten:          1,
		Groups:           []ShapeGroup{{Kind: "floating", Tiles34: []int{33}}},
	})

	got := buildDecompositionSet(all)
	if got.TotalNonDominated != 65 || len(got.Items) != 64 || !got.Truncated {
		t.Fatalf("cap result = total %d/items %d/truncated %v", got.TotalNonDominated, len(got.Items), got.Truncated)
	}
	if containsGroup(got.InvariantClaims, ShapeGroup{Kind: "floating", Tiles34: []int{0}}) {
		t.Fatal("claim shared only by returned prefix was falsely promoted to invariant")
	}
	returned := map[string]bool{}
	for _, item := range got.Items {
		returned[item.DecompositionRef] = true
	}
	foundConditional := false
	for _, claim := range got.AlternativeClaims {
		if claim.Kind == "floating" && reflect.DeepEqual(claim.Tiles34, []int{33}) {
			t.Fatal("claim supported only by an omitted decomposition must not carry dangling refs")
		}
		if claim.Kind == "floating" && reflect.DeepEqual(claim.Tiles34, []int{0}) {
			foundConditional = true
		}
		for _, ref := range claim.DecompositionRefs {
			if !returned[ref] {
				t.Fatalf("alternative claim references omitted decomposition %q", ref)
			}
		}
	}
	if !foundConditional {
		t.Fatal("full-set classification lost returned support for a conditional claim")
	}
	diagnostics := decompositionDiagnostics(got)
	if !reflect.DeepEqual(diagnostics, []string{"truncated_non_dominated_decompositions"}) {
		t.Fatalf("truncation diagnostics = %v", diagnostics)
	}
}

func TestGlobalCapReservesOneReturnedItemPerTiedFamily(t *testing.T) {
	all := make([]DecompositionV2, 0, 66)
	for index := 0; index < 65; index++ {
		groups := []ShapeGroup{{Kind: "floating", Tiles34: []int{0}}}
		for repeat := 0; repeat <= index; repeat++ {
			groups = append(groups, ShapeGroup{Kind: "floating", Tiles34: []int{1}})
		}
		all = append(all, DecompositionV2{
			DecompositionRef: fmt.Sprintf("standard:%03d", index),
			Family:           "standard",
			Shanten:          0,
			Groups:           groups,
		})
	}
	all = append(all, DecompositionV2{
		DecompositionRef: "chiitoitsu:only",
		Family:           "chiitoitsu",
		Shanten:          0,
		Groups:           []ShapeGroup{{Kind: "pair_candidate", Tiles34: []int{33, 33}}},
	})
	got := buildDecompositionSet(all)
	families := map[string]int{}
	for _, item := range got.Items {
		families[item.Family]++
	}
	if families["standard"] == 0 || families["chiitoitsu"] != 1 {
		t.Fatalf("global cap starved a tied family: %v", families)
	}
}

func TestClaimsPreserveOnlyUniversallyProvenMultiplicity(t *testing.T) {
	commonTwice := []ShapeGroup{
		{Kind: "floating", Tiles34: []int{0}},
		{Kind: "floating", Tiles34: []int{0}},
	}
	all := []DecompositionV2{
		{DecompositionRef: "standard:a", Family: "standard", Shanten: 1, Groups: append(cloneGroups(commonTwice), ShapeGroup{Kind: "floating", Tiles34: []int{1}})},
		{DecompositionRef: "standard:b", Family: "standard", Shanten: 1, Groups: append(cloneGroups(commonTwice), ShapeGroup{Kind: "floating", Tiles34: []int{2}})},
	}
	got := buildDecompositionSet(all)
	if count := groupCount(got.InvariantClaims, ShapeGroup{Kind: "floating", Tiles34: []int{0}}); count != 2 {
		t.Fatalf("universally proven claim multiplicity = %d, want 2: %#v", count, got.InvariantClaims)
	}
	for _, claim := range got.AlternativeClaims {
		if claim.Kind == "floating" && reflect.DeepEqual(claim.Tiles34, []int{0}) {
			t.Fatalf("extra multiplicity was overclaimed as a conditional fact: %#v", claim)
		}
	}

	variable := buildDecompositionSet([]DecompositionV2{
		{
			DecompositionRef: "standard:once",
			Family:           "standard",
			Shanten:          1,
			Groups:           []ShapeGroup{{Kind: "sequence", Tiles34: []int{0, 1, 2}}},
		},
		{
			DecompositionRef: "standard:twice",
			Family:           "standard",
			Shanten:          1,
			Groups: []ShapeGroup{
				{Kind: "sequence", Tiles34: []int{0, 1, 2}},
				{Kind: "sequence", Tiles34: []int{0, 1, 2}},
			},
		},
	})
	if count := groupCount(variable.InvariantClaims, ShapeGroup{Kind: "sequence", Tiles34: []int{0, 1, 2}}); count != 1 {
		t.Fatalf("minimum multiplicity invariant = %d, want 1", count)
	}
	conditionalCopies := 0
	for _, claim := range variable.AlternativeClaims {
		if claim.Kind == "sequence" && reflect.DeepEqual(claim.Tiles34, []int{0, 1, 2}) {
			conditionalCopies++
			if !reflect.DeepEqual(claim.DecompositionRefs, []string{"standard:twice"}) {
				t.Fatalf("second-copy support = %v, want twice-only", claim.DecompositionRefs)
			}
		}
	}
	if conditionalCopies != 1 {
		t.Fatalf("conditional second-copy claims = %d, want 1: %#v", conditionalCopies, variable.AlternativeClaims)
	}
}

func TestStandardDecompositionRefsUseFullSHA256(t *testing.T) {
	results := nonDominatedStandardDecompositions(counts34(21, 22, 23, 24, 25, 26, 27, 27, 31, 31, 32, 32, 33), 0)
	for _, result := range results {
		if len(result.DecompositionRef) != len("standard:")+64 {
			t.Fatalf("decomposition ref is not full SHA-256: %q", result.DecompositionRef)
		}
	}
}

func TestStandardDecompositionRejectsIllegalConcealedCount(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("invalid 12-tile closed input did not panic")
		}
	}()
	_ = nonDominatedStandardDecompositions(counts34(0, 1, 2, 3, 4, 5, 6, 7, 8, 27, 28, 29), 0)
}

func TestBestSpecialFamiliesReceiveDeterministicSyntheticDecompositions(t *testing.T) {
	chiitoi := syntheticFamilyDecomposition(
		counts34(0, 0, 8, 8, 9, 9, 17, 17, 18, 18, 26, 26, 27),
		"chiitoitsu",
		0,
	)
	if !strings.HasPrefix(chiitoi.DecompositionRef, "chiitoitsu:") ||
		groupCount(chiitoi.Groups, ShapeGroup{Kind: "pair_candidate", Tiles34: []int{0, 0}}) != 1 {
		t.Fatalf("invalid chiitoitsu synthetic decomposition: %#v", chiitoi)
	}
	kokushi := syntheticFamilyDecomposition(
		counts34(0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33),
		"kokushi",
		0,
	)
	if !strings.HasPrefix(kokushi.DecompositionRef, "kokushi:") || len(kokushi.Groups) != 13 {
		t.Fatalf("invalid kokushi synthetic decomposition: %#v", kokushi)
	}

	request := goldenHandStructureRequest()
	request.HandTiles34 = counts34(0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6)
	request.LeftTiles34 = theoreticalLeftTiles34(request.HandTiles34, nil)
	result, err := analyzeHandStructure(request)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(result.BestFamilies, []string{"standard", "chiitoitsu"}) {
		t.Fatalf("fixture no longer ties standard and chiitoitsu: %v", result.BestFamilies)
	}
	families := map[string]bool{}
	for _, item := range result.Decompositions.Items {
		families[item.Family] = true
	}
	if !families["standard"] || !families["chiitoitsu"] {
		t.Fatalf("tied best families missing decompositions: %#v", result.Decompositions.Items)
	}
}

func TestAnalyzeHandStructureAlwaysReturnsCalculatedBestFamilyDecompositions(t *testing.T) {
	for _, request := range []HandStructureRequestV2{
		goldenHandStructureRequest(),
		func() HandStructureRequestV2 {
			value := goldenHandStructureRequest()
			value.HandTiles34 = counts34(0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6)
			value.LeftTiles34 = theoreticalLeftTiles34(value.HandTiles34, nil)
			return value
		}(),
	} {
		result, err := analyzeHandStructure(request)
		if err != nil {
			t.Fatal(err)
		}
		if result.Decompositions.Status != "calculated" || len(result.Decompositions.Items) == 0 {
			t.Fatalf("valid best family has no calculated decomposition: %#v", result.Decompositions)
		}
		returnedFamilies := map[string]bool{}
		for _, item := range result.Decompositions.Items {
			returnedFamilies[item.Family] = true
		}
		for _, family := range result.BestFamilies {
			if !returnedFamilies[family] {
				t.Fatalf("best family %q missing after global cap: %#v", family, result.Decompositions.Items)
			}
		}
	}
}

func TestNonDominatedDecompositionPropertyAgainstPinnedShanten(t *testing.T) {
	random := rand.New(rand.NewSource(20260808))
	for openMelds := 0; openMelds <= 4; openMelds++ {
		concealedCount := 13 - 3*openMelds
		for sample := 0; sample < 80; sample++ {
			hand := make([]int, 34)
			for count := 0; count < concealedCount; {
				tile := random.Intn(34)
				if hand[tile] == 4 {
					continue
				}
				hand[tile]++
				count++
			}
			original := append([]int(nil), hand...)
			target := util.CalculateShantenOfNormal(append([]int(nil), hand...), concealedCount)
			results := nonDominatedStandardDecompositions(hand, openMelds)
			if len(results) == 0 {
				t.Fatalf("open=%d sample=%d target=%d returned no decomposition for %v", openMelds, sample, target, hand)
			}
			refs := map[string]bool{}
			for _, result := range results {
				if refs[result.DecompositionRef] {
					t.Fatalf("open=%d sample=%d duplicate ref %q", openMelds, sample, result.DecompositionRef)
				}
				refs[result.DecompositionRef] = true
				if result.Shanten != target {
					t.Fatalf("open=%d sample=%d result shanten=%d, pinned target=%d", openMelds, sample, result.Shanten, target)
				}
				metrics := decompositionMetrics(result.Groups, openMelds)
				if !metrics.Valid || metrics.Shanten != target {
					t.Fatalf("open=%d sample=%d local metric=%#v, pinned target=%d", openMelds, sample, metrics, target)
				}
				reconstructed := make([]int, 34)
				for _, group := range result.Groups {
					for _, tile := range group.Tiles34 {
						reconstructed[tile]++
					}
				}
				if !reflect.DeepEqual(reconstructed, hand) {
					t.Fatalf("open=%d sample=%d partition does not reconstruct hand: got %v want %v", openMelds, sample, reconstructed, hand)
				}
			}
			if !reflect.DeepEqual(hand, original) {
				t.Fatalf("open=%d sample=%d input mutated: got %v want %v", openMelds, sample, hand, original)
			}
		}
	}
}

func BenchmarkNonDominatedStandardDecompositionsWorstLegalHand(b *testing.B) {
	// Dense overlapping shapes are the adversarial case for the compact
	// streaming partition enumerator. Keep this benchmark runnable as a
	// regression gate without binding correctness tests to wall-clock timing.
	hand := counts34(0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6)
	b.ReportAllocs()
	for iteration := 0; iteration < b.N; iteration++ {
		_ = nonDominatedStandardDecompositions(hand, 0)
	}
}
