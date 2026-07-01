# 申請CSV 出力項目の選択 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。spec=`docs/superpowers/specs/2026-07-01-csv-column-selection-design.md`。

**Goal:** 申請CSVの出力列を管理画面で選択・並べ替え・保存でき、カスタム項目や出席率も出せるようにする。

**Architecture:** 列カタログ `lib/csvColumns.ts`（組み込み resolver＋カスタム）。選択は SystemSetting に順序付き `[{key,label}]`。管理API `/api/admin/csv-columns`、申請一覧に列選択モーダル、`export/route.ts` を動的列に改修。未設定は現行37列（非破壊）。

**Tech Stack:** Next14/TS/Prisma。branch `chore/security-hardening`。unit=`DATABASE_URL_BASE=...compass_test npx vitest run`。build env=...compass_test+SESSION/CSRF+NODE_OPTIONS=--max-old-space-size=2048。**push前 fetch+rebase。** tenant: withTenant `@/lib/tenant/with-tenant`, getTenantDb `@/lib/tenant/scoped`。

---

## Task 1: 列カタログ `lib/csvColumns.ts` ＋ unit

**Files:** Create `lib/csvColumns.ts`, `tests/unit/csv-columns.test.ts`

> 現行の `app/api/applications/export/route.ts` の HEADERS(37) と row 生成ロジック(lines 80-96)を **resolver に忠実に移植**する。relation は `documents`/`interviewFeedbacks`/`enrollmentProcedure`/`agent`（既存 include）。`escapeCsv`/`formatDateTimeJP` は `@/lib/utils`。

- [ ] **Step 1:** `lib/csvColumns.ts`：
  - `export type CsvApp = ...`（Application＋include relations の型。`Prisma.ApplicationGetPayload<{include: typeof CSV_INCLUDE}>` を export する形で）。`export const CSV_INCLUDE = { documents:{select:{docType:true}}, interviewFeedbacks:{select:{scoreOverall:true,recommendation:true,createdAt:true},orderBy:{createdAt:"desc"}}, enrollmentProcedure:{select:{status:true,tuitionPaidAt:true,schoolConfirmed:true,admitLetterIssued:true}}, agent:{select:{name:true}} } satisfies Prisma.ApplicationInclude;`
  - `export type BuiltinCol = { key: string; label: string; resolve: (a: CsvApp) => string };`
  - `export const BUILTIN_CSV_COLUMNS: BuiltinCol[]`：現37列を key/label/resolve で（現行 row 配列と同じ値になるよう移植）。key 例：applicationNo/status/createdAt/lastName/firstName/lastNameKana/firstNameKana/birthDate/gender/nationality/phone/email/postalCode/prefecture/city/address/addressDetail/residenceStatus/residenceExpiry/japaneseLevel/jlptCertified/schoolName/department/course/enrollmentYear/enrollmentMonth/applicationReason/lastSchoolName/lastSchoolCountry/lastSchoolGraduate/workExperience/documents/interviewAvg/interviewRec/epStatus/epTuition/epSchool/epAdmit/agentName。createdAt は formatDateTimeJP、jlptCertified は "あり/なし"、documents は docType を "／" 結合、interviewAvg/interviewRec/ep* は現行ロジック。
  - **追加の組み込み列**：`priorAttendanceRate`(label"日本語学校での出席率")、`lastSchoolGraduatedOn`(label"卒業（見込）年月")、`source`(label"流入元")、`utmCampaign`(label"広告キャンペーン")、`referrer`(label"流入元URL")。resolve は `a.priorAttendanceRate || ""` 等。
  - `export const DEFAULT_CSV_COLUMN_KEYS: string[]`：現37列の key（現行順）。
  - `export const BUILTIN_MAP = new Map(BUILTIN_CSV_COLUMNS.map(c=>[c.key,c]));`
  - `export function customCsvColumns(rows: {fieldKey:string;label:string;fieldType?:string|null}[]): {key:string;label:string}[]`：isCustomField(`@/lib/applyCustomFields`) の項目を fieldKey→label（重複は最初）で返す。
  - `export function resolveRow(app: CsvApp, columns: {key:string;label:string}[], extra: Record<string,unknown>): string[]`：各 column の key が BUILTIN_MAP にあれば resolve(app)、無ければカスタム→`String(extra?.[key] ?? "")`。
  - `export function sanitizeColumns(input: unknown, customKeys: Set<string>): {key:string;label:string}[]`：配列で、key が BUILTIN_MAP か customKeys に含まれるものだけ、label は文字列（無ければ BUILTIN のラベル or key）。空なら DEFAULT。
- [ ] **Step 2:** `tests/unit/csv-columns.test.ts`：resolveRow（組み込み値・カスタム extraData・順序）、DEFAULT_CSV_COLUMN_KEYS が37件、sanitize（未知 key 除外・空→DEFAULT）。ダミー CsvApp を作って検証。
- [ ] **Step 3:** `DATABASE_URL_BASE=...compass_test npx vitest run tests/unit/csv-columns.test.ts` → pass。tsc 0。
- [ ] **Step 4: commit** `git add lib/csvColumns.ts tests/unit/csv-columns.test.ts && git commit -m "feat(csv): 申請CSV 列カタログ（組み込みresolver＋カスタム）＋unit"`

---

## Task 2: 保存API `/api/admin/csv-columns`

**Files:** Create `app/api/admin/csv-columns/route.ts`

- [ ] **Step 1:** withTenant + admin + `hasCapability(session,"data.export")`。GET：SystemSetting(`getTenantDb().systemSetting.findUnique({where:{key:"applications_csv_columns"}})`) から選択（無ければ DEFAULT を組み込みラベルで構築）。全カスタム項目＝`getTenantDb().formFieldConfig.findMany({})` → `customCsvColumns`。返す `{ selected:{key,label}[], available:{ builtin: BUILTIN_CSV_COLUMNS.map(c=>({key,label})), custom } }`。
- [ ] **Step 2:** PUT：body `{ columns }` → `sanitizeColumns(columns, new Set(custom.map(c=>c.key)))` → SystemSetting upsert（value=JSON.stringify）。tenant の SystemSetting アクセスは既存 payment_config 等のパターンに合わせる（`getTenantDb().systemSetting.upsert`）。
- [ ] **Step 3:** tsc + build → 0/通過。
- [ ] **Step 4: commit** `git add app/api/admin/csv-columns && git commit -m "feat(csv): CSV出力項目の取得/保存API（SystemSetting）"`

---

## Task 3: 管理UI（申請一覧に列選択モーダル）

**Files:** Modify 申請一覧の管理ページ（`app/admin/applications/page.tsx` 等・READして特定）

- [ ] **Step 1:** 申請一覧ページの CSV ダウンロード近くに「**CSV出力項目**」ボタン→モーダル。GET `/api/admin/csv-columns` で available+selected 取得。左＝利用可能（組み込み/カスタムのグループ・チェック）、右＝選択済み（順序付き・↑↓で並べ替え・削除）。「既定に戻す」。保存で PUT。
- [ ] **Step 2:** 既存の「CSVダウンロード」リンク（`/api/applications/export?...`）はそのまま（保存済み列で出力）。既存 UI/コンポーネント流用。
- [ ] **Step 3:** tsc + build → 0/通過。
- [ ] **Step 4: commit** `git add <page> && git commit -m "feat(csv): 申請一覧にCSV出力項目の選択・並べ替えモーダル"`

---

## Task 4: エクスポート改修（動的列）＋検証＋push

**Files:** Modify `app/api/applications/export/route.ts`

- [ ] **Step 1:** 冒頭で SystemSetting の列定義取得（`getTenantDb`）。無ければ DEFAULT（組み込みラベルで）。カスタム列が含まれる場合 findMany の include に `extraData`? → `extraData` は select ではなく Application のスカラなので `include` ではなく通常取得される（select 未使用なら全スカラ取得）。現行は include のみで select 無し＝スカラ全取得なので extraData も来る。確認：`resolveRow(app, columns, app.extraData as any)`。
- [ ] **Step 2:** ストリーム先頭 `HEADERS = columns.map(c=>c.label)`。各申請 `resolveRow(app, columns, ...)` → escapeCsv → 行。`CSV_INCLUDE` を lib から使い include 統一。ページング/BOM/`data.export`/streaming 維持。
- [ ] **Step 3:** tsc + build → 0/通過。unit 全 pass。
- [ ] **Step 4: 実機（compass_e2e）:** カスタム項目付き申請（extraData に custom_x="早稲田日本語学校"）＋ priorAttendanceRate 入りの申請を用意 → PUT `/api/admin/csv-columns` 相当（or SystemSetting直挿し）で選択に custom_x と priorAttendanceRate を追加 → `/api/applications/export` の出力に該当ラベル列＋値が出る／未設定時は現行37列。tsx or curl で検証。クリーンアップ。
- [ ] **Step 5: commit + push** → fetch+rebase+push。

## 受け入れ基準
- 管理で列を選択・並べ替え・保存でき、CSVがその列・順で出力。カスタム項目/出席率も出せる。未設定は現行37列で非破壊。unit/build 緑。

## Self-Review
- spec 列カタログ→T1。保存→T2。UI→T3。エクスポート改修→T4。後方互換=DEFAULT。tenant準拠。型一貫(CsvApp/resolveRow/sanitizeColumns)。プレースホルダ無し。現行37列の resolver は既存 export の row ロジックを忠実移植。
