package main

import (
	"encoding/json"
	"testing"
)

func TestHandleIdentity(t *testing.T) {
	got := handleLine([]byte(`{"kind":"identity","requestId":"req-1","protocolVersion":"mahjong-facts/v1"}`))
	var result IdentityResult
	if err := json.Unmarshal(got, &result); err != nil {
		t.Fatalf("decode identity result: %v", err)
	}
	if result.RequestID != "req-1" {
		t.Fatalf("request ID = %q, want req-1", result.RequestID)
	}
	if result.Identity.UpstreamCommit != helperCommit {
		t.Fatalf("helper commit = %q, want %q", result.Identity.UpstreamCommit, helperCommit)
	}
}

func TestUnknownFieldFailsClosed(t *testing.T) {
	got := handleLine([]byte(`{"kind":"identity","requestId":"req-1","protocolVersion":"mahjong-facts/v1","recommendation":"6s"}`))
	var result ErrorResult
	if err := json.Unmarshal(got, &result); err != nil {
		t.Fatalf("decode error result: %v", err)
	}
	if result.Code != "invalid_request" {
		t.Fatalf("error code = %q, want invalid_request", result.Code)
	}
}

func TestProtocolMismatchFailsClosed(t *testing.T) {
	got := handleLine([]byte(`{"kind":"identity","requestId":"req-1","protocolVersion":"mahjong-facts/v0"}`))
	var result ErrorResult
	if err := json.Unmarshal(got, &result); err != nil {
		t.Fatalf("decode error result: %v", err)
	}
	if result.Code != "protocol_mismatch" {
		t.Fatalf("error code = %q, want protocol_mismatch", result.Code)
	}
}

func TestUnknownKindFailsClosed(t *testing.T) {
	got := handleLine([]byte(`{"kind":"recommend","requestId":"req-1","protocolVersion":"mahjong-facts/v1"}`))
	var result ErrorResult
	if err := json.Unmarshal(got, &result); err != nil {
		t.Fatalf("decode error result: %v", err)
	}
	if result.Code != "unknown_kind" {
		t.Fatalf("error code = %q, want unknown_kind", result.Code)
	}
}
