import { describe, expect, it } from "vitest";
import { parseMortalReportResultUrl } from "../src/report-url.js";

describe("parseMortalReportResultUrl", () => {
  it("accepts the exact approved report endpoint", () => {
    expect(parseMortalReportResultUrl(
      "https://mjai.ekyu.moe/report/0123456789abcdef.json",
    )).toEqual({
      status: "valid",
      reportId: "0123456789abcdef",
      approvedHost: "mjai.ekyu.moe",
    });
  });

  it("rejects http, ports, userinfo, query, hash, and wrong hosts", () => {
    expect(parseMortalReportResultUrl(
      "http://mjai.ekyu.moe/report/0123456789abcdef.json",
    ).status).toBe("invalid");
    expect(parseMortalReportResultUrl(
      "https://mjai.ekyu.moe:443/report/0123456789abcdef.json",
    ).status).toBe("invalid");
    expect(parseMortalReportResultUrl(
      "https://user@mjai.ekyu.moe/report/0123456789abcdef.json",
    ).status).toBe("invalid");
    expect(parseMortalReportResultUrl(
      "https://mjai.ekyu.moe/report/0123456789abcdef.json?x=1",
    ).status).toBe("invalid");
    expect(parseMortalReportResultUrl(
      "https://mjai.ekyu.moe/report/0123456789abcdef.json#hash",
    ).status).toBe("invalid");
    expect(parseMortalReportResultUrl(
      "https://evil.example/report/0123456789abcdef.json",
    ).status).toBe("invalid");
  });

  it("rejects the viewer page and malformed report ids", () => {
    expect(parseMortalReportResultUrl(
      "https://mjai.ekyu.moe/killerducky/?data=/report/0123456789abcdef.json",
    ).status).toBe("invalid");
    expect(parseMortalReportResultUrl(
      "https://mjai.ekyu.moe/report/0123456789abcdeg.json",
    ).status).toBe("invalid");
    expect(parseMortalReportResultUrl(
      "https://mjai.ekyu.moe/report/0123456789abcdef",
    ).status).toBe("invalid");
  });

  it("rejects oversized and empty inputs", () => {
    expect(parseMortalReportResultUrl("").status).toBe("invalid");
    expect(parseMortalReportResultUrl(
      `https://mjai.ekyu.moe/report/0123456789abcdef.json?x=${"a".repeat(300)}`,
    ).status).toBe("invalid");
  });
});
