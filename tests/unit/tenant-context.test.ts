import { describe, it, expect } from "vitest";
import { runWithTenant, currentOrgId, isPlatform, requireOrgId } from "@/lib/tenant/context";

describe("tenant context", () => {
  it("文脈内で orgId が読める / 文脈外は null", () => {
    expect(currentOrgId()).toBeNull();
    runWithTenant({ organizationId: "org_1" }, () => {
      expect(currentOrgId()).toBe("org_1");
      expect(requireOrgId()).toBe("org_1");
      expect(isPlatform()).toBe(false);
    });
    expect(currentOrgId()).toBeNull();
  });

  it("isPlatform フラグが伝わる", () => {
    runWithTenant({ organizationId: "org_x", isPlatform: true }, () => {
      expect(isPlatform()).toBe(true);
    });
  });

  it("文脈外の requireOrgId は throw", () => {
    expect(() => requireOrgId()).toThrow();
  });
});
