package main

import (
	"fmt"
	"math"

	"github.com/EndlessCheng/mahjong-helper/util"
	"github.com/EndlessCheng/mahjong-helper/util/model"
)

type CompletedHandRequest struct {
	RequestBase
	HandContext
	CompletedHandTiles34 []int `json:"completedHandTiles34"`
	Tsumo                bool  `json:"tsumo"`
	WinTile34            int   `json:"winTile34"`
}

type CompletedHandResult struct {
	Kind            string                 `json:"kind"`
	RequestID       string                 `json:"requestId"`
	ProtocolVersion string                 `json:"protocolVersion"`
	ActionRef       string                 `json:"actionRef"`
	StateHash       string                 `json:"stateHash"`
	Identity        EngineIdentity         `json:"identity"`
	Point           int                    `json:"point"`
	FixedPoint      float64                `json:"fixedPoint"`
	HanStatus       string                 `json:"hanStatus"`
	FuStatus        string                 `json:"fuStatus"`
	Limitations     []string               `json:"limitations"`
	Diagnostics     []FactEngineDiagnostic `json:"diagnostics"`
}

func validateCompletedHandRequest(request CompletedHandRequest) ([]model.Meld, error) {
	if request.Kind != "completed_hand" {
		return nil, fmt.Errorf("kind must be completed_hand")
	}
	if request.RequestID == "" || request.ActionRef == "" || request.StateHash == "" {
		return nil, fmt.Errorf("requestId, actionRef, and stateHash are required")
	}
	if request.ProtocolVersion != protocolVersion {
		return nil, fmt.Errorf("unsupported protocol version")
	}
	if err := validateCounts34(request.CompletedHandTiles34, "completedHandTiles34"); err != nil {
		return nil, err
	}
	if err := validateTile34(request.WinTile34, "winTile34"); err != nil {
		return nil, err
	}
	if request.CompletedHandTiles34[request.WinTile34] == 0 {
		return nil, fmt.Errorf("winTile34 must be present in completedHandTiles34")
	}
	melds, err := validateHandContext(request.HandContext, request.CompletedHandTiles34)
	if err != nil {
		return nil, err
	}
	concealedCount := 0
	for _, count := range request.CompletedHandTiles34 {
		concealedCount += count
	}
	wantConcealedCount := 14 - 3*len(request.Melds)
	if concealedCount != wantConcealedCount {
		return nil, fmt.Errorf("completed hand has %d concealed tiles, want %d", concealedCount, wantConcealedCount)
	}
	return melds, nil
}

func analyzeCompletedHand(request CompletedHandRequest) (CompletedHandResult, error) {
	melds, err := validateCompletedHandRequest(request)
	if err != nil {
		return CompletedHandResult{}, err
	}
	player := &model.PlayerInfo{
		HandTiles34:   cloneInts(request.CompletedHandTiles34),
		Melds:         melds,
		DoraTiles:     cloneInts(request.DoraTiles34),
		NumRedFives:   cloneInts(request.RedFiveCounts),
		IsTsumo:       request.Tsumo,
		WinTile:       request.WinTile34,
		RoundWindTile: request.RoundWindTile34,
		SelfWindTile:  request.SelfWindTile34,
		IsParent:      request.Dealer,
		IsRiichi:      request.Riichi,
		DiscardTiles:  cloneInts(request.SelfDiscards34),
	}
	pointResult := util.CalcPoint(player)
	if pointResult == nil || math.IsNaN(pointResult.FixedPoint) || math.IsInf(pointResult.FixedPoint, 0) {
		return CompletedHandResult{}, fmt.Errorf("mahjong-helper returned an invalid point result")
	}
	return CompletedHandResult{
		Kind:            "completed_hand_result",
		RequestID:       request.RequestID,
		ProtocolVersion: protocolVersion,
		ActionRef:       request.ActionRef,
		StateHash:       request.StateHash,
		Identity:        engineIdentity(),
		Point:           pointResult.Point,
		FixedPoint:      pointResult.FixedPoint,
		HanStatus:       "unsupported_upstream_api",
		FuStatus:        "unsupported_upstream_api",
		Limitations: []string{
			"completed_hand_han_fu_unavailable",
			"completed_hand_context_limited",
		},
		Diagnostics: []FactEngineDiagnostic{},
	}, nil
}
