import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulCapturedRecordIdentity } from "./record-capture.js";

const IDENTITY_MISMATCH = "mahjong_soul_record_identity_mismatch" as const;

// Resolves the analysis perspective of a paipu share URL by an IDENTITY JOIN:
//
//   URL `_a<perspectiveAccountId>`  ↔  fetchGameRecord head accounts[]
//                                 └-> exactly one account -> its seat
//
// The `_a<number>` suffix is a perspective ACCOUNT ID, never a seat; the
// seat is whatever seat that account actually occupied in the captured
// record. The URL defines the perspective — no fallback to the logged-in
// account, no nickname matching, no index arithmetic, no default seat.
//
// Every violation below fails closed with the fixed
// mahjong_soul_record_identity_mismatch:
//   - the captured record id is not the URL's record id
//   - the account metadata is empty or structurally invalid
//   - the perspective account matches zero accounts
//   - the perspective account matches more than one account
//   - the matched seat is not an integer 0..3

export function resolveMahjongSoulPaipuPerspective(input: {
  readonly parsedUrl: {
    readonly recordId: string;
    readonly perspectiveAccountId: number;
  };
  readonly capturedIdentity: MahjongSoulCapturedRecordIdentity;
}): {
  readonly recordId: string;
  readonly selfActor: 0 | 1 | 2 | 3;
} {
  const mismatch = (): MahjongSoulSourceError =>
    new MahjongSoulSourceError(IDENTITY_MISMATCH);

  const parsed = input?.parsedUrl;
  const captured = input?.capturedIdentity;
  if (
    parsed === null || typeof parsed !== "object"
    || typeof parsed.recordId !== "string" || parsed.recordId.length === 0
    || typeof parsed.perspectiveAccountId !== "number"
    || !Number.isInteger(parsed.perspectiveAccountId)
    || parsed.perspectiveAccountId < 1
    || parsed.perspectiveAccountId > 4_294_967_295
    || captured === null || typeof captured !== "object"
    || typeof captured.recordId !== "string" || captured.recordId.length === 0
    || !Array.isArray(captured.accounts) || captured.accounts.length === 0
  ) {
    throw mismatch();
  }

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

  const matches = captured.accounts.filter(
    (account) => account.accountId === parsed.perspectiveAccountId,
  );
  if (matches.length !== 1) throw mismatch();

  return Object.freeze({
    recordId: parsed.recordId,
    selfActor: matches[0]!.seat as 0 | 1 | 2 | 3,
  });
}
