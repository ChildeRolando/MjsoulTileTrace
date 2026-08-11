# Mahjong Soul CN Protocol Contracts Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with the built-in
> collaboration agents: one fresh TDD worker and one independent read-only
> reviewer per task. The optional superpowers subagent/executing-plan skills are
> not installed in this workspace. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Build M5-A: the strict, versioned, secret-safe contract and protobuf foundation for Mahjong Soul CN login capture, recent-record sync, and full-record retrieval without yet opening a real Electron login window or using a real account.

**Architecture:** Add renderer-safe Mahjong Soul DTOs to `@riichi-coach/contracts` and a new privileged `@riichi-coach/mahjong-soul-source` workspace package. The privileged package loads a hash-verified Apache-2.0 protocol bundle and generated CN endpoint policy, decodes the Liqi WebSocket envelope with request/response correlation, projects login success into a redacting secret type, and exposes no network transport. A deterministic updater vendors only pinned Akagi v3 protocol assets and records the corresponding official CN client hashes; runtime never downloads or guesses a schema.

**Tech Stack:** TypeScript 5.9, Zod 3.25, Vitest 3.2, Node.js crypto/fs, protobufjs 8.7.2, npm workspaces, Node test runner.

**Approved design:** `docs/superpowers/specs/2026-08-11-mahjong-soul-account-sync-design.md`, especially sections 3, 5, 6, 8, 10, 13, 15, and M5-A in section 18.

**Pinned research inputs (2026-08-11):**

- Official CN version URL: `https://game.maj-soul.com/1/version.json`
- Official client version: `0.11.252.w`
- Official resource index: `https://game.maj-soul.com/1/resversion0.11.252.w.json`
- Official versioned CN config: `https://game.maj-soul.com/1/v0.11.252.w/config.json`
- Official config SHA-256: `56d077557335d457e4c961ae752965c5944236287069cb716111ef30e73abca1`
- Official Liqi asset: `https://game.maj-soul.com/1/v0.11.243.w/res/proto/liqi.json`
- Official Liqi SHA-256: `f2955c3d10cf2d42bee9309f672c062540941ea0cffe1bd62e3f436c7afc404c`
- Protocol source: `https://github.com/shinkuan/Akagi`, commit `27e994ad8bacd87833856b3b36b146ebb7cccbbc`
- Protocol source license: Apache-2.0, including upstream `LICENSE.txt` and `NOTICE`
- `liqi.proto` raw-blob SHA-256: `ccfa3f7b39c205e9d4690f61bc1b333df415edfdf8d1e325cd5fc8a5ac30cbb7`
- RPC map raw-blob SHA-256: `15f44eecb654e3b5cfca7682cf00f3a0a16ae3c76d0450b0257a9e89aa44be80`

All vendored size/hash values are over the commit-specific raw Git blob bytes,
not a local checkout after `core.autocrlf` conversion. Tests must include at
least one LF→CRLF mutation proving platform line-ending conversion is rejected.

**Explicit non-goals:** Electron/Chromium/CDP, real credentials, WebSocket connection establishment, recent-record business filtering, record downloads, record-to-canonical mapping, renderer UI, and H1. Those begin in M5-B–M5-E. The package created here must not make an unauthenticated `fetchGameRecord` request and must not accept the old fixture bridge as a source.

---

## File map

### Public safe contracts

- Create `coach/packages/contracts/src/mahjong-soul.ts`: renderer-safe region, session status, record summary, analysis status, and fixed error-code schemas.
- Create `coach/packages/contracts/tests/mahjong-soul.test.ts`: strictness, canonical order, uniqueness, URL/record identity, and secret-field rejection.
- Modify `coach/packages/contracts/src/index.ts`: export the safe contracts.

### Privileged source package

- Create `coach/packages/mahjong-soul-source/package.json`: private workspace package and dependencies.
- Create `coach/packages/mahjong-soul-source/tsconfig.json` and `tsconfig.build.json`: follow existing package conventions.
- Create `coach/packages/mahjong-soul-source/src/errors.ts`: fixed project-owned source errors.
- Create `coach/packages/mahjong-soul-source/src/secret-string.ts`: non-coercible, JSON-redacting in-memory secret wrapper.
- Create `coach/packages/mahjong-soul-source/src/protocol-manifest.ts`: strict source lock and generated manifest schemas.
- Create `coach/packages/mahjong-soul-source/src/protocol-bundle.ts`: content-hash and surface verification.
- Create `coach/packages/mahjong-soul-source/src/liqi-codec.ts`: Liqi frame encode/decode and request correlation.
- Create `coach/packages/mahjong-soul-source/src/login-result.ts`: allowlisted `ResLogin` projection into account identity plus `SecretString`.
- Create `coach/packages/mahjong-soul-source/src/index.ts`: explicit privileged exports.
- Create focused tests under `coach/packages/mahjong-soul-source/tests/`.

### Pinned assets and generator

- Create `coach/vendor/mahjong-soul-protocol/source-lock.json`.
- Generate `coach/vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/{liqi.proto,rpc-map.json,LICENSE.txt,NOTICE}`.
- Generate `coach/vendor/mahjong-soul-protocol/manifest.json`.
- Generate `coach/vendor/mahjong-soul-protocol/endpoints.json` from the pinned
  versioned CN config with a project-owned strict capability shape.
- Create `coach/scripts/update-mahjong-soul-protocol.mjs` and its Node test.

### Workspace integration

- Modify `coach/package.json`, `coach/package-lock.json`, and `coach/smoke/package-import-smoke.mjs`.
- Modify `coach/README.md` only to document M5-A as protocol groundwork, not production login.

---

### Task 1: Define renderer-safe Mahjong Soul contracts

**Files:**

- Create: `coach/packages/contracts/src/mahjong-soul.ts`
- Create: `coach/packages/contracts/tests/mahjong-soul.test.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

Cover all of these independently:

```ts
import { describe, expect, it } from "vitest";
import {
  AnalyzableRecordSummarySchema,
  MahjongSoulSessionStatusSchema,
  MahjongSoulSourceErrorCodeSchema,
  parseMahjongSoulCnShareUrl,
} from "../src/mahjong-soul.js";

const summary = {
  recordId: "260811-00000000-0000-0000-0000-000000000001",
  shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a123456789",
  startedAt: 1_754_877_600,
  players: [
    { seat: 0, displayName: "A", finalScore: 32000, rank: 1 },
    { seat: 1, displayName: "B", finalScore: 27000, rank: 2 },
    { seat: 2, displayName: "C", finalScore: 23000, rank: 3 },
    { seat: 3, displayName: "D", finalScore: 18000, rank: 4 },
  ],
  selfSeat: 2,
  rule: {
    playerCount: 4,
    length: "south",
    modeId: 16,
    detailRuleHash: "sha256:" + "a".repeat(64),
    displayLabel: "四人南风",
  },
  analysisStatus: "not_analyzed",
  lastSyncedAt: 1_754_877_700,
} as const;

describe("Mahjong Soul renderer-safe contracts", () => {
  it("accepts one canonical four-player South summary", () => {
    expect(AnalyzableRecordSummarySchema.parse(summary)).toEqual(summary);
    expect(parseMahjongSoulCnShareUrl(summary.shareUrl)).toEqual({
      recordId: summary.recordId,
    });
  });

  it.each([
    { ...summary, token: "secret" },
    { ...summary, cookie: "secret" },
    { ...summary, accountId: 123 },
    { ...summary, rawRecord: "bytes" },
    { ...summary, players: [...summary.players].reverse() },
    { ...summary, players: summary.players.map((p) => ({ ...p, rank: 1 })) },
    { ...summary, selfSeat: 4 },
    { ...summary, shareUrl: "http://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a123456789" },
    { ...summary, shareUrl: "https://game.maj-soul.com:443/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a123456789" },
    { ...summary, shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000002_a123456789" },
    { ...summary, shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a123456789&token=secret" },
    { ...summary, shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a123456789#fragment" },
    { ...summary, shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a123456789_2" },
  ])("rejects unsafe or non-canonical summary %#", (value) => {
    expect(() => AnalyzableRecordSummarySchema.parse(value)).toThrow();
  });

  it("keeps session status free of credentials", () => {
    const valid = {
      status: "valid",
      region: "cn",
      displayName: "Player",
      lastValidatedAt: 1_754_877_700,
    };
    expect(MahjongSoulSessionStatusSchema.parse(valid)).toEqual(valid);
    expect(() => MahjongSoulSessionStatusSchema.parse({
      ...valid,
      accessToken: "secret",
    })).toThrow();
  });

  it("accepts only project-owned source error codes", () => {
    expect(MahjongSoulSourceErrorCodeSchema.parse(
      "mahjong_soul_record_fetch_failed",
    )).toBe("mahjong_soul_record_fetch_failed");
    expect(() => MahjongSoulSourceErrorCodeSchema.parse("server said token=x"))
      .toThrow();
  });
});
```

- [ ] **Step 2: Run RED**

Run from `coach`:

```powershell
npx vitest run packages/contracts/tests/mahjong-soul.test.ts
```

Expected: collection fails because `../src/mahjong-soul.js` does not exist.

- [ ] **Step 3: Implement strict safe contracts**

Use strict Zod objects and cross-field refinements. The implementation must include:

```ts
import { z } from "zod";

export const MahjongSoulRegionSchema = z.literal("cn");
export const MahjongSoulRecordIdSchema = z.string()
  .regex(/^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
export const MahjongSoulSha256Schema = z.string()
  .regex(/^sha256:[0-9a-f]{64}$/u);

export function parseMahjongSoulCnShareUrl(value: string): {
  readonly recordId: string;
} {
  const match = /^https:\/\/game\.maj-soul\.com\/1\/\?paipu=(\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_a([1-9]\d{0,9})$/u.exec(value);
  if (match === null || Number(match[2]) > 4_294_967_295) {
    throw new Error("mahjong_soul_record_identity_mismatch");
  }
  return Object.freeze({
    recordId: match[1]!,
  });
}

export const MahjongSoulSourceErrorCodeSchema = z.enum([
  "mahjong_soul_login_protocol_unsupported",
  "mahjong_soul_session_invalid",
  "mahjong_soul_session_storage_unavailable",
  "mahjong_soul_catalog_sync_failed",
  "mahjong_soul_record_not_analyzable",
  "mahjong_soul_record_fetch_failed",
  "unsupported_mahjong_soul_record_version",
  "mahjong_soul_record_identity_mismatch",
  "mahjong_soul_canonical_mapping_failed",
  "mahjong_soul_canonical_validation_failed",
]);

const PlayerSchema = z.object({
  seat: z.number().int().min(0).max(3),
  displayName: z.string().min(1).max(64),
  finalScore: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  rank: z.number().int().min(1).max(4),
}).strict();

export const AnalyzableRecordSummarySchema = z.object({
  recordId: MahjongSoulRecordIdSchema,
  shareUrl: z.string().url(),
  startedAt: z.number().int().nonnegative(),
  players: z.array(PlayerSchema).length(4),
  selfSeat: z.number().int().min(0).max(3),
  rule: z.object({
    playerCount: z.literal(4),
    length: z.literal("south"),
    modeId: z.number().int().nonnegative(),
    detailRuleHash: MahjongSoulSha256Schema,
    displayLabel: z.literal("四人南风"),
  }).strict(),
  analysisStatus: z.enum(["not_analyzed", "queued", "analyzing", "ready"]),
  lastSyncedAt: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  const seats = value.players.map((player) => player.seat);
  const ranks = value.players.map((player) => player.rank);
  if (!seats.every((seat, index) => seat === index)) {
    ctx.addIssue({ code: "custom", message: "players must be ordered by seat" });
  }
  if (new Set(ranks).size !== 4) {
    ctx.addIssue({ code: "custom", message: "ranks must be unique" });
  }
  try {
    if (parseMahjongSoulCnShareUrl(value.shareUrl).recordId !== value.recordId) {
      ctx.addIssue({ code: "custom", message: "share URL record mismatch" });
    }
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid share URL" });
  }
});
```

Define `MahjongSoulSessionStatusSchema` as this strict discriminated union:

```ts
const SessionBase = { region: MahjongSoulRegionSchema };
export const MahjongSoulSessionStatusSchema = z.discriminatedUnion("status", [
  z.object({ ...SessionBase, status: z.literal("logged_out") }).strict(),
  z.object({ ...SessionBase, status: z.literal("authenticating") }).strict(),
  z.object({ ...SessionBase, status: z.literal("session_validating") }).strict(),
  z.object({
    ...SessionBase,
    status: z.literal("valid"),
    displayName: z.string().min(1).max(64),
    lastValidatedAt: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    ...SessionBase,
    status: z.literal("offline_unverified"),
    displayName: z.string().min(1).max(64),
    lastValidatedAt: z.number().int().nonnegative(),
  }).strict(),
]);
```

No branch accepts account ID, token, Cookie, endpoint, or raw error text. The
share URL parser validates but does not return its `_a...` account suffix; it
must not use that suffix as the authoritative self identity.

Export inferred TypeScript types and add `export * from "./mahjong-soul.js";`
to `contracts/src/index.ts`.

- [ ] **Step 4: Run GREEN and package typecheck**

```powershell
npx vitest run packages/contracts/tests/mahjong-soul.test.ts
npm run typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 5: Review and commit**

```powershell
git add -- packages/contracts/src/mahjong-soul.ts packages/contracts/src/index.ts packages/contracts/tests/mahjong-soul.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: define Mahjong Soul source contracts"
```

### Task 2: Scaffold the privileged source package and secret type

**Files:**

- Create: `coach/packages/mahjong-soul-source/package.json`
- Create: `coach/packages/mahjong-soul-source/tsconfig.json`
- Create: `coach/packages/mahjong-soul-source/tsconfig.build.json`
- Create: `coach/packages/mahjong-soul-source/src/errors.ts`
- Create: `coach/packages/mahjong-soul-source/src/secret-string.ts`
- Create: `coach/packages/mahjong-soul-source/src/index.ts`
- Create: `coach/packages/mahjong-soul-source/tests/secret-string.test.ts`
- Modify: `coach/package.json`
- Modify: `coach/package-lock.json`

- [ ] **Step 1: Write RED for redaction and fixed errors**

```ts
import { describe, expect, it } from "vitest";
import { inspect } from "node:util";
import {
  MahjongSoulSourceError,
  SecretString,
} from "../src/index.js";

describe("privileged Mahjong Soul primitives", () => {
  it("never coerces or serializes the secret", () => {
    const secret = SecretString.from("test-token-not-secret");
    expect(String(secret)).toBe("[REDACTED]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[REDACTED]"}');
    expect(inspect({ nested: { secret } })).not.toContain("test-token-not-secret");
    expect(secret.reveal()).toBe("test-token-not-secret");
    expect(Object.keys(secret)).toEqual([]);
  });

  it.each([undefined, null, {}, []])("rejects non-string secret input %#", (value) => {
    expect(() => SecretString.from(value as never)).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );
  });

  it("does not carry upstream prose", () => {
    const error = new MahjongSoulSourceError(
      "mahjong_soul_login_protocol_unsupported",
    );
    expect(error.message).toBe("mahjong_soul_login_protocol_unsupported");
    expect(JSON.stringify(error)).not.toContain("token");
  });
});
```

- [ ] **Step 2: Run RED**

```powershell
npx vitest run packages/mahjong-soul-source/tests/secret-string.test.ts
```

Expected: package and modules do not exist.

- [ ] **Step 3: Add workspace metadata**

Create `package.json`:

```json
{
  "name": "@riichi-coach/mahjong-soul-source",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json"
  },
  "dependencies": {
    "@riichi-coach/contracts": "0.1.0",
    "protobufjs": "8.7.2",
    "zod": "3.25.76"
  }
}
```

Copy the contracts package tsconfig pattern, with `rootDir: "src"` and
`outDir: "dist"` in the build config.

Update root scripts so build and typecheck order is contracts → source →
reasoning:

```json
"build": "npm run build -w @riichi-coach/contracts && npm run build -w @riichi-coach/mahjong-soul-source && npm run build -w @riichi-coach/reasoning",
"typecheck": "tsc --noEmit -p packages/contracts/tsconfig.json && tsc --noEmit -p packages/mahjong-soul-source/tsconfig.json && tsc --noEmit -p packages/reasoning/tsconfig.json"
```

Also add exact root `devDependencies.protobufjs = "8.7.2"`; the plain-Node
updater and compatibility scripts must not rely on workspace hoisting from the
source package's runtime dependency.

Run `npm install` from `coach` to update the lockfile; do not hand-edit lock
entries.

- [ ] **Step 4: Implement secrets and fixed errors**

`SecretString` must use a private class field, have a private constructor,
expose only `from`, `reveal`, `toString`, and `toJSON`, and never include the
secret in inspect output:

```ts
export class SecretString {
  #value: string;

  private constructor(value: string) {
    if (value.length < 8 || value.length > 4096) {
      throw new Error("mahjong_soul_login_protocol_unsupported");
    }
    this.#value = value;
    Object.freeze(this);
  }

  static from(value: string): SecretString {
    if (typeof value !== "string") {
      throw new Error("mahjong_soul_login_protocol_unsupported");
    }
    return new SecretString(value);
  }

  reveal(): string { return this.#value; }
  toString(): string { return "[REDACTED]"; }
  toJSON(): string { return "[REDACTED]"; }
}
```

Add `nodejs.util.inspect.custom` returning `[REDACTED]`. Define
`MahjongSoulSourceError` so it accepts only `MahjongSoulSourceErrorCode`, sets
`message` to that code, and never accepts a detail string. Export these exact
symbols from `src/index.ts`.

- [ ] **Step 5: Run GREEN**

```powershell
npx vitest run packages/mahjong-soul-source/tests/secret-string.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit exact files**

```powershell
git add -- package.json package-lock.json packages/mahjong-soul-source/package.json packages/mahjong-soul-source/tsconfig.json packages/mahjong-soul-source/tsconfig.build.json packages/mahjong-soul-source/src/errors.ts packages/mahjong-soul-source/src/secret-string.ts packages/mahjong-soul-source/src/index.ts packages/mahjong-soul-source/tests/secret-string.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "build: add privileged Mahjong Soul source package"
```

### Task 3: Pin and vendor the protocol source reproducibly

**Files:**

- Create: `.gitattributes`
- Create: `coach/vendor/mahjong-soul-protocol/source-lock.json`
- Create: `coach/scripts/update-mahjong-soul-protocol.mjs`
- Create: `coach/scripts/update-mahjong-soul-protocol.test.mjs`
- Generate: `coach/vendor/mahjong-soul-protocol/manifest.json`
- Generate: `coach/vendor/mahjong-soul-protocol/endpoints.json`
- Generate: `coach/vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto`
- Generate: `coach/vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/rpc-map.json`
- Generate: `coach/vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/LICENSE.txt`
- Generate: `coach/vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/NOTICE`
- Modify: `coach/package.json`

- [ ] **Step 1: Write the locked source file**

The strict JSON file contains exact URLs, sizes, and hashes:

```json
{
  "lockVersion": "mahjong-soul-protocol-source/v1",
  "region": "cn",
  "official": {
    "clientVersion": "0.11.252.w",
    "currentVersionSnapshot": {
      "url": "https://game.maj-soul.com/1/version.json",
      "size": 85,
      "sha256": "112108838b042eca0e7e455bb8cf7d76f000d12de81c7a8a328d8485ff09b6ce"
    },
    "resourceIndexUrl": "https://game.maj-soul.com/1/resversion0.11.252.w.json",
    "resourceIndexSize": 12688057,
    "resourceIndexSha256": "91accb83474e4a530ff9c5e7b9471e7156cdc30410a11dbc223d9f637babcd2f",
    "liqiUrl": "https://game.maj-soul.com/1/v0.11.243.w/res/proto/liqi.json",
    "liqiSize": 286815,
    "liqiSha256": "f2955c3d10cf2d42bee9309f672c062540941ea0cffe1bd62e3f436c7afc404c",
    "configUrl": "https://game.maj-soul.com/1/v0.11.252.w/config.json",
    "configSize": 1173,
    "configSha256": "56d077557335d457e4c961ae752965c5944236287069cb716111ef30e73abca1"
  },
  "vendor": {
    "repository": "https://github.com/shinkuan/Akagi",
    "commit": "27e994ad8bacd87833856b3b36b146ebb7cccbbc",
    "license": "Apache-2.0",
    "files": [
      { "source": "LICENSE.txt", "target": "LICENSE.txt", "size": 10752, "sha256": "aa0e11e4740a0ae88ea797258500d9b066a68042be2f6036bfe49460b72405f0" },
      { "source": "NOTICE", "target": "NOTICE", "size": 5414, "sha256": "2ffcce0e8bae52171dfdacd28ff9637334a2cc21d250deb4f30e315e65a3c421" },
      { "source": "src/bridge/majsoul/proto/liqi.proto", "target": "liqi.proto", "size": 240793, "sha256": "ccfa3f7b39c205e9d4690f61bc1b333df415edfdf8d1e325cd5fc8a5ac30cbb7" },
      { "source": "src/bridge/majsoul/liqi.json", "target": "rpc-map.json", "size": 42178, "sha256": "15f44eecb654e3b5cfca7682cf00f3a0a16ae3c76d0450b0257a9e89aa44be80" }
    ]
  }
}
```

- [ ] **Step 2: Write RED updater tests**

Use `node:test`, a temporary output directory, and an injected `fetchImpl`.
Prove:

- every vendored source is fetched from the commit-specific raw GitHub URL;
- bytes are rejected before writing when size or SHA differs;
- versioned official resource index, Liqi, and config bytes are checked but the
  12 MB resource index, 286 KB official schema, and raw config are not vendored;
- the generated `endpoints.json` contains only project-owned CN policy:
  `loginPageOrigins`, `staticAssetOrigins`, `gatewayDiscoveryOrigins`, and
  `lobbyWebSocketOrigins`, and `recordDataPrefixes`; tracker, payment, chat,
  contest, advertising, analytics,
  customer-service, and arbitrary config URLs are absent;
- generated manifest is byte-identical across two runs;
- `--check` regenerates into a temporary sibling and fails if committed output
  differs, without modifying the working tree;
- default generation and `--check` never fetch mutable `version.json`;
- `--check-current` alone fetches the 85-byte current-version endpoint and
  returns a fixed drift code when it no longer points at the pinned client;
- a failed run leaves no partial output;
- unexpected keys in `source-lock.json` fail closed;
- generated RPC map and official Liqi schema are parseable; required route/type
  ownership is deliberately deferred to the single Task 7 compatibility table;
- raw URLs and upstream response text never enter thrown messages.
- `git check-attr text` reports `unset` for every file under
  `coach/vendor/mahjong-soul-protocol/**`, so `core.autocrlf` cannot rewrite
  source-locked or generated bytes.

Run:

```powershell
node --test scripts/update-mahjong-soul-protocol.test.mjs
```

Expected RED: updater module is missing.

- [ ] **Step 3: Implement the deterministic updater**

The CLI must:

1. parse the source lock with an explicit key allowlist;
2. fetch all reproducible generation sources (excluding
   `currentVersionSnapshot`) with HTTPS, `redirect: "error"`, response-size
   limits, and an injected fetch for tests;
3. verify exact byte size and SHA-256 before any write;
4. parse the versioned resource index and require that its Liqi prefix produces
   the locked Liqi URL; parse the versioned config and emit the strict endpoint
   policy above, accepting only the exact game origin, route-2 through route-6
   gateway origins, and the exact record-data HTTPS prefix;
5. parse official Liqi JSON and vendored RPC map without maintaining a required
   route/type list in the updater; Task 7's compatibility module owns that list;
6. write to a unique sibling staging directory;
7. atomically replace only the exact vendor target after all checks pass;
8. emit a strict generated manifest containing identities and asset hashes,
   not downloaded payloads or response prose;
9. in `--check` mode, build the same output in a temporary sibling, compare the
   exact expected file set and bytes with the checked-in directory, then remove
   the temporary output without mutating the repository;
10. in `--check-current` mode only, fetch the mutable current-version document
    with redirect rejection and an 85-byte limit, validate it against the
    snapshot, and never write files.

The production script may write generated vendor assets because this is a
deterministic bulk vendoring operation; the script itself must be created with
`apply_patch`.

Create root `.gitattributes` with the exact scoped rule:

```gitattributes
/coach/vendor/mahjong-soul-protocol/** -text
```

This config file is the TDD exception needed to preserve byte identity. Do not
change global text handling or any non-vendor path. After generation, run
`git check-attr text -- coach/vendor/mahjong-soul-protocol/**` and require every
reported value to be `unset`; then verify the raw four hashes again after
staging.

The generated endpoint policy is byte-stable and exactly:

```json
{
  "policyVersion": "mahjong-soul-cn-endpoints/v1",
  "loginPageOrigins": ["https://game.maj-soul.com"],
  "staticAssetOrigins": ["https://game.maj-soul.com"],
  "gatewayDiscoveryOrigins": [
    "https://route-2.maj-soul.com",
    "https://route-3.maj-soul.com:8443",
    "https://route-4.maj-soul.com",
    "https://route-5.maj-soul.com",
    "https://route-6.maj-soul.com"
  ],
  "lobbyWebSocketOrigins": [
    "wss://route-2.maj-soul.com",
    "wss://route-3.maj-soul.com:8443",
    "wss://route-4.maj-soul.com",
    "wss://route-5.maj-soul.com",
    "wss://route-6.maj-soul.com"
  ],
  "recordDataPrefixes": [
    "https://record-old.maj-soul.com:9443/majsoul/game_record"
  ]
}
```

The generator extracts only these named fields from the verified config and
requires the exact expected values. It does not copy unknown config fields or
derive trust from tracker, payment, chat, contest, customer-service, or SDK
URLs.
M5-B may map an HTTPS discovery origin to `wss` only when the resulting origin
is exactly in `lobbyWebSocketOrigins`; a discovery response can never add a new
authority or port. CAPTCHA SDK URLs remain deliberately untrusted in M5-A. M5-B
must first capture evidence from the official isolated login flow and amend the
pinned policy explicitly if those ancillary resources are required; it must not
fall back to a broad host or CSP allowlist.

- [ ] **Step 4: Generate and independently verify the bundle**

```powershell
node scripts/update-mahjong-soul-protocol.mjs
node --test scripts/update-mahjong-soul-protocol.test.mjs
Get-FileHash -Algorithm SHA256 vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto
Get-FileHash -Algorithm SHA256 vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/rpc-map.json
```

Expected hashes match the plan header. Run the updater twice, then run
`node scripts/update-mahjong-soul-protocol.mjs --check`; the check regenerates
into a temporary sibling, compares every expected output byte, and does not
modify the working tree. Separately run
`node scripts/update-mahjong-soul-protocol.mjs --check-current`; this is the
online freshness gate and is not an input to reproducible generation.

- [ ] **Step 5: Add updater to the normal test gate**

Add:

```json
"test:mahjong-soul-protocol-updater": "node --test scripts/update-mahjong-soul-protocol.test.mjs",
"test": "npm run build && vitest run && npm run test:mahjong-soul-protocol-updater"
```

- [ ] **Step 6: Commit**

```powershell
git add -- ../.gitattributes package.json scripts/update-mahjong-soul-protocol.mjs scripts/update-mahjong-soul-protocol.test.mjs vendor/mahjong-soul-protocol/source-lock.json vendor/mahjong-soul-protocol/manifest.json vendor/mahjong-soul-protocol/endpoints.json vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/rpc-map.json vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/LICENSE.txt vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/NOTICE
git diff --cached --name-only
git diff --cached --check
git commit -m "chore: pin Mahjong Soul CN protocol bundle"
```

### Task 4: Validate the protocol bundle at the runtime boundary

**Files:**

- Create: `coach/packages/mahjong-soul-source/src/protocol-manifest.ts`
- Create: `coach/packages/mahjong-soul-source/src/protocol-bundle.ts`
- Create: `coach/packages/mahjong-soul-source/tests/protocol-bundle.test.ts`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`

- [ ] **Step 1: Write RED bundle tests**

Copy the generated bundle into a temporary directory for mutation tests. Cover:

- exact bundle loads and returns frozen bytes/text plus parsed manifest;
- wrong/missing/extra manifest keys fail with
  `mahjong_soul_login_protocol_unsupported`;
- modified proto, RPC map, license, or notice fails with the same fixed code;
- wrong official client, official Liqi hash, region, adapter version, commit,
  source URL, asset size, or asset hash fails;
- missing/tampered endpoint policy, an unapproved endpoint category, or a
  tracker/payment origin in the endpoint policy fails;
- path traversal and symlinked assets fail;
- proto and RPC-map parse failures fail; runtime does not independently walk a
  second required-message graph;
- exceptions never contain a mutated filename payload, file contents, local
  absolute path, or Zod prose.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run packages/mahjong-soul-source/tests/protocol-bundle.test.ts
```

Expected: exports are missing.

- [ ] **Step 3: Implement manifest and bundle validation**

Define a strict schema with these literals:

```ts
export const MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION =
  "mahjong-soul-cn-protocol/v1" as const;
export const MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION = "0.1.0" as const;
export const MAHJONG_SOUL_CN_CLIENT_VERSION = "0.11.252.w" as const;
```

The generated manifest must name the four upstream assets plus the generated
`endpoints.json`, each with exact relative paths, sizes, and lowercase SHA-256.
`loadMahjongSoulProtocolBundle(rootDir)` must resolve and
realpath every target, prove it stays inside `rootDir`, reject symbolic links,
read with explicit maximum sizes, hash bytes, parse the RPC map, and parse the
proto with `protobufjs.parse` before returning:

```ts
export interface MahjongSoulProtocolBundle {
  manifest: MahjongSoulProtocolManifest;
  protoText: string;
  rpcMap: Readonly<Record<string, { req: string; resp: string }>>;
  endpoints: Readonly<{
    loginPageOrigins: readonly ["https://game.maj-soul.com"];
    staticAssetOrigins: readonly ["https://game.maj-soul.com"];
    gatewayDiscoveryOrigins: readonly string[];
    lobbyWebSocketOrigins: readonly string[];
    recordDataPrefixes: readonly string[];
  }>;
}
```

Return deep-frozen project-owned data. The endpoint policy is generated from
the pinned config but has a project-owned strict schema and contains no generic
"other endpoints" bag. Runtime validates manifest literals, exact asset hashes,
endpoint-policy literals, RPC-map parseability, and proto parseability only; the
generator in Task 7 is the sole owner of required-surface compatibility. Map all
failures to the fixed source error without including caught messages.

- [ ] **Step 4: Run GREEN**

```powershell
npx vitest run packages/mahjong-soul-source/tests/protocol-bundle.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add -- packages/mahjong-soul-source/src/protocol-manifest.ts packages/mahjong-soul-source/src/protocol-bundle.ts packages/mahjong-soul-source/src/index.ts packages/mahjong-soul-source/tests/protocol-bundle.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: verify Mahjong Soul protocol bundles"
```

### Task 5: Implement the strict Liqi wire codec

**Files:**

- Create: `coach/packages/mahjong-soul-source/src/liqi-codec.ts`
- Create: `coach/packages/mahjong-soul-source/tests/liqi-codec.test.ts`
- Create: `coach/packages/mahjong-soul-source/tests/fixtures/minimal-liqi.proto`
- Create: `coach/packages/mahjong-soul-source/tests/fixtures/minimal-rpc-map.json`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`

- [ ] **Step 1: Write RED frame tests**

Use a minimal protobuf fixture defining `Wrapper`, `ReqLogin`,
`ReqOauth2Login`, their exact routes, `ResLogin`, `ReqGameRecord`,
`ResGameRecord`, one response field with a `uint64` fixture value, one `bytes`
field, one known notification, and a fake `ReqDeleteAccount`/route that exists
only to prove the package safety cap cannot be widened. Tests must cover:

- request frame type `2`, little-endian uint16 request ID, wrapper method name,
  and validation against the exact request type without returning its payload;
- request IDs must be integers in `0..65535`; negative, fractional, or larger
  IDs fail before state changes;
- response frame type `3` correlated to the request and decoded with its exact
  response type;
- notify frame type `1` with no request ID;
- response wrapper name must be empty;
- empty, oversized, truncated, type `0/4`, duplicate pending ID, response with
  no pending request, duplicate response, unknown route, unknown message type,
  and malformed protobuf all fail with the fixed protocol error;
- `encodeRequest` rejects payload type errors and unknown payload keys before
  encoding, and rejects every method outside both the caller-requested subset
  and the package-owned safe direct-call capability set;
- attempts to request account deletion, payment, shop, purchase, or any other
  RPC outside the package-owned safe set fail even if the caller includes them;
- observed `login` and `oauth2Login` requests are correlated but
  always return metadata-only `request_observed`; passwords, email addresses,
  access tokens, and every other request field are discarded; the pending entry
  retains only the method, response type, and numeric `type` authentication
  discriminator needed to resume the captured session;
- the protobuf-3 default/omitted login authentication type is normalized to
  zero; non-integer, negative, or greater-than-uint32 values fail closed before
  the response can be accepted;
- non-surfaced observed requests are tracked as ignored so their responses are
  consumed without being surfaced;
- pending map has an explicit maximum and is cleared on `close()`;
- after `close()` or any fixed protocol error poisons the codec, every operation
  fails with the fixed code and cannot reuse correlation state;
- 64-bit integers remain decimal strings and bytes remain `Uint8Array`;
- errors never include method payloads, token values, protobuf prose, or raw
  frame bytes.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run packages/mahjong-soul-source/tests/liqi-codec.test.ts
```

- [ ] **Step 3: Implement the codec**

Follow the verified Liqi wire layout:

```text
notify:   [0x01][Wrapper]
request:  [0x02][request_id u16 little-endian][Wrapper]
response: [0x03][request_id u16 little-endian][Wrapper with empty name]
```

Use one codec instance per WebSocket flow. Store pending entries as:

```ts
interface PendingRequest {
  method: string;
  responseType: protobuf.Type;
  surfaced: boolean;
  origin: "observed_login" | "observed_ignored" | "direct_call";
  loginMethod: "login" | "oauth2Login" | null;
  loginAuthType: number | null;
}
```

Decode `Wrapper` first. Resolve request/response route types from the verified
RPC map. A notify wrapper name is a protobuf message FQN, not an RPC route:
resolve it with `root.lookupType(wrapper.name)`. A known but unallowlisted notify
returns `ignored`; an unknown notify type fails with the fixed protocol code.
For decoded payloads use:

```ts
type.toObject(message, {
  defaults: true,
  arrays: true,
  objects: true,
  longs: String,
  enums: Number,
  bytes: Uint8Array,
});
```

The public result is a strict union of `request_observed`, `response`, `notify`,
and `ignored`. `request_observed` contains only method and request ID. Only
allowlisted server `response`/`notify` variants contain decoded payload. No
variant contains the original frame or a decoded client request body. Enforce a
4 MiB frame maximum and 4096 pending request maximum.

An observed-login `response` also carries a project-owned
`requestContext: { source: "observed_login"; loginMethod:
"login" | "oauth2Login"; authType: number }`. These are the only
client-request-derived fields allowed to survive. `authType` must be a
uint32 read from field `type`; no username, password, email, token, device,
random key, or request object may survive correlation.

Expose this exact stateful boundary so login capture can observe the official
page's outgoing request while later source code can originate its own requests:

```ts
export interface LiqiCodec {
  decodeClientFrame(frame: Uint8Array): DecodedLiqiMessage;
  decodeServerFrame(frame: Uint8Array): DecodedLiqiMessage;
  encodeRequest(input: {
    requestId: number;
    method: string;
    payload: Readonly<Record<string, unknown>>;
  }): Uint8Array;
  close(): void;
}

export function createLiqiCodec(
  bundle: MahjongSoulProtocolBundle,
  policy: {
    readonly directCallMethods: readonly string[];
    readonly surfacedNotifications: readonly string[];
  },
): LiqiCodec;
```

Freeze package-owned capability constants. The safe direct-call set is exactly
`.lq.Lobby.oauth2Check`, `.lq.Lobby.oauth2Login`, `.lq.Lobby.fetchInfo`,
`.lq.Lobby.fetchGameRecordListV2`, `.lq.Lobby.fetchNextGameRecordList`,
`.lq.Lobby.fetchGameRecord`, `.lq.Lobby.loginBeat`, and `.lq.Lobby.logout`.
The M5-A surfaced-notification set is empty. Caller arrays may only narrow these
sets; initialization fails if either array contains anything else. The observed
browser request set remains separately fixed to `.lq.Lobby.login` and
`.lq.Lobby.oauth2Login`; caller policy cannot widen it.

Both `decodeClientFrame` and `encodeRequest` register the pending response. A
duplicate ID fails closed. `decodeClientFrame` may decode a request internally
to prove protobuf validity, but it must drop the object before returning.
Only the package-owned frozen login method set can surface responses for
observed browser requests; caller policy cannot add password-bearing browser
methods. Direct calls surface only responses to frames created by
`encodeRequest`.
`decodeServerFrame` is the only operation that may consume a response entry.
Frames are copied at entry and the caller's buffers and payload objects are
never mutated.

- [ ] **Step 4: Mutation and GREEN verification**

Temporarily swap request ID byte order in the implementation and show the
little-endian test fails; restore it and run:

```powershell
npx vitest run packages/mahjong-soul-source/tests/liqi-codec.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add -- packages/mahjong-soul-source/src/liqi-codec.ts packages/mahjong-soul-source/src/index.ts packages/mahjong-soul-source/tests/liqi-codec.test.ts packages/mahjong-soul-source/tests/fixtures/minimal-liqi.proto packages/mahjong-soul-source/tests/fixtures/minimal-rpc-map.json
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: decode Mahjong Soul Liqi frames"
```

### Task 6: Project a login response into a redacting credential

**Files:**

- Create: `coach/packages/mahjong-soul-source/src/login-result.ts`
- Create: `coach/packages/mahjong-soul-source/tests/login-result.test.ts`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`

- [ ] **Step 1: Write RED login projection tests**

Use decoded payloads, not raw frames. Prove:

- successful `login` and `oauth2Login` `ResLogin` responses each return region
  `cn`, exact login method, uint32 authentication type, positive account ID,
  bounded display name, `SecretString`, and no other account fields;
- token can be explicitly revealed only by privileged code;
- JSON/string/inspect of the result never contains the fake token;
- a nonzero or malformed error object, zero/missing/out-of-uint32 account ID,
  missing/short/oversized
  access token, missing/oversized nickname, wrong method, wrong message kind,
  wrong/out-of-uint32 auth type, wrong request context, or malformed
  decoded payload fails with the fixed login protocol error;
- hostile server `error.message`, `json_param`, `args`, nickname, and unknown
  fields cannot enter the thrown message;
- input payload is not mutated and the returned value is frozen.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run packages/mahjong-soul-source/tests/login-result.test.ts
```

- [ ] **Step 3: Implement a sanitizing projection**

Implement:

```ts
export interface CapturedMahjongSoulCredential {
  readonly region: "cn";
  readonly loginMethod: "login" | "oauth2Login";
  readonly authType: number;
  readonly accountId: number;
  readonly displayName: string;
  readonly accessToken: SecretString;
}

export function extractCapturedLoginCredential(
  message: DecodedLiqiMessage,
): CapturedMahjongSoulCredential;
```

Require `message.kind === "response"`, observed-login request context, and
method in the exact frozen set `.lq.Lobby.login`, `.lq.Lobby.oauth2Login`. Read
only the already-sanitized `requestContext.loginMethod`,
`requestContext.authType`, `error.code`, `account_id`,
`account.nickname`, and `access_token`; discard every other field. Do not pass
the input object through a permissive schema and do not copy it into output.
An absent protobuf `error` field is success. Because the approved codec uses
`toObject({ defaults: true })`, protobuf absence is represented as `null`; treat
only `undefined`/missing and `null` as the same absent sentinel. A strict object
with integer code `0` is also success; any other value, nonzero code, or
non-integer code is the fixed protocol error.
Preserving `loginMethod` is mandatory: M5-B must select and prove the correct
session-resume adapter for each credential kind instead of assuming tokens from
the two RPCs are interchangeable.

- [ ] **Step 4: Run GREEN and a leak scan**

```powershell
npx vitest run packages/mahjong-soul-source/tests/login-result.test.ts
npm run typecheck
rg -n "console\.(log|error)|JSON\.stringify\(.*payload|access_token" packages/mahjong-soul-source/src
```

Expected: only the deliberate field read remains; no logging or serialization
of the decoded payload.

- [ ] **Step 5: Commit**

```powershell
git add -- packages/mahjong-soul-source/src/login-result.ts packages/mahjong-soul-source/src/index.ts packages/mahjong-soul-source/tests/login-result.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: capture redacted Mahjong Soul sessions"
```

### Task 7: Verify the required official protocol surface

**Files:**

- Create: `coach/scripts/mahjong-soul-protocol-compatibility.mjs`
- Create: `coach/scripts/mahjong-soul-protocol-compatibility.test.mjs`
- Create: `coach/packages/mahjong-soul-source/tests/official-bundle-integration.test.ts`
- Create: `coach/packages/mahjong-soul-source/tests/fixtures/official-bundle-frames.json`
- Modify: `coach/packages/mahjong-soul-source/src/protocol-bundle.ts`
- Modify: `coach/packages/mahjong-soul-source/src/protocol-manifest.ts`
- Modify: `coach/packages/mahjong-soul-source/tests/protocol-bundle.test.ts`
- Modify: `coach/scripts/update-mahjong-soul-protocol.mjs`
- Modify: `coach/scripts/update-mahjong-soul-protocol.test.mjs`
- Modify: `coach/vendor/mahjong-soul-protocol/manifest.json`
- Modify: `coach/package.json`

- [ ] **Step 1: Write RED compatibility tests**

The plain-Node generator module loads a small protobufjs official-schema
fixture and vendored-proto fixture. Keeping this comparison in `.mjs` lets the
plain Node updater reuse the same implementation without importing unbuilt or
stale TypeScript output. Require exact agreement for:

- `Wrapper`;
- the request/response types of every allowlisted RPC;
- `.lq.Lobby.fetchGameRecordListV2` and
  `.lq.Lobby.fetchNextGameRecordList`, including `ReqGameRecordListV2`,
  `ResGameRecordListV2`, `ReqNextGameRecordList`, `ResNextGameRecordList`,
  `RecordListEntry`, and `RecordPlayerResult`;
- `GameDetailRecords`, its numeric `version` field, and every `GameAction`
  wrapper field used to locate and decode an action payload;
- `RecordNewRound`, `RecordDealTile`, `RecordDiscardTile`,
  `RecordChiPengGang`, `RecordAnGangAddGang`, `RecordHule`, `RecordNoTile`, and
  `RecordLiuJu`;
- field number, scalar/message type, repeated/singular status, and referenced
  message identity.

For every required route, compare three independent sources: the official
protobufjs service descriptor, the vendored proto service descriptor, and the
actual vendored `rpc-map.json` entry used by the runtime codec. Negative tests
independently alter a field number, type, repetition, official route request or
response type, vendored-proto route request or response type, RPC-map request or
response type, or remove a required record message. Extra unrelated official
messages remain allowed. All mismatches return a fixed protocol error with no
type name taken from hostile input.

Also write two separate RED boundaries before implementation:

- updater tests require the generated manifest to contain the exact
  compatibility report and reject a tampered report/hash association;
- runtime bundle tests require that exact report, reject missing/tampered report
  fields, and prove report hashes equal the already-verified official-schema and
  vendored-proto asset hashes.

- [ ] **Step 2: Run RED**

```powershell
node --test scripts/mahjong-soul-protocol-compatibility.test.mjs
node --test scripts/update-mahjong-soul-protocol.test.mjs
npx vitest run packages/mahjong-soul-source/tests/protocol-bundle.test.ts
```

Expected RED: comparator is absent, updater does not emit the report, and the
runtime schema does not bind it. All three failures must be observed before
GREEN.

- [ ] **Step 3: Implement graph comparison**

In `scripts/mahjong-soul-protocol-compatibility.mjs`, build `protobuf.Root`
objects from the official protobufjs JSON and vendored proto, and strictly parse
the vendored RPC map. This generator is the sole owner of the project-owned
required route/type graph; walk that graph and compare canonical field
descriptors and all three route mappings.
Export `verifyMahjongSoulProtocolCompatibility(input)`; it returns a frozen
compatibility report with project-owned identifiers only:

```js
{
  status: "compatible",
  clientVersion: "0.11.252.w",
  officialSchemaSha256: "f2955c3d10cf2d42bee9309f672c062540941ea0cffe1bd62e3f436c7afc404c",
  vendorProtoSha256: "ccfa3f7b39c205e9d4690f61bc1b333df415edfdf8d1e325cd5fc8a5ac30cbb7",
  vendorRpcMapSha256: "15f44eecb654e3b5cfca7682cf00f3a0a16ae3c76d0450b0257a9e89aa44be80",
  requiredSurfaceVersion: "mahjong-soul-required-surface/v1",
}
```

Call this exact function during bundle generation and store the report in the
generated manifest. Extend the strict TypeScript manifest schema to require the
six report fields and their exact literals/hashes. Runtime validates the exact
report literals, binds all three report hashes to the manifest's
already-verified official-schema, proto, and RPC-map hashes, and checks
proto/RPC-map parseability; it does not walk required
types, download the official schema, or run a second compatibility algorithm.
Do not export the generator module from the privileged package.

- [ ] **Step 4: Add a real-bundle synthetic-frame integration test**

Check in a strict JSON fixture containing only fixed lowercase hex frames and
fake values (`account_id: 123456789`, nickname `ProtocolFixture`, token
`fixture-token-never-real`). The fixture must be generated once from the pinned
official JSON by a test-only script or independently reviewed helper, then
committed; the test must not regenerate expected bytes with the codec under
test. Load the real vendored bundle and cover:

- observed `.lq.Lobby.login` and `.lq.Lobby.oauth2Login` client frames,
  correlated fake `ResLogin` server frames, and credential projection including
  distinct `loginMethod`;
- direct V2 list request/iterator response followed by
  `.lq.Lobby.fetchNextGameRecordList` and `entries` decoding;
- `.lq.Lobby.fetchGameRecord` responses for both inline `data` bytes and
  `data_url` string envelopes;
- a nonzero hostile login error that produces only the fixed project code.

No fixture contains a real account, token, Cookie, endpoint response, or network
capture, and the test performs no network access.

- [ ] **Step 5: Add the compatibility gate to normal tests and run GREEN**

Add exact root scripts (and keep root `protobufjs: 8.7.2` pinned directly):

```json
"test:mahjong-soul-protocol-compatibility": "node --test scripts/mahjong-soul-protocol-compatibility.test.mjs",
"test": "npm run build && vitest run && npm run test:mahjong-soul-protocol-updater && npm run test:mahjong-soul-protocol-compatibility"
```

```powershell
node --test scripts/mahjong-soul-protocol-compatibility.test.mjs
node --test scripts/update-mahjong-soul-protocol.test.mjs
node scripts/update-mahjong-soul-protocol.mjs
node scripts/update-mahjong-soul-protocol.mjs --check
node scripts/update-mahjong-soul-protocol.mjs --check-current
npx vitest run packages/mahjong-soul-source/tests/protocol-bundle.test.ts packages/mahjong-soul-source/tests/official-bundle-integration.test.ts
npm test
npm run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add -- package.json scripts/mahjong-soul-protocol-compatibility.mjs scripts/mahjong-soul-protocol-compatibility.test.mjs scripts/update-mahjong-soul-protocol.mjs scripts/update-mahjong-soul-protocol.test.mjs packages/mahjong-soul-source/src/protocol-bundle.ts packages/mahjong-soul-source/src/protocol-manifest.ts packages/mahjong-soul-source/tests/protocol-bundle.test.ts packages/mahjong-soul-source/tests/official-bundle-integration.test.ts packages/mahjong-soul-source/tests/fixtures/official-bundle-frames.json vendor/mahjong-soul-protocol/manifest.json
git diff --cached --name-only
git diff --cached --check
git commit -m "test: bind the Mahjong Soul protocol surface"
```

### Task 8: Export, document, and fully verify M5-A

**Files:**

- Modify: `coach/smoke/package-import-smoke.mjs`
- Modify: `coach/README.md`
- Modify: `docs/superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md`
- Create: `docs/superpowers/handoffs/2026-08-11-mahjong-soul-protocol-contracts-handoff.md`

- [ ] **Step 1: Add emitted-package characterization assertions**

Import `@riichi-coach/mahjong-soul-source` and assert:

```js
assert.equal(
  contracts.MahjongSoulRegionSchema.parse("cn"),
  "cn",
);
assert.equal(
  source.MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION,
  "mahjong-soul-cn-protocol/v1",
);
assert.equal(typeof source.loadMahjongSoulProtocolBundle, "function");
assert.equal(typeof source.createLiqiCodec, "function");
assert.equal(typeof source.extractCapturedLoginCredential, "function");
```

Run `npm run test:package-import`. These symbols were exported by their owning
tasks, so this is a GREEN acceptance characterization, not a fabricated RED.

- [ ] **Step 2: Verify explicit exports and build order**

Confirm that prior owning tasks did not export updater internals, raw fetch
helpers, fixture paths, or a default token value. Verify emitted JavaScript
imports cleanly without requiring the vendor bundle until
`loadMahjongSoulProtocolBundle` is explicitly called; this step does not make
new source-package edits.

- [ ] **Step 3: Update documentation accurately**

README must say:

- M5-A is a privileged protocol/contract foundation only;
- it performs no real login and stores no real token;
- existing coach CLI remains fixture-only;
- M5-B is the next slice: Electron login window and encrypted vault;
- protocol source commit, license, official client version, and hashes;
- generated CN endpoint policy and the separation between reproducible
  `--check` and online `--check-current`;
- exact update and verification commands.

Roadmap marks only M5-A complete, not M5 or H1.

- [ ] **Step 4: Run the complete verification matrix**

From `coach`:

```powershell
npm test
npm run typecheck
npm run test:package-import
npm audit --omit=dev
node scripts/update-mahjong-soul-protocol.mjs
node scripts/update-mahjong-soul-protocol.mjs --check
node scripts/update-mahjong-soul-protocol.mjs --check-current
```

From repository root:

```powershell
node --test tests/*.mjs
```

Also run the existing Go sidecar gates with the configured Go runtime, because
workspace package changes must not disturb the fact engine:

```powershell
$go = 'C:\Users\Roland\AppData\Local\CodexTools\go1.24.13\go\bin\go.exe'
Push-Location coach/tools/mahjong-facts
& $go test ./... -count=1
& $go vet ./...
Pop-Location
```

Expected: all commands pass; running the updater makes no diff; no real token
or account data exists anywhere in the repository.

- [ ] **Step 5: Perform the completion audit**

Prove each M5-A requirement with direct evidence:

- safe IPC DTOs reject secret-shaped fields;
- privileged secrets redact string/JSON/inspect;
- protocol assets match locked size/hash/license/commit;
- official schema, vendored proto, and runtime RPC-map hashes plus their
  three-way required route/type surface are bound;
- wire request/response correlation is exact and bounded;
- login projection emits only six allowlisted values, including the exact
  `loginMethod` discriminator;
- endpoint policy contains only login/static/gateway/record-data capabilities
  and excludes tracker, payment, chat, advertising, and arbitrary config URLs;
- unknown protocol data fails with fixed project errors;
- no network transport, Electron code, login form, or production fallback was
  introduced early;
- all pre-existing coach and East 1 turn 6/7 tests still pass.

- [ ] **Step 6: Write and commit the handoff**

Record actual test counts and commit hashes, not planned values. Protect the
user's unrelated dirty files.

```powershell
git add -- smoke/package-import-smoke.mjs README.md ../docs/superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md ../docs/superpowers/handoffs/2026-08-11-mahjong-soul-protocol-contracts-handoff.md
git diff --cached --name-only
git diff --cached --check
git commit -m "docs: hand off Mahjong Soul protocol contracts"
```

---

## Plan self-review checklist

- Every approved M5-A responsibility maps to a task.
- No task claims Electron login, persistence, catalog sync, record download, or
  canonical mapping before its later slice.
- Protocol update is source-locked, hash-verified, atomic, and reproducible.
- Official current schema is used as compatibility evidence; Apache-2.0 Akagi
  assets provide redistributable proto/RPC inputs with LICENSE and NOTICE.
- Secret-bearing decoded payloads remain inside the privileged package and are
  projected immediately into a redacting wrapper.
- Renderer-safe contracts structurally reject secret/account/raw-record fields.
- Runtime makes no schema download and never guesses on protocol drift.
- All code-changing steps have a preceding RED and a focused GREEN command.
- Every commit stages an explicit path list and checks the cached diff.
- The protected existing changes in `.gitignore`,
  `docs/superpowers/plans/2026-08-08-hand-structure-furiten.md`, and `overlay/**`
  are never staged or modified.
