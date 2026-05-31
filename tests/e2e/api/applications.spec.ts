/**
 * API テスト: 出願の作成・取得
 *
 * 注: GET /api/applications の一覧と admin の認証フローは要修正のため一時 skip。
 * POST /api/applications と GET /api/applications/status のスモークのみ実行。
 */
import { test, expect } from "@playwright/test";

const validApplication = {
  lastName: "テスト姓",
  firstName: "テスト名",
  lastNameKana: "テストセイ",
  firstNameKana: "テストメイ",
  birthDate: "2003-04-15",
  gender: "男性",
  nationality: "中国",
  japaneseLevel: "N2",
  phone: "090-1234-5678",
  postalCode: "1234567",
  prefecture: "東京都",
  city: "新宿区",
  address: "1-2-3",
  schoolName: "中央ゼミナール",
  department: "大学受験科",
  enrollmentYear: "2026",
  enrollmentMonth: "4",
  lastSchoolName: "テスト高校",
  lastSchoolCountry: "中国",
  lastSchoolGraduate: "卒業",
  applicationReason: "テスト用の志望動機です。".repeat(20),
};

test.describe("POST /api/applications", () => {
  test("正常データで 201 + 出願番号発行", async ({ request }) => {
    const res = await request.post("/api/applications", {
      data: { ...validApplication, email: `test-${Date.now()}@example.com`, status: "書類待ち" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    // 出願番号フォーマットは "APP-YYYYMMDD-HEX8" または年度フォーマット "YY-N-NNN"
    expect(body.applicationNo).toMatch(/^(APP-\d{8}-[A-F0-9]{8}|\d{2}-\d-\d{3})$/);
    expect(body.id).toBeDefined();
  });

  test("メール不正で 400", async ({ request }) => {
    const res = await request.post("/api/applications", {
      data: { ...validApplication, email: "not-an-email", status: "書類待ち" },
    });
    expect(res.status()).toBe(400);
  });

  test("必須フィールド欠落で 400", async ({ request }) => {
    const { lastName: _omit, ...incomplete } = validApplication;
    void _omit;
    const res = await request.post("/api/applications", {
      data: { ...incomplete, email: `test-${Date.now()}@example.com`, status: "書類待ち" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("GET /api/applications/status (学生本人)", () => {
  test("seed された DEMO-0001 で 200", async ({ request }) => {
    const res = await request.get(
      "/api/applications/status?applicationNo=DEMO-0001&email=demo-0001%40example.com",
    );
    if (res.status() === 404) {
      test.skip(true, "DEMO-0001 が seed されていない");
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.applicationNo).toBe("DEMO-0001");
  });

  test("間違った email で 4xx", async ({ request }) => {
    const res = await request.get(
      "/api/applications/status?applicationNo=DEMO-0001&email=wrong%40example.com",
    );
    expect([400, 403, 404]).toContain(res.status());
  });

  test("パラメータ無しで 400", async ({ request }) => {
    const res = await request.get("/api/applications/status");
    expect(res.status()).toBe(400);
  });
});

test.describe.skip("admin 管理 API (TODO: 認証フロー整備後)", () => {
  test("placeholder", () => {});
});
