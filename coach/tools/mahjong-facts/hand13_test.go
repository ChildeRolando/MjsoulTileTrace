package main

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func goldenHand13Request() Hand13Request {
	hand := make([]int, 34)
	for _, tile := range []int{
		3, 4, // 45m
		11, 11, 12, 12, 13, 13, // 334455p
		20, 21, 22, // 345s
		30, 30, // 44z
	} {
		hand[tile]++
	}
	left := theoreticalLeftTiles34(hand, nil)
	left[5]-- // one 6m is publicly visible
	remainingDraws := 42
	return Hand13Request{
		RequestBase: RequestBase{
			Kind:            "hand13",
			RequestID:       "hand13-golden",
			ProtocolVersion: protocolVersion,
			ActionRef:       "action:v1:discard:9s:normal:tedashi",
			StateHash:       "sha256:golden",
		},
		HandContext: HandContext{
			Melds:           []MeldInput{},
			DoraTiles34:     []int{3},
			RedFiveCounts:   []int{0, 0, 0},
			RoundWindTile34: 27,
			SelfWindTile34:  28,
			Dealer:          false,
			Riichi:          false,
			SelfDiscards34:  []int{},
		},
		HandTiles34:           hand,
		LeftTiles34:           left,
		VisibleCountsComplete: true,
		DoraTilesComplete:     true,
		SelfDiscardsComplete:  true,
		RemainingDraws:        &remainingDraws,
	}
}

func estimateByField(estimates []UpstreamEstimate, field string) *UpstreamEstimate {
	for index := range estimates {
		if estimates[index].Field == field {
			return &estimates[index]
		}
	}
	return nil
}

func TestNumericEstimateRejectsOutOfDomainRates(t *testing.T) {
	for _, test := range []struct {
		field string
		value float64
	}{
		{"avg_agari_rate", -0.01},
		{"avg_agari_rate", 100.01},
		{"furiten_rate", -0.01},
		{"furiten_rate", 1.01},
		{"dama_point", -1},
		{"riichi_point", -1},
	} {
		if _, ok := numericEstimate(test.field, test.value, "test"); ok {
			t.Fatalf("numericEstimate(%q, %v) accepted an out-of-domain value", test.field, test.value)
		}
	}
}

func TestHand13GoldenFacts(t *testing.T) {
	result, err := analyzeHand13(goldenHand13Request())
	if err != nil {
		t.Fatalf("analyze hand13: %v", err)
	}
	if result.Shanten != 0 {
		t.Fatalf("shanten = %d, want 0", result.Shanten)
	}
	if !reflect.DeepEqual(result.EffectiveTile34, []int{2, 5}) {
		t.Fatalf("effective tiles = %v, want [2 5]", result.EffectiveTile34)
	}
	wantWaits := []TileCount{{Tile34: 2, Count: 4}, {Tile34: 5, Count: 3}}
	if !reflect.DeepEqual(result.WaitsRemaining, wantWaits) {
		t.Fatalf("remaining waits = %v, want %v", result.WaitsRemaining, wantWaits)
	}
	yaku := estimateByField(result.Estimates, "yaku_types")
	if yaku == nil || yaku.IntegerValues == nil || !reflect.DeepEqual(*yaku.IntegerValues, []int{0, 4, 6, 7}) {
		t.Fatalf("yaku IDs = %v, want [0 4 6 7]", yaku)
	}
	if result.DoraCount == nil || *result.DoraCount != 1 {
		t.Fatalf("dora count = %v, want 1", result.DoraCount)
	}
	dama := estimateByField(result.Estimates, "dama_point")
	if dama == nil || dama.NumericValue == nil {
		t.Fatalf("dama point estimate missing: %v", result.Estimates)
	}
}

func TestHand13BlocksOnlyDoraDependentFactsWhenIndicatorsIncomplete(t *testing.T) {
	request := goldenHand13Request()
	request.DoraTilesComplete = false
	result, err := analyzeHand13(request)
	if err != nil {
		t.Fatalf("analyze hand13: %v", err)
	}
	if result.Shanten != 0 {
		t.Fatalf("shanten = %d, want 0", result.Shanten)
	}
	if result.DoraCount != nil || result.DoraCountStatus != "blocked_missing_facts" {
		t.Fatalf("dora result = %v/%q, want blocked null", result.DoraCount, result.DoraCountStatus)
	}
	if estimateByField(result.Estimates, "dama_point") != nil {
		t.Fatal("dora-dependent point estimate must be omitted")
	}
	if estimateByField(result.Estimates, "mixed_waits_score") == nil {
		t.Fatal("dora-independent wait score should remain available")
	}
}

func TestHand13IncompleteVisibilityKeepsStructuralFacts(t *testing.T) {
	request := goldenHand13Request()
	request.RequestID = "hand13-incomplete"
	request.VisibleCountsComplete = false
	request.LeftTiles34 = nil

	result, err := analyzeHand13(request)
	if err != nil {
		t.Fatalf("analyze hand13: %v", err)
	}
	if result.Shanten != 0 {
		t.Fatalf("shanten = %d, want 0", result.Shanten)
	}
	if !reflect.DeepEqual(result.EffectiveTile34, []int{2, 5}) {
		t.Fatalf("effective tiles = %v, want [2 5]", result.EffectiveTile34)
	}
	if result.WaitsRemainingStatus != "blocked_missing_facts" {
		t.Fatalf("remaining status = %q", result.WaitsRemainingStatus)
	}
	if len(result.WaitsRemaining) != 0 {
		t.Fatalf("blocked remaining waits must be empty: %v", result.WaitsRemaining)
	}
	for _, estimate := range result.Estimates {
		found := false
		for _, limitation := range estimate.Limitations {
			if strings.Contains(limitation, "theoretical unseen counts") {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("estimate %q must disclose theoretical visibility: %v", estimate.Field, estimate.Limitations)
		}
	}
}

func TestHand13RejectsInvalidCountVector(t *testing.T) {
	request := goldenHand13Request()
	request.HandTiles34 = request.HandTiles34[:33]
	if _, err := analyzeHand13(request); err == nil {
		t.Fatal("expected invalid hand count vector to fail")
	}
}

func TestHand13RejectsImpossibleCrossZoneCounts(t *testing.T) {
	request := goldenHand13Request()
	request.Melds = []MeldInput{{Kind: "pon", Tiles34: []int{0, 0, 0}}}
	request.HandTiles34 = make([]int, 34)
	for _, tile := range []int{0, 0, 0, 0, 1, 2, 3, 9, 10, 11} {
		request.HandTiles34[tile]++
	}
	request.VisibleCountsComplete = false
	request.LeftTiles34 = nil
	if _, err := analyzeHand13(request); err == nil {
		t.Fatal("expected impossible hand-plus-meld ownership to fail")
	}
}

func TestHand13RejectsLiveCountsThatConflictWithOwnedTiles(t *testing.T) {
	request := goldenHand13Request()
	request.LeftTiles34[3] = 4
	if _, err := analyzeHand13(request); err == nil {
		t.Fatal("expected live counts plus owned tiles above four to fail")
	}
}

func TestHand13ProtocolRejectsRecommendationField(t *testing.T) {
	requestJSON, err := json.Marshal(goldenHand13Request())
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	var requestObject map[string]any
	if err := json.Unmarshal(requestJSON, &requestObject); err != nil {
		t.Fatalf("decode request object: %v", err)
	}
	requestObject["recommendedDiscard"] = 5
	requestJSON, err = json.Marshal(requestObject)
	if err != nil {
		t.Fatalf("marshal request with prohibited field: %v", err)
	}

	var result ErrorResult
	if err := json.Unmarshal(handleLine(requestJSON), &result); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if result.Code != "invalid_request" {
		t.Fatalf("error code = %q, want invalid_request", result.Code)
	}
}
