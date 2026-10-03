import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CoachProviderConfigSchema, type CoachProviderConfig } from "@riichi-coach/contracts";

// Public provider configuration only. Credentials remain in their existing owner.
export function createCoachSettingsStore(directory: string) {
  const file = join(directory, "coach-provider-settings-v1.json");
  return {
    load(): CoachProviderConfig | null {
      try {
        if (statSync(file).size > 4096) throw new Error("provider_unavailable");
        return CoachProviderConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
      } catch { return null; }
    },
    async save(value: CoachProviderConfig): Promise<void> {
      const settings = CoachProviderConfigSchema.parse(value);
      const temporary = `${file}.tmp`;
      try {
        mkdirSync(directory, { recursive: true });
        writeFileSync(temporary, JSON.stringify(settings), { encoding: "utf8", mode: 0o600 });
        renameSync(temporary, file);
      } catch {
        try { unlinkSync(temporary); } catch { /* bounded fixed failure */ }
        throw new Error("provider_unavailable");
      }
    },
  };
}
