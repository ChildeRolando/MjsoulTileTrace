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
	Message         string `json:"message"`
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
		Message:         "failed to encode response",
	})
	return fallback
}

func errorResponse(requestID, code, message string) []byte {
	return marshalResponse(ErrorResult{
		Kind:            "error",
		RequestID:       requestID,
		ProtocolVersion: protocolVersion,
		Code:            code,
		Message:         message,
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
	case "":
		return errorResponse(header.RequestID, "invalid_request", "kind is required")
	default:
		return errorResponse(header.RequestID, "unknown_kind", "unsupported request kind")
	}
}
