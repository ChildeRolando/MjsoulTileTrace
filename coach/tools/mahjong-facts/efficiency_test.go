package main

import (
	"reflect"
	"testing"
)

func efficiencyRequest(tiles ...int) Hand13Request {
	r := goldenHand13Request()
	r.CalculationMode = "efficiency-v1"
	r.HandTiles34 = make([]int, 34)
	for _, tile := range tiles {
		r.HandTiles34[tile]++
	}
	r.LeftTiles34 = theoreticalLeftTiles34(r.HandTiles34, nil)
	return r
}

func TestEfficiencyImprovementAndVisibleCounts(t *testing.T) {
	// 123m 24m 123p 123s 11z: 3m completes; 5m allows 45m with 3m/6m waits.
	r := efficiencyRequest(0, 1, 2, 1, 3, 9, 10, 11, 18, 19, 20, 27, 27)
	r.LeftTiles34[5] = 2 // two visible 6m, never use hidden hands or wall truth
	original := cloneInts(r.HandTiles34)
	result, err := analyzeHand13(r)
	if err != nil {
		t.Fatal(err)
	}
	if result.Shanten != 0 || !reflect.DeepEqual(result.WaitsRemaining, []TileCount{{Tile34: 2, Count: 3}}) {
		t.Fatalf("unexpected direct waits: %+v", result)
	}
	found := false
	for _, improve := range result.Improves {
		if improve.DrawTile34 == 4 {
			found = true
			if !reflect.DeepEqual(improve.BestWaits, []TileCount{{Tile34: 2, Count: 3}, {Tile34: 5, Count: 2}}) {
				t.Fatalf("unexpected improvement: %+v", improve)
			}
		}
	}
	if !found {
		t.Fatal("5m improvement missing")
	}
	if !reflect.DeepEqual(original, r.HandTiles34) {
		t.Fatal("mutated request")
	}
	r.Riichi = true
	locked, err := analyzeHand13(r)
	if err != nil || len(locked.Improves) != 0 {
		t.Fatalf("riichi replacement allowed: %+v %v", locked, err)
	}
	r.Riichi = false
	r.LeftTiles34[4] = 0
	exhausted, _ := analyzeHand13(r)
	for _, improve := range exhausted.Improves {
		if improve.DrawTile34 == 4 {
			t.Fatal("exhausted improvement exposed")
		}
	}
	r.VisibleCountsComplete = false
	if _, err := analyzeHand13(r); err == nil {
		t.Fatal("incomplete counts accepted")
	}
}

func TestEfficiencySpecialFamiliesAndOpenHand(t *testing.T) {
	seven := efficiencyRequest(0, 0, 3, 3, 6, 6, 9, 9, 12, 12, 15, 15, 18)
	result, err := analyzeHand13(seven)
	if err != nil || result.Shanten != 0 || !reflect.DeepEqual(result.EffectiveTile34, []int{18}) {
		t.Fatalf("seven pairs: %+v %v", result, err)
	}
	orphanTiles := []int{0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33}
	orphan := efficiencyRequest(orphanTiles...)
	result, err = analyzeHand13(orphan)
	if err != nil || result.Shanten != 0 || !reflect.DeepEqual(result.EffectiveTile34, orphanTiles) {
		t.Fatalf("kokushi: %+v %v", result, err)
	}
	open := efficiencyRequest(0, 1, 2, 1, 3, 18, 19, 20, 27, 27)
	open.Melds = []MeldInput{{Kind: "chi", Tiles34: []int{9, 10, 11}}}
	open.LeftTiles34 = theoreticalLeftTiles34(open.HandTiles34, open.Melds)
	result, err = analyzeHand13(open)
	if err != nil || result.Shanten != 0 || !reflect.DeepEqual(result.EffectiveTile34, []int{2}) {
		t.Fatalf("open hand: %+v %v", result, err)
	}
}
