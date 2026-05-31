/**
 * API テスト: 受験票 PDF 発行 (/api/documents/exam-ticket)
 *
 * 1. 認証情報なしで 400
 * 2. 受付中ステータスでは 403（seed 依存）
 * 3. (skip) 面接待ち + 試験日確定 → 200 + PDF — seed 整備後に有効化
 */
import { test, expect } from "@playwright/test";

test.describe("受験票 PDF 発行 (smoke)", () => {
  test("認証情報なしで 400", async ({ request }) => {
    const res = await request.get("/api/documents/exam-ticket");
    expect(res.status()).toBe(400);
  });

  test("受付中ステータスでは 403 (seed 依存)", async ({ request }) => {
    const res = await request.get(
      "/api/documents/exam-ticket?applicationNo=DEMO-0001&email=demo-0001%40example.com",
    );
    if (res.status() === 404) {
      test.skip(true, "DEMO-0001 が seed されていない");
    }
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("書類審査通過後");
  });
});

test.describe.skip("受験票 PDF 発行 (詳細, seed 整備後)", () => {
  test("placeholder", () => {});
});
