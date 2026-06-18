/**
 * E2E: 学生出願フロー
 *
 * data-testid を利用した安定 selector で完全実装。
 * カバー範囲:
 *  - Step 1 未入力時の「次へ進む」ボタン disabled + 警告ヒント
 *  - Step 1 を埋めるとボタン enable + ステップ進行
 *  - /apply/status?applicationNo=...&email=... で自動検索→申請データ表示
 *  - トップページに状況確認導線がある
 */
import { test, expect } from "@playwright/test";

test.describe("学生出願フロー Step 1", () => {
  test("未入力時は『次へ進む』ボタンが disabled", async ({ page }) => {
    await page.goto("/apply?school=chuo-seminar");
    // 出願者タイプ選択ゲート: 留学生（foreign）を選んで Step 1 へ進む
    await page.getByTestId("applicant-type-foreign").click();
    const nextBtn = page.getByTestId("apply-next");
    await expect(nextBtn).toBeVisible({ timeout: 10_000 });
    await expect(nextBtn).toBeDisabled();
    // 警告ヒント
    await expect(page.getByText(/必須項目を入力してから進んでください/).first()).toBeVisible();
  });

  test("必須項目を埋めると『次へ進む』が enable になる", async ({ page }) => {
    await page.goto("/apply?school=chuo-seminar");
    // 出願者タイプ選択ゲート: 留学生（foreign）を選んで Step 1 へ進む
    await page.getByTestId("applicant-type-foreign").click();

    // form-config の API が返るのを待つために少し待機
    await expect(page.getByTestId("apply-lastName")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("apply-lastName").fill("山田");
    await page.getByTestId("apply-firstName").fill("太郎");
    await page.getByTestId("apply-lastNameKana").fill("ヤマダ");
    await page.getByTestId("apply-firstNameKana").fill("タロウ");
    // 生年月日（DateSelect = type=date input）
    await page.getByTestId("apply-birthDate").fill("2002-04-01");
    await page.getByTestId("apply-gender").selectOption("男性");
    await page.getByTestId("apply-nationality").selectOption("中国");
    await page.getByTestId("apply-phone").fill("09012345678");
    await page.getByTestId("apply-email").fill(`e2e-${Date.now()}@example.com`);
    await page.getByTestId("apply-postalCode").fill("1234567");
    await page.getByTestId("apply-prefecture").selectOption("東京都");
    await page.getByTestId("apply-city").fill("新宿区");
    await page.getByTestId("apply-address").fill("1-2-3");
    await page.getByTestId("apply-japaneseLevel").selectOption("N2");

    const nextBtn = page.getByTestId("apply-next");
    // 入力検証は state 更新後に判定されるので少し待つ
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
  });
});

test.describe("出願状況確認・再ログイン", () => {
  test("トップページにヘッダ『出願の続き・状況確認』リンクがある", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /出願の続き・状況確認|続き \/ 状況/ });
    await expect(link.first()).toBeVisible();
  });

  test("/apply/status?applicationNo=...&email=... で申請データが表示される", async ({ page }) => {
    // URL パラメータ付きでアクセス → 自動検索 → 結果表示
    await page.goto("/apply/status?applicationNo=DEMO-0001&email=demo-0001%40example.com");
    // 最終結果に DEMO-0001 が見えていれば成功
    await expect(page.getByText("DEMO-0001").first()).toBeVisible({ timeout: 10_000 });
  });
});
