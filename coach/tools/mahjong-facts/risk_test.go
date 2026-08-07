package main

import "testing"

func wallAndSujiRequest() ThreatRiskRequest {
	safe := make([]bool, 34)
	safe[3] = true // 4m genbutsu
	left := make([]int, 34)
	for index := range left {
		left[index] = 4
	}
	left[1] = 0  // 2m wall makes 1m no-chance
	left[10] = 1 // one 2p remains, making 1p one-chance
	return ThreatRiskRequest{
		RequestBase: RequestBase{
			Kind:            "threat_risk",
			RequestID:       "risk-wall",
			ProtocolVersion: protocolVersion,
			ActionRef:       "action:v1:discard:6s:normal:tsumogiri",
			StateHash:       "sha256:risk",
		},
		ThreatActor:         2,
		Turns:               8,
		SafeTiles34:         safe,
		LeftTiles34:         left,
		DoraTiles34:         []int{},
		RoundWindTile34:     27,
		ThreatWindTile34:    29,
		EarlyOutsideTiles34: []int{8},
		EvidenceIDs:         []string{"event-riichi", "event-4m"},
	}
}

func hasStructuralRisk(values []StructuralRisk, tile int, kind string) bool {
	for _, value := range values {
		if value.Tile34 == tile && value.Kind == kind {
			return true
		}
	}
	return false
}

func TestThreatRiskKeepsGenbutsuAndWallClasses(t *testing.T) {
	result, err := analyzeThreatRisk(wallAndSujiRequest())
	if err != nil {
		t.Fatalf("analyze threat risk: %v", err)
	}
	if result.RiskScale[3] != 0 {
		t.Fatalf("genbutsu risk = %v, want 0", result.RiskScale[3])
	}
	for _, expected := range []StructuralRisk{
		{Tile34: 3, Kind: "genbutsu"},
		{Tile34: 0, Kind: "wall"},
		{Tile34: 0, Kind: "no_chance"},
		{Tile34: 9, Kind: "one_chance"},
		{Tile34: 8, Kind: "early_outside"},
	} {
		if !hasStructuralRisk(result.Classifications, expected.Tile34, expected.Kind) {
			t.Fatalf("missing classification %+v in %v", expected, result.Classifications)
		}
	}
	if len(result.LeftNoSujiTile34) == 0 {
		t.Fatal("expected left no-suji tiles")
	}
	if len(result.Limitations) == 0 {
		t.Fatal("expected risk limitations")
	}
}

func TestThreatRiskRejectsTurnsOutsidePinnedTable(t *testing.T) {
	request := wallAndSujiRequest()
	request.Turns = 0
	if _, err := analyzeThreatRisk(request); err == nil {
		t.Fatal("expected turn zero to fail")
	}
	request.Turns = 20
	if _, err := analyzeThreatRisk(request); err == nil {
		t.Fatal("expected turn 20 to fail")
	}
}
