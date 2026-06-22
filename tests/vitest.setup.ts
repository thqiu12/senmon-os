/**
 * Vitest 共通セットアップ(Postgres)
 *
 * 戦略:
 *  - テスト DB は Postgres。接続は DATABASE_URL_BASE で渡す
 *    (CI: postgres サービス / ローカル: .env or インライン環境変数)。
 *  - ワーカー(プロセス)ごとに一意の schema(test_<pid>)を使い並列実行を隔離する
 *    (旧 SQLite の per-pid ファイル戦略を Postgres schema に置換)。
 *  - 同一プロセス内では beforeAll で 1 回だけ db push。
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { beforeAll } from "vitest";

// CI/ローカルの Postgres 接続(DB 名まで)。schema はここで付与する。
const BASE =
  process.env.DATABASE_URL_BASE ||
  "postgresql://postgres:postgres@localhost:5432/compass_test";
const SCHEMA = `test_${process.pid}`;
const URL = `${BASE}${BASE.includes("?") ? "&" : "?"}schema=${SCHEMA}`;

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = URL;
process.env.DIRECT_URL = URL; // provider=postgresql は directUrl 必須
process.env.SESSION_SECRET ??= "test-session-secret-32chars-1234567890abcdef";
process.env.CSRF_SECRET ??= "test-csrf-secret-32chars-1234567890abcdef";
process.env.UPLOAD_DIR = "/tmp/senmon-test-uploads";
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";

let dbPushed = false;

beforeAll(() => {
  if (dbPushed) return;
  mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });

  // 専用 schema を作り直してからスキーマ適用(実行ごとにクリーン)。
  // 各ワーカー専用 schema なので他ワーカーには影響しない。
  execSync(`npx prisma db execute --url "${URL}" --stdin`, {
    stdio: "pipe",
    input: `DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE; CREATE SCHEMA "${SCHEMA}";`,
  });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL },
  });

  dbPushed = true;
});
