import { inspect } from "node:util";
import { describe, expect, test } from "vitest";

import type { CanonicalEventStream } from "@riichi-coach/contracts";
import {
  SecretString,
  type MahjongSoulLobbySession,
  type RawRecordListEntry,
  type StoredMahjongSoulSession,
} from "@riichi-coach/mahjong-soul-source";
import {
  replayDiagnosticExitCode,
  runMahjongSoulReplayDiagnostic,
  type MahjongSoulReplayDiagnosticPorts,
} from "../src/replay-diagnostic-runner.js";

const recordId = "260811-00000000-0000-0000-0000-000000000001";
const token = "fixture-replay-token-never-real";

function storedSession(): StoredMahjongSoulSession {
  return {
    region: "cn",
    loginMethod: "oauth2Login",
    authType: 7,
    accountId: 123,
    displayName: "Fixture",
    accessToken: SecretString.from(token),
    recoveryContext: {
      device: {
        platform: "pc", hardware: "pc", os: "windows", osVersion: "10",
        isBrowser: true, software: "Chrome", salePlatform: "web",
        hardwareVendor: "fixture", modelNumber: "fixture", screenWidth: 1,
        screenHeight: 1, userAgent: "fixture", screenType: 0,
      },
      clientVersion: { resource: "0.11.252.w", package: "" },
      currencyPlatforms: [2],
      version: 1,
      clientVersionString: "web-0.11.252.w",
      tag: "chs_t",
    },
    adapterVersion: "0.1.0",
    clientVersion: "0.11.252.w",
    createdAt: 1,
    lastValidatedAt: 1,
  };
}

function entry(): RawRecordListEntry {
  return {
    version: 210715,
    uuid: recordId,
    start_time: 1_700_000_000,
    end_time: 1_700_001_800,
    tag: 0,
    subtag: 0,
    players: [
      { rank: 1, account_id: 123, nickname: "P0", seat: 0, point: 25000 },
      { rank: 2, account_id: 124, nickname: "P1", seat: 1, point: 25000 },
      { rank: 3, account_id: 125, nickname: "P2", seat: 2, point: 25000 },
      { rank: 4, account_id: 126, nickname: "P3", seat: 3, point: 25000 },
    ],
    standard_rule: 2,
    game_mode: 2,
    game_mode_ai: false,
    game_mode_extendinfo: "",
    game_mode_detail_rule_present: false,
  };
}

function lobby(closeFn?: () => void): MahjongSoulLobbySession {
  return {
    async authenticate() {},
    async call() { return {}; },
    async close() { closeFn?.(); },
  };
}

function ports(
  overrides: Partial<MahjongSoulReplayDiagnosticPorts> = {},
): MahjongSoulReplayDiagnosticPorts {
  return {
    vault: {
      async restore() { return storedSession(); },
      async save() {},
      async markValidated() {},
      async clear() {},
    },
    createSession: async () => lobby(),
    authenticate: async () => "authenticated",
    syncCatalog: async () => [entry()],
    fetchRecord: async (_session, _stored, id) => ({
      recordId: id,
      sha256: `sha256:${"a".repeat(64)}`,
      container: "actions",
      actionCount: 1,
      recordBytes: Uint8Array.of(1),
    }),
    mapRecord: () => ({ status: "ready", stream: {} as CanonicalEventStream }),
    replay: () => [],
    serializeAudit: () => "{\"audit\":true}",
    writeAudit: async (_serialized, id) => `C:\\audit\\${id}.json`,
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

describe("Mahjong Soul replay H1 diagnostic", () => {
  test("maps every fixed status to a stable process exit code", () => {
    expect(replayDiagnosticExitCode("replay_audit_written")).toBe(0);
    expect(replayDiagnosticExitCode("login_required")).toBe(10);
    expect(replayDiagnosticExitCode("session_restore_failed")).toBe(11);
    expect(replayDiagnosticExitCode("catalog_sync_failed")).toBe(12);
    expect(replayDiagnosticExitCode("no_analyzable_record")).toBe(13);
    expect(replayDiagnosticExitCode("record_not_analyzable")).toBe(14);
    expect(replayDiagnosticExitCode("record_fetch_failed")).toBe(15);
    expect(replayDiagnosticExitCode("unsupported_record_semantics")).toBe(16);
    expect(replayDiagnosticExitCode("replay_validation_failed")).toBe(17);
    expect(replayDiagnosticExitCode("audit_write_failed")).toBe(18);
    expect(replayDiagnosticExitCode("session_restore_rejected")).toBe(19);
    expect(replayDiagnosticExitCode("inconclusive")).toBe(29);
  });

  test("returns login_required without opening a session when none is stored", async () => {
    let created = false;
    const result = await runMahjongSoulReplayDiagnostic(ports({
      vault: {
        async restore() { return null; },
        async save() {},
        async markValidated() {},
        async clear() {},
      },
      createSession: async () => { created = true; return lobby(); },
    }));
    expect(result).toEqual({ status: "login_required" });
    expect(created).toBe(false);
  });

  test("returns session_restore_failed and closes the lobby when auth is unverified", async () => {
    let closed = false;
    const result = await runMahjongSoulReplayDiagnostic(ports({
      authenticate: async () => "unverified",
      createSession: async () => lobby(() => { closed = true; }),
    }));
    expect(result).toEqual({ status: "session_restore_failed" });
    expect(closed).toBe(true);
  });

  test("distinguishes a server-rejected session from an unverified restore", async () => {
    const rejected = await runMahjongSoulReplayDiagnostic(ports({
      authenticate: async () => "rejected",
    }));
    expect(rejected).toEqual({ status: "session_restore_rejected" });

    const unverified = await runMahjongSoulReplayDiagnostic(ports({
      authenticate: async () => "unverified",
    }));
    expect(unverified).toEqual({ status: "session_restore_failed" });
  });

  test("returns unsupported_record_semantics for an unproven action", async () => {
    const result = await runMahjongSoulReplayDiagnostic(ports({
      mapRecord: () => ({
        status: "invalid",
        code: "mahjong_soul_canonical_unsupported_semantics",
      }),
    }));
    expect(result).toEqual({ status: "unsupported_record_semantics" });
  });

  test("returns replay_validation_failed for a malformed mapped record", async () => {
    const result = await runMahjongSoulReplayDiagnostic(ports({
      mapRecord: () => ({
        status: "invalid",
        code: "mahjong_soul_canonical_mapping_failed",
      }),
    }));
    expect(result).toEqual({ status: "replay_validation_failed" });
  });

  test("returns record_not_analyzable for a malformed --record-id", async () => {
    const result = await runMahjongSoulReplayDiagnostic(
      ports({ recordId: "not-a-record-id" }),
    );
    expect(result).toEqual({ status: "record_not_analyzable" });
  });

  test("returns record_not_analyzable for a --record-id outside the catalog", async () => {
    const result = await runMahjongSoulReplayDiagnostic(ports({
      recordId: "260811-00000000-0000-0000-0000-000000000099",
    }));
    expect(result).toEqual({ status: "record_not_analyzable" });
  });

  test("writes the audit, returns its path, closes the lobby, and never leaks the token", async () => {
    let closed = false;
    let written: { serialized: string; recordId: string } | null = null;
    const result = await runMahjongSoulReplayDiagnostic(ports({
      createSession: async () => lobby(() => { closed = true; }),
      writeAudit: async (serialized, id) => {
        written = { serialized, recordId: id };
        return "C:\\audit\\record.json";
      },
    }));
    expect(result).toEqual({
      status: "replay_audit_written",
      auditPath: "C:\\audit\\record.json",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(closed).toBe(true);
    expect(written).toEqual({ serialized: "{\"audit\":true}", recordId });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(inspect(result)).not.toContain(token);
  });
});
