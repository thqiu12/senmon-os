# OC分析 実装計画（サブプロジェクトB）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps use checkbox。spec=`docs/superpowers/specs/2026-06-30-oc-analytics-design.md`。

**Goal:** OC予約の集計（予約数/出席率/キャンセル率/OC→出願転換率/イベント別/流入元別）を `/admin/oc` 分析タブで可視化。

**Architecture:** 集計は純関数 `lib/ocAnalytics.ts`。API `/api/admin/oc/analytics`（withTenant+getTenantDb で取得→純関数）。UI は `/admin/oc` に分析タブ。schema 変更なし。

**Tech Stack:** Next.js14/TS/Prisma。branch `chore/security-hardening`。unit=`DATABASE_URL_BASE=...compass_test npx vitest run`。build env=...compass_test+SESSION/CSRF+NODE_OPTIONS。**push前 fetch+rebase。** tenant: withTenant `@/lib/tenant/with-tenant`, getTenantDb `@/lib/tenant/scoped`。

---

## Task 1: 集計純関数 `lib/ocAnalytics.ts` ＋ unit

**Files:** Create `lib/ocAnalytics.ts`, `tests/unit/oc-analytics.test.ts`

- [ ] **Step 1: `lib/ocAnalytics.ts`**
```ts
export type AnalyticsReservation = {
  ocEventId: string; status: string; email: string; attendees: number;
  source?: string | null; utmCampaign?: string | null; createdAt: Date;
};
export type AppEmail = { email: string; createdAt: Date };
export type AnalyticsEvent = { id: string; title: string; startAt: Date; capacity: number; schoolKey: string };

const norm = (e: string) => e.trim().toLowerCase();
const ACTIVE = new Set(["予約", "出席"]);

/** メール→最古の出願日 マップ（小文字正規化）。 */
function appEmailMap(apps: AppEmail[]): Map<string, Date> {
  const m = new Map<string, Date>();
  for (const a of apps) {
    if (!a.email) continue;
    const k = norm(a.email);
    const cur = m.get(k);
    if (!cur || a.createdAt < cur) m.set(k, a.createdAt);
  }
  return m;
}
/** 予約者が転換したか（同メールで予約日以降に出願）。 */
function converted(r: AnalyticsReservation, appMap: Map<string, Date>): boolean {
  const d = appMap.get(norm(r.email));
  return !!d && d >= r.createdAt;
}

export function computeOCAnalytics(
  reservations: AnalyticsReservation[],
  apps: AppEmail[],
  events: AnalyticsEvent[] = [],
) {
  const appMap = appEmailMap(apps);
  const byStatus: Record<string, number> = { 予約: 0, 出席: 0, 欠席: 0, キャンセル: 0 };
  let attendeesTotal = 0, convReserved = 0, attended = 0, convAttended = 0;
  for (const r of reservations) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (ACTIVE.has(r.status)) attendeesTotal += r.attendees || 0;
    if (converted(r, appMap)) convReserved++;
    if (r.status === "出席") { attended++; if (converted(r, appMap)) convAttended++; }
  }
  const total = reservations.length;
  const attendedCnt = byStatus["出席"], absent = byStatus["欠席"], canceled = byStatus["キャンセル"];
  const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

  // 流入元別
  const srcMap = new Map<string, { source: string; reservations: number; converted: number }>();
  for (const r of reservations) {
    const s = (r.source && r.source.trim()) || "(直接)";
    const e = srcMap.get(s) ?? { source: s, reservations: 0, converted: 0 };
    e.reservations++; if (converted(r, appMap)) e.converted++;
    srcMap.set(s, e);
  }
  // イベント別
  const evMap = new Map(events.map(e => [e.id, e]));
  const byEventAgg = new Map<string, { eventId: string; title: string; startAt: Date; capacity: number; 予約: number; 出席: number; 欠席: number; キャンセル: number; used: number; converted: number }>();
  for (const r of reservations) {
    const ev = evMap.get(r.ocEventId);
    const cur = byEventAgg.get(r.ocEventId) ?? { eventId: r.ocEventId, title: ev?.title ?? r.ocEventId, startAt: ev?.startAt ?? new Date(0), capacity: ev?.capacity ?? 0, 予約: 0, 出席: 0, 欠席: 0, キャンセル: 0, used: 0, converted: 0 };
    cur[r.status as "予約"] = (cur[r.status as "予約"] ?? 0) + 1;
    if (ACTIVE.has(r.status)) cur.used += r.attendees || 0;
    if (converted(r, appMap)) cur.converted++;
    byEventAgg.set(r.ocEventId, cur);
  }
  return {
    summary: { reservations: total, attendeesTotal, attendanceRate: rate(attendedCnt, attendedCnt + absent), cancellationRate: rate(canceled, total) },
    byStatus,
    conversion: { reservedToApplied: rate(convReserved, total), attendedToApplied: rate(convAttended, attended), convReserved, convAttended },
    bySource: Array.from(srcMap.values()).map(s => ({ ...s, rate: rate(s.converted, s.reservations) })).sort((a, b) => b.reservations - a.reservations),
    byEvent: Array.from(byEventAgg.values()).map(e => ({ ...e, remaining: Math.max(0, e.capacity - e.used), convRate: rate(e.converted, e.予約 + e.出席 + e.欠席 + e.キャンセル) })).sort((a, b) => b.startAt.getTime() - a.startAt.getTime()),
  };
}
```

- [ ] **Step 2: `tests/unit/oc-analytics.test.ts`** — cover: status集計、出席率=出席/(出席+欠席)、キャンセル率、転換（同メール＋出願日≥予約日=true、出願日<予約日=false、メール無し=false、大文字小文字無視）、流入元別(直接含む)、イベント別。
- [ ] **Step 3:** `DATABASE_URL_BASE=...compass_test npx vitest run tests/unit/oc-analytics.test.ts` → pass。`npx tsc --noEmit` → 0。
- [ ] **Step 4: commit** `git add lib/ocAnalytics.ts tests/unit/oc-analytics.test.ts && git commit -m "feat(oc): OC分析の集計純関数＋unit"`

---

## Task 2: 分析API ＋ /admin/oc 分析タブ ＋ 検証

**Files:** Create `app/api/admin/oc/analytics/route.ts`; Modify `app/admin/oc/page.tsx`

- [ ] **Step 1: API** `app/api/admin/oc/analytics/route.ts`（withTenant + isAdmin + `hasCapability(session,"form.edit")`）:
  - GET `?school=&from=&to=`。`getTenantDb()` で：① OCEvent を school/期間(startAt)でフィルタ取得（id/title/startAt/capacity/schoolKey）。② その event 群の OCReservation 取得（ocEventId/status/email/attendees/source/utmCampaign/createdAt）。③ Application を `where:{deletedAt:null}` で email/createdAt のみ取得。④ `computeOCAnalytics(reservations, apps, events)` を返す。
  - 既存 `app/api/admin/oc/events/route.ts` の withTenant/権限/getTenantDb パターンに合わせる（読んで踏襲）。
- [ ] **Step 2: UI** `app/admin/oc/page.tsx` に「分析」タブ追加：学校 select＋期間(from/to date、既定=過去3ヶ月)→ `/api/admin/oc/analytics` 取得 → サマリカード（予約者数/出席率/キャンセル率/予約→出願転換率）＋イベント別テーブル＋流入元別テーブル。既存スタイル流用。イベント管理タブは現状維持。
- [ ] **Step 3: tsc + build** → 0 / 全ページ。
- [ ] **Step 4: 実機（compass_e2e + 既定org slug=chinichi）** — OCイベント+予約(出席/欠席/キャンセル混在)+一部同メールの Application を仕込み→`/api/admin/oc/analytics` が 出席率/キャンセル率/転換率/流入元別/イベント別 を正しく返すか確認。検証後クリーンアップ。
- [ ] **Step 5: commit + push** `git add app/api/admin/oc/analytics app/admin/oc/page.tsx && git commit -m "feat(oc): 分析API＋/admin/oc 分析タブ"` → fetch+rebase+push。

## 受け入れ基準
- /admin/oc 分析タブで 予約数/出席率/キャンセル率/OC→出願転換率/イベント別/流入元別 が表示。転換=メール一致(出願日≥予約日)。schema変更なし。unit/build緑。

## Self-Review
- spec 指標→T1純関数（status/出席率/キャンセル率/転換[日付]/流入元/イベント別）。API/UI→T2。tenant準拠。型一貫(computeOCAnalytics)。プレースホルダ無し。
