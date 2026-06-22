/**
 * API テスト: 受付中の回次があれば、申請番号は YY-回次-連番（選考管理のプレビュー形式）で採番され、
 * 旧形式フォールバック(APP-YYYYMMDD-…)にならないこと（#1 の回帰ガード）。
 */
import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const applicant = {
  lastName: "採番", firstName: "太郎",
  lastNameKana: "サイバン", firstNameKana: "タロウ",
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

test.describe("申請番号は開いている回次で採番", () => {
  test("受付中の回次があれば YY-回次-連番（APP-…でない）", async ({ request }) => {
    const csrf = await adminCsrf(request);
    if (!csrf) test.skip(true, "admin seed が無い");
    const H = { "X-CSRF-Token": csrf! };

    // 全校共通の受付中回次を用意（開いている）。
    const cohort = await request.post("/api/cohorts", {
      headers: H,
      data: {
        name: "採番テスト回", status: "受付中", year: 2026, round: 1,
        acceptStart: "2020-01-01T00:00:00.000Z", acceptEnd: "2099-01-01T00:00:00.000Z",
      },
    });
    expect(cohort.ok(), `回次作成失敗: ${cohort.status()} ${await cohort.text()}`).toBeTruthy();

    // admin ログイン済みコンテキストのため CSRF ヘッダを付与（出願作成自体は公開API）。
    const email = `appno-${Date.now()}@example.com`;
    const create = await request.post("/api/applications", { headers: H, data: { ...applicant, email } });
    expect(create.status()).toBe(201);
    const { applicationNo } = await create.json();

    // 例: 26-1-001。旧形式 APP-… ではないこと。
    expect(applicationNo, `実際の申請番号: ${applicationNo}`).toMatch(/^\d{2}-\d+-\d{3,}$/);
  });
});
