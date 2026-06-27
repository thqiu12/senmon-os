# Plan 2 Phase F — ルートのテナント化(route migration)

> 前提: Phase A/B/D/E 完了(列+backfill+隔離心臓 `tenantPrisma`+解決 `resolveOrgId`+会話 org)。
> 機構: `lib/tenant/with-tenant.ts`(`withTenant` ラッパ)+ `lib/tenant/scoped.ts`(`getTenantDb`)。

**Goal:** 全 staff/出願ルート(68/74 が prisma 直使用)を「org 文脈で包み、`prisma` → `getTenantDb()`」に置換。これで隔離が**実際に効く**(現状は単一テナント=知日グループなので挙動は同じだが、以後テナント追加で安全)。

**最大・最リスクのフェーズ。** 本番のログイン/出願に影響。**分批 + 各批 e2e** で進める。**1 PR = 1 バッチ**。

## 機構(確定)

ルートは次の形に:
```ts
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";

export const GET = withTenant(async (req) => {
  const session = await getSession(req);      // 認証/認可は従来どおり
  if (!isAdmin(session)) return NextResponse.json({ error: "..." }, { status: 403 });
  const db = getTenantDb();                    // org スコープ済み
  return NextResponse.json(await db.application.findMany({ ... }));
});
```
- `withTenant` が `resolveOrgId`(user.org → host → 既定 chinichi)で org 文脈を確立。
- ハンドラ内の `prisma.X` を全て `db.X`(=`getTenantDb()`)に置換。
- 認証は**変えない**(各ハンドラの getSession/authz をそのまま)。

## スコープ外(tenant 化しない=base `prisma` のまま)

- **認証/ログイン** `app/api/admin/login`(誰か判明前=org 不明。user を username で引く)、`getSession`(token→user)。
- **横断/運営** 将来の PlatformAdmin 用テナント管理ルート(明示的に base prisma + `isPlatformAdmin` ガード)。
- **DB 不使用** `health`, `deploy-meta` 等。
> これらは「allowlist」として記録し、CI の生 prisma 検出(後述)から除外する。

## バッチ順(低リスク→高リスク。1 バッチ 1 PR、各批 e2e 必須)

1. **読み取り中心の後台** — `agents`, `interviewers`, `cohorts`, `announcements`, `schools`, `interview-feedback`(8 ルート程度)。影響小・検証容易。
2. **applications 系**(15) — 出願一覧/詳細/更新。出願管理の中核。e2e 厚め。
3. **prospects / documents**(10) — エージェント・書類。documents はファイル配信もスコープ。
4. **enrollment / students / timetable / attendance / homework / certificate / leave**(在籍系, ~13)。
5. **公開出願端 apply**(4)+ **student-portal**(4) — **未ログインで host/既定 org 解決**。出願フローを e2e で重点検証(申請番号・払先・書類)。
6. **admin 残り**(16 のうち allowlist 以外) — audit, form-config, payment 等。

## 各バッチの手順(TDD/検証)

- [ ] 対象ルート列挙: `grep -rl '@/lib/prisma' app/api/<module> --include=route.ts`
- [ ] 各ルート: `export const METHOD = withTenant(async (req, ctx) => { ... })` で包む + 本体の `prisma.` → `db.`(`const db = getTenantDb()`)。authz はそのまま。
- [ ] cross-tenant が必要な箇所が無いか確認(あれば base prisma + 理由をコメント)。
- [ ] ローカル: `npm run test:unit`(含 漏洩テスト)+ 該当 e2e。
- [ ] PR → CI 緑(unit/e2e/typecheck)→ マージ → 自動デプロイ → 本番 smoke(ログイン/該当機能)。

## 仕上げの強制(バッチ完了後)

- [ ] CI に「`app/api` 配下で allowlist 以外が生 `prisma.` を使っていたら fail」する grep チェックを追加(移行漏れ・将来の退行を防ぐ)。
  例: `grep -rn 'from "@/lib/prisma"' app/api --include=route.ts | grep -vf tenant-allowlist.txt` がヒットしたら exit 1。

## 完了後 → Phase C

全ルートが org を注入するようになって初めて、**Phase C(`organizationId` を必須化 + FK)** を安全に適用できる(create が必ず org を持つため NOT NULL 違反が起きない)。

## ロールバック

各バッチは独立 PR。問題が出たらそのバッチを revert(他バッチに影響なし)。隔離心臓・解決ヘルパは休眠のまま無害。
