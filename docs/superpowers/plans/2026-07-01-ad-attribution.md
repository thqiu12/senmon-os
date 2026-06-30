# 広告連携（流入元捕捉＋分析）実装計画（サブプロジェクトC）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。spec=`docs/superpowers/specs/2026-06-30-ad-attribution-design.md`。

**Goal:** 出願フォームに流入元(UTM/gclid/referrer)を捕捉し、`/admin/oc` 分析タブで「広告→OC→出願」を流入元別に可視化。

**Architecture:** Application に5列追加。出願フォームでURLパラメータ捕捉→POST保存(OCと対称)。集計は純関数 `lib/attribution.ts`、`/api/admin/oc/analytics` を拡張、`/admin/oc` 分析タブに「流入元/広告」セクション。

**Tech Stack:** Next14/TS/Prisma。branch `chore/security-hardening`。unit=`DATABASE_URL_BASE=...compass_test npx vitest run`。build env=...compass_test+SESSION/CSRF+NODE_OPTIONS=--max-old-space-size=2048。**push前 fetch+rebase。** tenant: withTenant `@/lib/tenant/with-tenant`, getTenantDb `@/lib/tenant/scoped`。

---

## Task 1: schema（Application に流入元5列）

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20260701100000_application_attribution/migration.sql`

- [ ] **Step 1:** `model Application` に追加（OCReservation と対称・nullable。`referrerName`/`referrerType` とは別物に注意。既存の `examMode` 等の近く）:
```prisma
  // 流入元（広告アトリビューション）
  source       String?
  utmCampaign  String?
  utmMedium    String?
  gclid        String?
  referrer     String?
```
（注: Application には既に `referrerName`/`referrerType`[推薦機関] がある。今回の `referrer`[流入元URL] と混同しないこと。）

- [ ] **Step 2:** migration.sql:
```sql
ALTER TABLE "Application" ADD COLUMN "source" TEXT;
ALTER TABLE "Application" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "Application" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "Application" ADD COLUMN "gclid" TEXT;
ALTER TABLE "Application" ADD COLUMN "referrer" TEXT;
```

- [ ] **Step 3:** `for DB in compass_test compass_e2e; do DATABASE_URL=...$DB DIRECT_URL=...$DB npx prisma db push --skip-generate; done` → generate → `npx tsc --noEmit` 0。列確認(psql)。

- [ ] **Step 4: commit** `git add prisma/schema.prisma prisma/migrations/20260701100000_application_attribution/ && git commit -m "feat(db): Application に流入元5列（source/utm/gclid/referrer）"`

---

## Task 2: 出願フォームの流入元捕捉＋保存

**Files:** Modify `lib/schemas.ts`, `app/apply/page.tsx`, `app/api/applications/route.ts`

- [ ] **Step 1: schema** — `lib/schemas.ts` の `ApplicationCreateSchema` に追加:
```ts
  source: z.string().max(200).optional().nullable(),
  utmCampaign: z.string().max(200).optional().nullable(),
  utmMedium: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
```

- [ ] **Step 2: 捕捉**（`app/apply/page.tsx`）— `/oc` の UTM 捕捉と同方式。マウントの effect（`?school=` preselect を処理している effect か、別 effect）で `new URLSearchParams(window.location.search)` から `utm_source`/`utm_campaign`/`utm_medium`/`gclid` ＋ `document.referrer` を読み、`form` state（FormData に5フィールド追加）or 別 state に保持。出願POSTの body に `source: utm_source, utmCampaign, utmMedium, gclid, referrer` を同梱。FormData 型（`app/apply/_components/primitives.tsx` の FormData）に5フィールド追加。resume では上書きしない（初回作成時の値のみ）。

- [ ] **Step 3: 保存**（`app/api/applications/route.ts`）— parse 済み body から `source/utmCampaign/utmMedium/gclid/referrer` を `prisma.application.create`(getTenantDb) の data に追加（`?? null`）。

- [ ] **Step 4: tsc + build** → 0 / 全ページ。
- [ ] **Step 5: e2e 非回帰** — `DATABASE_URL/DIRECT_URL=...compass_e2e ... npx playwright test tests/e2e/api/ tests/e2e/student-apply.spec.ts --reporter=line` 全 pass（流入元 optional なので既存出願は影響なし）。
- [ ] **Step 6: commit** `git add lib/schemas.ts app/apply/page.tsx app/apply/_components/primitives.tsx app/api/applications/route.ts && git commit -m "feat(apply): 出願フォームで流入元(UTM/gclid/referrer)を捕捉・保存"`

---

## Task 3: 流入元/広告 分析（純関数＋API拡張＋UI）＋検証＋push

**Files:** Create `lib/attribution.ts`, `tests/unit/attribution.test.ts`; Modify `app/api/admin/oc/analytics/route.ts`, `app/admin/oc/page.tsx`

- [ ] **Step 1: 純関数 `lib/attribution.ts`**
```ts
type App = { email: string; source?: string | null; createdAt: Date };
type Resv = { email: string; source?: string | null; status: string; createdAt: Date };
const norm = (e: string) => e.trim().toLowerCase();
const src = (s?: string | null) => (s && s.trim()) || "(直接)";
export function computeAttribution(applications: App[], reservations: Resv[]) {
  // メール→最古出願日
  const appByEmail = new Map<string, Date>();
  for (const a of applications) { if (!a.email) continue; const k = norm(a.email); const c = appByEmail.get(k); if (!c || a.createdAt < c) appByEmail.set(k, a.createdAt); }
  const m = new Map<string, { source: string; applications: number; ocReservations: number; ocConverted: number }>();
  const get = (s: string) => { let e = m.get(s); if (!e) { e = { source: s, applications: 0, ocReservations: 0, ocConverted: 0 }; m.set(s, e); } return e; };
  for (const a of applications) get(src(a.source)).applications++;
  for (const r of reservations) {
    const e = get(src(r.source)); e.ocReservations++;
    const d = appByEmail.get(norm(r.email)); if (d && d >= r.createdAt) e.ocConverted++;
  }
  return Array.from(m.values())
    .map(e => ({ ...e, ocConvRate: e.ocReservations > 0 ? e.ocConverted / e.ocReservations : 0 }))
    .sort((a, b) => b.applications - a.applications);
}
```
- [ ] **Step 2: unit `tests/unit/attribution.test.ts`** — 源別 出願数/OC予約数/転換[email一致・出願日≥予約日]/(直接)集約/降順。
- [ ] **Step 3: API 拡張** `app/api/admin/oc/analytics/route.ts` — Application の select に `source` 追加（B では email/createdAt 取得済）。OCReservation は source 取得済。期間フィルタは Application も createdAt の from/to で絞る。レスポンスに `byAcquisition: computeAttribution(apps, reservations)` を追加（既存 OC指標はそのまま）。
- [ ] **Step 4: UI** `app/admin/oc/page.tsx` 分析タブに「流入元/広告」テーブル追加（流入元/出願数/OC予約数/OC経由出願/転換率）。
- [ ] **Step 5: tsc + build** → 0 / 全ページ。unit 全 pass。
- [ ] **Step 6: 実機（compass_e2e + 既定org slug=chinichi）** — source付き Application＋OC予約＋一致メールを仕込み→`/api/admin/oc/analytics` の `byAcquisition` が源別の 出願/OC予約/転換 を正しく返す。`/apply?school=X&utm_source=google` 経由出願で Application.source="google" 保存も確認。検証後クリーンアップ。
- [ ] **Step 7: commit + push** → fetch+rebase+push。
> 本番=migrate deploy で Application 5列追加。学校サイト/広告リンクに `utm_*` を付ければ出願にも流入元が残る。

## 受け入れ基準
- 出願が流入元を捕捉・保存（非破壊）。/admin/oc 分析タブの「流入元/広告」で源別 出願/OC予約/OC経由出願/転換率 表示。unit/build/e2e 緑。schema=Application5列。

## Self-Review
- spec①捕捉→T1(列)/T2(form+保存)。②分析→T3(純関数+API+UI)。tenant準拠。型一貫(computeAttribution)。`referrer`(流入元) vs `referrerName/Type`(推薦) 混同注意を明記。プレースホルダ無し。
