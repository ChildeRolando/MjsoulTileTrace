import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import protobuf from "protobufjs";

import {
  verifyMahjongSoulProtocolCompatibility,
} from "./mahjong-soul-protocol-compatibility.mjs";

const registerTest = process.env.VITEST === "true"
  ? (await import("vitest")).test
  : (await import("node:test")).test;

const SURFACE_PROTO = `
syntax = "proto3";
package lq;

message Error { uint32 code = 1; }
message Account { string nickname = 1; }
message ClientDeviceInfo {}
message ClientVersionInfo {}
message GameConnectInfo {}
message AccountLevel {}
message RecordGame {}
message GameUserInput {}
message GameUserEvent {}
message TingPai {}
message OptionalOperationList {}
message NewRoundOpenedTiles {}
message MuyuInfo {}
message YongchangInfo {}
message XiaKeShangInfo {}
message LiQiSuccess {}
message HunZhiYiJiBuffInfo {}
message TingPaiInfo {}
message HuleInfo {}
message GameEnd {}
message NoTilePlayerInfo {}
message NoTileScoreInfo {}

message Wrapper { string name = 1; bytes data = 2; }
message ReqLogin {
  string account = 1; string password = 2; bool reconnect = 3;
  ClientDeviceInfo device = 4; string random_key = 5;
  ClientVersionInfo client_version = 6; bool gen_access_token = 7;
  repeated uint32 currency_platforms = 8; uint32 type = 9;
  uint32 version = 10; string client_version_string = 11; string tag = 12;
}
message ResLogin {
  Error error = 1; uint32 account_id = 2; Account account = 3;
  GameConnectInfo game_info = 4; bool has_unread_announcement = 5;
  string access_token = 6; uint32 signup_time = 7;
  bool is_id_card_authed = 8; string country = 9;
  repeated uint32 logined_version = 10; repeated uint32 rewarded_version = 11;
}
message ReqOauth2Check { uint32 type = 1; string access_token = 2; }
message ResOauth2Check { Error error = 1; bool has_account = 2; }
message ReqOauth2Login {
  uint32 type = 1; string access_token = 2; bool reconnect = 3;
  ClientDeviceInfo device = 4; string random_key = 5;
  ClientVersionInfo client_version = 6; bool gen_access_token = 7;
  repeated uint32 currency_platforms = 8; uint32 version = 9;
  string client_version_string = 10; string tag = 11;
}
message ReqCommon {}
message ResCommon { Error error = 1; }
message ResFetchInfo { Error error = 1; }
message ReqGameRecordListV2 {
  uint32 tag = 1; uint32 begin_time = 2; uint32 end_time = 3;
  repeated uint32 ranks = 4; repeated uint32 modes = 5;
  uint32 max_hu_type = 6; repeated uint32 level_mode = 7;
}
message ResGameRecordListV2 {
  Error error = 1; string iterator = 2; uint32 iterator_expire = 3;
  uint32 actual_begin_time = 4; uint32 actual_end_time = 5;
}
message ReqNextGameRecordList { string iterator = 1; uint32 count = 2; }
message ResNextGameRecordList {
  Error error = 1; bool next = 2; repeated RecordListEntry entries = 3;
  uint32 iterator_expire = 4; uint32 next_end_time = 5;
}
message RecordListEntry {
  uint32 version = 1; string uuid = 2; uint32 start_time = 3;
  uint32 end_time = 4; uint32 tag = 5; uint32 subtag = 6;
  repeated RecordPlayerResult players = 7; uint32 standard_rule = 8;
}
message RecordPlayerResult {
  uint32 rank = 1; uint32 account_id = 2; string nickname = 3;
  AccountLevel level = 4; AccountLevel level3 = 5; uint32 seat = 6;
  int32 pt = 7; int32 point = 8; uint32 max_hu_type = 9;
  uint32 action_liqi = 10; uint32 action_rong = 11;
  uint32 action_zimo = 12; uint32 action_chong = 13; uint32 verified = 14;
}
message ReqGameRecord { string game_uuid = 1; string client_version_string = 2; }
message ResGameRecord {
  Error error = 1; RecordGame head = 3; bytes data = 4; string data_url = 5;
}
message ReqLoginBeat { string contract = 1; }
message ReqLogout {}
message ResLogout { Error error = 1; }
message GameDetailRecords {
  repeated bytes records = 1; uint32 version = 2;
  repeated GameAction actions = 3; bytes bar = 4;
}
message GameAction {
  uint32 passed = 1; uint32 type = 2; bytes result = 3;
  GameUserInput user_input = 4; GameUserEvent user_event = 5;
  uint32 game_event = 6;
}
message RecordNewRound {
  uint32 chang = 1; uint32 ju = 2; uint32 ben = 3; string dora = 4;
  repeated int32 scores = 5; uint32 liqibang = 6;
  repeated string tiles0 = 7; repeated string tiles1 = 8;
  repeated string tiles2 = 9; repeated string tiles3 = 10;
  repeated TingPai tingpai = 11; OptionalOperationList operation = 12;
  string md5 = 13; string paishan = 14; uint32 left_tile_count = 15;
  repeated string doras = 16; repeated NewRoundOpenedTiles opens = 17;
  MuyuInfo muyu = 18; repeated OptionalOperationList operations = 19;
  uint32 ju_count = 20; uint32 field_spell = 21; string sha256 = 22;
  YongchangInfo yongchang = 23; string saltSha256 = 24; string salt = 25;
  XiaKeShangInfo xia_ke_shang = 26;
}
message RecordDealTile {
  uint32 seat = 1; string tile = 2; uint32 left_tile_count = 3;
  LiQiSuccess liqi = 5; repeated string doras = 6; repeated bool zhenting = 7;
  OptionalOperationList operation = 8; uint32 tile_state = 9;
  MuyuInfo muyu = 11; uint32 tile_index = 12;
  HunZhiYiJiBuffInfo hun_zhi_yi_ji_info = 13;
}
message RecordDiscardTile {
  uint32 seat = 1; string tile = 2; bool is_liqi = 3; bool moqie = 5;
  repeated bool zhenting = 6; repeated TingPaiInfo tingpais = 7;
  repeated string doras = 8; bool is_wliqi = 9;
  repeated OptionalOperationList operations = 10; uint32 tile_state = 11;
  MuyuInfo muyu = 12; YongchangInfo yongchang = 13;
  HunZhiYiJiBuffInfo hun_zhi_yi_ji_info = 14;
  uint32 liqi_type_beishuizhizhan = 27;
}
message RecordChiPengGang {
  uint32 seat = 1; uint32 type = 2; repeated string tiles = 3;
  repeated uint32 froms = 4; LiQiSuccess liqi = 5;
  repeated bool zhenting = 7; OptionalOperationList operation = 8;
  repeated uint32 tile_states = 9; MuyuInfo muyu = 10;
  repeated int32 scores = 11; uint32 liqibang = 12;
  YongchangInfo yongchang = 13; HunZhiYiJiBuffInfo hun_zhi_yi_ji_info = 14;
}
message RecordAnGangAddGang {
  uint32 seat = 1; uint32 type = 2; string tiles = 3;
  repeated string doras = 6; repeated OptionalOperationList operations = 7;
  MuyuInfo muyu = 8;
}
message RecordHule {
  repeated HuleInfo hules = 1; repeated int32 old_scores = 2;
  repeated int32 delta_scores = 3; uint32 wait_timeout = 4;
  repeated int32 scores = 5; GameEnd gameend = 6;
  repeated string doras = 7; MuyuInfo muyu = 8; int32 baopai = 9;
  HunZhiYiJiBuffInfo hun_zhi_yi_ji_info = 10;
}
message RecordNoTile {
  bool liujumanguan = 1; repeated NoTilePlayerInfo players = 2;
  repeated NoTileScoreInfo scores = 3; bool gameend = 4; MuyuInfo muyu = 5;
  repeated HuleInfo hules_history = 9;
}
message RecordLiuJu {
  uint32 type = 1; GameEnd gameend = 2; uint32 seat = 3;
  repeated string tiles = 4; LiQiSuccess liqi = 5;
  repeated string allplayertiles = 6; MuyuInfo muyu = 7;
  repeated HuleInfo hules_history = 9;
}

service Lobby {
  rpc login(ReqLogin) returns (ResLogin);
  rpc oauth2Check(ReqOauth2Check) returns (ResOauth2Check);
  rpc oauth2Login(ReqOauth2Login) returns (ResLogin);
  rpc fetchInfo(ReqCommon) returns (ResFetchInfo);
  rpc fetchGameRecordListV2(ReqGameRecordListV2) returns (ResGameRecordListV2);
  rpc fetchNextGameRecordList(ReqNextGameRecordList) returns (ResNextGameRecordList);
  rpc fetchGameRecord(ReqGameRecord) returns (ResGameRecord);
  rpc loginBeat(ReqLoginBeat) returns (ResCommon);
  rpc logout(ReqLogout) returns (ResLogout);
}
`;

const ROUTES = Object.freeze({
  ".lq.Lobby.login": { req: ".lq.ReqLogin", resp: ".lq.ResLogin" },
  ".lq.Lobby.oauth2Check": { req: ".lq.ReqOauth2Check", resp: ".lq.ResOauth2Check" },
  ".lq.Lobby.oauth2Login": { req: ".lq.ReqOauth2Login", resp: ".lq.ResLogin" },
  ".lq.Lobby.fetchInfo": { req: ".lq.ReqCommon", resp: ".lq.ResFetchInfo" },
  ".lq.Lobby.fetchGameRecordListV2": { req: ".lq.ReqGameRecordListV2", resp: ".lq.ResGameRecordListV2" },
  ".lq.Lobby.fetchNextGameRecordList": { req: ".lq.ReqNextGameRecordList", resp: ".lq.ResNextGameRecordList" },
  ".lq.Lobby.fetchGameRecord": { req: ".lq.ReqGameRecord", resp: ".lq.ResGameRecord" },
  ".lq.Lobby.loginBeat": { req: ".lq.ReqLoginBeat", resp: ".lq.ResCommon" },
  ".lq.Lobby.logout": { req: ".lq.ReqLogout", resp: ".lq.ResLogout" },
});

const bytes = (value) => Buffer.from(value, "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const vendorProtoBytes = bytes(SURFACE_PROTO);
  const official = protobuf.parse(SURFACE_PROTO, { keepCase: true }).root.toJSON();
  const officialSchemaBytes = bytes(JSON.stringify(official));
  const vendorRpcMapBytes = bytes(JSON.stringify(ROUTES));
  return {
    clientVersion: "0.test.1.w",
    official,
    officialSchemaBytes,
    vendorProtoBytes,
    vendorRpcMapBytes,
  };
}

function verify(input) {
  return verifyMahjongSoulProtocolCompatibility({
    clientVersion: input.clientVersion,
    officialSchemaBytes: input.officialSchemaBytes,
    vendorProtoBytes: input.vendorProtoBytes,
    vendorRpcMapBytes: input.vendorRpcMapBytes,
  });
}

registerTest("returns a frozen six-field report bound to all three byte sources", () => {
  const input = fixture();
  const report = verify(input);
  assert.deepEqual(report, {
    status: "compatible",
    clientVersion: "0.test.1.w",
    officialSchemaSha256: hash(input.officialSchemaBytes),
    vendorProtoSha256: hash(input.vendorProtoBytes),
    vendorRpcMapSha256: hash(input.vendorRpcMapBytes),
    requiredSurfaceVersion: "mahjong-soul-required-surface/v1",
  });
  assert.equal(Object.isFrozen(report), true);
});

registerTest("rejects independent official, proto, and runtime-map surface drift", () => {
  const mutations = [
    (input) => {
      input.official.nested.lq.nested.Wrapper.fields.data.id = 17;
      input.officialSchemaBytes = bytes(JSON.stringify(input.official));
    },
    (input) => {
      input.vendorProtoBytes = bytes(SURFACE_PROTO.replace("bytes data = 2", "string data = 2"));
    },
    (input) => {
      input.vendorProtoBytes = bytes(SURFACE_PROTO.replace(
        "repeated RecordPlayerResult players = 7",
        "RecordPlayerResult players = 7",
      ));
    },
    (input) => {
      input.official.nested.lq.nested.Lobby.methods.login.responseType = "ResCommon";
      input.officialSchemaBytes = bytes(JSON.stringify(input.official));
    },
    (input) => {
      input.official.nested.lq.nested.Lobby.methods.login.requestType = "ReqCommon";
      input.officialSchemaBytes = bytes(JSON.stringify(input.official));
    },
    (input) => {
      input.vendorProtoBytes = bytes(SURFACE_PROTO.replace(
        "rpc oauth2Login(ReqOauth2Login) returns (ResLogin)",
        "rpc oauth2Login(ReqCommon) returns (ResLogin)",
      ));
    },
    (input) => {
      input.vendorProtoBytes = bytes(SURFACE_PROTO.replace(
        "rpc logout(ReqLogout) returns (ResLogout)",
        "rpc logout(ReqLogout) returns (ResCommon)",
      ));
    },
    (input) => {
      const routes = structuredClone(ROUTES);
      routes[".lq.Lobby.fetchNextGameRecordList"].req = ".lq.ReqCommon";
      input.vendorRpcMapBytes = bytes(JSON.stringify(routes));
    },
    (input) => {
      const routes = structuredClone(ROUTES);
      routes[".lq.Lobby.fetchGameRecord"].resp = ".lq.ResCommon";
      input.vendorRpcMapBytes = bytes(JSON.stringify(routes));
    },
    (input) => {
      input.vendorProtoBytes = bytes(SURFACE_PROTO.replace(
        /message RecordLiuJu \{[\s\S]*?\n\}/u,
        "",
      ));
    },
  ];

  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.throws(
      () => verify(input),
      (error) => error instanceof Error
        && error.message === "mahjong_soul_protocol_compatibility_failed",
    );
  }
});

registerTest("accepts wire-equivalent field declaration reordering", () => {
  const input = fixture();
  const wrapper = input.official.nested.lq.nested.Wrapper;
  wrapper.fields = {
    data: wrapper.fields.data,
    name: wrapper.fields.name,
  };
  input.officialSchemaBytes = bytes(JSON.stringify(input.official));
  assert.equal(verify(input).status, "compatible");
});

registerTest("allows unrelated official messages but never reflects hostile names", () => {
  const allowed = fixture();
  allowed.official.nested.lq.nested.UnrelatedFutureMessage = {
    fields: { value: { type: "string", id: 1 } },
  };
  allowed.officialSchemaBytes = bytes(JSON.stringify(allowed.official));
  assert.equal(verify(allowed).status, "compatible");

  const hostile = fixture();
  hostile.official.nested.lq.nested.Wrapper.fields.data.type =
    "server_token_hostile_type";
  hostile.officialSchemaBytes = bytes(JSON.stringify(hostile.official));
  assert.throws(
    () => verify(hostile),
    (error) => error instanceof Error
      && error.message === "mahjong_soul_protocol_compatibility_failed"
      && !error.message.includes("server_token_hostile_type"),
  );
});
