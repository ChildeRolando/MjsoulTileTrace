/**
 * Explicit diagnostic codes for the Tenhou mjloggm → canonical importer.
 *
 * Every failure mode of {@link mapTenhouRecord} resolves to exactly one code.
 * The mapper never guesses: unknown or inconsistent raw semantics fail closed
 * (M6-A3 §12: strict, deterministic, fail closed, explicit diagnostic codes).
 */
export type TenhouSourceErrorCode =
  // Raw bytes are not a well-formed flat mjloggm document
  // (bad root element, non self-closing tags, malformed attributes, truncated).
  | "tenhou_record_invalid_xml"
  // mjloggm ver attribute is present but is not "2.3".
  | "tenhou_record_unsupported_version"
  // Structurally unmappable game shape: GO missing, three-player (sanma),
  // TAIKYOKU oya != 0, or an INIT with malformed player data.
  | "tenhou_record_unsupported_game"
  // A BYE tag is present (player disconnect). Canonical replay cannot prove
  // turn integrity for disconnected games, so they are excluded up front.
  | "tenhou_record_disconnect_unsupported"
  // A reconnect UN tag (a second UN, or a UN carrying only a single nN
  // attribute) is present. Reconnects may hide events, so they fail closed.
  | "tenhou_record_reconnect_unsupported"
  // A known tag appears in a position/state the mapper does not support
  // (e.g. SHUFFLE after the first INIT).
  | "tenhou_record_unsupported_event"
  // Tile code outside 0..135 or otherwise undecodable.
  | "tenhou_mapper_invalid_tile"
  // Event-order / state-machine inconsistency in an otherwise well-formed
  // document: a call without an unconsumed matching discard, kakan without a
  // prior pon, REACH step 2 without step 1, a non-dealer first draw, a draw
  // count that exceeds the 70-tile wall, an exhaustive round that did not end
  // at exactly 70 total draws, a score-chain break, or a final owari that does
  // not match the mapped terminal scores.
  | "tenhou_mapper_invalid_event"
  // Defensive: the mapped event list violated the canonical stream schema.
  // Real inputs should never reach this; it guards against mapper defects.
  | "tenhou_mapper_schema_invalid";

export class TenhouSourceError extends Error {
  readonly code: TenhouSourceErrorCode;

  constructor(code: TenhouSourceErrorCode) {
    super(code);
    this.name = "TenhouSourceError";
    this.code = code;
    Object.freeze(this);
  }
}
