import {
  MahjongSoulSessionStatusSchema,
  COACH_IPC_CHANNELS, CoachProviderConfigSchema, CoachProviderStatusSchema,
  FixedReviewAcknowledgementSchema, FixedReviewCancelRequestSchema,
  FixedReviewDetailRequestSchema, FixedReviewDetailSchema, FixedReviewGenerateRequestSchema,
  FixedReviewLeaveRequestSchema, FixedReviewOpenRequestSchema, FixedReviewOperationResultSchema,
  FixedReviewSnapshotSchema, type CoachDesktopApi,
  ReviewSessionListSchema,
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

/** Safe bridge only: no provider, credentials, filesystem or HTTP imports. */
export function createCoachPreloadApi(port: { invoke(channel: string, ...args: unknown[]): Promise<unknown> }): CoachDesktopApi {
  const invoke = port.invoke.bind(port);
  const statusCall = async (channel: string, args: unknown[]) => {
    try { return CoachProviderStatusSchema.parse(await invoke(channel, ...args)); }
    catch { throw new Error("provider_unavailable"); }
  };
  const noArgs = (channel: string, args: unknown[]) => {
    if (args.length !== 0) return Promise.reject(new Error("provider_unavailable"));
    return statusCall(channel, []);
  };
  return Object.freeze({
    async configure(...args: unknown[]) {
      try {
        if (args.length !== 1) throw Error();
        return await statusCall(COACH_IPC_CHANNELS.configure, [CoachProviderConfigSchema.parse(args[0])]);
      } catch { throw new Error("provider_unavailable"); }
    },
    status: (...args: unknown[]) => noArgs(COACH_IPC_CHANNELS.status, args),
    importCredential: (...args: unknown[]) => noArgs(COACH_IPC_CHANNELS.importCredential, args),
    clearCredential: (...args: unknown[]) => noArgs(COACH_IPC_CHANNELS.clearCredential, args),
    async openReview(...args: unknown[]) {
      try {
        if (args.length !== 1) throw Error();
        return FixedReviewSnapshotSchema.parse(await invoke(COACH_IPC_CHANNELS.openReview, FixedReviewOpenRequestSchema.parse(args[0])));
      } catch { throw new Error("provider_unavailable"); }
    },
    async generateReview(...args: unknown[]) {
      try {
        if (args.length !== 1) throw Error();
        return FixedReviewOperationResultSchema.parse(await invoke(COACH_IPC_CHANNELS.generate, FixedReviewGenerateRequestSchema.parse(args[0])));
      } catch { throw new Error("provider_unavailable"); }
    },
    async cancelGeneration(...args: unknown[]) {
      try {
        if (args.length !== 1) throw Error();
        return FixedReviewAcknowledgementSchema.parse(await invoke(COACH_IPC_CHANNELS.cancelGeneration, FixedReviewCancelRequestSchema.parse(args[0])));
      } catch { throw new Error("provider_unavailable"); }
    },
    async getReviewDetail(...args: unknown[]) {
      try {
        if (args.length !== 1) throw Error();
        return FixedReviewDetailSchema.parse(await invoke(COACH_IPC_CHANNELS.getReviewDetail, FixedReviewDetailRequestSchema.parse(args[0])));
      } catch { throw new Error("provider_unavailable"); }
    },
    async leaveReview(...args: unknown[]) {
      try {
        if (args.length !== 1) throw Error();
        return FixedReviewAcknowledgementSchema.parse(await invoke(COACH_IPC_CHANNELS.leaveReview, FixedReviewLeaveRequestSchema.parse(args[0])));
      } catch { throw new Error("provider_unavailable"); }
    },
    async listReviewSessions(...args: unknown[]) {
      try {
        if (args.length !== 0) throw Error();
        return ReviewSessionListSchema.parse(await invoke(COACH_IPC_CHANNELS.listReviewSessions));
      } catch { throw new Error("provider_unavailable"); }
    },
  });
}
