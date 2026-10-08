import { describe, expect, it } from "vitest";
import { storagePlaygroundMarker } from "../src/storage-playground/marker.js";

describe("storagePlaygroundMarker", () => {
  it("returns the accepted storage-playground marker", () => {
    expect(storagePlaygroundMarker()).toBe("accepted");
  });
});
