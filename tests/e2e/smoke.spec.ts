/**
 * E2E スモークテスト — 「サイトが起動している」最小限の検証
 *
 * 詳細な UI 自動化（フォーム入力・admin ログイン）は別途段階的に実装。
 * 当面これだけが CI でグリーンを担保するためのスモーク。
 */
import { test, expect } from "@playwright/test";

test.describe("スモークテスト", () => {
  test("トップページが表示される", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/専門学校|出願|入学/);
  });

  test("出願ページが表示される", async ({ page }) => {
    const response = await page.goto("/apply");
    expect(response?.status()).toBe(200);
  });

  test("出願状況確認ページが表示される", async ({ page }) => {
    const response = await page.goto("/apply/status");
    expect(response?.status()).toBe(200);
  });

  test("管理画面（ログイン画面）が表示される", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);
    // パスワード input が存在する（ログインフォーム）
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  test("/api/health が ok を返す", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  test("/api/apply/settings が認証なしで取得できる（公開）", async ({ request }) => {
    const res = await request.get("/api/apply/settings");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.enrollmentYears)).toBe(true);
    expect(body.enrollmentYears.length).toBeGreaterThan(0);
  });

  test("/api/admin/settings は認証なしで弾かれる", async ({ request }) => {
    const res = await request.get("/api/admin/settings");
    expect([401, 403]).toContain(res.status());
  });
});
