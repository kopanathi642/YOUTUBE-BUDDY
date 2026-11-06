import { describe, expect, it } from "vitest";
import { safeNext } from "./pages/Auth";

const O = "https://app.example.com";
describe("safeNext blocks open redirects after sign-in", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/edit/123?seq=4#t", O)).toBe("/edit/123?seq=4#t");
    expect(safeNext("/ai-generator/tool/001", O)).toBe("/ai-generator/tool/001");
  });
  it.each([null, "", "https://evil.com", "//evil.com", "/\\evil.com", "\\\\evil.com", "/\\/evil.com", "javascript:alert(1)", "/\tjavascript:x", "/%0a//evil.com".replace("%0a", "\n")])(
    "rejects %s", (raw) => { expect(safeNext(raw as string | null, O)).toBe("/universes"); });
});
