# 出願者タイプ（日本人/留学生）対応 — Phase 1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 出願者が最初に「日本人/留学生」を選び、その後に学校×タイプ別フォームで出願できるようにし、管理画面で学校×タイプのフォームを編集できる（＋志望校管理↔form管理の連動を修正）ようにする。

**Architecture:** 既存 FormFieldConfig に `applicantType` 次元を追加。出願フローにタイプ選択を足し、form-config API を `type` 対応に拡張。form管理の学校タブをハードコードから ApplySchool 連動に変更。すべて非破壊（既定=留学生 `foreign`）。

**Tech Stack:** Next.js 14 App Router, Prisma + SQLite, TypeScript, Tailwind。検証は `npx tsc --noEmit`（プロジェクトの実ゲート）。リポジトリ `/tmp/review-repo-cicd`、ブランチ `chore/security-hardening`。仕様: `docs/superpowers/specs/2026-06-18-applicant-type-design.md`。

> 注: 本プロジェクトに UI テストフレームワークは無い。検証は `npx tsc --noEmit`（必要に応じ `npx prisma generate`）＋対象画面の手動確認。純関数（form-config マージ）のみ Node で簡易確認。

---

## File Structure

- `prisma/schema.prisma` — `Application.applicantType` / `FormFieldConfig.applicantType` 追加（修正）
- `lib/applicantType.ts` — タイプ定数・既定フォーム差分の定義（新規）
- `lib/formFieldDefaults.ts` — タイプ別の既定（留学生専用項目フラグ）を付与（修正）
- `app/api/apply/form-config/route.ts` — `?type` 対応・マージ順拡張（修正）
- `app/api/admin/form-config/route.ts` — GET/PUT で `applicantType` 受領（修正）
- `app/api/applications/route.ts` — POST で applicantType 保存、GET list で `?applicantType` フィルタ（修正）
- `app/apply/page.tsx` — タイプ選択ステップ＋state＋form-config 取得に type 付与＋提出（修正）
- `app/admin/form-config/page.tsx` — 学校タブを ApplySchool 連動化＋タイプ切替（修正）
- `app/admin/applications/[id]/page.tsx` — タイプバッジ表示（修正）
- 申請一覧（dashboard の一覧 or 選考管理）— タイプ絞り込み（修正）
- `lib/i18n/en.ts` — タイプ選択ステップの英訳（修正）

---

## Task 1: スキーマに applicantType を追加

**Files:**
- Modify: `prisma/schema.prisma`（`model Application`、`model FormFieldConfig`）

- [ ] **Step 1: Application にカラム追加**

`model Application` に追加（既存カラム群の末尾付近、`agentId` の近く）:
```prisma
  // 出願者タイプ: japanese / foreign（既定=foreign＝従来動作）
  applicantType   String   @default("foreign")
```

- [ ] **Step 2: FormFieldConfig にカラム＋一意制約変更**

`model FormFieldConfig`:
```prisma
  applicantType String?  // null=共通 / "japanese" / "foreign"
  // @@unique([fieldKey, schoolId]) を↓に変更
  @@unique([fieldKey, schoolId, applicantType])
```
（既存の `@@unique([fieldKey, schoolId])` 行を削除し上記に置換）

- [ ] **Step 3: prisma generate で型生成＋db push をローカル検証**

Run:
```bash
cd /tmp/review-repo-cicd && npx prisma generate && npx prisma db push
```
Expected: エラーなく完了。SQLite で一意制約の再構築が走るが既存行は applicantType=null で一意性維持。
（万一 db push が一意制約で失敗する場合は、先に `applicantType` を nullable 追加→既存重複が無いことを確認→制約適用、の順で対応）

- [ ] **Step 4: コミット**
```bash
git add prisma/schema.prisma && git commit -m "feat(schema): applicantType を Application/FormFieldConfig に追加"
```

---

## Task 2: タイプ定数とタイプ別フォーム既定

**Files:**
- Create: `lib/applicantType.ts`
- Modify: `lib/formFieldDefaults.ts`

- [ ] **Step 1: lib/applicantType.ts を作成**
```typescript
// 出願者タイプの定数と表示ラベル
export const APPLICANT_TYPES = ["foreign", "japanese"] as const;
export type ApplicantType = (typeof APPLICANT_TYPES)[number];

export const APPLICANT_TYPE_LABEL: Record<ApplicantType, string> = {
  foreign: "留学生",
  japanese: "日本人",
};

export function isApplicantType(v: unknown): v is ApplicantType {
  return v === "foreign" || v === "japanese";
}

// 日本人フォームで既定オフにする留学生専用フィールド
export const FOREIGN_ONLY_FIELDS = ["residenceStatus", "residenceExpiry", "japaneseLevel", "jlptCertified"];
```

- [ ] **Step 2: formFieldDefaults にタイプ別既定ヘルパーを追加**

`lib/formFieldDefaults.ts` 末尾に、タイプを受けて既定の有効/無効を返すヘルパーを追加:
```typescript
import { FOREIGN_ONLY_FIELDS, type ApplicantType } from "@/lib/applicantType";

// タイプ別の既定 isEnabled（japanese は留学生専用項目をオフ）
export function defaultEnabledFor(fieldKey: string, type: ApplicantType): boolean {
  if (type === "japanese" && FOREIGN_ONLY_FIELDS.includes(fieldKey)) return false;
  return true;
}
```

- [ ] **Step 3: tsc 検証**

Run: `npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 4: コミット**
```bash
git add lib/applicantType.ts lib/formFieldDefaults.ts && git commit -m "feat: 出願者タイプ定数とタイプ別フォーム既定"
```

---

## Task 3: /api/apply/form-config を type 対応

**Files:**
- Modify: `app/api/apply/form-config/route.ts`

- [ ] **Step 1: マージロジックを type 対応に拡張**

`GET` で `type`（applicantType）クエリを受け、マージ順を
`defaults(タイプ別) → 全校共通(共通) → 全校共通(type) → 学校(共通) → 学校(type)` に変更。
- `prisma.formFieldConfig.findMany` の where に applicantType 条件を追加（共通=null と該当 type の両方を取得）。
- 同一 fieldKey は「学校×type > 学校×共通 > 全校×type > 全校×共通 > 既定」で上書き（後勝ち）。
- `defaultEnabledFor(fieldKey, type)` を既定の isEnabled に用いる。
- `type` 未指定時は従来挙動（共通のみ）。

- [ ] **Step 2: 純関数として切り出してマージを単体確認可能にする**

マージ計算を `route.ts` 内のエクスポート関数 `mergeFormConfig(defaults, rows, type)` に切り出す（DB 非依存・純関数）。

- [ ] **Step 3: マージの簡易ユニット確認（Node）**

`/tmp/mergeCheck.mjs` 相当で、共通=表示・japaneseで在留資格=非表示・学校上書きが効くことを確認:
Run: `npx tsc --noEmit`（型）＋ 代表ケースを `node --input-type=module` で `mergeFormConfig` に通し、`residenceStatus` が japanese で `isEnabled:false` になることを確認。
Expected: 期待どおり。

- [ ] **Step 4: コミット**
```bash
git add app/api/apply/form-config/route.ts && git commit -m "feat(api): apply/form-config を出願者タイプ対応"
```

---

## Task 4: /api/admin/form-config を applicantType 対応

**Files:**
- Modify: `app/api/admin/form-config/route.ts`

- [ ] **Step 1: GET に applicantType を追加**

`schoolId` に加え `applicantType`（null|japanese|foreign）クエリを受け、その (schoolId, applicantType) の設定行を返す。未指定（共通）は applicantType=null を返す。

- [ ] **Step 2: PUT/保存に applicantType を反映**

upsert の where を `fieldKey_schoolId_applicantType`（新一意キー）に変更。保存ペイロードに applicantType を含める。

- [ ] **Step 3: tsc 検証**

Run: `npx tsc --noEmit` → 0 errors。

- [ ] **Step 4: コミット**
```bash
git add app/api/admin/form-config/route.ts && git commit -m "feat(api): admin/form-config を applicantType 対応"
```

---

## Task 5: /api/applications に applicantType（保存＋一覧フィルタ）

**Files:**
- Modify: `app/api/applications/route.ts`、`lib/schemas.ts`（ApplicationCreate に applicantType）

- [ ] **Step 1: スキーマに applicantType を追加**

`lib/schemas.ts` の出願作成スキーマに `applicantType: z.enum(["japanese","foreign"]).default("foreign")` を追加。

- [ ] **Step 2: POST で保存**

`app/api/applications/route.ts` の作成処理で `applicantType` を Application に保存。

- [ ] **Step 3: GET list に ?applicantType フィルタ**

一覧 GET（line ~195 以降）の where に、`applicantType` クエリがあれば `{ applicantType }` を追加（deletedAt:null と併用）。

- [ ] **Step 4: tsc 検証** → `npx tsc --noEmit` 0 errors。

- [ ] **Step 5: コミット**
```bash
git add app/api/applications/route.ts lib/schemas.ts && git commit -m "feat(api): applications に applicantType 保存とフィルタ"
```

---

## Task 6: 出願フローにタイプ選択ステップ

**Files:**
- Modify: `app/apply/page.tsx`、`lib/i18n/en.ts`

- [ ] **Step 1: state にタイプを追加**

`ApplyPageInner` の form state（または別 state）に `applicantType: ApplicantType` を追加（既定は未選択 or "foreign"）。

- [ ] **Step 2: タイプ選択 UI（最初のステップ）**

志望校選択の前に「日本人 / 留学生」を選ぶ画面を追加（2枚の大きな選択カード）。選択するまで次に進めない。選択後、以降のステップへ。i18n: `t("日本人")`, `t("留学生")`, 見出し等を `en.ts` に追加。

- [ ] **Step 3: form-config 取得に type を付与**

`/api/apply/form-config` 呼び出しに `&type=${applicantType}` を付ける（schoolId と併用）。

- [ ] **Step 4: 提出に applicantType を含める**

出願作成 POST のボディに `applicantType` を追加。

- [ ] **Step 5: tsc 検証** → `npx tsc --noEmit` 0 errors。

- [ ] **Step 6: コミット**
```bash
git add app/apply/page.tsx lib/i18n/en.ts && git commit -m "feat(apply): 出願フローに日本人/留学生 選択ステップ"
```

---

## Task 7: form管理の学校タブを ApplySchool 連動＋タイプ切替

**Files:**
- Modify: `app/admin/form-config/page.tsx`

- [ ] **Step 1: 学校タブを動的化（連動修正）**

ハードコードの `SCHOOL_TABS`（`...SCHOOLS.map`）を、マウント時に `GET /api/admin/schools` から取得した ApplySchool 一覧（`{ id: schoolKey, name }`）で構築する。先頭は `{ id: null, name: "全校共通" }`。

- [ ] **Step 2: タイプ切替 UI を追加**

学校タブに加え、「共通 / 日本人 / 留学生」の applicantType 切替を追加。`selectedApplicantType` state を持ち、`fetchConfigs(schoolId, applicantType)` に渡す。

- [ ] **Step 3: 取得・保存に applicantType を渡す**

`/api/admin/form-config?schoolId=...&applicantType=...` で取得、保存時も applicantType を送る（Task 4 と整合）。

- [ ] **Step 4: tsc 検証** → `npx tsc --noEmit` 0 errors。

- [ ] **Step 5: 手動確認**

ローカル/プレビューで: 志望校管理で学校追加 → form管理の学校タブに出る。タイプ切替で項目編集が (学校×タイプ) で保存される。

- [ ] **Step 6: コミット**
```bash
git add app/admin/form-config/page.tsx && git commit -m "feat(admin): form管理の学校タブをApplySchool連動化＋タイプ切替"
```

---

## Task 8: 申請詳細のタイプ表示＋一覧のタイプ絞り込み

**Files:**
- Modify: `app/admin/applications/[id]/page.tsx`（バッジ）、`app/admin/dashboard/page.tsx`（一覧フィルタ。実際の申請一覧の場所に合わせる）

- [ ] **Step 1: 申請詳細にタイプバッジ**

ヘッダー付近に `application.applicantType` を `APPLICANT_TYPE_LABEL` でバッジ表示（日本人=teal、留学生=blue 等）。

- [ ] **Step 2: 一覧にタイプ絞り込み**

申請一覧（ダッシュボードの一覧 fetch `/api/applications?${params}`）に applicantType フィルタ（すべて/日本人/留学生）を追加し、選択を params に反映。

- [ ] **Step 3: tsc 検証** → `npx tsc --noEmit` 0 errors。

- [ ] **Step 4: コミット**
```bash
git add app/admin/applications/[id]/page.tsx app/admin/dashboard/page.tsx && git commit -m "feat(admin): 申請詳細にタイプ表示・一覧にタイプ絞り込み"
```

---

## Task 9: 仕上げ・デプロイ

- [ ] **Step 1: 全体 tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 2: 非破壊確認**

`?type` 未指定の出願 form-config が従来どおり動くこと、既存申請（applicantType=foreign 既定）が一覧・詳細で正しく表示されることを確認。

- [ ] **Step 3: push（auto-deploy）**
```bash
git push origin chore/security-hardening
```
Expected: auto-deploy が package/prisma 変更検知 → db push（applicantType 追加・一意制約変更）→ build → 反映。デプロイ前バックアップ取得済み。`tail /srv/senmon/backup/auto-deploy.log` で完了確認（SSH 要許可）。

---

## 受け入れ基準（Phase 1）

- 出願者がタイプ（日本人/留学生）を選んでから学校→そのタイプ用フォームが表示される。
- 日本人選択時、在留資格・在留期限・日本語レベル等が既定で非表示。
- 管理画面 form管理で (学校×タイプ) のフォームを編集でき、志望校を追加するとform管理の学校タブに出る。
- 申請一覧/選考管理でタイプ絞り込み、申請詳細でタイプ表示。
- `type` 未指定・既存データは従来どおり（非破壊）。

## Self-Review メモ

- スペック各節 → タスク対応: タイプ軸(T1)、既定差分(T2)、apply form-config(T3)、admin form-config(T4)、保存+フィルタ(T5)、フロー選択(T6)、学校タブ連動+タイプ切替(T7)、詳細表示+一覧フィルタ(T8)、非破壊+デプロイ(T9)。Phase 2/3 は別計画。
- 型整合: `ApplicantType`/`applicantType` を全タスクで統一。form管理の保存キーは新一意キー `fieldKey_schoolId_applicantType`（T1/T4/T7 整合）。
- プレースホルダ無し。UI 詳細コードは実装時に既存パターン（isEnabled/タブ）に合わせる。
