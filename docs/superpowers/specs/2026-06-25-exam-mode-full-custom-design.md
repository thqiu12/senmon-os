# 選考区分フル自由化 設計書（方式A）

**日付:** 2026-06-25 / **対象:** senmon/Compass 出願システム / **ブランチ:** `chore/security-hardening`（本番・Postgres）

## 目的
出願フォームの「選考区分・推薦」を、現状の固定3区分（一般/指定推薦/特待生）の ON/OFF だけでなく、**学校×出願者タイプ別に、区分の追加・改名・並べ替え・削除・筆記有無の設定・区分ごとの専用入力欄の付与**まで管理画面で行えるようにする。値の固定（ExamModeEnum）・条件付き入力欄・受験票PDF・選考区分別学費・i18n といった既存の結合を、後方互換を保ったまま再設計する。

## 確定した設計判断（ユーザー承認済み）
- 区分は学校×タイプ別の**リスト**。各区分は不変の内部ID＋編集可能な表示名を持つ（改名は表示名のみ＝既存出願/PDF/学費はIDで一貫）。
- 区分ごとに**任意の専用入力欄**を紐づけられる（既存カスタム項目に「表示条件＝選考区分」を足して実現）。
- 既存の「推薦機関名・種別」は**区分のトグル(`showReferrer`)**で出し分け（列バックの既存フィールドを維持）。「特待生要件」の案内は**区分の `description`**へ。
- 方式A（カスタム項目機構に統合）・一気に全部（Phase1+2同時）。

---

## データモデル

### 1. 選考区分リスト（既存 examMode 設定行の `options` を JSON 化）
`FormFieldConfig`（fieldKey="examMode", scope=学校×タイプ）の `options`（TEXT）に、区分配列の JSON を保存：
```json
[
  {"id":"一般","label":"一般選抜","exam":true,"showReferrer":true,"description":""},
  {"id":"指定推薦","label":"指定推薦","exam":false,"showReferrer":true,"description":""},
  {"id":"特待生","label":"特待生選考","exam":false,"showReferrer":false,"description":"特待生選考の要件: …"}
]
```
- `id`: 不変の内部キー。**既定3区分は id=現値**（"一般"/"指定推薦"/"特待生"）＝既存出願 `Application.examMode` がそのまま有効。新区分は生成ID（`em_<base36 連番>` 等、日本語ラベル非依存）。
- `label`: 出願フォーム/PDF表示名（編集可）。
- `exam`: 筆記試験あり(true)/免除(false)。`isNoWrittenExamSchool` 等の既存筆記ロジックと整合（区分の exam が最終的な筆記要否）。
- `showReferrer`: 選択時に推薦機関名(`referrerName`)・種別(`referrerType`)欄を出すか。
- `description`: 選択時に出す案内文（任意）。
- 配列順 = 表示順。

スキーマ変更なし（既存 options 列を使う）。`FormFieldConfig.options` は #2 / カスタム項目で既に存在。

### 2. 条件付きカスタム項目（区分ごとの専用入力欄）
`FormFieldConfig` に新カラム **`showWhenExamMode String?`** を追加（nullable）。
- `null` = 常に表示（現状のカスタム項目と同じ）。
- 区分ID = その区分が選択されたときのみ表示。
- **Prisma マイグレーション1本**（加算・nullable・既定 null）。本番は `prisma migrate deploy`。
- 既存カスタム項目は `null`（影響なし）。

---

## パーサ / 純関数（`lib/applyExamModes.ts` を拡張）
- `parseExamModeOptions(options: string | null): ExamModeOption[]`
  - JSON配列 → そのまま（各要素を検証・既定補完: exam=false, showReferrer=false, label=id, description=""）。
  - CSV（#2 の旧形式: "一般\n指定推薦"）→ 既定3区分のうち列挙された id だけを既定属性付きで返す（後方互換）。
  - 空/null → 既定3区分（DEFAULT_EXAM_MODES）。
- `DEFAULT_EXAM_MODES: ExamModeOption[]` = 一般(exam:true,showReferrer:true) / 指定推薦(exam:false,showReferrer:true) / 特待生(exam:false,showReferrer:false,description:既定要件文)。
- `examModesForConfig(formConfig): ExamModeOption[]` = formConfig 内の examMode 行の options を parse（行が無ければ DEFAULT、isEnabled=false なら空＝節非表示）。
- `examModeLabel(formConfig|options, id): string` = ID→表示名（PDF・確認画面用、未知IDは id を返す）。
- `EXAM_MODE_VALUES`（旧定数）は DEFAULT_EXAM_MODES の id 配列として残し、依存箇所を順次置換。
ユニットテスト: JSON/CSV/空 の解釈、既定補完、ラベル解決、isEnabled=false→空。

---

## 検証（`lib/schemas.ts` + applications POST）
- `ExamModeEnum`（`z.enum([...3])`）→ **`z.string().min(1).max(20)`** に緩和（任意区分IDを許容）。`examMode` を参照する全 schema（ApplicationCreateSchema 等）を更新。
- 出願API POST（`app/api/applications/route.ts`）に検証追加（#1 と同要領）: 解決した学校×タイプの区分リストを取得し、`body.examMode` がその id 集合に含まれるか検証。未設定校は DEFAULT_EXAM_MODES の id を許容。範囲外なら400。
- `examModeTuitionAmounts`（学校別学費の区分→金額マップ）は **id キー**。既定idは現値なので既存マップ不変。

---

## 受験票PDF（`lib/pdf/exam-ticket.ts`）
- 現状 `examMode`（保存値=ID）を印字。**ID→表示名(label)に解決して印字**するよう変更。
- PDF生成側に学校×タイプの区分リスト（または label）を渡す。生成元（API/呼び出し箇所）で `examModesForConfig` を解決して label を渡す。未知IDは ID をそのまま印字（フォールバック）。

---

## 出願フォーム（`app/apply/page.tsx` Step2）
- 選考区分カードを**配置リスト(`examModesForConfig(formConfig)`)から描画**（label＋筆記バッジ＝`exam`）。`enabledExamModes` の固定3配列フィルタを置換。
- グリッド列数は区分数に応じて可変（既存ロジック流用）。区分0件 → 節ごと非表示（既存）。
- 既定選択補正（選択中IDが配置に無ければ先頭へ）＝既存 useEffect を新パーサに合わせる。
- 選択時の表示：
  - `showReferrer===true` の区分 → 推薦機関名(`referrerName`)・種別(`referrerType`)欄（既存JSX流用、`form.examMode===id && opt.showReferrer` で表示）。
  - `description` があれば案内ボックス表示（特待生要件の既存ボックスを汎用化）。
  - `showWhenExamMode===選択ID` のカスタム項目を表示（Step2 内に条件付きカスタム描画。`isCustomField`＋`showWhenExamMode`一致＋extraData値）。
- 保存値 `form.examMode` = 区分ID。確認画面(Step5)は label 表示（`examModeLabel`）。

---

## 管理UI（`app/admin/form-config/page.tsx`）
- 「選考区分・推薦で表示する区分」カードを**リスト編集**に置換：
  - 行ごとに：表示名(input)／筆記有無(toggle)／推薦機関欄(toggle)／説明(textarea任意)／並べ替え(↑↓ or drag)／削除。各行に内部ID（新規は生成、既定は固定）。
  - 「＋区分を追加」ボタン（新規ID生成、label空→入力）。
  - 保存時、examMode 設定行の `options` に区分配列JSONを書き込み（PUT、#2 で options 永続化済）。
- カスタム項目の追加/編集（モーダル）に「**表示条件：選考区分**」セレクト（なし／各区分）を追加 → `showWhenExamMode` を保存（POST/PUT に項目追加）。

---

## 後方互換・移行・シード
- 既存 `Application.examMode` ∈ {一般,指定推薦,特待生}（=既定id）→ そのまま有効。
- 既存スクール（examMode 行なし or CSV）→ パーサが DEFAULT / CSV解釈でフォールバック。明示シードは不要（無設定＝既定3区分）。`showWhenExamMode` 新カラムは既存行 null。
- 新カラム追加マイグレーション（`prisma/migrations/<ts>_add_showwhenexammode/migration.sql`: `ALTER TABLE "FormFieldConfig" ADD COLUMN "showWhenExamMode" TEXT;`）。schema.prisma に列追加。
- 既存の指定推薦→推薦機関、特待生→要件 の挙動は、無設定校では DEFAULT_EXAM_MODES（showReferrer/description を既定で持つ）により**自動的に維持**。

---

## テスト / 検証
- ユニット: applyExamModes パーサ（JSON/CSV/空/補完/ラベル）、検証関数（区分ID範囲）、条件付きカスタム表示判定。
- ビルド/型: `npx tsc --noEmit` 0、`next build` 78/78。
- e2e: `student-apply.spec.ts` 非回帰（既定3区分のまま動く）。
- 実機（compass_e2e）通し: ①管理で新区分追加（筆記なし・専用カスタム項目紐づけ）→ ②出願フォームで新区分が出る・選択で専用欄が出る・保存 → ③確認/申請詳細で label 表示 → ④受験票PDFが label 印字 → ⑤改名しても既存出願が壊れない（IDキー）。検証後クリーンアップ。

## 受け入れ基準
- 管理画面で選考区分を学校×タイプ別に 追加/改名/並べ替え/削除/筆記有無/推薦機関欄/説明 設定でき、保存が効く。
- カスタム項目に「表示条件＝選考区分」を設定でき、出願フォームでその区分選択時だけ表示・保存される。
- 出願フォーム/確認/申請詳細/PDF が表示名(label)で、内部はID で一貫。既存出願・既定校は無改修で従来どおり。
- 全 unit・build・e2e グリーン。schema 変更は `showWhenExamMode` 1列のみ（migrate deploy）。

## スコープ外（YAGNI）
- 区分ごとの「学費を管理UIで区分行から直接編集」までは本spec外（学費は既存 examModeTuitionAmounts の編集箇所を id 対応にするのみ。新規UIは作らない）。
- 条件分岐は「選考区分＝X」の単一条件のみ（複数条件・AND/OR は作らない）。
- 区分のタイプ別（日本人/留学生）以上の出し分けは既存スコープ次元で足りるため追加しない。

## 影響ファイル
- `prisma/schema.prisma` + 新マイグレーション（showWhenExamMode 列）
- `lib/applyExamModes.ts`（パーサ/型/ラベル拡張）
- `lib/schemas.ts`（ExamModeEnum 緩和）
- `app/api/applications/route.ts`（examMode 範囲検証）
- `app/apply/page.tsx`（区分配置描画＋条件付きカスタム＋推薦/説明）
- `app/admin/form-config/page.tsx`（区分リスト編集＋カスタム項目の表示条件）
- `app/api/admin/form-config/route.ts`（POST/PUT に showWhenExamMode）
- `lib/pdf/exam-ticket.ts`（label 印字）＋PDF呼び出し箇所
- テスト各種
