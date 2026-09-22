import {
  COACH_IPC_CHANNELS, CoachProviderConfigSchema, CoachProviderStatusSchema,
  FixedReviewAcknowledgementSchema, FixedReviewCancelRequestSchema,
  FixedReviewDetailRequestSchema, FixedReviewDetailSchema, FixedReviewGenerateRequestSchema,
  FixedReviewLeaveRequestSchema, FixedReviewOpenRequestSchema, FixedReviewOperationResultSchema,
  FixedReviewSnapshotSchema,
} from "@riichi-coach/contracts";
import type { IpcMainPort } from "./ipc.js";
import type { CoachService } from "./llm-provider/service.js";

export function registerCoachIpc(input: {
  ipcMain: IpcMainPort; service: CoachService; trustedSenderId: number;
}) {
  if (!Number.isInteger(input.trustedSenderId) || input.trustedSenderId < 0) throw new Error("provider_unavailable");
  for (const [operation, channel] of Object.entries(COACH_IPC_CHANNELS)) {
    input.ipcMain.handle(channel, async (event, ...args) => {
      try {
        const e = event as { sender?: { id?: unknown }; senderFrame?: unknown } | null;
        const sender = e?.sender as { id?: unknown; mainFrame?: unknown } | undefined;
        if (sender?.id !== input.trustedSenderId || (sender.mainFrame !== undefined && e?.senderFrame !== sender.mainFrame)) throw Error();
        if (operation === "configure") {
          if (args.length !== 1) throw Error();
          return CoachProviderStatusSchema.parse(await input.service.configure(CoachProviderConfigSchema.parse(args[0])));
        }
        if (operation === "generate") {
          if (args.length !== 1) throw Error();
          const request = FixedReviewGenerateRequestSchema.parse(args[0]);
          return FixedReviewOperationResultSchema.parse(await input.service.generateReview(request.packageId, request.operationId));
        }
        if (operation === "openReview") {
          if (args.length !== 1) throw Error();
          const request = FixedReviewOpenRequestSchema.parse(args[0]);
          return FixedReviewSnapshotSchema.parse(await input.service.openReview(request.packageId));
        }
        if (operation === "cancelGeneration") {
          if (args.length !== 1) throw Error();
          const request = FixedReviewCancelRequestSchema.parse(args[0]);
          input.service.cancelGeneration(request.operationId);
          return FixedReviewAcknowledgementSchema.parse({ status: "acknowledged" });
        }
        if (operation === "getReviewDetail") {
          if (args.length !== 1) throw Error();
          const request = FixedReviewDetailRequestSchema.parse(args[0]);
          return FixedReviewDetailSchema.parse(input.service.getReviewDetail(request.packageId, request.decisionId, request.activeReportRefId));
        }
        if (operation === "leaveReview") {
          if (args.length !== 1) throw Error();
          const request = FixedReviewLeaveRequestSchema.parse(args[0]);
          input.service.leaveReview(request.packageId);
          return FixedReviewAcknowledgementSchema.parse({ status: "acknowledged" });
        }
        if (args.length !== 0) throw Error();
        const result = operation === "status" ? await input.service.status()
          : operation === "importCredential" ? await input.service.importCredential() : await input.service.clearCredential();
        return CoachProviderStatusSchema.parse(result);
      } catch { throw new Error("provider_unavailable"); }
    });
  }
  return Object.freeze({ dispose() { for (const channel of Object.values(COACH_IPC_CHANNELS)) input.ipcMain.removeHandler(channel); } });
}
