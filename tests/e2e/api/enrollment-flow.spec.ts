/**
 * API テスト: 合格者の入学手続きが最後まで「完了」できることを守る。
 *
 * 合格 → 案内公開(案内済み) → 学生が閲覧・署名 → 管理者が学費確認・校方確認/許可書発行
 *      → 学生が完了報告(完了 + completedAt) までを一気通貫で検証する。
 *   ※ この後の「学生化(students/enroll)」は別フロー(校・クラス割当が必要)なので対象外。
 *      ただし students/enroll は completedAt を必須とするため、ここで completedAt が
 *      確実に立つことが、最終ステップの前提を満たすことの担保になる。
 *
 * CSRF は「管理者トークン保有時のみ」強制(middleware)。テストは admin ログイン後に
 * 同一コンテキストで学生エンドポイントも叩くため、全 mutation に X-CSRF-Token を付ける
 * (ルート側は applicationNo+email の本人確認で動くので admin cookie 併存でも挙動は同じ)。
 */
import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const applicant = {
  lastName: "入学", firstName: "手続",
  lastNameKana: "ニュウガク", firstNameKana: "テツヅキ",
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

test.describe("入学手続きが最後まで完了できる", () => {
  test("合格→案内公開→署名→学費/校方確認→学生が完了報告(完了+completedAt)", async ({ request }) => {
    // 1. 出願作成（公開・CSRF不要）
    const email = `enroll-${Date.now()}@example.com`;
    const create = await request.post("/api/applications", { data: { ...applicant, email } });
    expect(create.status()).toBe(201);
    const { id, applicationNo } = await create.json();

    // 2. 管理者ログイン（CSRFトークン取得）
    const csrf = await adminCsrf(request);
    if (!csrf) test.skip(true, "admin seed が無い");
    const H = { "X-CSRF-Token": csrf! };

    // 3. 合格にする
    const pass = await request.patch(`/api/applications/${id}`, { headers: H, data: { status: "合格" } });
    expect(pass.ok(), `合格化が失敗: ${pass.status()} ${await pass.text()}`).toBeTruthy();

    // 4. 入学手続きを公開（→ 案内済み）
    const publish = await request.post("/api/enrollment", {
      headers: H,
      data: {
        applicationId: id, publish: true,
        instructions: "入学手続きのご案内です。期日までに学費納入と書類提出をお願いします。",
        tuitionAmount: "500000", tuitionBankInfo: "○○銀行 新宿支店 普通 1234567",
      },
    });
    expect(publish.ok(), `公開が失敗: ${publish.status()} ${await publish.text()}`).toBeTruthy();
    expect((await publish.json()).procedure.status).toBe("案内済み");

    // 5. 学生が手続き内容を閲覧できる
    const view = await request.get(
      `/api/enrollment?applicationNo=${encodeURIComponent(applicationNo)}&email=${encodeURIComponent(email)}`,
    );
    expect(view.ok(), `学生の閲覧が失敗: ${view.status()}`).toBeTruthy();

    // 6. 学生が誓約書に署名
    const sign = await request.post("/api/enrollment/signature", {
      headers: H,
      data: { applicationNo, email, signatureData: "data:image/png;base64,iVBORw0KGgo=", signerName: "入学 手続" },
    });
    expect(sign.ok(), `署名が失敗: ${sign.status()} ${await sign.text()}`).toBeTruthy();

    // 7. 管理者: 学費入金を確認
    const tuition = await request.post("/api/enrollment", {
      headers: H, data: { applicationId: id, tuitionPaid: true },
    });
    expect(tuition.ok(), `学費確認が失敗: ${tuition.status()}`).toBeTruthy();

    // 8. 管理者: 校方確認 + 入学許可書発行
    const confirm = await request.post("/api/enrollment/confirm", {
      headers: H, data: { applicationId: id, action: "confirm" },
    });
    expect(confirm.ok(), `校方確認/許可書発行が失敗: ${confirm.status()} ${await confirm.text()}`).toBeTruthy();

    // 9. 学生: 完了報告 → 完了 + completedAt
    const complete = await request.patch("/api/enrollment", {
      headers: H, data: { applicationNo, email, markComplete: true },
    });
    expect(complete.ok(), `完了報告が失敗: ${complete.status()} ${await complete.text()}`).toBeTruthy();
    const proc = (await complete.json()).procedure;
    expect(proc.status).toBe("完了");
    expect(proc.completedAt).toBeTruthy();
  });
});
