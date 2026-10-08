import { describe, expect, it } from "vitest";
import { storagePlaygroundMarker } from "../src/storage-playground/marker.js";

describe("COAC-211 disposable storage lifecycle target", () => {
  it("returns the accepted marker required by the frozen playground specification", () => {
    expect(storagePlaygroundMarker()).toBe("accepted");
  });
});
