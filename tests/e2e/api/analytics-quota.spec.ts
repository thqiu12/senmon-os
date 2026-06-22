/**
 * API テスト: 分析・予測 / 定員 が FK優先集計でも 200 + 期待の形で返る（実行時エラーの回帰ガード）。
 */
import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

async function adminLogin(request: APIRequestContext): Promise<boolean> {
  const res = await request.post("/api/admin/login", {
    data: { username: "admin", password: "TestAdmin2026!" },
  });
  return res.ok();
}

test.describe("分析・予測 / 定員 API", () => {
  test("admin で analytics と quota が 200 + 期待の形で返る", async ({ request }) => {
    if (!(await adminLogin(request))) test.skip(true, "admin seed が無い");

    const a = await request.get("/api/admin/analytics");
    expect(a.ok(), `analytics: ${a.status()}`).toBeTruthy();
    const ab = await a.json();
    expect(Array.isArray(ab.forecast)).toBe(true);
    expect(Array.isArray(ab.channels)).toBe(true);

    const q = await request.get("/api/admin/quota");
    expect(q.ok(), `quota: ${q.status()}`).toBeTruthy();
    expect(Array.isArray(await q.json())).toBe(true);
  });
});
