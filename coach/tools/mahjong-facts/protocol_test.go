package main

import (
	"bytes"
	"encoding/json"
	"reflect"
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
	if bytes.Contains(got, []byte(`"message"`)) {
		t.Fatalf("public error response must not expose private parser prose: %s", got)
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

func TestV1MissingProtocolVersionKeepsLegacyMismatch(t *testing.T) {
	got := handleLine([]byte(`{"kind":"identity","requestId":"req-legacy"}`))
	var result ErrorResult
	if err := json.Unmarshal(got, &result); err != nil {
		t.Fatalf("decode error result: %v", err)
	}
	if result.Code != "protocol_mismatch" {
		t.Fatalf("legacy error code = %q, want protocol_mismatch", result.Code)
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

func TestProtocolHandStructureDispatchesV2(t *testing.T) {
	request := goldenHandStructureRequest()
	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal hand structure request: %v", err)
	}

	var result HandStructureResultV2
	if err := json.Unmarshal(handleLine(encoded), &result); err != nil {
		t.Fatalf("decode hand structure result: %v", err)
	}
	if result.Kind != "hand_structure_result" {
		t.Fatalf("result kind = %q, want hand_structure_result", result.Kind)
	}
	if result.SchemaVersion != handStructureSchemaVersion {
		t.Fatalf("schema version = %q, want %q", result.SchemaVersion, handStructureSchemaVersion)
	}
	if result.RequestID != request.RequestID || result.ActionRef != request.ActionRef || result.StateHash != request.StateHash {
		t.Fatalf("result bindings = (%q, %q, %q), want (%q, %q, %q)",
			result.RequestID, result.ActionRef, result.StateHash,
			request.RequestID, request.ActionRef, request.StateHash)
	}
	wantFamilies := []string{"standard", "chiitoitsu", "kokushi"}
	gotFamilies := make([]string, len(result.Families))
	for index, family := range result.Families {
		gotFamilies[index] = family.Family
	}
	if !reflect.DeepEqual(gotFamilies, wantFamilies) {
		t.Fatalf("families = %v, want %v", gotFamilies, wantFamilies)
	}
	if result.OverallShanten != 0 || len(result.Waits) == 0 {
		t.Fatalf("valid tenpai result must carry waits: shanten=%d waits=%v", result.OverallShanten, result.Waits)
	}
}

func protocolRequestObject(t *testing.T, request any) map[string]any {
	t.Helper()
	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	var object map[string]any
	if err := json.Unmarshal(encoded, &object); err != nil {
		t.Fatalf("decode request object: %v", err)
	}
	return object
}

func assertInvalidPublicRequest(t *testing.T, request map[string]any) {
	t.Helper()
	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal invalid request: %v", err)
	}
	response := handleLine(encoded)
	var result ErrorResult
	if err := json.Unmarshal(response, &result); err != nil {
		t.Fatalf("decode error result: %v", err)
	}
	if result.Code != "invalid_request" {
		t.Fatalf("error code = %q, want invalid_request; response=%s", result.Code, response)
	}
	if bytes.Contains(response, []byte(`"message"`)) {
		t.Fatalf("public error response exposed private parser prose: %s", response)
	}
}

func TestProtocolHandStructureRejectsUnknownAndMissingTopLevelFields(t *testing.T) {
	withUnknown := protocolRequestObject(t, goldenHandStructureRequest())
	withUnknown["recommendation"] = "6s"
	assertInvalidPublicRequest(t, withUnknown)

	for _, field := range []string{
		"schemaVersion", "requestId", "protocolVersion", "actionRef", "stateHash",
		"handTiles34", "melds", "leftTiles34", "visibleCountsComplete", "ronContext", "yakuContext",
	} {
		t.Run("missing_"+field, func(t *testing.T) {
			missing := protocolRequestObject(t, goldenHandStructureRequest())
			delete(missing, field)
			assertInvalidPublicRequest(t, missing)
		})
	}
}

func TestProtocolHandStructureStrictlyDecodesNestedYakuContext(t *testing.T) {
	for _, mutate := range []func(map[string]any){
		func(context map[string]any) { context["coachingHint"] = "push" },
		func(context map[string]any) { delete(context, "openTanyaoStatus") },
	} {
		request := protocolRequestObject(t, goldenHandStructureRequest())
		context, ok := request["yakuContext"].(map[string]any)
		if !ok {
			t.Fatalf("yakuContext encoded as %T", request["yakuContext"])
		}
		mutate(context)
		assertInvalidPublicRequest(t, request)
	}
}

func TestProtocolHand13RegressionStillDispatches(t *testing.T) {
	request := goldenHand13Request()
	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal hand13 request: %v", err)
	}
	var result Hand13Result
	if err := json.Unmarshal(handleLine(encoded), &result); err != nil {
		t.Fatalf("decode hand13 result: %v", err)
	}
	if result.Kind != "hand13_result" || result.RequestID != request.RequestID {
		t.Fatalf("hand13 result lost V1 dispatch/binding: %#v", result)
	}
}
