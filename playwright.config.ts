import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 設定
 *
 * - tests/e2e/ 配下の UI 自動化テスト
 * - tests/e2e/api/ 配下の API テスト（Playwright の request fixture を使用）
 * - npm run dev を自動起動（テスト用 DB を使用）
 *
 * 環境変数 BASE_URL でリモート（例: http://160.16.132.198）も指定可能。
 * CI 環境 (process.env.CI) では失敗時に video / trace を保存し、リトライ 2 回。
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3070";
const useLocalServer = !process.env.BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // 共有 DB のためシリアル
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["json", { outputFile: "playwright-report/results.json" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
    actionTimeout: 8_000,
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // 必要に応じて mobile も追加可能
    // { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],

  // ローカルテスト時は dev サーバーを自動起動。db push → admin seed → demo seed の順。
  // テストが依存する admin / DEMO-* のデータを確実に作る。
  webServer: useLocalServer
    ? {
        command:
          "npx prisma db push --skip-generate --accept-data-loss && " +
          "npx tsx prisma/seed.ts && " +
          "SEED_DEMO=1 npx tsx prisma/demo-seed.ts && " +
          "npm run dev -- -p 3070",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          NODE_ENV: "development",
          // Postgres。CI は job env で DATABASE_URL/DIRECT_URL を渡す。ローカルは既定値。
          DATABASE_URL:
            process.env.DATABASE_URL ||
            "postgresql://postgres@localhost:5433/compass_e2e?sslmode=disable",
          DIRECT_URL:
            process.env.DIRECT_URL ||
            process.env.DATABASE_URL ||
            "postgresql://postgres@localhost:5433/compass_e2e?sslmode=disable",
          SESSION_SECRET: "test-session-secret-32chars-1234567890abcdef",
          CSRF_SECRET: "test-csrf-secret-32chars-1234567890abcdef",
          NEXT_PUBLIC_BASE_URL: BASE_URL,
          UPLOAD_DIR: "/tmp/senmon-test-uploads",
          SEED_ADMIN_USERNAME: "admin",
          SEED_ADMIN_PASSWORD: "TestAdmin2026!",
        },
      }
    : undefined,
});
