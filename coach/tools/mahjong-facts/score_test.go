package main

import "testing"

func completePinfuRonRequest() CompletedHandRequest {
	hand := make([]int, 34)
	for _, tile := range []int{
		0, 1, 2, // 123m
		3, 4, 5, // 456m
		13, 13, // 55p
		15, 16, 17, // 789p
		19, 20, 21, // 234s, ron on 4s
	} {
		hand[tile]++
	}
	return CompletedHandRequest{
		RequestBase: RequestBase{
			Kind:            "completed_hand",
			RequestID:       "score-pinfu",
			ProtocolVersion: protocolVersion,
			ActionRef:       "action:v1:ron:4s:actor1",
			StateHash:       "sha256:score",
		},
		HandContext: HandContext{
			Melds:           []MeldInput{},
			DoraTiles34:     []int{},
			RedFiveCounts:   []int{0, 0, 0},
			RoundWindTile34: 27,
			SelfWindTile34:  28,
			Dealer:          false,
			Riichi:          false,
			SelfDiscards34:  []int{},
		},
		CompletedHandTiles34: hand,
		Tsumo:                false,
		WinTile34:            21,
	}
}

func TestCompletedHandReturnsPointButNotPrivateFuHan(t *testing.T) {
	result, err := analyzeCompletedHand(completePinfuRonRequest())
	if err != nil {
		t.Fatalf("analyze completed hand: %v", err)
	}
	if result.Point != 1000 {
		t.Fatalf("point = %d, want 1000", result.Point)
	}
	if result.FixedPoint != 1000 {
		t.Fatalf("fixed point = %v, want 1000", result.FixedPoint)
	}
	if result.HanStatus != "unsupported_upstream_api" {
		t.Fatalf("han status = %q", result.HanStatus)
	}
	if result.FuStatus != "unsupported_upstream_api" {
		t.Fatalf("fu status = %q", result.FuStatus)
	}
}

func TestCompletedHandRejectsMissingWinTile(t *testing.T) {
	request := completePinfuRonRequest()
	request.WinTile34 = 33
	if _, err := analyzeCompletedHand(request); err == nil {
		t.Fatal("expected a win tile absent from the hand to fail")
	}
}

func TestCompletedHandRejectsMoreThanFourOwnedCopiesAcrossMelds(t *testing.T) {
	request := completePinfuRonRequest()
	request.Melds = []MeldInput{{Kind: "pon", Tiles34: []int{0, 0, 0}}}
	request.CompletedHandTiles34 = make([]int, 34)
	for _, tile := range []int{0, 0, 0, 0, 1, 2, 3, 9, 10, 11, 18} {
		request.CompletedHandTiles34[tile]++
	}
	request.WinTile34 = 0
	if _, err := analyzeCompletedHand(request); err == nil {
		t.Fatal("expected impossible hand-plus-meld ownership to fail")
	}
}
