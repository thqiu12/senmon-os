/**
 * API テスト: /api/admin/settings + /api/apply/settings
 *
 * - 公開エンドポイントは常に検証
 * - 管理者エンドポイントは admin seed が走った前提。失敗時は skip。
 */
import { test, expect } from "@playwright/test";

async function tryLoginAsAdmin(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/admin/login", {
    data: { username: "admin", password: "TestAdmin2026!" },
  });
  if (!res.ok()) return null;
  const body = await res.json();
  return { csrfToken: body.csrfToken as string };
}

test.describe("/api/apply/settings (公開)", () => {
  test("認証なしで 200", async ({ request }) => {
    const res = await request.get("/api/apply/settings");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.enrollmentYears)).toBe(true);
    expect(body.enrollmentYears.length).toBeGreaterThan(0);
    expect(typeof body.enrollmentMonth).toBe("string");
  });
});

test.describe("/api/admin/settings (管理者)", () => {
  test("未認証は 4xx", async ({ request }) => {
    const res = await request.get("/api/admin/settings");
    expect([401, 403]).toContain(res.status());
  });

  test("admin で GET → 200", async ({ request }) => {
    const auth = await tryLoginAsAdmin(request);
    if (!auth) test.skip(true, "admin seed が走っていない");
    const res = await request.get("/api/admin/settings");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.enrollmentYears).toBeDefined();
  });

  test("PUT で enrollmentYears 更新 + 重複除去 + ソート", async ({ request }) => {
    const auth = await tryLoginAsAdmin(request);
    if (!auth) test.skip(true, "admin seed が走っていない");
    const res = await request.put("/api/admin/settings", {
      headers: { "X-CSRF-Token": auth!.csrfToken },
      data: { enrollmentYears: ["2028", "2026", "2026", "2027"] },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.enrollmentYears).toEqual(["2026", "2027", "2028"]);
  });

  test("4桁数字以外で zod 400", async ({ request }) => {
    const auth = await tryLoginAsAdmin(request);
    if (!auth) test.skip(true, "admin seed が走っていない");
    const res = await request.put("/api/admin/settings", {
      headers: { "X-CSRF-Token": auth!.csrfToken },
      data: { enrollmentYears: ["abc", "20a6"] },
    });
    expect(res.status()).toBe(400);
  });

  test("空配列で 400", async ({ request }) => {
    const auth = await tryLoginAsAdmin(request);
    if (!auth) test.skip(true, "admin seed が走っていない");
    const res = await request.put("/api/admin/settings", {
      headers: { "X-CSRF-Token": auth!.csrfToken },
      data: { enrollmentYears: [] },
    });
    expect(res.status()).toBe(400);
  });

  test("PUT 後、公開エンドポイントにも反映される", async ({ request }) => {
    const auth = await tryLoginAsAdmin(request);
    if (!auth) test.skip(true, "admin seed が走っていない");
    await request.put("/api/admin/settings", {
      headers: { "X-CSRF-Token": auth!.csrfToken },
      data: { enrollmentYears: ["2027", "2028", "2029"] },
    });
    const res = await request.get("/api/apply/settings");
    const body = await res.json();
    expect(body.enrollmentYears).toEqual(["2027", "2028", "2029"]);

    // 後始末
    await request.put("/api/admin/settings", {
      headers: { "X-CSRF-Token": auth!.csrfToken },
      data: { enrollmentYears: ["2026", "2027", "2028"] },
    });
  });
});
