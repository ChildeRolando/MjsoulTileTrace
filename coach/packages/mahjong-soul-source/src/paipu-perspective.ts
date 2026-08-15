import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulCapturedRecordIdentity } from "./record-capture.js";

const IDENTITY_MISMATCH = "mahjong_soul_record_identity_mismatch" as const;

// The share URL's `_a<token>` is the sharing player's account id behind a
// reversible obfuscation. The transform is ecosystem-pinned (tensoul's
// decodeAccountID, Avenshy's share-link perspective converter implements
// the exact inverse, and 2026-active projects carry the same decoder) and
// was cross-verified LIVE on 2026-08-15 against three real captured
// samples, including one game shared from two different perspectives:
//
//   token -> decode -> account id -> exactly one head.accounts match -> seat
//
// succeeded 3/3 with exact single matches, and encode(decode(token)) ===
// token for every sample. The constants are the community transform, not a
// server-documented field; if a future sample ever fails the decode+join,
// do NOT refit constants — investigate the current Unity client's share
// URL generation instead.

const TOKEN_SHIFT = 1_358_437;
const TOKEN_XOR = 86_216_345;
const TOKEN_OFFSET = 1_117_113;
const TOKEN_SLOPE = 7;

function mismatch(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(IDENTITY_MISMATCH);
}

/**
 * Decodes a share URL `_a` token into the sharing player's account id.
 * Fails closed with mahjong_soul_record_identity_mismatch when the token is
 * not a positive uint32-shaped integer or does not decode to a positive
 * integer account id.
 */
export function decodeMahjongSoulPerspectiveToken(token: number): number {
  if (
    typeof token !== "number"
    || !Number.isInteger(token)
    || token < 1
    || token > 4_294_967_295
  ) {
    throw mismatch();
  }
  // JS ^ is 32-bit signed; both operands stay well inside int32 for every
  // token the transform can emit (observed tokens are < 2^31). A token that
  // would overflow int32 cannot have been produced by the encoding and
  // decodes to garbage — rejected by the divisibility/positivity checks.
  const product = (((token - TOKEN_SHIFT) ^ TOKEN_XOR) - TOKEN_OFFSET);
  if (product <= 0 || product % TOKEN_SLOPE !== 0) throw mismatch();
  const accountId = product / TOKEN_SLOPE;
  if (!Number.isInteger(accountId) || accountId < 1 || accountId > 4_294_967_295) {
    throw mismatch();
  }
  return accountId;
}

/**
 * Encodes an account id back into its share URL `_a` token — the exact
 * inverse of decodeMahjongSoulPerspectiveToken. Kept for tests, tooling and
 * perspective conversion; production imports only decode.
 */
export function encodeMahjongSoulPerspectiveAccountId(accountId: number): number {
  if (
    typeof accountId !== "number"
    || !Number.isInteger(accountId)
    || accountId < 1
    || accountId > 4_294_967_295
  ) {
    throw mismatch();
  }
  // Stay inside int32 for the XOR, exactly like the observed encoding.
  const scaled = TOKEN_SLOPE * accountId + TOKEN_OFFSET;
  if (scaled > 2_147_483_647) throw mismatch();
  return (scaled ^ TOKEN_XOR) + TOKEN_SHIFT;
}

// Resolves the analysis perspective of a paipu share URL by:
//
//   URL `_a<perspectiveToken>`
//     -> decodeMahjongSoulPerspectiveToken (reversible obfuscation)
//     -> account id
//     -> IDENTITY JOIN against the SAME-response captured record accounts
//     -> exactly one account -> its seat
//
// The URL defines the perspective — no fallback to the logged-in account,
// no nickname matching, no index arithmetic, no default seat.
//
// Every violation below fails closed with the fixed
// mahjong_soul_record_identity_mismatch:
//   - the token does not decode to a valid account id
//   - the captured record id is not the URL's record id
//   - the account metadata is empty or structurally invalid
//   - the decoded account matches zero accounts
//   - the decoded account matches more than one account
//   - the matched seat is not an integer 0..3

export function resolveMahjongSoulPaipuPerspective(input: {
  readonly parsedUrl: {
    readonly recordId: string;
    readonly perspectiveToken: number;
  };
  readonly capturedIdentity: MahjongSoulCapturedRecordIdentity;
}): {
  readonly recordId: string;
  readonly selfActor: 0 | 1 | 2 | 3;
} {
  const parsed = input?.parsedUrl;
  const captured = input?.capturedIdentity;
  if (
    parsed === null || typeof parsed !== "object"
    || typeof parsed.recordId !== "string" || parsed.recordId.length === 0
    || captured === null || typeof captured !== "object"
    || typeof captured.recordId !== "string" || captured.recordId.length === 0
    || !Array.isArray(captured.accounts) || captured.accounts.length === 0
  ) {
    throw mismatch();
  }

  // Layer 1: deobfuscate the share token into an account id.
  const perspectiveAccountId = decodeMahjongSoulPerspectiveToken(parsed.perspectiveToken);

  // The URL and the capture must describe the same record.
  if (captured.recordId !== parsed.recordId) throw mismatch();

  for (const account of captured.accounts) {
    if (
      account === null || typeof account !== "object"
      || typeof account.accountId !== "number"
      || !Number.isInteger(account.accountId)
      || account.accountId < 1
      || account.accountId > 4_294_967_295
      || typeof account.seat !== "number"
      || !Number.isInteger(account.seat)
      || account.seat < 0
      || account.seat > 3
    ) {
      // Invalid account metadata anywhere in the record cannot be trusted
      // for the join, regardless of whether it is the matched entry.
      throw mismatch();
    }
  }

  // Layer 2: exact identity join on the decoded account id.
  const matches = captured.accounts.filter(
    (account) => account.accountId === perspectiveAccountId,
  );
  if (matches.length !== 1) throw mismatch();

  return Object.freeze({
    recordId: parsed.recordId,
    selfActor: matches[0]!.seat as 0 | 1 | 2 | 3,
  });
}
