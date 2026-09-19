import {
  CoachProviderSettingsSchema, LlmCoachRequestSchema, LlmTokenUsageSchema,
  type CoachProviderSettings, type LlmCoachProvider, type LlmCoachResult, type LlmCoachRequest,
} from "@riichi-coach/contracts";
import type { ProviderCredentialService } from "./credentials.js";

/** One HTTP attempt. The narrow generation seam owns the single transport retry. */
export function createOpenAiCoachProvider(input: {
  credentials: ProviderCredentialService;
  settings: () => CoachProviderSettings | null;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): LlmCoachProvider {
  return Object.freeze({
    descriptor: () => ({ providerId: "openai-compatible", model: input.settings()?.modelName ?? "unconfigured" }),
    async complete(request: LlmCoachRequest): Promise<LlmCoachResult> {
      const settings = CoachProviderSettingsSchema.safeParse(input.settings());
      if (!settings.success) return { errorCode: "provider_unavailable" };
      const parsed = LlmCoachRequestSchema.safeParse(request);
      if (!parsed.success) return { content: "{}" }; // invalid input is not a transport failure
      try {
        return await input.credentials.withCredential(async (key): Promise<LlmCoachResult> => {
          if (settings.data.baseUrl.includes(key) || settings.data.modelName.includes(key) || parsed.data.prompt.includes(key)) {
            return { errorCode: "provider_unavailable" };
          }
          const controller = new AbortController();
          let timedOut = false;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<LlmCoachResult>((resolve) => {
            timer = setTimeout(() => { timedOut = true; controller.abort(); resolve({ errorCode: "timeout" }); }, input.timeoutMs ?? 30_000);
          });
          const attempt = async (): Promise<LlmCoachResult> => {
            try {
              const response = await (input.fetch ?? globalThis.fetch)(`${settings.data.baseUrl.replace(/\/+$/u, "")}/chat/completions`, {
                method: "POST", redirect: "error", signal: controller.signal,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({ model: settings.data.modelName, messages: [{ role: "user", content: parsed.data.prompt }],
                  temperature: parsed.data.temperature, max_tokens: parsed.data.maxOutputTokens, response_format: { type: "json_object" } }),
              });
              if (!response.ok) {
                await response.body?.cancel();
                if (response.status === 429) return { errorCode: "rate_limited" };
                if (response.status >= 500) return { errorCode: "server_error" };
                // Auth/config/protocol errors are terminal; never retry as transport.
                return { content: "{}" };
              }
              // Bound the untrusted response in main-process memory, including body timeout.
              const reader = response.body?.getReader();
              if (!reader) return { content: "{}" };
              const chunks: Uint8Array[] = []; let length = 0;
              try {
                for (;;) {
                  const chunk = await reader.read(); if (chunk.done) break;
                  length += chunk.value.length;
                  if (length > 2_000_000) { await reader.cancel(); return { content: "{}" }; }
                  chunks.push(chunk.value);
                }
              } finally { reader.releaseLock(); }
              let value;
              try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return { content: "{}" }; }
              const rawContent: unknown = value?.choices?.[0]?.message?.content;
              if (typeof rawContent !== "string" || !rawContent.length) return { content: "{}" };
              // Preserve the model's exact content for privileged hash/assembly,
              // including malformed JSON. It is never an IPC/persistence DTO.
              // Envelope reasoning_content, headers and other fields die here.
              const content = rawContent;
              const usage = LlmTokenUsageSchema.safeParse(value?.usage ? {
                inputTokens: value.usage.prompt_tokens, outputTokens: value.usage.completion_tokens, totalTokens: value.usage.total_tokens,
              } : undefined);
              return usage.success ? { content, usage: usage.data } : { content };
            } catch (error) {
              if (timedOut || (error as { name?: string })?.name === "AbortError") return { errorCode: "timeout" };
              const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
              return { errorCode: code === "ECONNRESET" || code === "UND_ERR_SOCKET" ? "network_reset" : "connection_failed" };
            }
          };
          try { return await Promise.race([attempt(), timeout]); } finally { clearTimeout(timer); }
        }) ?? { errorCode: "provider_unavailable" };
      } catch { return { errorCode: "provider_unavailable" }; }
    },
  });
}
