import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("allows normal in-site paths", () => {
    expect(safeNextPath("/host/events?x=1")).toBe("/host/events?x=1");
  });
  it("rejects other sites and malformed values", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil", "", null, undefined]) {
      expect(safeNextPath(bad as string | null)).toBe("/host");
    }
  });
});
