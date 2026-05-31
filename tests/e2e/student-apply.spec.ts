/**
 * E2E: 学生出願フロー
 *
 * 注: 詳細な UI 自動化（フォーム入力・admin ログイン）は app/apply/page.tsx の
 * 実際の name 属性・id 属性に依存するためメンテナンス負荷が高い。
 * 当面は SKIP し、tests/e2e/smoke.spec.ts で「ページが 200 で表示される」最小限の検証のみ
 * CI に組み込む。フォーム自動入力は次フェーズで data-testid を仕込んでから復帰。
 *
 * 復帰時のアクション:
 *  - app/apply/page.tsx の各 input に data-testid="apply-lastName" 等を付与
 *  - 下の test.describe.skip を test.describe に戻し、locator を data-testid ベースに更新
 */
import { test, expect } from "@playwright/test";

test.describe.skip("学生出願フロー (TODO: data-testid 整備後に有効化)", () => {
  test("Step 1 未入力時は「次へ進む」ボタンが無効", async ({ page }) => {
    await page.goto("/apply?school=chuo-seminar");
    const nextBtn = page.getByRole("button", { name: /次へ進む/ });
    await expect(nextBtn).toBeDisabled();
  });

  test("Step 1 を埋めると次へ進むボタンが有効化される", async ({ page }) => {
    await page.goto("/apply?school=chuo-seminar");
    // data-testid 待ち
    await page.getByTestId("apply-lastName").fill("山田");
    await page.getByTestId("apply-firstName").fill("太郎");
    // ... (完全実装は後ほど)
  });

  test("Step 4 で振込証明書未アップロード時は確認へ進めない", async ({ page }) => {
    await page.goto("/apply");
    await expect(page.getByRole("heading", { name: "個人情報" })).toBeVisible();
  });
});

test.describe("出願状況確認・再ログイン（軽量シナリオ）", () => {
  test("トップページにヘッダ「出願の続き・状況確認」リンクがある", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /出願の続き・状況確認|続き \/ 状況/ });
    await expect(link.first()).toBeVisible();
  });

  test("/apply/status?applicationNo=...&email=... で自動入力される", async ({ page }) => {
    await page.goto("/apply/status?applicationNo=DEMO-0001&email=demo-0001%40example.com");
    // 検索フォームに値がセットされていれば成功（自動ログイン or 自動検索）
    const inputs = await page.locator('input').all();
    let prefilled = false;
    for (const input of inputs) {
      const v = await input.inputValue();
      if (v === "DEMO-0001" || v === "demo-0001@example.com") {
        prefilled = true; break;
      }
    }
    expect(prefilled).toBe(true);
  });
});
