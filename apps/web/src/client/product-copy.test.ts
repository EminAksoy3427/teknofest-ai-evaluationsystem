import { describe, expect, it } from "vitest";

import { AI_CAPABILITY_NAME, PRODUCT_DESCRIPTOR, PRODUCT_NAME } from "./product-copy";

describe("product-facing identity", () => {
  it("keeps the platform wordmark and names the capability AI 3. Göz", () => {
    expect(PRODUCT_NAME).toBe("TEKNOFEST AI");
    expect(PRODUCT_DESCRIPTOR).toBe("Değerlendirme Platformu");
    expect(AI_CAPABILITY_NAME).toBe("AI 3. Göz");
    expect(AI_CAPABILITY_NAME).not.toContain("4. Göz");
  });
});
