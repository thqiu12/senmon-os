# 申請CSV 出力項目の選択（管理画面）設計書

**日付:** 2026-07-01 / **対象:** senmon/Compass / **ブランチ:** `chore/security-hardening`（本番・Postgres・マルチテナント）

## 目的
申請一覧CSVの出力項目を、管理画面で**選択・並べ替え**できるようにする。組み込み項目に加え、**カスタム項目（extraData。例「日本語学校名」）・出席率（priorAttendanceRate）**なども出力対象にできるようにする。

## 現状
`app/api/applications/export/route.ts` は**固定37列**。`priorAttendanceRate`（出席率）・`lastSchoolGraduatedOn`・`extraData`（カスタム項目）は**出力されない**。管理画面での列の選択機能は無い。

## 確定した設計判断（ユーザー承認済み）
- **保存型・全体共有**（SystemSetting）。一度設定すれば以後その列でCSV出力（全管理者共通）。
- **列の並べ替え可**（順序付き選択）。
- 組み込み項目＋カスタム項目の両方を選べる。プリセット複数は対象外（YAGNI）。
- tenant パターン準拠。

---

## ① 列カタログ `lib/csvColumns.ts`
- **組み込み列** `BUILTIN_CSV_COLUMNS: { key: string; label: string; resolve: (app) => string }[]`：
  - 現行37列（applicationNo/status/createdAt/lastName/…/agentName）を key/label/resolver 化。relation 依存（documents/interviewFeedbacks/enrollmentProcedure/agent）は resolver 内で処理。
  - **追加**：`priorAttendanceRate`（日本語学校での出席率）・`lastSchoolGraduatedOn`（卒業見込年月）・`source`/`utmCampaign`/`referrer`（流入元）。
- **DEFAULT_CSV_COLUMN_KEYS**：現行37列の key 配列（未設定時の既定＝後方互換）。
- **カスタム列**：`customCsvColumns(configRows)` = FormFieldConfig の `isCustomField` 項目を `{ key: fieldKey, label }` に（重複 fieldKey は代表ラベル）。値は各申請の `extraData[fieldKey]`。
- **resolveRow(app, columns)**：選択列（`{key,label}[]`）の順に値を返す純関数（組み込みは resolver、カスタムは `extraData[key]` を文字列化）。unit 可能。

## ② 保存（SystemSetting・全体共有）
- key=`applications_csv_columns`、value=順序付き JSON `[{ key, label }]`。label を持つのでエクスポート時に form-config 再取得不要。
- 未設定 → `DEFAULT_CSV_COLUMN_KEYS`（現行37列・現行順）。

## ③ 管理API `app/api/admin/csv-columns/route.ts`（withTenant + admin + `data.export`）
- GET：`{ selected: {key,label}[], available: { builtin: {key,label}[], custom: {key,label}[] } }`（現在の選択＋利用可能な全列）。custom は全 FormFieldConfig のカスタム項目を集約。
- PUT：body=`{ columns: {key,label}[] }` を SystemSetting に保存（sanitize：既知の組み込み key かカスタム項目 key のみ許可、label は文字列）。

## ④ 管理UI（申請一覧ページ）
- 「**CSV出力項目**」ボタン→モーダル：
  - 利用可能列（組み込み／カスタムのグループ）をチェックで選択。
  - 選択済みリストを**ドラッグ or ↑↓で並べ替え**。
  - 「既定に戻す」（DEFAULT に戻す）。保存で PUT。
- 既存の「CSVダウンロード」リンクはそのまま（保存済み選択で出力）。
- 申請一覧ページの場所：既存の一覧 UI に沿って配置（既存コンポーネント流用）。

## ⑤ エクスポートAPI 改修（`app/api/applications/export/route.ts`）
- 冒頭で SystemSetting の列定義を取得（未設定は DEFAULT）。カスタム列があれば findMany の select/include に `extraData` を含める。
- ストリーム先頭で `HEADERS = columns.map(c=>c.label)` を出力。各申請で `resolveRow(app, columns)` → escapeCsv → 行出力。
- `data.export` 権限・ストリーミング・BOM・ページング維持。

## ⑥ 後方互換・スコープ
- 未設定なら**現行37列そのまま**（挙動不変）。
- schema 変更なし（SystemSetting を使う）。tenant 準拠。
- 対象外（YAGNI）：名前付きプリセット複数、個人別設定、他のCSV（面接候補/OC等）への横展開。

## テスト / 検証
- ユニット `tests/unit/csv-columns.test.ts`：`resolveRow`（組み込み resolver・カスタム extraData・順序）、DEFAULT が現行37と一致、sanitize（未知 key 除外）。
- build／既存 e2e 非回帰。
- 実機（compass_e2e）：カスタム項目付き申請を用意→列選択に「日本語学校名」「出席率」を追加保存→`/api/applications/export` の出力にその2列＋値が出る。既定（未設定）で現行37列。

## 受け入れ基準
- 管理画面で CSV 出力列を選択・並べ替え・保存でき、CSVがその列・順で出力される。カスタム項目（日本語学校名）・出席率も出せる。
- 未設定時は現行37列で非破壊。unit/build/e2e 緑。

## 影響ファイル
- `lib/csvColumns.ts` ＋ `tests/unit/csv-columns.test.ts`
- `app/api/admin/csv-columns/route.ts`（新）
- `app/api/applications/export/route.ts`（動的列に改修）
- 申請一覧の管理UI（列選択モーダル・該当 page/コンポーネント）
