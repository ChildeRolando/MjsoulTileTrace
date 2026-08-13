import { createHash } from "node:crypto";

import protobuf from "protobufjs";

const FAILURE = "mahjong_soul_protocol_compatibility_failed";
const SURFACE_VERSION = "mahjong-soul-required-surface/v3";

const REQUIRED_ROUTES = Object.freeze({
  ".lq.Lobby.login": Object.freeze({ req: ".lq.ReqLogin", resp: ".lq.ResLogin" }),
  ".lq.Lobby.oauth2Check": Object.freeze({ req: ".lq.ReqOauth2Check", resp: ".lq.ResOauth2Check" }),
  ".lq.Lobby.oauth2Login": Object.freeze({ req: ".lq.ReqOauth2Login", resp: ".lq.ResLogin" }),
  ".lq.Lobby.fetchInfo": Object.freeze({ req: ".lq.ReqCommon", resp: ".lq.ResFetchInfo" }),
  ".lq.Lobby.fetchGameRecordListV2": Object.freeze({ req: ".lq.ReqGameRecordListV2", resp: ".lq.ResGameRecordListV2" }),
  ".lq.Lobby.fetchNextGameRecordList": Object.freeze({ req: ".lq.ReqNextGameRecordList", resp: ".lq.ResNextGameRecordList" }),
  ".lq.Lobby.fetchGameRecordsDetail": Object.freeze({ req: ".lq.ReqGameRecordsDetail", resp: ".lq.ResGameRecordsDetail" }),
  ".lq.Lobby.fetchGameRecord": Object.freeze({ req: ".lq.ReqGameRecord", resp: ".lq.ResGameRecord" }),
  ".lq.Lobby.loginBeat": Object.freeze({ req: ".lq.ReqLoginBeat", resp: ".lq.ResCommon" }),
  ".lq.Lobby.logout": Object.freeze({ req: ".lq.ReqLogout", resp: ".lq.ResLogout" }),
});

const REQUIRED_MESSAGES = Object.freeze([
  ".lq.Wrapper",
  ".lq.ReqLogin",
  ".lq.ResLogin",
  ".lq.ReqOauth2Check",
  ".lq.ResOauth2Check",
  ".lq.ReqOauth2Login",
  ".lq.ReqCommon",
  ".lq.ResFetchInfo",
  ".lq.ReqGameRecordListV2",
  ".lq.ResGameRecordListV2",
  ".lq.ReqNextGameRecordList",
  ".lq.ResNextGameRecordList",
  ".lq.RecordListEntry",
  ".lq.RecordPlayerResult",
  ".lq.ReqGameRecordsDetail",
  ".lq.ResGameRecordsDetail",
  ".lq.RecordGame",
  ".lq.GameConfig",
  ".lq.GameMode",
  ".lq.GameDetailRule",
  ".lq.ReqGameRecord",
  ".lq.ResGameRecord",
  ".lq.ReqLoginBeat",
  ".lq.ResCommon",
  ".lq.ReqLogout",
  ".lq.ResLogout",
  ".lq.GameDetailRecords",
  ".lq.GameAction",
  ".lq.RecordNewRound",
  ".lq.RecordDealTile",
  ".lq.RecordDiscardTile",
  ".lq.RecordChiPengGang",
  ".lq.RecordAnGangAddGang",
  ".lq.RecordHule",
  ".lq.RecordNoTile",
  ".lq.RecordLiuJu",
]);

const CRITICAL_FIELDS = Object.freeze({
  ".lq.Error": Object.freeze({
    code: Object.freeze({ id: 1, type: "uint32", repeated: false }),
  }),
  ".lq.Account": Object.freeze({
    nickname: Object.freeze({ id: 2, type: "string", repeated: false }),
  }),
  ".lq.Wrapper": Object.freeze({
    name: Object.freeze({ id: 1, type: "string", repeated: false }),
    data: Object.freeze({ id: 2, type: "bytes", repeated: false }),
  }),
  ".lq.GameDetailRecords": Object.freeze({
    records: Object.freeze({ id: 1, type: "bytes", repeated: true }),
    version: Object.freeze({ id: 2, type: "uint32", repeated: false }),
    actions: Object.freeze({ id: 3, type: ".lq.GameAction", repeated: true }),
  }),
  ".lq.GameAction": Object.freeze({
    passed: Object.freeze({ id: 1, type: "uint32", repeated: false }),
    type: Object.freeze({ id: 2, type: "uint32", repeated: false }),
    result: Object.freeze({ id: 3, type: "bytes", repeated: false }),
    user_input: Object.freeze({ id: 4, type: ".lq.GameUserInput", repeated: false }),
    user_event: Object.freeze({ id: 5, type: ".lq.GameUserEvent", repeated: false }),
    game_event: Object.freeze({ id: 6, type: "uint32", repeated: false }),
  }),
  ".lq.ReqGameRecordsDetail": Object.freeze({
    uuid_list: Object.freeze({ id: 1, type: "string", repeated: true }),
  }),
  ".lq.ReqGameRecordListV2": Object.freeze({
    tag: Object.freeze({ id: 1, type: "uint32", repeated: false }),
    begin_time: Object.freeze({ id: 2, type: "uint32", repeated: false }),
    end_time: Object.freeze({ id: 3, type: "uint32", repeated: false }),
  }),
  ".lq.ResGameRecordListV2": Object.freeze({
    error: Object.freeze({ id: 1, type: ".lq.Error", repeated: false }),
    iterator: Object.freeze({ id: 2, type: "string", repeated: false }),
    iterator_expire: Object.freeze({ id: 3, type: "uint32", repeated: false }),
    actual_begin_time: Object.freeze({ id: 4, type: "uint32", repeated: false }),
    actual_end_time: Object.freeze({ id: 5, type: "uint32", repeated: false }),
  }),
  ".lq.ReqNextGameRecordList": Object.freeze({
    iterator: Object.freeze({ id: 1, type: "string", repeated: false }),
    count: Object.freeze({ id: 2, type: "uint32", repeated: false }),
  }),
  ".lq.ResNextGameRecordList": Object.freeze({
    error: Object.freeze({ id: 1, type: ".lq.Error", repeated: false }),
    next: Object.freeze({ id: 2, type: "bool", repeated: false }),
    entries: Object.freeze({ id: 3, type: ".lq.RecordListEntry", repeated: true }),
    iterator_expire: Object.freeze({ id: 4, type: "uint32", repeated: false }),
  }),
  ".lq.RecordListEntry": Object.freeze({
    version: Object.freeze({ id: 1, type: "uint32", repeated: false }),
    uuid: Object.freeze({ id: 2, type: "string", repeated: false }),
    start_time: Object.freeze({ id: 3, type: "uint32", repeated: false }),
    end_time: Object.freeze({ id: 4, type: "uint32", repeated: false }),
    tag: Object.freeze({ id: 5, type: "uint32", repeated: false }),
    subtag: Object.freeze({ id: 6, type: "uint32", repeated: false }),
    players: Object.freeze({ id: 7, type: ".lq.RecordPlayerResult", repeated: true }),
    standard_rule: Object.freeze({ id: 8, type: "uint32", repeated: false }),
  }),
  ".lq.RecordPlayerResult": Object.freeze({
    rank: Object.freeze({ id: 1, type: "uint32", repeated: false }),
    account_id: Object.freeze({ id: 2, type: "uint32", repeated: false }),
    nickname: Object.freeze({ id: 3, type: "string", repeated: false }),
    seat: Object.freeze({ id: 6, type: "uint32", repeated: false }),
    point: Object.freeze({ id: 8, type: "int32", repeated: false }),
  }),
  ".lq.ResGameRecordsDetail": Object.freeze({
    error: Object.freeze({ id: 1, type: ".lq.Error", repeated: false }),
    record_list: Object.freeze({ id: 2, type: ".lq.RecordGame", repeated: true }),
  }),
  ".lq.RecordGame": Object.freeze({
    uuid: Object.freeze({ id: 1, type: "string", repeated: false }),
    config: Object.freeze({ id: 5, type: ".lq.GameConfig", repeated: false }),
    standard_rule: Object.freeze({ id: 14, type: "uint32", repeated: false }),
  }),
  ".lq.GameConfig": Object.freeze({
    mode: Object.freeze({ id: 2, type: ".lq.GameMode", repeated: false }),
  }),
  ".lq.GameMode": Object.freeze({
    mode: Object.freeze({ id: 1, type: "uint32", repeated: false }),
    ai: Object.freeze({ id: 4, type: "bool", repeated: false }),
    extendinfo: Object.freeze({ id: 5, type: "string", repeated: false }),
    detail_rule: Object.freeze({ id: 6, type: ".lq.GameDetailRule", repeated: false }),
  }),
});

function fail() {
  throw new Error(FAILURE);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return isRecord(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function ownedBytes(value) {
  if (!(value instanceof Uint8Array)) fail();
  return Buffer.from(value);
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function lookupType(root, name) {
  const value = root.lookup(name);
  if (!(value instanceof protobuf.Type)) fail();
  value.resolveAll();
  return value;
}

function normalizedField(field) {
  field.resolve();
  return {
    id: field.id,
    type: field.resolvedType instanceof protobuf.Type
      ? field.resolvedType.fullName
      : field.type,
    repeated: field.repeated === true,
  };
}

function canonicalFields(type) {
  return Object.fromEntries(
    type.fieldsArray
      .map((field) => [field.name, normalizedField(field)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertCriticalFields(root) {
  for (const [typeName, fields] of Object.entries(CRITICAL_FIELDS)) {
    const actual = canonicalFields(lookupType(root, typeName));
    for (const [fieldName, expected] of Object.entries(fields)) {
      if (!sameJson(actual[fieldName], expected)) fail();
    }
  }
}

function lookupRoute(root, routeName) {
  const lastDot = routeName.lastIndexOf(".");
  const serviceName = routeName.slice(0, lastDot);
  const methodName = routeName.slice(lastDot + 1);
  const service = root.lookup(serviceName);
  if (!(service instanceof protobuf.Service)) fail();
  const method = service.methods[methodName];
  if (!(method instanceof protobuf.Method)) fail();
  method.resolve();
  if (
    !(method.resolvedRequestType instanceof protobuf.Type)
    || !(method.resolvedResponseType instanceof protobuf.Type)
  ) fail();
  return {
    req: method.resolvedRequestType.fullName,
    resp: method.resolvedResponseType.fullName,
  };
}

function parseOfficial(bytes) {
  const value = JSON.parse(decodeUtf8(bytes));
  if (!isRecord(value)) fail();
  const root = protobuf.Root.fromJSON(value);
  root.resolveAll();
  return root;
}

function parseVendorProto(bytes) {
  const root = protobuf.parse(decodeUtf8(bytes), { keepCase: true }).root;
  root.resolveAll();
  return root;
}

function parseRpcMap(bytes) {
  const value = JSON.parse(decodeUtf8(bytes));
  if (!isRecord(value)) fail();
  for (const route of Object.values(value)) {
    if (
      !exactKeys(route, ["req", "resp"])
      || typeof route.req !== "string"
      || typeof route.resp !== "string"
    ) fail();
  }
  return value;
}

function verifyRequiredSurface(official, vendor, rpcMap) {
  for (const typeName of REQUIRED_MESSAGES) {
    const officialFields = canonicalFields(lookupType(official, typeName));
    const vendorFields = canonicalFields(lookupType(vendor, typeName));
    if (!sameJson(officialFields, vendorFields)) fail();
  }
  assertCriticalFields(official);
  assertCriticalFields(vendor);

  for (const [routeName, expected] of Object.entries(REQUIRED_ROUTES)) {
    const officialRoute = lookupRoute(official, routeName);
    const vendorRoute = lookupRoute(vendor, routeName);
    const runtimeRoute = rpcMap[routeName];
    if (
      !sameJson(officialRoute, expected)
      || !sameJson(vendorRoute, expected)
      || !exactKeys(runtimeRoute, ["req", "resp"])
      || !sameJson(runtimeRoute, expected)
    ) fail();
  }
}

export function verifyMahjongSoulProtocolCompatibility(input) {
  try {
    if (
      !exactKeys(input, [
        "clientVersion",
        "officialSchemaBytes",
        "vendorProtoBytes",
        "vendorRpcMapBytes",
      ])
      || typeof input.clientVersion !== "string"
      || !/^[0-9]+(?:\.[A-Za-z0-9]+){2}\.w$/u.test(input.clientVersion)
    ) fail();
    const officialSchemaBytes = ownedBytes(input.officialSchemaBytes);
    const vendorProtoBytes = ownedBytes(input.vendorProtoBytes);
    const vendorRpcMapBytes = ownedBytes(input.vendorRpcMapBytes);
    const official = parseOfficial(officialSchemaBytes);
    const vendor = parseVendorProto(vendorProtoBytes);
    const rpcMap = parseRpcMap(vendorRpcMapBytes);
    verifyRequiredSurface(official, vendor, rpcMap);
    return Object.freeze({
      status: "compatible",
      clientVersion: input.clientVersion,
      officialSchemaSha256: sha256(officialSchemaBytes),
      vendorProtoSha256: sha256(vendorProtoBytes),
      vendorRpcMapSha256: sha256(vendorRpcMapBytes),
      requiredSurfaceVersion: SURFACE_VERSION,
    });
  } catch {
    fail();
  }
}
