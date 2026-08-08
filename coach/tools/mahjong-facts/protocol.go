package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	helper "github.com/EndlessCheng/mahjong-helper/util"
)

const (
	protocolVersion = "mahjong-facts/v1"
	helperCommit    = "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0"
	adapterVersion  = "0.1.0"
)

// Keep the dependency pinned before the first analysis handler lands.
var _ = helper.CalculateShantenWithImproves13

type requestHeader struct {
	Kind            string `json:"kind"`
	RequestID       string `json:"requestId"`
	ProtocolVersion string `json:"protocolVersion"`
}

func requireJSONFields(line []byte, fields ...string) error {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(line, &object); err != nil {
		return err
	}
	for _, field := range fields {
		if _, exists := object[field]; !exists {
			return fmt.Errorf("%s is required", field)
		}
	}
	return nil
}

type IdentityRequest struct {
	Kind            string `json:"kind"`
	RequestID       string `json:"requestId"`
	ProtocolVersion string `json:"protocolVersion"`
}

type EngineIdentity struct {
	Engine          string `json:"engine"`
	UpstreamCommit  string `json:"upstreamCommit"`
	AdapterVersion  string `json:"adapterVersion"`
	ProtocolVersion string `json:"protocolVersion"`
}

type IdentityResult struct {
	Kind            string         `json:"kind"`
	RequestID       string         `json:"requestId"`
	ProtocolVersion string         `json:"protocolVersion"`
	Identity        EngineIdentity `json:"identity"`
}

type ErrorResult struct {
	Kind            string `json:"kind"`
	RequestID       string `json:"requestId,omitempty"`
	ProtocolVersion string `json:"protocolVersion"`
	Code            string `json:"code"`
}

type FactEngineDiagnostic struct {
	Code  string `json:"code"`
	Field string `json:"field,omitempty"`
}

func engineIdentity() EngineIdentity {
	return EngineIdentity{
		Engine:          "mahjong-helper",
		UpstreamCommit:  helperCommit,
		AdapterVersion:  adapterVersion,
		ProtocolVersion: protocolVersion,
	}
}

func strictDecode(line []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values are not allowed")
		}
		return fmt.Errorf("invalid trailing JSON: %w", err)
	}
	return nil
}

func marshalResponse(value any) []byte {
	encoded, err := json.Marshal(value)
	if err == nil {
		return encoded
	}
	fallback, _ := json.Marshal(ErrorResult{
		Kind:            "error",
		ProtocolVersion: protocolVersion,
		Code:            "internal_error",
	})
	return fallback
}

func errorResponse(requestID, code, _privateMessage string) []byte {
	return marshalResponse(ErrorResult{
		Kind:            "error",
		RequestID:       requestID,
		ProtocolVersion: protocolVersion,
		Code:            code,
	})
}

func handleLine(line []byte) (response []byte) {
	defer func() {
		if recovered := recover(); recovered != nil {
			response = errorResponse("", "internal_error", "request handler failed")
		}
	}()

	var header requestHeader
	if err := json.Unmarshal(line, &header); err != nil {
		return errorResponse("", "invalid_request", err.Error())
	}
	if header.ProtocolVersion != protocolVersion {
		if header.Kind == "hand_structure" && header.ProtocolVersion == "" {
			return errorResponse(header.RequestID, "invalid_request", "protocolVersion is required")
		}
		return errorResponse(header.RequestID, "protocol_mismatch", "unsupported protocol version")
	}

	switch header.Kind {
	case "identity":
		var request IdentityRequest
		if err := strictDecode(line, &request); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		if request.RequestID == "" {
			return errorResponse("", "invalid_request", "requestId is required")
		}
		return marshalResponse(IdentityResult{
			Kind:            "identity_result",
			RequestID:       request.RequestID,
			ProtocolVersion: protocolVersion,
			Identity:        engineIdentity(),
		})
	case "hand13":
		var request Hand13Request
		if err := strictDecode(line, &request); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		if err := requireJSONFields(
			line,
			"requestId", "protocolVersion", "actionRef", "stateHash",
			"melds", "doraTiles34", "redFiveCounts", "roundWindTile34",
			"selfWindTile34", "dealer", "riichi", "selfDiscards34",
			"handTiles34", "leftTiles34", "visibleCountsComplete",
			"doraTilesComplete", "selfDiscardsComplete", "remainingDraws",
		); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		result, err := analyzeHand13(request)
		if err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		return marshalResponse(result)
	case "hand_structure":
		var request HandStructureRequestV2
		if err := strictDecode(line, &request); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		if err := requireJSONFields(
			line,
			"schemaVersion", "requestId", "protocolVersion", "actionRef", "stateHash",
			"handTiles34", "melds", "leftTiles34", "visibleCountsComplete", "ronContext", "yakuContext",
		); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		result, err := analyzeHandStructure(request)
		if err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		return marshalResponse(result)
	case "completed_hand":
		var request CompletedHandRequest
		if err := strictDecode(line, &request); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		if err := requireJSONFields(
			line,
			"requestId", "protocolVersion", "actionRef", "stateHash",
			"melds", "doraTiles34", "redFiveCounts", "roundWindTile34",
			"selfWindTile34", "dealer", "riichi", "selfDiscards34",
			"completedHandTiles34", "tsumo", "winTile34",
		); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		result, err := analyzeCompletedHand(request)
		if err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		return marshalResponse(result)
	case "threat_risk":
		var request ThreatRiskRequest
		if err := strictDecode(line, &request); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		if err := requireJSONFields(
			line,
			"requestId", "protocolVersion", "actionRef", "stateHash",
			"threatActor", "turns", "safeTiles34", "leftTiles34",
			"doraTiles34", "roundWindTile34", "threatWindTile34",
			"earlyOutsideTiles34", "evidenceIds",
		); err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		result, err := analyzeThreatRisk(request)
		if err != nil {
			return errorResponse(header.RequestID, "invalid_request", err.Error())
		}
		return marshalResponse(result)
	case "":
		return errorResponse(header.RequestID, "invalid_request", "kind is required")
	default:
		return errorResponse(header.RequestID, "unknown_kind", "unsupported request kind")
	}
}
