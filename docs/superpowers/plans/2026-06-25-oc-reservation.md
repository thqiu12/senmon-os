# オープンキャンパス(OC) 予約・フォーム 実装計画（サブプロジェクトA）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps use checkbox (`- [ ]`)。spec=`docs/superpowers/specs/2026-06-25-oc-reservation-design.md`。

**Goal:** OCイベント定義・公開予約（設定駆動フォーム）・確認メール＋本人キャンセル・定員管理・学校サイトからのリンク誘導(UTM)を実装する。

**Architecture:** 新規 OCEvent/OCReservation モデル＋FormFieldConfig に formType(apply/oc)。公開 `/oc`＋`/api/oc/*`、管理 `/admin/oc`。既存の ApplySchool・DynamicField・lib/email・採番・i18n を再利用。ルートは tenant パターン（withTenant + getTenantDb）準拠、新モデルに organizationId。

**Tech Stack:** Next.js14/React/TS/Prisma(Postgres)。branch `chore/security-hardening`。unit=`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run`。build env=DATABASE_URL/DIRECT_URL=...compass_test, SESSION_SECRET/CSRF_SECRET 32+字, NODE_OPTIONS=--max-old-space-size=2048。e2e/live=compass_e2e。**push前は必ず fetch+rebase（tenant並行作業）。**

> ⚠️ tenant 現行パターン：API は `export const GET = withTenant(async (req)=>{...})`、DB は `getTenantDb()`（raw `prisma` ではなく）。新モデルは `organizationId String?` + `@@index([organizationId])`（実行時に tenantPrisma が注入）。各タスクで該当ルート/モデルの現行例（例: `app/api/admin/form-config/route.ts`）を読んで合わせること。

---

## Task 1: スキーマ（OCEvent / OCReservation / FormFieldConfig.formType）

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20260625180000_oc_reservation/migration.sql`

- [ ] **Step 1: schema にモデル追加**（`Application` 等の近く、tenant 規約に倣う）
```prisma
model OCEvent {
  organizationId String?
  id          String   @id @default(cuid())
  schoolKey   String
  title       String
  description String?
  startAt     DateTime
  endAt       DateTime?
  capacity    Int
  location    String?
  isOnline    Boolean  @default(false)
  onlineUrl   String?
  status      String   @default("下書き") // 下書き/公開/締切
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  reservations OCReservation[]
  @@index([organizationId])
  @@index([schoolKey, status, startAt])
}

model OCReservation {
  organizationId String?
  id            String   @id @default(cuid())
  ocEventId     String
  ocEvent       OCEvent  @relation(fields: [ocEventId], references: [id], onDelete: Cascade)
  reservationNo String   @unique
  name          String
  email         String
  phone         String?
  attendees     Int      @default(1)
  extraData     Json?
  status        String   @default("予約") // 予約/キャンセル/出席/欠席
  source        String?
  utmCampaign   String?
  utmMedium     String?
  gclid         String?
  referrer      String?
  canceledAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([organizationId])
  @@index([ocEventId, status])
  @@index([email])
}
```
`FormFieldConfig` に追加し、一意制約を拡張:
```prisma
  formType String @default("apply") // apply | oc
  // 既存 @@unique([fieldKey, schoolId, applicantType]) を ↓ に変更
  @@unique([fieldKey, schoolId, applicantType, formType])
```

- [ ] **Step 2: migration.sql**（手書き。tenant 規約に合わせ organizationId は nullable のまま。OCの organizationId NOT NULL 化は tenant チームの移行に委ねる/別途）
```sql
CREATE TABLE "OCEvent" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT, "schoolKey" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3),
  "capacity" INTEGER NOT NULL, "location" TEXT, "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "onlineUrl" TEXT, "status" TEXT NOT NULL DEFAULT '下書き',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "OCEvent_organizationId_idx" ON "OCEvent"("organizationId");
CREATE INDEX "OCEvent_schoolKey_status_startAt_idx" ON "OCEvent"("schoolKey","status","startAt");
CREATE TABLE "OCReservation" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT, "ocEventId" TEXT NOT NULL,
  "reservationNo" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT,
  "attendees" INTEGER NOT NULL DEFAULT 1, "extraData" JSONB, "status" TEXT NOT NULL DEFAULT '予約',
  "source" TEXT, "utmCampaign" TEXT, "utmMedium" TEXT, "gclid" TEXT, "referrer" TEXT, "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OCReservation_ocEventId_fkey" FOREIGN KEY ("ocEventId") REFERENCES "OCEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OCReservation_reservationNo_key" ON "OCReservation"("reservationNo");
CREATE INDEX "OCReservation_organizationId_idx" ON "OCReservation"("organizationId");
CREATE INDEX "OCReservation_ocEventId_status_idx" ON "OCReservation"("ocEventId","status");
CREATE INDEX "OCReservation_email_idx" ON "OCReservation"("email");
ALTER TABLE "FormFieldConfig" ADD COLUMN "formType" TEXT NOT NULL DEFAULT 'apply';
DROP INDEX IF EXISTS "FormFieldConfig_fieldKey_schoolId_applicantType_key";
CREATE UNIQUE INDEX "FormFieldConfig_fieldKey_schoolId_applicantType_formType_key" ON "FormFieldConfig"("fieldKey","schoolId","applicantType","formType");
```

- [ ] **Step 3: db push 両DB + generate + tsc**
```bash
for DB in compass_test compass_e2e; do DATABASE_URL="postgresql://setsuiken@localhost:5432/$DB" DIRECT_URL="postgresql://setsuiken@localhost:5432/$DB" npx prisma db push --skip-generate; done
npx prisma generate
npx tsc --noEmit
```
Expected: 同期成功、tsc 0。

- [ ] **Step 4: commit**
```bash
git add prisma/schema.prisma prisma/migrations/20260625180000_oc_reservation/
git commit -m "feat(db): OCEvent/OCReservation + FormFieldConfig.formType 追加"
```

---

## Task 2: OC 純関数（定員・採番・フォーム解決）＋ unit

**Files:** Create `lib/ocCapacity.ts`, `lib/ocForm.ts`, `tests/unit/oc-capacity.test.ts`, `tests/unit/oc-form.test.ts`

- [ ] **Step 1: `lib/ocCapacity.ts`**
```ts
type Resv = { attendees: number; status: string };
const ACTIVE = new Set(["予約", "出席"]);
/** 有効予約の参加人数合計。 */
export function usedSeats(reservations: Resv[]): number {
  return reservations.filter(r => ACTIVE.has(r.status)).reduce((s, r) => s + (r.attendees || 0), 0);
}
/** 残席（capacity 上限）。 */
export function remainingSeats(capacity: number, reservations: Resv[]): number {
  return Math.max(0, capacity - usedSeats(reservations));
}
/** 今回 attendees 名が入れるか。 */
export function canReserve(capacity: number, reservations: Resv[], attendees: number): boolean {
  return attendees > 0 && usedSeats(reservations) + attendees <= capacity;
}
```

- [ ] **Step 2: `lib/ocForm.ts`** — OCフォームの既定とフォーム解決
```ts
// OCコア項目（OCReservation 列にマップ）＋既定。追加項目は extraData。
export const OC_CORE_KEYS = new Set(["name", "email", "phone", "attendees"]);
export type OCFieldDefault = { fieldKey: string; label: string; section: string; isRequired: boolean; fieldType: string; displayOrder: number };
export const OC_FORM_DEFAULTS: OCFieldDefault[] = [
  { fieldKey: "name",      label: "お名前",     section: "予約者情報", isRequired: true,  fieldType: "text",  displayOrder: 1 },
  { fieldKey: "email",     label: "メールアドレス", section: "予約者情報", isRequired: true,  fieldType: "email", displayOrder: 2 },
  { fieldKey: "phone",     label: "電話番号",   section: "予約者情報", isRequired: false, fieldType: "tel",   displayOrder: 3 },
  { fieldKey: "attendees", label: "参加人数",   section: "予約者情報", isRequired: true,  fieldType: "text",  displayOrder: 4 },
];
type Row = { fieldKey: string; isEnabled: boolean; label: string; section: string; isRequired: boolean; fieldType: string; displayOrder: number | null; description?: string|null; options?: string|null; labelEn?: string|null; descriptionEn?: string|null };
/** OCの設定行(formType=oc, 該当school) + 既定 を マージ。applicantType 次元なし。有効のみ displayOrder 昇順。 */
export function mergeOCForm(defaults: OCFieldDefault[], rows: Row[]): Row[] {
  const map = new Map<string, Row>();
  for (const d of defaults) map.set(d.fieldKey, { ...d, isEnabled: true, displayOrder: d.displayOrder, description: null, options: null, labelEn: null, descriptionEn: null });
  for (const r of rows) map.set(r.fieldKey, { ...r });
  return Array.from(map.values()).filter(r => r.isEnabled).sort((a,b)=>(a.displayOrder??0)-(b.displayOrder??0));
}
```

- [ ] **Step 3: unit tests** — `oc-capacity.test.ts`（usedSeats/remaining/canReserve: 満席・キャンセル除外・複数人数）、`oc-form.test.ts`（既定マージ・行で上書き・無効化除外・順序）。
- [ ] **Step 4: 実行** — `DATABASE_URL_BASE=...compass_test npx vitest run tests/unit/oc-capacity.test.ts tests/unit/oc-form.test.ts` → pass。tsc 0。
- [ ] **Step 5: commit**
```bash
git add lib/ocCapacity.ts lib/ocForm.ts tests/unit/oc-capacity.test.ts tests/unit/oc-form.test.ts
git commit -m "feat(oc): 定員計算・採番・OCフォーム解決の純関数＋unit"
```

---

## Task 3: form-config を formType 対応（OCフォーム設定の保存/取得）

**Files:** Modify `app/api/admin/form-config/route.ts`, `app/api/apply/form-config/route.ts`, `app/admin/form-config/page.tsx`

- [ ] **Step 1: 出願API は formType="apply" に絞る**
`app/api/apply/form-config/route.ts` の findMany where に `formType: "apply"` を追加（OC行を混ぜない）。

- [ ] **Step 2: OC form-config 取得**
`/api/oc/form-config?school=<schoolKey>` を新設（`app/api/oc/form-config/route.ts`）：`getTenantDb().formFieldConfig.findMany({ where: { schoolId: schoolKey, formType: "oc" } })` → `mergeOCForm(OC_FORM_DEFAULTS, rows)` を返す（withTenant）。

- [ ] **Step 3: 管理 form-config に formType**
`app/api/admin/form-config/route.ts`：GET/PUT/POST が `formType` クエリ/フィールドを受け、scope に含める（既定 "apply"）。`app/admin/form-config/page.tsx`：上部に「出願フォーム / OC予約フォーム」の切替を追加（formType state）。OC 選択時は applicantType 次元を隠し（OCは null 固定）、保存/取得を formType=oc で行う。OC は OC_FORM_DEFAULTS をベースに。

- [ ] **Step 4: tsc + build** → 0 / 78+。出願フォーム非回帰（formType=apply 既定）。
- [ ] **Step 5: commit**
```bash
git add app/api/admin/form-config/route.ts app/api/apply/form-config/route.ts app/admin/form-config/page.tsx app/api/oc/form-config/route.ts
git commit -m "feat(oc): form-config を formType(apply/oc)対応＋OCフォーム設定UI/取得API"
```

---

## Task 4: 公開 OC API（一覧・予約・キャンセル）

**Files:** Create `app/api/oc/events/route.ts`, `app/api/oc/reservations/route.ts`, `app/api/oc/reservations/cancel/route.ts`, `app/api/oc/status/route.ts`; `lib/schemas.ts`（OCReservationCreateSchema）

- [ ] **Step 1: schema** — `lib/schemas.ts` に zod `OCReservationCreateSchema`（ocEventId, name, email(email), phone?, attendees(coerce.number.min(1).max(20)), extraData record, utm/source/gclid/referrer? 任意）。

- [ ] **Step 2: GET /api/oc/events** — `?school=` で `status:"公開"` かつ `startAt > now` を返す（各イベントの残席を `remainingSeats` で算出して付与）。withTenant + getTenantDb。

- [ ] **Step 3: POST /api/oc/reservations** — レート制限（apply 同様）→ parse → イベント取得（公開中・未来）→ そのイベントの有効予約取得 → `canReserve(capacity, resv, attendees)` false なら 409「満席」→ reservationNo 採番（OC-YYMMDD-连番 or ランダム）→ create（extraData・utm/source 保存）→ 確認メール（Task 6）→ 201 + {reservationNo}。二重取り防止：作成直前に再集計。

- [ ] **Step 4: GET /api/oc/status** (`?reservationNo=&email=`) → 予約＋イベント情報を返す（apply status 準拠）。POST /api/oc/reservations/cancel (`{reservationNo,email}`) → 本人確認 → status="キャンセル"・canceledAt=now（定員自動復帰）。

- [ ] **Step 5: tsc + build** → 0 / 78+。
- [ ] **Step 6: commit**
```bash
git add app/api/oc/ lib/schemas.ts
git commit -m "feat(oc): 公開API（一覧/予約[定員チェック]/照会/キャンセル）"
```

---

## Task 5: 公開ページ `/oc`（一覧→予約→完了→status）

**Files:** Create `app/oc/page.tsx`, `app/oc/_components/*`, `app/oc/status/page.tsx`

- [ ] **Step 1: `/oc`** — `?school=` preselect（apply の preselect 方式準拠）。公開イベント一覧（日時・会場/オンライン・残席・満席表示）。**マウント時に URL の utm_*/gclid/referrer を保持**（予約 POST に同梱）。
- [ ] **Step 2: 予約フォーム** — 選択イベント → `/api/oc/form-config?school=` を取得 → **DynamicField で描画**（formType=oc。コア項目 name/email/phone/attendees ＋追加項目）→ クライアント必須検証 → POST /api/oc/reservations（utm 同梱）→ 満席は 409 表示。
- [ ] **Step 3: 完了画面** — 予約番号・日時・会場/URL・status リンク。
- [ ] **Step 4: `/oc/status`** — reservationNo+email で照会・本人キャンセル。
- [ ] **Step 5: tsc + build** → 0 / 78+。
- [ ] **Step 6: commit**
```bash
git add app/oc/
git commit -m "feat(oc): 公開予約ページ（一覧/フォーム/完了/status・UTM捕捉・DynamicField再利用）"
```

---

## Task 6: 確認メール

**Files:** Modify `lib/email*`（OC確認メールテンプレ追加）, wire into Task 4 POST

- [ ] **Step 1:** `lib/email` に `sendOCConfirmation({ to, name, reservationNo, event, cancelUrl })`（RESEND 未設定なら no-op、apply メールと同方針）。件名/本文に 予約番号・日時・会場/URL・キャンセルリンク。
- [ ] **Step 2:** Task 4 の予約作成成功後に呼ぶ（失敗してもAPIは201・ログのみ）。
- [ ] **Step 3: tsc + build** → 0 / 78+。
- [ ] **Step 4: commit**
```bash
git add lib/email* app/api/oc/reservations/route.ts
git commit -m "feat(oc): 予約確認メール（番号＋キャンセルリンク・RESEND未設定はno-op）"
```

---

## Task 7: 管理 `/admin/oc`（イベントCRUD・予約一覧・出席・CSV）

**Files:** Create `app/admin/oc/page.tsx`, `app/api/admin/oc/events/route.ts` (+[id]), `app/api/admin/oc/reservations/route.ts`（一覧/出席更新/キャンセル/CSV）

- [ ] **Step 1: 管理API** — events CRUD（withTenant+getTenantDb、`form.edit` 等の権限）、reservations 一覧（イベント別・残席）、出席更新（status=出席/欠席）、キャンセル、CSV出力。
- [ ] **Step 2: 管理UI** — `/admin/oc`：イベント一覧＋作成/編集フォーム（学校・日時・定員・会場/オンライン・公開状態）、イベント選択で予約一覧（人数 vs 定員、出席チェック、CSV）。既存管理レイアウト/コンポーネント流用。サイドメニューに「オープンキャンパス」追加。
- [ ] **Step 3: tsc + build** → 0 / 78+。
- [ ] **Step 4: commit**
```bash
git add app/admin/oc/ app/api/admin/oc/
git commit -m "feat(oc-admin): イベントCRUD＋予約一覧/出席/CSV"
```

---

## Task 8: 検証＋push

- [ ] **Step 1: 全 unit** → pass。 **Step 2: build** → 78+/0。 **Step 3: e2e**（既存 student-apply + api 非回帰；OC の簡易 e2e があれば）。
- [ ] **Step 4: 実機（compass_e2e, dev server）通し**：管理で OCEvent 作成・公開 → `/oc?school=chuo-seminar&utm_source=test` で一覧表示・UTM捕捉 → 予約（定員1で2人目は満席409）→ 確認（status）→ 本人キャンセルで残席復帰 → 管理で予約一覧・出席チェック・CSV。OCフォームに追加項目を設定→公開フォームに出る。検証後クリーンアップ。
- [ ] **Step 5: push** — `git fetch origin && git rebase origin/chore/security-hardening && git push`。
> 本番：auto-deploy が migrate deploy（新モデル/列）＋配信。学校サイトには `/oc?school=X&utm_*` リンクを配布。

## 受け入れ基準（A）
- 管理でOC作成・公開、公開ページで予約→確認メール→本人キャンセル、定員超過防止、OCフォーム設定駆動、`?school=`preselect＋UTM捕捉。出願フォーム非破壊。全 unit/build/e2e 緑。

## Self-Review（spec対応）
- データモデル→T1。純関数→T2。formType/フォーム設定→T3。公開API→T4。公開ページ/UTM/学校サイトリンク→T5。確認メール→T6。管理→T7。検証→T8。tenant パターン（withTenant/getTenantDb/organizationId）を全API/モデルで踏襲。型一貫（OCEvent/OCReservation/mergeOCForm/remainingSeats/canReserve）。プレースホルダ無し。
