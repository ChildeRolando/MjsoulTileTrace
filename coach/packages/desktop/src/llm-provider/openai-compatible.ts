import {
  CoachProviderConfigSchema, LlmCoachRequestSchema, LlmTokenUsageSchema,
  type CoachProviderConfig, type LlmCoachProvider, type LlmCoachResult, type LlmCoachErrorCode, type LlmCoachRequest,
} from "@riichi-coach/contracts";
import type { ProviderCredentials } from "./credentials.js";
import { redactCoachOutput } from "./redacted-output.js";

function transportError(error: unknown, timedOut: boolean): LlmCoachErrorCode {
  if (timedOut) return "timeout";
  const e = error as { name?: unknown; code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.cause?.code ?? e?.code;
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return "timeout";
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return "network_reset";
  return "connection_failed";
}

function reflectsProtectedText(content: string, protectedText: readonly string[]): boolean {
  const contains = (value: unknown): boolean => {
    if (typeof value === "string") return protectedText.some(text => value.includes(text));
    if (Array.isArray(value)) return value.some(contains);
    if (value !== null && typeof value === "object") return Object.entries(value).some(([name, entry]) => contains(name) || contains(entry));
    return false;
  };
  if (contains(content)) return true;
  // JSON escapes must not conceal a reflected Authorization value or prompt.
  try { return contains(JSON.parse(content)); } catch { return false; }
}

/** One HTTP attempt. The narrow generation seam owns the single retry and audit count. */
export function createOpenAiCoachProvider(input: {
  settings: CoachProviderConfig | null;
  credentials: Pick<ProviderCredentials, "readKey">;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): LlmCoachProvider {
  const parsed = CoachProviderConfigSchema.safeParse(input.settings);
  const settings = parsed.success ? parsed.data : null;
  return Object.freeze({
    descriptor: () => ({ providerId: "openai-compatible", model: settings?.modelName ?? "unconfigured" }),
    async complete(request: LlmCoachRequest): Promise<LlmCoachResult> {
      const checked = LlmCoachRequestSchema.safeParse(request);
      if (settings === null || !checked.success) return { errorCode: "provider_unavailable" };
      let key: string | null;
      try { key = await input.credentials.readKey(); } catch { key = null; }
      if (key === null) return { errorCode: "provider_unavailable" };
      const controller = new AbortController();
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<LlmCoachResult>((resolve) => {
        timer = setTimeout(() => { timedOut = true; controller.abort(); resolve({ errorCode: "timeout" }); }, input.timeoutMs ?? 30_000);
      });
      const attempt = async (): Promise<LlmCoachResult> => {
        try {
          const response = await input.fetchImpl(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST", redirect: "error", signal: controller.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: settings.modelName, messages: [{ role: "user", content: checked.data.prompt }], temperature: 0, max_tokens: checked.data.maxOutputTokens, response_format: { type: "json_object" }, stream: false }),
          });
          if (!response.ok) {
            // Never read/retain upstream error prose (including echoed credentials).
            await response.body?.cancel();
            return { errorCode: response.status === 429 ? "rate_limited" : response.status >= 500 ? "server_error" : "connection_failed" };
          }
          let raw: unknown;
          try { raw = await response.json(); } catch (error) {
            if (error instanceof SyntaxError) return { content: "{}" };
            throw error;
          }
          const r = raw as { choices?: { message?: { content?: unknown } }[]; usage?: unknown } | null;
          const content = r?.choices?.[0]?.message?.content;
          // Semantic failures are success-shaped invalid drafts: never transport-retry them.
          if (typeof content !== "string") return { content: "{}" };
          if (content.length === 0 || reflectsProtectedText(content, [key!, checked.data.prompt])) return redactCoachOutput(content);
          const usage = r?.usage;
          // Optional metadata is untrusted. Its absence or malformed shape must
          // never discard valid content or be classified as a transport error.
          if (usage === null || typeof usage !== "object" || Array.isArray(usage)) return { content };
          const fields = usage as Record<string, unknown>;
          const tokens = LlmTokenUsageSchema.safeParse({
            inputTokens: fields.prompt_tokens, outputTokens: fields.completion_tokens, totalTokens: fields.total_tokens,
          });
          return tokens.success ? { content, usage: tokens.data } : { content };
        } catch (error) { return { errorCode: transportError(error, timedOut) }; }
      };
      try { return await Promise.race([attempt(), timeout]); }
      finally { clearTimeout(timer); key = null; }
    },
  });
}
