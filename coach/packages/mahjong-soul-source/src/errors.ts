import {
  MahjongSoulSourceErrorCodeSchema,
  type MahjongSoulSourceErrorCode,
} from "@riichi-coach/contracts";

export class MahjongSoulSourceError extends Error {
  constructor(code: MahjongSoulSourceErrorCode) {
    if (
      arguments.length !== 1
      || !MahjongSoulSourceErrorCodeSchema.safeParse(code).success
    ) {
      throw new TypeError("mahjong_soul_login_protocol_unsupported");
    }
    super(code);
    this.name = "MahjongSoulSourceError";
    Object.freeze(this);
  }
}
