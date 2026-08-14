import { parse as parseProtobuf } from "protobufjs";
import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";

const CONTAINER_INVALID = "mahjong_soul_record_container_invalid" as const;

// One decoded stored action. `name` is the normalized Record* name (e.g.
// "RecordNewRound"), `data` is the decoded Record* protobuf object, and
// `sourceRecordOrdinal` is the 1-based original GameAction index so empty-result
// actions can be skipped WITHOUT compressing later ordinals.
export interface DecodedStoredAction {
  readonly sourceRecordOrdinal: number;
  readonly name: string;
  readonly data: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(CONTAINER_INVALID);
}

// Decode the INNER GameDetailRecords bytes (already through the outer transport
// unwrap) into an indexed list of stored Record* actions. Empty GameAction.result
// entries are skipped but their ordinal is preserved. Structural problems fail
// closed; semantic "what does this Record* mean" is the mapper's job, not here.
export function decodeStoredRecordActions(
  bundle: MahjongSoulProtocolBundle,
  recordBytes: Uint8Array,
): DecodedStoredAction[] {
  try {
    if (!(recordBytes instanceof Uint8Array) || recordBytes.length === 0) throw invalid();
    const root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
    const recordsType = root.lookupType("lq.GameDetailRecords");
    const decoded = recordsType.toObject(recordsType.decode(recordBytes), {
      arrays: true,
      bytes: Uint8Array,
      defaults: true,
    }) as { actions?: unknown[] };
    const actions = Array.isArray(decoded.actions) ? decoded.actions : [];
    const wrapperType = root.lookupType("lq.Wrapper");
    const result: DecodedStoredAction[] = [];
    for (let index = 0; index < actions.length; index += 1) {
      const raw = actions[index];
      if (!isRecord(raw) || !(raw.result instanceof Uint8Array)) throw invalid();
      if (raw.result.length === 0) continue;
      const wrapper = wrapperType.toObject(wrapperType.decode(raw.result), {
        defaults: true,
        bytes: Uint8Array,
      }) as { name?: unknown; data?: unknown };
      const name = wrapper.name;
      if (
        typeof name !== "string"
        || !name.startsWith(".lq.Record")
        || !(wrapper.data instanceof Uint8Array)
      ) {
        throw invalid();
      }
      const shortName = name.slice(".lq.".length);
      let type;
      try {
        type = root.lookupType(name);
      } catch {
        throw invalid();
      }
      let data: unknown;
      try {
        data = type.toObject(type.decode(wrapper.data), {
          arrays: true,
          bytes: Uint8Array,
          defaults: false,
        });
      } catch {
        throw invalid();
      }
      if (!isRecord(data)) throw invalid();
      result.push(Object.freeze({
        sourceRecordOrdinal: index + 1,
        name: shortName,
        data: Object.freeze(data) as Readonly<Record<string, unknown>>,
      }));
    }
    return result;
  } catch (error) {
    if (error instanceof MahjongSoulSourceError) throw error;
    throw invalid();
  }
}
