/**
 * API テスト: 管理操作が操作ログに記録され、閲覧は最高管理者・管理者のみ。
 *  - ステータス変更 → /api/admin/audit-logs に operator/action/target 付きで出る。
 *  - ページサイズは50。
 *  - 未ログインでは閲覧不可(403)。
 */
import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const applicant = {
  lastName: "監査", firstName: "太郎",
  lastNameKana: "カンサ", firstNameKana: "タロウ",
  birthDate: "2003-04-15", gender: "男性", nationality: "中国",
  japaneseLevel: "N2", phone: "09012345678",
  postalCode: "1234567", prefecture: "東京都", city: "新宿区", address: "1-2-3",
  schoolName: "中央ゼミナール", department: "大学受験科",
  enrollmentYear: "2026", enrollmentMonth: "4", applicantType: "foreign",
};

async function adminCsrf(request: APIRequestContext): Promise<string | null> {
  const res = await request.post("/api/admin/login", {
    data: { username: "admin", password: "TestAdmin2026!" },
  });
  if (!res.ok()) return null;
  return (await res.json()).csrfToken as string;
}

test.describe("操作ログ /api/admin/audit-logs", () => {
  test("ステータス変更が操作者・操作・対象付きで記録される", async ({ request }) => {
    const email = `audit-${Date.now()}@example.com`;
    const create = await request.post("/api/applications", { data: { ...applicant, email, status: "書類待ち" } });
    expect(create.status()).toBe(201);
    const { id, applicationNo } = await create.json();

    const csrf = await adminCsrf(request);
    if (!csrf) test.skip(true, "admin seed が無い");
    const H = { "X-CSRF-Token": csrf! };

    const status = await request.patch(`/api/applications/${id}`, { headers: H, data: { status: "保留" } });
    expect(status.ok(), `ステータス変更失敗: ${status.status()}`).toBeTruthy();

    const res = await request.get(
      `/api/admin/audit-logs?action=${encodeURIComponent("application.status")}&search=${encodeURIComponent(applicationNo)}`,
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.pageSize).toBe(50);
    const entry = (body.logs ?? []).find((l: { targetId: string | null }) => l.targetId === id);
    expect(entry, "ステータス変更が記録されていない").toBeTruthy();
    expect(entry.action).toBe("application.status");
    expect(entry.actorName).toBeTruthy();
    expect(entry.summary).toContain("保留");
  });

  test("未ログインでは操作ログを閲覧できない", async ({ playwright }) => {
    // cookie を持たない新規コンテキストで叩く（共有 request だと前テストの admin cookie が残るため）。
    const ctx = await playwright.request.newContext({ baseURL: process.env.BASE_URL || "http://localhost:3070" });
    const res = await ctx.get("/api/admin/audit-logs");
    // middleware が未ログインの /api/admin/* を 401、権限不足は route が 403。どちらでも「閲覧不可」。
    expect([401, 403]).toContain(res.status());
    await ctx.dispose();
  });
});
