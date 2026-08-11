import {
  MahjongSoulSessionStatusSchema,
  type MahjongSoulSessionStatus,
} from "@riichi-coach/contracts";
import { z } from "zod";

const SessionMethodSchema = z.function()
  .args()
  .returns(z.promise(MahjongSoulSessionStatusSchema));

export const MahjongSoulDesktopApiSchema = z.object({
  getSessionStatus: SessionMethodSchema,
  openMahjongSoulLogin: SessionMethodSchema,
  logoutMahjongSoul: SessionMethodSchema,
}).strict();

export interface MahjongSoulDesktopApi {
  getSessionStatus(): Promise<MahjongSoulSessionStatus>;
  openMahjongSoulLogin(): Promise<MahjongSoulSessionStatus>;
  logoutMahjongSoul(): Promise<MahjongSoulSessionStatus>;
}

export function parseMahjongSoulSessionStatus(
  value: unknown,
): MahjongSoulSessionStatus {
  const parsed = MahjongSoulSessionStatusSchema.parse(value);
  return Object.freeze({ ...parsed });
}
