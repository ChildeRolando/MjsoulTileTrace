import {
  OpenAiCoachProviderConfigSchema,
  type CoachProviderConfig,
  type LlmTokenUsage,
} from "@riichi-coach/contracts";
import { z } from "zod";
import type { ProviderCredentials } from "./credentials.js";
import { normalizeTokenUsage } from "./token-usage.js";
import {
  ARENA_PROVIDER_MAX_INPUT_BYTES,
  ARENA_PROVIDER_MAX_OUTPUT_BYTES,
  ArenaProviderRequestSchema,
  ArenaToolCallProviderResultSchema,
  type ArenaProviderRequest,
  type ArenaToolCallProvider,
  type ArenaToolCallProviderResult,
} from "../blind-discard-arena-provider.js";

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
class ProviderResponseTooLarge extends Error {}
class ProviderAbort extends Error {
  constructor(readonly status: "timeout" | "cancelled") { super(status); }
}

async function cancelBody(response: Response): Promise<void> {
  try { await response.body?.cancel(); } catch { /* provider prose is intentionally ignored */ }
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<{ value: unknown; byteLength: number }> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await cancelBody(response);
    throw new ProviderResponseTooLarge();
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("provider_response_invalid");
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    byteLength += next.value.byteLength;
    if (byteLength > maxBytes) {
      try { await reader.cancel(); } catch { /* bounded failure */ }
      throw new ProviderResponseTooLarge();
    }
    chunks.push(next.value);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
  return { value: JSON.parse(text) as unknown, byteLength };
}

function mapUsage(raw: unknown): LlmTokenUsage | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const usage = raw as Record<string, unknown>;
  const details = usage.prompt_tokens_details;
  return normalizeTokenUsage({
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    ...(details !== null && typeof details === "object" && !Array.isArray(details)
      ? { cachedInputTokens: (details as Record<string, unknown>).cached_tokens }
      : {}),
  });
}

/**
 * Uses the existing OpenAI-compatible settings and encrypted credential owner,
 * but a separate function-call protocol. There are no automatic retries and
 * non-tool response content (including hidden reasoning) is discarded.
 */
export function createOpenAiArenaToolCallProvider(input: {
  settings: CoachProviderConfig | null;
  credentials: Pick<ProviderCredentials, "readKey">;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): ArenaToolCallProvider {
  const parsed = OpenAiCoachProviderConfigSchema.safeParse(input.settings);
  const settings = parsed.success ? parsed.data : null;
  const timeoutMs = input.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("arena_provider_timeout_invalid");
  }

  return Object.freeze({
    descriptor: () => ({
      providerId: "openai-compatible" as const,
      model: settings?.modelName ?? "unconfigured",
      protocolVersion: "arena-function-call/v1" as const,
    }),
    async request(rawRequest: ArenaProviderRequest, parentSignal: AbortSignal): Promise<ArenaToolCallProviderResult> {
      const checked = ArenaProviderRequestSchema.safeParse(rawRequest);
      if (!checked.success) return { status: "provider_error" };
      if (settings === null) return { status: "provider_unavailable" };
      if (parentSignal.aborted) return { status: "cancelled" };

      const requestBody = {
        model: settings.modelName,
        messages: checked.data.messages.map((message) => {
          if (message.role === "assistant") {
            return {
              role: "assistant",
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: call.arguments },
              })),
            };
          }
          if (message.role === "tool") {
            return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
          }
          return { role: message.role, content: message.content };
        }),
        tools: checked.data.tools,
        tool_choice: "required",
        parallel_tool_calls: false,
        temperature: 0,
        max_tokens: checked.data.maxOutputTokens,
        stream: false,
      };
      const body = JSON.stringify(requestBody);
      if (Buffer.byteLength(body, "utf8") > checked.data.maxInputBytes || checked.data.maxInputBytes > ARENA_PROVIDER_MAX_INPUT_BYTES) return { status: "input_too_large" };

      let key: string | null;
      try { key = await input.credentials.readKey(); } catch { key = null; }
      if (key === null) return { status: "provider_unavailable" };

      const controller = new AbortController();
      let abortStatus: "timeout" | "cancelled" | null = null;
      const onParentAbort = () => {
        abortStatus = "cancelled";
        controller.abort();
      };
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
      if (parentSignal.aborted) onParentAbort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abortPromise = new Promise<never>((_resolve, reject) => {
        const rejectAbort = () => reject(new ProviderAbort(abortStatus ?? "cancelled"));
        if (controller.signal.aborted) rejectAbort();
        else controller.signal.addEventListener("abort", rejectAbort, { once: true });
      });
      const send = async (): Promise<ArenaToolCallProviderResult> => {
        try {
          const response = await input.fetchImpl(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body,
          });
          if (!response.ok) {
            await cancelBody(response);
            return { status: response.status === 401 || response.status === 403 ? "provider_unavailable" : "provider_error" };
          }
          const decoded = await readBoundedJson(response, Math.min(checked.data.maxOutputBytes, ARENA_PROVIDER_MAX_OUTPUT_BYTES));
          const raw = decoded.value;
          if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { status: "provider_error" };
          const envelope = raw as Record<string, unknown>;
          const choices = envelope.choices;
          if (!Array.isArray(choices) || choices.length !== 1 || choices[0] === null || typeof choices[0] !== "object") {
            return { status: "provider_error" };
          }
          const choice = choices[0] as Record<string, unknown>;
          const message = choice.message;
          if (choice.finish_reason !== "tool_calls" || message === null || typeof message !== "object") {
            return { status: "provider_error" };
          }
          const calls = (message as Record<string, unknown>).tool_calls;
          if (!Array.isArray(calls) || calls.length !== 1 || calls[0] === null || typeof calls[0] !== "object") {
            return { status: "provider_error" };
          }
          const fn = (calls[0] as Record<string, unknown>).function;
          if (fn === null || typeof fn !== "object") return { status: "provider_error" };
          const functionFields = fn as Record<string, unknown>;
          if (typeof functionFields.name !== "string" || typeof functionFields.arguments !== "string") {
            return { status: "provider_error" };
          }
          const call = { name: functionFields.name, arguments: functionFields.arguments };
          const validCall = z.object({ name: z.string().regex(TOOL_NAME), arguments: z.string().max(Math.min(checked.data.maxOutputBytes, ARENA_PROVIDER_MAX_OUTPUT_BYTES)) }).strict().safeParse(call);
          if (!validCall.success) return { status: "output_too_large" };
          const usage = mapUsage(envelope.usage);
          return usage === undefined
            ? { status: "ready", call: validCall.data, outputBytes: decoded.byteLength }
            : { status: "ready", call: validCall.data, outputBytes: decoded.byteLength, usage };
        } catch (error) {
          if (error instanceof ProviderResponseTooLarge) return { status: "output_too_large" };
          if (abortStatus === "timeout") return { status: "timeout" };
          if (abortStatus === "cancelled" || parentSignal.aborted) return { status: "cancelled" };
          return { status: "provider_error" };
        }
      };

      try {
        timer = setTimeout(() => {
          abortStatus = "timeout";
          controller.abort();
        }, timeoutMs);
        return await Promise.race([send(), abortPromise]);
      } catch (error) {
        if (error instanceof ProviderAbort) return { status: error.status };
        return { status: "provider_error" };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        parentSignal.removeEventListener("abort", onParentAbort);
        key = null;
      }
    },
  });
}
