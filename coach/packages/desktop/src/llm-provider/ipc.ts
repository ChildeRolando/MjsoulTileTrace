import {
  COACH_IPC_CHANNELS, CoachGenerateRequestSchema, CoachGenerateResultSchema,
  CoachProviderSettingsSchema, CoachProviderStatusSchema, type CoachDesktopApi,
} from "@riichi-coach/contracts";
import type { IpcMainPort } from "../ipc.js";

export function registerCoachIpc(input: {
  ipcMain: IpcMainPort; service: CoachDesktopApi; trustedSenderId: number;
}): { dispose(): void } {
  for (const [operation, channel] of Object.entries(COACH_IPC_CHANNELS)) {
    input.ipcMain.handle(channel, async (event, ...args) => {
      try {
        const sender = event as { sender?: { id?: number }; senderFrame?: unknown };
        if (sender?.sender?.id !== input.trustedSenderId) throw Error();
        // Reject child frames when Electron supplies frame identity.
        const frameEvent = event as { senderFrame?: unknown; sender?: { mainFrame?: unknown } };
        if (frameEvent.senderFrame !== undefined && frameEvent.senderFrame !== frameEvent.sender?.mainFrame) throw Error();
        if (operation === "configure") {
          if (args.length !== 1) throw Error();
          return CoachProviderStatusSchema.parse(await input.service.configure(CoachProviderSettingsSchema.parse(args[0])));
        }
        if (operation === "generate") {
          if (args.length !== 1) throw Error();
          return CoachGenerateResultSchema.parse(await input.service.generate(CoachGenerateRequestSchema.parse(args[0])));
        }
        if (args.length !== 0) throw Error();
        const result = operation === "status" ? await input.service.getStatus()
          : operation === "importCredential" ? await input.service.importCredential() : await input.service.clearCredential();
        return CoachProviderStatusSchema.parse(result);
      } catch { throw Error("m6d2_provider_operation_failed"); }
    });
  }
  return { dispose: () => { for (const channel of Object.values(COACH_IPC_CHANNELS)) input.ipcMain.removeHandler(channel); } };
}
