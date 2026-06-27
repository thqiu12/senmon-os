# マルチテナント化 (Plan 2) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development または executing-plans でタスク単位に実装。ステップは `- [ ]` で追跡。
> **前提 spec:** `docs/superpowers/specs/2026-06-22-platform-core-multitenant-design.md`(設計確定済)。Plan 1(Postgres 移行)完了済。

**Goal:** Compass を単一テナントから「アプリ層で完全にテナント隔離されたマルチテナント」にする。`Organization` を隔離境界とし、全 DB アクセスを `organizationId` で自動スコープし、取りこぼし不能にする。

**Architecture:** ① `Organization` モデル + 全テナント対象テーブルに `organizationId`。② Prisma `$extends` で全クエリに `organizationId` を自動注入(主enforcement)。③ middleware でサブドメイン/カスタムドメインから org 解決 → AsyncLocalStorage で文脈注入。④ 認証をテナント対応(`AdminUser.organizationId` + PlatformAdmin)。RLS は Plan 3、R2 は Plan 4、モジュール枠は Plan 5。

**Tech Stack:** Next.js 14 App Router / Prisma 5.22 / Postgres(Supabase) / vitest + Playwright。

**安全方針(最重要):** スキーマ変更は**加法的・段階的**(nullable 追加 → backfill → 必須化)。各 Phase は単独で本番デプロイ可能。**クロステナント漏洩テストを CI 必須**にし、隔離の回帰を物理的に防ぐ。

---

## モデルのテナント分類(36 モデル)

**全 36 モデルがテナント対象**(各 org の自前データ)。`SystemSetting`/`AuditLog`/`AdminUser` も org 単位。グローバル例外は無い。
→ 全モデルに `organizationId` を付与。`Organization` 自身と将来の `PlatformAdmin` 系のみ非対象。

**Hojin(法人)グルーピング** は Plan 2 では `Organization.id` 直下に全校をぶら下げる最小形で進め、法人軸の分組は **Plan 2.5(後続)** に切り出す(隔離境界は Organization のみ。法人はレポート軸=非隔離なので急がない)。

---

## ファイル構成

- 作成: `lib/tenant/context.ts` — AsyncLocalStorage によるリクエスト文脈(orgId / isPlatform)
- 作成: `lib/tenant/prisma-tenant.ts` — `tenantPrisma(orgId)`(`$extends` 隔離の心臓)
- 作成: `lib/tenant/resolve.ts` — host/サブドメイン/カスタムドメイン → Organization 解決(キャッシュ付)
- 作成: `lib/tenant/scoped.ts` — ルートから使う `getTenantDb()`(文脈 org の scoped client を返す)
- 変更: `middleware.ts` — host から org slug を抽出しヘッダ注入(edge, DB アクセス無し)
- 変更: `prisma/schema.prisma` — `Organization` + 全モデルに `organizationId`(段階的)
- 作成: `prisma/migrations/*` — Phase A(nullable 追加)/ Phase C(必須化+FK+index)
- 作成: `prisma/backfill-organization.ts` — 既存全行を「知日グループ」org に backfill
- 変更: `lib/auth.ts` — `AdminUser.organizationId` 対応・ログインを org スコープに・PlatformAdmin
- 作成: `tests/unit/tenant-isolation.test.ts` — クロステナント漏洩テスト(CI 必須の肝)
- 変更: 各 API ルート — `prisma` 直使用 → `getTenantDb()` 経由へ(段階移行)

---

## Phase A — スキーマ加法(nullable で安全に追加)

### Task A1: Organization モデル + 全モデルに nullable organizationId

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Organization モデル追加**

```prisma
model Organization {
  id             String   @id @default(cuid())
  name           String
  slug           String   @unique                 // サブドメイン {slug}.compass.app
  customDomain   String?  @unique                  // 学生端カスタムドメイン
  plan           String   @default("pro")
  enabledModules String   @default("[\"admissions\",\"enrollment\"]") // JSON 配列(文字列)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

- [ ] **Step 2: 全テナント対象モデルに以下を追加(36 モデル、同一パターン)**

各モデルに:
```prisma
  organizationId String?                            // Phase A: nullable。Phase C で必須化
  @@index([organizationId])
```
(FK relation は Phase C でまとめて張る。Phase A は列 + index のみ=軽量・安全)

`AdminUser` には加えて:
```prisma
  isPlatformAdmin Boolean @default(false)           // true=テナント横断の運営者(あなた)
```
> 対象モデル一覧: AdminUser, Cohort, Interviewer, InterviewFeedback, Announcement, Application, ChangeRequest, Agent, Prospect, Document, AdminNote, EnrollmentProcedure, EnrollmentSignature, School, Course, Class, Subject, Teacher, Student, Timetable, TimetableSlot, Attendance, LeaveRequest, Homework, HomeworkSubmission, CertificateRequest, CalendarEvent, SchoolNotice, ChatMessage, ApplicationSchool, FormFieldConfig, ApplySchool, ApplyDepartment, SystemSetting, EnrollmentQuota, AuditLog。

- [ ] **Step 3: マイグレーション生成 + ローカル PG で適用**

Run: `npx prisma migrate dev --name add_organization_nullable`
Expected: 新マイグレーションが生成され、ローカル PG に適用成功。

- [ ] **Step 4: コミット**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(tenant): Organization モデル + 全モデルに nullable organizationId (Plan2 Phase A)"
```

> このマイグレーションは加法的 = 本番 `migrate deploy` で安全。**この時点で本番にデプロイしてよい**(旧コードは新列を無視)。

---

## Phase B — 既存データの backfill

### Task B1: 「知日グループ」org を作り全行を紐付け

**Files:** Create `prisma/backfill-organization.ts`

- [ ] **Step 1: backfill スクリプト(冪等)**

```ts
import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();
const SLUG = "chinichi";
const NAME = "知日グループ";

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: NAME, slug: SLUG },
  });
  let total = 0;
  for (const m of Prisma.dmmf.datamodel.models) {
    if (m.name === "Organization") continue;
    const delegate = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    // organizationId が null の行だけ更新(冪等)
    const r = await (prisma as any)[delegate].updateMany({
      where: { organizationId: null },
      data: { organizationId: org.id },
    });
    total += r.count;
    console.log(`${m.name}: ${r.count}`);
  }
  console.log(`\n✓ backfill 完了: org=${org.id}, ${total} 行`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: ローカル(seed 済 PG)で実行 + 検証**

Run: `npx tsx prisma/backfill-organization.ts`
Expected: 各モデルの件数が出て `✓ backfill 完了`。`organizationId IS NULL` の行が 0 になることを確認:
Run: `psql "$DATABASE_URL" -c "SELECT count(*) FROM \"Application\" WHERE \"organizationId\" IS NULL;"` → 0

- [ ] **Step 3: コミット**

```bash
git add prisma/backfill-organization.ts
git commit -m "feat(tenant): 既存データを知日グループ org に backfill するスクリプト (Plan2 Phase B)"
```

> **本番反映手順**: Phase A デプロイ後、本番で `npx tsx prisma/backfill-organization.ts` を一度実行(Phase C デプロイ前)。

---

## Phase C — organizationId 必須化 + FK

### Task C1: NOT NULL + FK relation + index

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: 全モデルの `organizationId String?` を必須 + relation に**

```prisma
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId])
```
`AdminUser` は PlatformAdmin が org 無しのため **nullable のまま**:
```prisma
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id])
```
`Organization` に各 back-relation を追加(`applications Application[]` 等)。

- [ ] **Step 2: マイグレーション生成 + 適用(backfill 済 DB に対して)**

Run: `npx prisma migrate dev --name organization_required_fk`
Expected: NOT NULL 化 + FK 追加が成功(backfill 済なので null 違反なし)。

- [ ] **Step 3: コミット**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(tenant): organizationId を必須化 + FK + index (Plan2 Phase C)"
```

> **本番反映の順序厳守**: Phase A デプロイ → 本番 backfill 実行 → **その後** Phase C デプロイ。順序を誤ると NOT NULL 違反で migrate 失敗(=デプロイ中止、旧プロセス継続=安全だが要再実行)。

---

## Phase D — テナント文脈 + Prisma 隔離(心臓)

### Task D1: テナント文脈(AsyncLocalStorage)

**Files:** Create `lib/tenant/context.ts`, Test `tests/unit/tenant-context.test.ts`

- [ ] **Step 1: テスト**

```ts
import { describe, it, expect } from "vitest";
import { runWithTenant, currentOrgId, isPlatform } from "@/lib/tenant/context";

describe("tenant context", () => {
  it("文脈内で orgId が読める / 文脈外は null", () => {
    expect(currentOrgId()).toBeNull();
    runWithTenant({ organizationId: "org_1" }, () => {
      expect(currentOrgId()).toBe("org_1");
      expect(isPlatform()).toBe(false);
    });
    expect(currentOrgId()).toBeNull();
  });
});
```

- [ ] **Step 2: 実装**

```ts
import { AsyncLocalStorage } from "node:async_hooks";
export type TenantCtx = { organizationId: string; isPlatform?: boolean };
const als = new AsyncLocalStorage<TenantCtx>();
export function runWithTenant<T>(ctx: TenantCtx, fn: () => T): T { return als.run(ctx, fn); }
export function currentOrgId(): string | null { return als.getStore()?.organizationId ?? null; }
export function isPlatform(): boolean { return als.getStore()?.isPlatform === true; }
export function requireOrgId(): string {
  const id = currentOrgId();
  if (!id) throw new Error("テナント文脈が未設定です(runWithTenant の外で DB アクセス)");
  return id;
}
```

- [ ] **Step 3: テスト通過確認 + コミット** (`npm run test:unit -- tenant-context`)

### Task D2: Prisma テナント拡張(全クエリ自動スコープ)

**Files:** Create `lib/tenant/prisma-tenant.ts`, Test `tests/unit/tenant-isolation.test.ts`

- [ ] **Step 1: クロステナント漏洩テスト(CI 必須の肝。先に書く)**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { tenantPrisma } from "@/lib/tenant/prisma-tenant";

describe("tenant isolation", () => {
  let orgA: string, orgB: string;
  beforeAll(async () => {
    orgA = (await prisma.organization.create({ data: { name: "A", slug: "a-"+process.pid } })).id;
    orgB = (await prisma.organization.create({ data: { name: "B", slug: "b-"+process.pid } })).id;
    // 各 org に 1 件 Agent を作る(scoped client 経由 = organizationId 自動付与)
    await tenantPrisma(orgA).agent.create({ data: { name: "agentA" } as any });
    await tenantPrisma(orgB).agent.create({ data: { name: "agentB" } as any });
  });

  it("A の client は A の行しか見えない", async () => {
    const rows = await tenantPrisma(orgA).agent.findMany();
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => (r as any).name === "agentB")).toBe(false);
  });

  it("A の client は B の行を update/delete できない", async () => {
    const b = await prisma.agent.findFirst({ where: { organizationId: orgB } });
    const upd = await tenantPrisma(orgA).agent.updateMany({ where: { id: b!.id }, data: { name: "hacked" } });
    expect(upd.count).toBe(0); // organizationId フィルタで 0 件
  });

  it("create は自動で organizationId=A になる", async () => {
    const a = await tenantPrisma(orgA).agent.create({ data: { name: "x" } as any });
    expect(a.organizationId).toBe(orgA);
  });
});
```

- [ ] **Step 2: 実装(全 operation を網羅)**

```ts
import { prisma } from "@/lib/prisma";

// テナント対象モデル(Organization 以外の全モデル)。DMMF から動的生成。
import { Prisma } from "@prisma/client";
const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models.map((m) => m.name).filter((n) => n !== "Organization")
);
const READ = new Set(["findUnique","findUniqueOrThrow","findFirst","findFirstOrThrow","findMany","count","aggregate","groupBy"]);
const WRITE_WHERE = new Set(["updateMany","deleteMany","update","delete","upsert"]);

export function tenantPrisma(organizationId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const a: any = args ?? {};
          if (READ.has(operation) || WRITE_WHERE.has(operation)) {
            a.where = { ...(a.where ?? {}), organizationId };
          }
          if (operation === "create") {
            a.data = { ...(a.data ?? {}), organizationId };
          }
          if (operation === "createMany") {
            const d = a.data; a.data = Array.isArray(d) ? d.map((x: any) => ({ ...x, organizationId })) : { ...d, organizationId };
          }
          if (operation === "upsert") {
            a.create = { ...(a.create ?? {}), organizationId };
          }
          return query(a);
        },
      },
    },
  });
}
```
> 注意点(レビュー必須): `findUnique`(主キー単独 where)に `organizationId` を足すと Prisma が「unique where に非 unique 条件」で弾く場合がある → その場合 `findUnique` は `findFirst` に内部読み替える実装に変更する。テストで検出する。

- [ ] **Step 3: テスト通過確認**(Run: `npm run test:unit -- tenant-isolation`)。漏洩テストが全部緑になるまで実装を直す(テストを緩めない)。

- [ ] **Step 4: コミット**

```bash
git add lib/tenant/prisma-tenant.ts tests/unit/tenant-isolation.test.ts lib/tenant/context.ts tests/unit/tenant-context.test.ts
git commit -m "feat(tenant): Prisma テナント拡張 + クロステナント漏洩テスト (Plan2 Phase D)"
```

### Task D3: scoped DB ヘルパ

**Files:** Create `lib/tenant/scoped.ts`

- [ ] **Step 1: 実装**

```ts
import { tenantPrisma } from "./prisma-tenant";
import { requireOrgId } from "./context";
/** ルート/サーバ処理から使う。文脈 org のスコープ済みクライアントを返す。 */
export function getTenantDb() { return tenantPrisma(requireOrgId()); }
```

- [ ] **Step 2: コミット** (`git commit -m "feat(tenant): getTenantDb ヘルパ (Plan2 Phase D)"`)

---

## Phase E — テナント解決(middleware)+ 認証

### Task E1: middleware で host → org slug 抽出

**Files:** Modify `middleware.ts`, Create `lib/tenant/resolve.ts`

- [ ] **Step 1: middleware(edge, DB 無し)** — host のサブドメイン or カスタムドメインを `x-tenant-host` ヘッダに載せる

```ts
// middleware.ts(既存に追記)
import { NextResponse, type NextRequest } from "next/server";
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const res = NextResponse.next();
  res.headers.set("x-tenant-host", host);   // 解決は node 側(resolve.ts)で行う
  return res;
}
```

- [ ] **Step 2: lib/tenant/resolve.ts(node, DB + キャッシュ)**

```ts
import { prisma } from "@/lib/prisma";
const ROOT = process.env.TENANT_ROOT_DOMAIN || "compass.app";
const cache = new Map<string, { id: string; at: number }>();
const TTL = 60_000;

export async function resolveOrgIdFromHost(host: string): Promise<string | null> {
  const key = (host || "").split(":")[0].toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.id;
  let org = null;
  if (key.endsWith("." + ROOT)) {
    const slug = key.slice(0, -("." + ROOT).length);
    org = await prisma.organization.findUnique({ where: { slug } });
  } else {
    org = await prisma.organization.findUnique({ where: { customDomain: key } });
  }
  if (org) cache.set(key, { id: org.id, at: Date.now() });
  return org?.id ?? null;
}
```

- [ ] **Step 3: テスト + コミット**

### Task E2: 認証をテナント対応に

**Files:** Modify `lib/auth.ts`(現状を読んでから)

- [ ] **Step 1: ログイン解決を org スコープに** — `getSession` が解決した host の org と、ユーザの `organizationId` が一致することを検証(PlatformAdmin は除外)。セッション/文脈に `organizationId` を持たせる。
- [ ] **Step 2: ルート入口で `runWithTenant({ organizationId }, ...)` を張る共通ラッパ** — 既存の API ハンドラ共通部 or 各ルートで。
- [ ] **Step 3: PlatformAdmin(`isPlatformAdmin`)はテナント横断**(テナント管理画面のみ)。
- [ ] **Step 4: テスト(別 org のユーザが別 org にログインできない)+ コミット**

---

## Phase F — 既存ルートの段階移行(prisma → getTenantDb)

### Task F1: 全 API ルートを scoped client 経由に

**Files:** `app/api/**/route.ts`(全 staff ルート)

- [ ] **Step 1: ルート棚卸し** — `grep -rln "from \"@/lib/prisma\"" app/api` で `prisma` 直使用箇所を列挙。
- [ ] **Step 2: 1 ルートずつ `prisma` → `getTenantDb()` に置換 + テスト**(リスト系から)。各ルートで `runWithTenant` 文脈が張られている前提。
- [ ] **Step 3: 移行漏れ検出** — ESLint ルール or grep CI で「`app/api` 内の素の `prisma.` 直使用」を検出して落とす(段階的に厳格化)。
- [ ] **Step 4: e2e で主要フロー(出願/一覧/在籍)が単一 org で回ることを確認 + コミット**。

> 注: 学生出願端(公開 API)は org をカスタムドメイン/slug から解決し `runWithTenant` を張る。出願データの作成は scoped client 経由 = org 自動付与。

---

## 本番ロールアウト順序(まとめ)

1. Phase A(nullable 追加)→ PR + CI 緑 → chore マージ → 自動 migrate deploy(加法・安全)。
2. 本番で `npx tsx prisma/backfill-organization.ts`(Phase B)。`IS NULL` が 0 を確認。
3. Phase C(必須化+FK)→ PR + CI 緑 → マージ → 自動 migrate deploy。
4. Phase D/E/F(文脈・拡張・解決・認証・ルート移行)→ PR + CI 緑(**漏洩テスト必須**)→ マージ。
5. 既存 1 org(知日グループ)で全機能の回帰確認。
6. (Plan 3)RLS + 索引で纵深防御 + 性能。(Plan 4)R2 テナント別。(Plan 5)モジュール枠。

---

## Self-Review チェック

- [ ] spec の「テナント階層/隔離/解決/認証」を Phase A–F が全てカバー(計費/R2/モジュール/RLS は別 Plan = 範囲外で正)。
- [ ] スキーマ変更は加法的・3 段(nullable→backfill→必須)で各 Phase 単独デプロイ可。
- [ ] 隔離の主enforcement(Prisma 拡張)に**漏洩テストが付き CI 必須**。`findUnique` の unique-where 問題を明記。
- [ ] 型整合: `tenantPrisma`/`getTenantDb`/`runWithTenant`/`currentOrgId`/`requireOrgId` の名前が全 Phase で一致。
- [ ] 精益: 法人グルーピングは最小(Plan 2.5 送り)、分庫しない、RLS は Plan 3。
