package main

import (
	"fmt"
	"math"
	"sort"

	"github.com/EndlessCheng/mahjong-helper/util"
)

type ThreatRiskRequest struct {
	RequestBase
	ThreatActor         int      `json:"threatActor"`
	Turns               int      `json:"turns"`
	SafeTiles34         []bool   `json:"safeTiles34"`
	LeftTiles34         []int    `json:"leftTiles34"`
	DoraTiles34         []int    `json:"doraTiles34"`
	RoundWindTile34     int      `json:"roundWindTile34"`
	ThreatWindTile34    int      `json:"threatWindTile34"`
	EarlyOutsideTiles34 []int    `json:"earlyOutsideTiles34"`
	EvidenceIDs         []string `json:"evidenceIds"`
}

type StructuralRisk struct {
	Tile34 int    `json:"tile34"`
	Kind   string `json:"kind"`
}

type HonorClassification struct {
	Tile34         int    `json:"tile34"`
	RemainingCount int    `json:"remainingCount"`
	Category       string `json:"category"`
}

type ThreatRiskResult struct {
	Kind                 string                `json:"kind"`
	RequestID            string                `json:"requestId"`
	ProtocolVersion      string                `json:"protocolVersion"`
	ActionRef            string                `json:"actionRef"`
	StateHash            string                `json:"stateHash"`
	Identity             EngineIdentity        `json:"identity"`
	ThreatActor          int                   `json:"threatActor"`
	RiskScale            []float64             `json:"riskScale"`
	Classifications      []StructuralRisk      `json:"classifications"`
	HonorClassifications []HonorClassification `json:"honorClassifications"`
	LeftNoSujiTile34     []int                 `json:"leftNoSujiTile34"`
	EvidenceIDs          []string              `json:"evidenceIds"`
	Limitations          []string              `json:"limitations"`
	Diagnostics          []string              `json:"diagnostics"`
}

func validateStrictAscendingTiles(values []int, field string) error {
	if values == nil {
		return fmt.Errorf("%s must be an array", field)
	}
	for index, tile := range values {
		if err := validateTile34(tile, field); err != nil {
			return err
		}
		if index > 0 && tile <= values[index-1] {
			return fmt.Errorf("%s must use strict ascending order", field)
		}
	}
	return nil
}

func validateThreatRiskRequest(request ThreatRiskRequest) error {
	if request.Kind != "threat_risk" {
		return fmt.Errorf("kind must be threat_risk")
	}
	if request.RequestID == "" || request.ActionRef == "" || request.StateHash == "" {
		return fmt.Errorf("requestId, actionRef, and stateHash are required")
	}
	if request.ProtocolVersion != protocolVersion {
		return fmt.Errorf("unsupported protocol version")
	}
	if request.ThreatActor < 0 || request.ThreatActor > 3 {
		return fmt.Errorf("threatActor must be between 0 and 3")
	}
	if request.Turns < 1 || request.Turns > util.MaxTurns {
		return fmt.Errorf("turns must be between 1 and %d", util.MaxTurns)
	}
	if len(request.SafeTiles34) != 34 {
		return fmt.Errorf("safeTiles34 must contain exactly 34 booleans")
	}
	if err := validateCounts34(request.LeftTiles34, "leftTiles34"); err != nil {
		return err
	}
	if err := validateTile34List(request.DoraTiles34, "doraTiles34"); err != nil {
		return err
	}
	if request.RoundWindTile34 < 27 || request.RoundWindTile34 > 30 {
		return fmt.Errorf("roundWindTile34 must be a wind tile")
	}
	if request.ThreatWindTile34 < 27 || request.ThreatWindTile34 > 30 {
		return fmt.Errorf("threatWindTile34 must be a wind tile")
	}
	if err := validateStrictAscendingTiles(request.EarlyOutsideTiles34, "earlyOutsideTiles34"); err != nil {
		return err
	}
	if len(request.EvidenceIDs) == 0 {
		return fmt.Errorf("evidenceIds must not be empty")
	}
	seenEvidence := map[string]struct{}{}
	for _, evidenceID := range request.EvidenceIDs {
		if evidenceID == "" {
			return fmt.Errorf("evidenceIds must not contain empty values")
		}
		if _, exists := seenEvidence[evidenceID]; exists {
			return fmt.Errorf("evidenceIds must be unique")
		}
		seenEvidence[evidenceID] = struct{}{}
	}
	return nil
}

func addStructuralRisk(
	values map[StructuralRisk]struct{},
	tile int,
	kind string,
) {
	values[StructuralRisk{Tile34: tile, Kind: kind}] = struct{}{}
}

func addSujiClassifications(values map[StructuralRisk]struct{}, safe []bool) {
	for tile := 0; tile < 27; tile++ {
		if safe[tile] {
			addStructuralRisk(values, tile, "genbutsu")
			continue
		}
		rank := tile % 9
		safeCount := 0
		switch {
		case rank <= 2:
			if safe[tile+3] {
				safeCount++
			}
		case rank >= 6:
			if safe[tile-3] {
				safeCount++
			}
		default:
			if safe[tile-3] {
				safeCount++
			}
			if safe[tile+3] {
				safeCount++
			}
		}
		if rank >= 3 && rank <= 5 {
			switch safeCount {
			case 0:
				addStructuralRisk(values, tile, "no_suji")
			case 1:
				addStructuralRisk(values, tile, "half_suji")
			case 2:
				addStructuralRisk(values, tile, "double_suji")
			}
		} else if safeCount == 0 {
			addStructuralRisk(values, tile, "no_suji")
		} else {
			addStructuralRisk(values, tile, "suji")
		}
	}
	for tile := 27; tile < 34; tile++ {
		if safe[tile] {
			addStructuralRisk(values, tile, "genbutsu")
		}
	}
}

func addWallClassifications(values map[StructuralRisk]struct{}, left []int, safe []bool) {
	for _, wall := range util.CalcWallTiles(left) {
		addStructuralRisk(values, wall.Tile34, "wall")
	}
	for _, wall := range util.CalcNCSafeTiles(left) {
		addStructuralRisk(values, wall.Tile34, "no_chance")
	}
	for _, wall := range util.CalcDNCSafeTilesWithDiscards(left, safe) {
		addStructuralRisk(values, wall.Tile34, "double_no_chance")
	}
	for _, wall := range util.CalcOCSafeTiles(left) {
		kind := "one_chance"
		switch wall.SafeType {
		case util.WallSafeTypeDoubleOneChance:
			kind = "double_one_chance"
		case util.WallSafeTypeMixedOneChance:
			kind = "mixed_one_chance"
		}
		addStructuralRisk(values, wall.Tile34, kind)
	}
}

func sortedStructuralRisks(values map[StructuralRisk]struct{}) []StructuralRisk {
	result := make([]StructuralRisk, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Slice(result, func(left, right int) bool {
		if result[left].Tile34 != result[right].Tile34 {
			return result[left].Tile34 < result[right].Tile34
		}
		return result[left].Kind < result[right].Kind
	})
	return result
}

func honorClassifications(request ThreatRiskRequest) []HonorClassification {
	result := make([]HonorClassification, 0, 7)
	for tile := 27; tile < 34; tile++ {
		category := "guest_wind"
		if tile >= 31 || tile == request.RoundWindTile34 || tile == request.ThreatWindTile34 {
			category = "yakuhai"
		}
		result = append(result, HonorClassification{
			Tile34: tile, RemainingCount: request.LeftTiles34[tile], Category: category,
		})
	}
	return result
}

func analyzeThreatRisk(request ThreatRiskRequest) (ThreatRiskResult, error) {
	if err := validateThreatRiskRequest(request); err != nil {
		return ThreatRiskResult{}, err
	}
	riskScale := util.CalculateRiskTiles34(
		request.Turns,
		append([]bool(nil), request.SafeTiles34...),
		cloneInts(request.LeftTiles34),
		cloneInts(request.DoraTiles34),
		request.RoundWindTile34,
		request.ThreatWindTile34,
	)
	riskScale.FixWithEarlyOutside(cloneInts(request.EarlyOutsideTiles34))
	for tile, value := range riskScale {
		if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
			return ThreatRiskResult{}, fmt.Errorf("mahjong-helper returned invalid risk for tile %d", tile)
		}
	}

	classifications := map[StructuralRisk]struct{}{}
	addSujiClassifications(classifications, request.SafeTiles34)
	addWallClassifications(classifications, request.LeftTiles34, request.SafeTiles34)
	for _, tile := range request.EarlyOutsideTiles34 {
		addStructuralRisk(classifications, tile, "early_outside")
	}
	leftNoSuji := util.CalculateLeftNoSujiTiles(request.SafeTiles34, request.LeftTiles34)
	sort.Ints(leftNoSuji)
	return ThreatRiskResult{
		Kind:                 "threat_risk_result",
		RequestID:            request.RequestID,
		ProtocolVersion:      protocolVersion,
		ActionRef:            request.ActionRef,
		StateHash:            request.StateHash,
		Identity:             engineIdentity(),
		ThreatActor:          request.ThreatActor,
		RiskScale:            append([]float64(nil), riskScale...),
		Classifications:      sortedStructuralRisks(classifications),
		HonorClassifications: honorClassifications(request),
		LeftNoSujiTile34:     cloneInts(leftNoSuji),
		EvidenceIDs:          append([]string(nil), request.EvidenceIDs...),
		Limitations: []string{
			"Pinned mahjong-helper risk scale is a versioned heuristic, not a calibrated Mortal deal-in probability",
			"Each threat is analyzed independently; values are never merged into one probability",
			"Suji labels use replay-provided safe tiles while wall and one-chance labels remain separate",
		},
		Diagnostics: []string{},
	}, nil
}
