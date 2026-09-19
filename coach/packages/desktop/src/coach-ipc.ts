import {
  COACH_IPC_CHANNELS, CoachProviderConfigSchema, CoachProviderStatusSchema,
  CoachReportRequestSchema, CoachReportResultSchema,
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
          return CoachReportResultSchema.parse(await input.service.generate(CoachReportRequestSchema.parse(args[0])));
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
