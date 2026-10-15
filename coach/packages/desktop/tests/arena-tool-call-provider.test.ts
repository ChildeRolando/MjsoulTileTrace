import { describe, expect, it } from "vitest";
import {
  createOpenAiArenaToolCallProvider,
} from "../src/llm-provider/arena-tool-call.js";
import type { ArenaProviderRequest } from "../src/blind-discard-arena-provider.js";

const KEY = "sk-arena-test-secret";
const SETTINGS = { baseUrl: "https://provider.example.test/v1", modelName: "tool-model-v1" };

function request(overrides: Partial<ArenaProviderRequest> = {}): ArenaProviderRequest {
  return {
    messages: [
      { role: "system", content: "Use only the offered tools." },
      { role: "user", content: "Blind observation JSON: {}" },
    ],
    tools: [{
      type: "function",
      function: {
        name: "submit_decision",
        description: "Lock a final choice.",
        parameters: {
          type: "object",
          properties: { actionRef: { type: "string", enum: ["discard:1m:tedashi"] } },
          required: ["actionRef"],
          additionalProperties: false,
        },
        strict: true,
      },
    }],
    maxOutputTokens: 300,
    maxInputBytes: 64 * 1024,
    maxOutputBytes: 16 * 1024,
    ...overrides,
  };
}

function okResponse(input: { content?: string; usage?: unknown } = {}): Response {
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: "tool_calls",
      message: {
        content: input.content ?? null,
        tool_calls: [{
          id: "call-secret-looking-provider-id",
          type: "function",
          function: { name: "submit_decision", arguments: JSON.stringify({ actionRef: "discard:1m:tedashi" }) },
        }],
      },
    }],
    ...(input.usage === undefined ? {} : { usage: input.usage }),
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Arena OpenAI-compatible tool-call provider", () => {
  it("sends only the isolated function-call request and discards non-tool response content", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const provider = createOpenAiArenaToolCallProvider({
      settings: SETTINGS,
      credentials: { readKey: async () => KEY },
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return okResponse({ content: "hidden chain-of-thought must never be persisted", usage: { prompt_tokens: 20, completion_tokens: 7, total_tokens: 27 } });
      },
    });
    const result = await provider.request(request({ maxOutputTokens: 8192 }), new AbortController().signal);

    expect(capturedUrl).toBe("https://provider.example.test/v1/chat/completions");
    expect(capturedInit?.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toMatchObject({ tool_choice: "required", parallel_tool_calls: false, temperature: 0, max_tokens: 8192, stream: false });
    expect(body.tools[0].function.strict).toBe(true);
    expect(body.messages[0]).toEqual({ role: "system", content: "Use only the offered tools." });
    expect(body).not.toHaveProperty("response_format");
    expect(result).toMatchObject({
      status: "ready",
      call: { name: "submit_decision", arguments: JSON.stringify({ actionRef: "discard:1m:tedashi" }) },
      usage: { inputTokens: 20, outputTokens: 7, totalTokens: 27 },
    });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain("hidden chain-of-thought");
    expect(JSON.stringify(result)).not.toContain("call-secret-looking-provider-id");
  });

  it("bounds both request and response bytes without retrying or retaining provider prose", async () => {
    let fetchCount = 0;
    const provider = createOpenAiArenaToolCallProvider({
      settings: SETTINGS,
      credentials: { readKey: async () => KEY },
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response("x".repeat(2_000), { status: 200 });
      },
    });
    const inputExceeded = await provider.request(request({ maxInputBytes: 10 }), new AbortController().signal);
    expect(inputExceeded).toEqual({ status: "input_too_large" });
    expect(fetchCount).toBe(0);

    const outputExceeded = await provider.request(request({ maxOutputBytes: 100 }), new AbortController().signal);
    expect(outputExceeded).toEqual({ status: "output_too_large" });
    expect(fetchCount).toBe(1);
    expect(JSON.stringify(outputExceeded)).not.toContain("x".repeat(100));
  });

  it("reports cancellation, timeout, unavailable credentials, and provider errors distinctly", async () => {
    const missing = createOpenAiArenaToolCallProvider({
      settings: SETTINGS,
      credentials: { readKey: async () => null },
      fetchImpl: async () => { throw new Error("should_not_fetch"); },
    });
    expect(await missing.request(request(), new AbortController().signal)).toEqual({ status: "provider_unavailable" });

    const controller = new AbortController();
    const cancelled = createOpenAiArenaToolCallProvider({
      settings: SETTINGS,
      credentials: { readKey: async () => KEY },
      fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
      timeoutMs: 1000,
    });
    const cancelledRun = cancelled.request(request(), controller.signal);
    controller.abort();
    expect(await cancelledRun).toEqual({ status: "cancelled" });

    const timedOut = createOpenAiArenaToolCallProvider({
      settings: SETTINGS,
      credentials: { readKey: async () => KEY },
      fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
      timeoutMs: 5,
    });
    expect(await timedOut.request(request(), new AbortController().signal)).toEqual({ status: "timeout" });

    let calls = 0;
    const failed = createOpenAiArenaToolCallProvider({
      settings: SETTINGS,
      credentials: { readKey: async () => KEY },
      fetchImpl: async () => { calls += 1; return new Response("private upstream error", { status: 503 }); },
    });
    expect(await failed.request(request(), new AbortController().signal)).toEqual({ status: "provider_error" });
    expect(calls).toBe(1);
  });
});
