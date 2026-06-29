#!/usr/bin/env node
/**
 * テナント隔離ガード（退行防止）
 *
 * app/api 配下の route.ts が base prisma（`@/lib/prisma`）を直接 import していないことを検査する。
 * 新しいルートは必ず withTenant + getTenantDb()（= organizationId スコープ）を使うこと。
 *
 * 例外（allowlist）= org 文脈確立より前 / org に依存しない認証・本人性・死活のルートのみ:
 *   - app/api/admin/login/route.ts … ログイン（org はユーザーから確定するため、確定前は base）
 *   - app/api/admin/me/route.ts    … 本人性（session.userId による自分自身の取得）
 *
 * 新たに allowlist へ追加する場合は、なぜ org スコープ不要かを必ずコメントで説明すること。
 * lib 配下（resolveSchoolFk / verifyStudentOwnership / lib/settings 等）はこのガードの対象外
 * （別途の lib hardening 課題。呼び出し元ルートの org スコープ find が実質ゲートになっている）。
 *
 * 使い方: node scripts/check-route-tenant-isolation.mjs
 * 失敗時は exit code 1 + 違反ファイル一覧を出力。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_DIR = join(ROOT, "app", "api");

// org スコープ不要が確定しているルートのみ（理由はファイル冒頭コメント参照）
const ALLOWLIST = new Set([
  "app/api/admin/login/route.ts",
  "app/api/admin/me/route.ts",
]);

// base prisma の直接 import を検出（パスエイリアス/相対の両方）
const BASE_PRISMA_IMPORT = /from\s+["'](@\/lib\/prisma|\.\.?\/(?:\.\.\/)*lib\/prisma)["']/;

/** @param {string} dir @returns {string[]} */
function findRouteFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

const routeFiles = findRouteFiles(API_DIR);
/** @type {string[]} */
const offenders = [];

for (const file of routeFiles) {
  const rel = relative(ROOT, file).split("\\").join("/");
  if (ALLOWLIST.has(rel)) continue;
  const src = readFileSync(file, "utf8");
  if (BASE_PRISMA_IMPORT.test(src)) offenders.push(rel);
}

if (offenders.length > 0) {
  console.error(
    "\n❌ テナント隔離ガード: 以下のルートが base prisma を直接 import しています。\n" +
      "   withTenant + getTenantDb()（org スコープ）に移行するか、正当な理由があれば\n" +
      "   scripts/check-route-tenant-isolation.mjs の ALLOWLIST にコメント付きで追加してください。\n",
  );
  for (const o of offenders) console.error("   - " + o);
  console.error(
    `\n   違反 ${offenders.length} 件 / 検査 ${routeFiles.length} ルート\n`,
  );
  process.exit(1);
}

console.log(
  `✅ テナント隔離ガード: ${routeFiles.length} ルートを検査、base prisma の直接使用なし` +
    `（allowlist ${ALLOWLIST.size} 件を除く）。`,
);
