/**
 * API テスト: 学生の出願フローが「壊れない」ことを守る。
 *  - GET /api/apply/schools : 志望校が取得できる（空だと誰も出願できない）
 *  - POST /api/applications → /submit : 作成（下書き）から最終送信までの正常系 + 本人確認
 *  - POST /api/upload : 入力検証（不正なリクエストは弾く）
 *
 * いずれも Playwright の request fixture（ブラウザ非依存）で安定して検証する。
 * 受付期間（開いている cohort が必要）は、作成が 201 になること自体が間接的なチェックになる。
 */
import { test, expect } from "@playwright/test";

const baseApplicant = {
  lastName: "テスト姓",
  firstName: "テスト名",
  lastNameKana: "テストセイ",
  firstNameKana: "テストメイ",
  birthDate: "2003-04-15",
  gender: "男性",
  nationality: "中国",
  japaneseLevel: "N2",
  phone: "09012345678",
  postalCode: "1234567",
  prefecture: "東京都",
  city: "新宿区",
  address: "1-2-3",
  schoolName: "中央ゼミナール",
  department: "大学受験科",
  enrollmentYear: "2026",
  enrollmentMonth: "4",
  applicationReason: "",
  lastSchoolName: "",
  lastSchoolCountry: "",
  lastSchoolGraduate: "",
  applicantType: "foreign",
};

test.describe("GET /api/apply/schools", () => {
  test("有効な志望校を取得できる（空でない）", async ({ request }) => {
    const res = await request.get("/api/apply/schools");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const schools = Array.isArray(body) ? body : (body.schools ?? body.data);
    expect(Array.isArray(schools)).toBe(true);
    // 0 校だと出願ポータルで誰も志望校を選べず、出願が成立しない。
    expect(schools.length).toBeGreaterThan(0);
    for (const s of schools) {
      expect(typeof s.schoolKey).toBe("string");
      expect(Array.isArray(s.departments)).toBe(true);
    }
  });
});

test.describe("出願の作成（下書き）→最終送信", () => {
  test("下書き作成(201)後、本人メールで送信すると受付中になる", async ({ request }) => {
    const email = `apiflow-${Date.now()}@example.com`;
    const create = await request.post("/api/applications", {
      data: { ...baseApplicant, email, status: "書類待ち" },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    expect(created.id).toBeTruthy();

    const submit = await request.post(`/api/applications/${created.id}/submit`, {
      data: { email },
    });
    expect(submit.ok()).toBeTruthy();
    const submitted = await submit.json();
    expect(submitted.status).toBe("受付中");
  });

  test("他人のメールでは最終送信できない(403)", async ({ request }) => {
    const email = `apiflow-deny-${Date.now()}@example.com`;
    const create = await request.post("/api/applications", {
      data: { ...baseApplicant, email, status: "書類待ち" },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();

    const submit = await request.post(`/api/applications/${created.id}/submit`, {
      data: { email: "intruder@example.com" },
    });
    expect(submit.status()).toBe(403);
  });

  test("日本人(日本語レベル空)でも作成できる", async ({ request }) => {
    // schema 修正の回帰ガード: 日本人は japaneseLevel を空で送るが 201 になるべき。
    const email = `apiflow-jp-${Date.now()}@example.com`;
    const create = await request.post("/api/applications", {
      data: { ...baseApplicant, email, applicantType: "japanese", japaneseLevel: "", residenceStatus: "", residenceExpiry: "", status: "書類待ち" },
    });
    expect(create.status()).toBe(201);
  });
});

test.describe("POST /api/upload 入力検証", () => {
  test("ファイル未選択は400", async ({ request }) => {
    const res = await request.post("/api/upload", {
      multipart: { docType: "パスポート" },
    });
    expect(res.status()).toBe(400);
  });

  test("不正な書類種別(パストラバーサル)は400", async ({ request }) => {
    const res = await request.post("/api/upload", {
      multipart: {
        docType: "../../etc/passwd",
        file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      },
    });
    expect(res.status()).toBe(400);
  });
});
