package main

import (
	"fmt"
	"math"
	"sort"

	"github.com/EndlessCheng/mahjong-helper/util"
)

type RequestBase struct {
	Kind            string `json:"kind"`
	RequestID       string `json:"requestId"`
	ProtocolVersion string `json:"protocolVersion"`
	ActionRef       string `json:"actionRef"`
	StateHash       string `json:"stateHash"`
}

type Hand13Request struct {
	RequestBase
	HandContext
	HandTiles34           []int `json:"handTiles34"`
	LeftTiles34           []int `json:"leftTiles34"`
	VisibleCountsComplete bool  `json:"visibleCountsComplete"`
	DoraTilesComplete     bool  `json:"doraTilesComplete"`
	SelfDiscardsComplete  bool  `json:"selfDiscardsComplete"`
	RemainingDraws        *int  `json:"remainingDraws"`
}

type TileCount struct {
	Tile34 int `json:"tile34"`
	Count  int `json:"count"`
}

type ImproveResult struct {
	DrawTile34 int         `json:"drawTile34"`
	BestWaits  []TileCount `json:"bestWaits"`
}

type UpstreamEstimate struct {
	Field         string   `json:"field"`
	NumericValue  *float64 `json:"numericValue,omitempty"`
	IntegerValues *[]int   `json:"integerValues,omitempty"`
	Limitations   []string `json:"limitations"`
}

type Hand13Result struct {
	Kind                 string             `json:"kind"`
	RequestID            string             `json:"requestId"`
	ProtocolVersion      string             `json:"protocolVersion"`
	ActionRef            string             `json:"actionRef"`
	StateHash            string             `json:"stateHash"`
	Identity             EngineIdentity     `json:"identity"`
	Shanten              int                `json:"shanten"`
	EffectiveTile34      []int              `json:"effectiveTile34"`
	WaitsRemainingStatus string             `json:"waitsRemainingStatus"`
	WaitsRemaining       []TileCount        `json:"waitsRemaining"`
	Improves             []ImproveResult    `json:"improves"`
	DoraCountStatus      string             `json:"doraCountStatus"`
	DoraCount            *int               `json:"doraCount"`
	Estimates            []UpstreamEstimate `json:"estimates"`
	Diagnostics          []string           `json:"diagnostics"`
}

func sortedWaitIndexes(waits util.Waits) []int {
	indexes := make([]int, 0, len(waits))
	for tile := range waits {
		indexes = append(indexes, tile)
	}
	sort.Ints(indexes)
	return indexes
}

func sortedTileCounts(waits util.Waits) []TileCount {
	indexes := sortedWaitIndexes(waits)
	result := make([]TileCount, 0, len(indexes))
	for _, tile := range indexes {
		result = append(result, TileCount{Tile34: tile, Count: waits[tile]})
	}
	return result
}

func normalizeImproves(improves util.Improves) []ImproveResult {
	draws := make([]int, 0, len(improves))
	for draw := range improves {
		draws = append(draws, draw)
	}
	sort.Ints(draws)
	result := make([]ImproveResult, 0, len(draws))
	for _, draw := range draws {
		result = append(result, ImproveResult{
			DrawTile34: draw,
			BestWaits:  sortedTileCounts(improves[draw]),
		})
	}
	return result
}

func numericEstimate(field string, value float64, limitation string) (UpstreamEstimate, bool) {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return UpstreamEstimate{}, false
	}
	return UpstreamEstimate{
		Field:        field,
		NumericValue: &value,
		Limitations:  []string{limitation},
	}, true
}

func normalizeEstimates(result *util.Hand13AnalysisResult, request Hand13Request) ([]UpstreamEstimate, []string) {
	yakuIDs := make([]int, 0, len(result.YakuTypes))
	for yakuID := range result.YakuTypes {
		yakuIDs = append(yakuIDs, yakuID)
	}
	sort.Ints(yakuIDs)
	yakuValues := yakuIDs
	estimates := []UpstreamEstimate{{
		Field:         "yaku_types",
		IntegerValues: &yakuValues,
		Limitations:   []string{"Possible yaku IDs reported by the pinned mahjong-helper analysis"},
	}}
	diagnostics := []string{}
	numeric := []struct {
		field      string
		value      float64
		limitation string
		available  bool
	}{
		{"dama_point", result.DamaPoint, "Pinned mahjong-helper average dama/open-hand point estimate", request.DoraTilesComplete},
		{"riichi_point", result.RiichiPoint, "Pinned mahjong-helper average riichi point estimate", request.DoraTilesComplete},
		{"mixed_waits_score", result.MixedWaitsScore, "Pinned mahjong-helper composite wait-speed heuristic", true},
		{"avg_agari_rate", result.AvgAgariRate, "Pinned mahjong-helper estimated win rate, not a calibrated project probability", request.SelfDiscardsComplete && request.RemainingDraws != nil},
		{"furiten_rate", result.FuritenRate, "Pinned mahjong-helper furiten heuristic", request.SelfDiscardsComplete},
		{"mixed_round_point", result.MixedRoundPoint, "Pinned mahjong-helper round-point estimate, not project placement EV", request.DoraTilesComplete && request.SelfDiscardsComplete && request.RemainingDraws != nil},
	}
	for _, item := range numeric {
		if !item.available {
			diagnostics = append(diagnostics, "estimate_blocked_missing_facts:"+item.field)
			continue
		}
		estimate, ok := numericEstimate(item.field, item.value, item.limitation)
		if !ok {
			diagnostics = append(diagnostics, "non_finite_upstream_estimate:"+item.field)
			continue
		}
		estimates = append(estimates, estimate)
	}
	return estimates, diagnostics
}

func validateHand13Request(request Hand13Request) error {
	if request.Kind != "hand13" {
		return fmt.Errorf("kind must be hand13")
	}
	if request.RequestID == "" || request.ActionRef == "" || request.StateHash == "" {
		return fmt.Errorf("requestId, actionRef, and stateHash are required")
	}
	if request.ProtocolVersion != protocolVersion {
		return fmt.Errorf("unsupported protocol version")
	}
	if err := validateCounts34(request.HandTiles34, "handTiles34"); err != nil {
		return err
	}
	if request.VisibleCountsComplete {
		if err := validateCounts34(request.LeftTiles34, "leftTiles34"); err != nil {
			return err
		}
	} else if request.LeftTiles34 != nil {
		return fmt.Errorf("leftTiles34 must be null when visible counts are incomplete")
	}
	if request.RemainingDraws != nil && *request.RemainingDraws < 0 {
		return fmt.Errorf("remainingDraws must not be negative")
	}
	_, err := validateHandContext(request.HandContext, request.HandTiles34)
	return err
}

func analyzeHand13(request Hand13Request) (Hand13Result, error) {
	if err := validateHand13Request(request); err != nil {
		return Hand13Result{}, err
	}
	theoreticalLeft := theoreticalLeftTiles34(request.HandTiles34, request.Melds)
	if err := validateCounts34(theoreticalLeft, "theoreticalLeftTiles34"); err != nil {
		return Hand13Result{}, err
	}
	structuralPlayer, err := newPlayerInfo(request, theoreticalLeft)
	if err != nil {
		return Hand13Result{}, err
	}
	structural := util.CalculateShantenWithImproves13(structuralPlayer)

	analysis := structural
	if request.VisibleCountsComplete {
		livePlayer, convertErr := newPlayerInfo(request, request.LeftTiles34)
		if convertErr != nil {
			return Hand13Result{}, convertErr
		}
		analysis = util.CalculateShantenWithImproves13(livePlayer)
	}

	effectiveTiles := sortedWaitIndexes(structural.Waits)
	waitsRemaining := []TileCount{}
	waitsStatus := "blocked_missing_facts"
	if request.VisibleCountsComplete {
		waitsStatus = "calculated"
		for _, tile := range effectiveTiles {
			waitsRemaining = append(waitsRemaining, TileCount{
				Tile34: tile,
				Count:  request.LeftTiles34[tile],
			})
		}
	}
	estimates, diagnostics := normalizeEstimates(analysis, request)
	var doraCount *int
	doraCountStatus := "blocked_missing_facts"
	if request.DoraTilesComplete {
		count := analysis.DoraCount
		doraCount = &count
		doraCountStatus = "calculated"
	} else {
		diagnostics = append(diagnostics, "dora_count_blocked_missing_facts")
	}
	return Hand13Result{
		Kind:                 "hand13_result",
		RequestID:            request.RequestID,
		ProtocolVersion:      protocolVersion,
		ActionRef:            request.ActionRef,
		StateHash:            request.StateHash,
		Identity:             engineIdentity(),
		Shanten:              structural.Shanten,
		EffectiveTile34:      effectiveTiles,
		WaitsRemainingStatus: waitsStatus,
		WaitsRemaining:       waitsRemaining,
		Improves:             normalizeImproves(analysis.Improves),
		DoraCountStatus:      doraCountStatus,
		DoraCount:            doraCount,
		Estimates:            estimates,
		Diagnostics:          diagnostics,
	}, nil
}
