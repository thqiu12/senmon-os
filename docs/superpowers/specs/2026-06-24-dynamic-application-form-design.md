# 出願フォーム フル動的化 — 設計仕様

- 日付: 2026-06-24
- 対象: senmon / Compass（入学・出願システム）申請者フォーム `app/apply`
- ブランチ: `feat/postgres-migration`（本番デプロイ元）
- ステータス: 設計レビュー待ち

## 1. 目的

出願フォーム（申請者画面）を **FormFieldConfig 完全駆動** にし、セクション・並び順・表示/非表示・必須・ラベル・ヒント、さらに **管理画面で追加した任意のカスタム入力項目とその回答の保存** まで、すべて「各種設定 → form管理」（学校 × 出願者タイプ単位）から**コード変更なし**で制御できるようにする。

既存の標準項目の使い勝手（日付ピッカー・選択肢・形式チェック等）は維持する（ハイブリッド方式）。

## 2. 現状（コード確認済み）

- フォームは `app/apply/page.tsx`（約2300行）。Step1〜5（申請情報→志望校→書類→選考費→確認）。
- 標準入力項目は `fieldKey` ごとに**写死で描画**。表示/必須/ラベル/ヒントは config 駆動化済み（`lib/applyFieldVisibility.ts`）。
- マージ: `lib/applyFormConfigMerge.ts`（apply 側は有効項目のみ返す、学校×タイプ優先）。
- 書類（file）項目は **既に config 動的描画**（Step3）。
- 管理画面 form管理: セクション選択・**ドラッグ並び替え**・項目追加(POST)・削除 が既に存在。学校×タイプ切替も実装済み。
- `Application` は固定カラムのみ。**カスタム項目の回答を保存する場所が無い**。
- 標準項目の選択肢（国籍/都道府県/性別/日本語レベル/在留資格/卒業状況）と特殊バリデーション（郵便番号7桁/メール形式/志望動機300字/生年月日 年範囲）は**コードに写死**。

## 3. 中核アプローチ（ハイブリッド動的）

3つの層に分離する。

### 3.1 データモデル（非破壊・追加のみ）
| モデル | 追加 | 用途 |
|---|---|---|
| `Application` | `extraData Json?`（PG。null可） | カスタム項目の回答を `{ [fieldKey]: value }` で保存 |
| `FormFieldConfig` | `options String?`（null可。改行区切り or JSON） | カスタム select 項目の選択肢を管理画面で定義 |
| `FormFieldConfig` | `placeholder String?`（null可・任意） | カスタム項目のプレースホルダ（任意。後続でも可） |

既存カラムは変更しない。`extraData`/`options` は null 既定で完全後方互換。

### 3.2 項目レジストリ（コード）— `lib/applyFieldRegistry.ts`
既知の**標準 fieldKey** ごとに、以下を定義した単一ソース:
- `column`: 対応する `Application` のカラム名（コア項目）。custom_ は無し → extraData。
- `widget`: 描画ウィジェット種別（`text|tel|email|textarea|select|date-range|month|checkbox|postal`）。
- `options`: 固定選択肢（国籍/都道府県/性別/日本語レベル/在留資格/卒業状況）。
- `validate`: 特殊検証（postal=7桁、email=形式、applicationReason=300字、birthDate=年範囲 等）。
- `section`/`displayOrder` の既定（= 現行の FORM_FIELD_DEFAULTS と整合）。

未知（`custom_*`）の fieldKey はレジストリに無い → `fieldType` から汎用ウィジェットを選び、値は `extraData` に保存、検証は必須チェック（＋型に応じた最小限）。

### 3.3 動的レンダラー（コンポーネント）
- `<DynamicField config registryEntry value onChange error/>`: 1項目を適切なウィジェットで描画。標準項目はレジストリの専用ウィジェット/選択肢、カスタムは `fieldType` の汎用ウィジェット。ラベル/ヒント/必須は config（`lib/applyFieldVisibility` を流用）。`options` は レジストリ → 無ければ config.options。
- セクション描画: 有効項目を **`section` でグルーピングし `displayOrder` 昇順** に並べ、セクション見出し＋グリッドで表示。セクションの並び順は「各セクション内の最小 displayOrder」で決定。

### 3.4 ステップ構成（フロー）
- **Step 1「申請情報」= form-config 入力項目をすべて動的描画**（個人情報/連絡先/住所/在日情報/最終学歴/志望動機/カスタム…をセクション順に）。
- **Step 2「志望校」= 構造的（ApplySchool 駆動）のまま**。志望校/学科/コース/入学希望年月、選考区分(examMode)・推薦欄は form-config ではなくマスタ/条件駆動なので**現状維持**。
- Step 3 書類（既に動的）／Step 4 選考費／Step 5 確認。
- 確認画面(Step5)も config を反復して動的表示（カスタム項目含む）。

> フロー変更点: 現在 Step2 にある「志望動機・最終学歴」は Step1 の動的リストに移動する（＝申請情報が一画面に集約）。これは意図的な整理。要承認。

### 3.5 バリデーション
`validateStep1` を config 反復に変更: 有効な各項目について `fieldRequired` で必須判定 → 空ならエラー。標準項目はレジストリの `validate` を追加適用。カスタム項目は必須＋型最小限。Step2（志望校）は現状維持。

### 3.6 保存（POST `/api/applications`）
- コア項目: レジストリの `column` に従い従来カラムへ。
- カスタム項目: `extraData` に `{fieldKey: value}` で格納。
- `ApplicationCreateSchema`（zod）を拡張: コアは現行通り検証、`extraData` は `record(string|boolean)` 等で緩く受ける。未知キーは許容。
- **非破壊**: extraData 未指定の既存出願は従来通り。

### 3.7 管理画面での表示
- 申請詳細: `extraData` の各項目を config のラベルで表示（在日/個人情報等のコア項目は従来通り）。
- form管理: カスタム項目追加時に `options`（select の場合）を入力できる UI を追加（POST に options を含める）。POST/DELETE を applicantType 対応にする（現状 common 固定の繰越も解消）。

## 4. 非目標（YAGNI）
- 条件分岐ロジック（「Aを選んだらB表示」）はやらない。
- フィールド型の無制限拡張はしない（text/textarea/select/date/month/checkbox/file/tel/email に限定）。
- 多段ステップの完全自由化（セクション→任意ステップ割当）はしない。入力は Step1 集約、志望校は Step2 固定。
- CSV/分析へのカスタム項目反映は本設計外（必要になれば別途）。

## 5. フェーズ分割

- **Phase 1 — 基盤**: スキーマ（`extraData`/`options`）+ `lib/applyFieldRegistry.ts` + `<DynamicField>`/セクション動的描画。**Step1 の個人情報系を動的描画に置換し現行と完全パリティ**（見た目・検証・保存が現状と一致）。
- **Phase 2 — 集約**: 最終学歴・志望動機を Step1 動的リストへ統合。確認画面(Step5)を config 反復に。Step2 は志望校＋選考区分のみに整理。
- **Phase 3 — カスタム項目**: 汎用ウィジェット描画 + `extraData` 保存 + 申請詳細表示 + form管理のカスタム追加UI（options/型）。POST/DELETE の applicantType 対応。
- **Phase 4 — 仕上げ**: バリデーション網羅、E2E（標準パリティ＋カスタム項目の出願→保存→詳細表示）、本番カットオーバー確認。

各フェーズで TDD（純関数=レジストリ/マージ/検証のユニット）＋ `next build` ＋ Playwright E2E ＋ 実ブラウザ確認。`feat/postgres-migration` に段階 push。

## 6. 受け入れ基準
- 管理画面で セクション/並び順/表示/必須/ラベル/ヒント を変更 → 出願フォームに反映（コード変更なし）。
- 管理画面で **新規カスタム入力項目（text/select 等）を追加 → 出願フォームに表示 → 出願 → 回答が保存 → 申請詳細に表示**。
- 標準項目の専用UI（日付/選択肢/形式チェック/300字 等）と既存出願の動作は不変（非破壊）。
- 学校×タイプ別の出し分けが全項目で機能。

## 7. リスクと対策
- **公開フォームの大改修**: フェーズ毎にパリティを E2E で担保。Phase 1 は「見た目・挙動が現状と一致」を必須条件に。
- **extraData の型/検証**: zod で緩く受けるが、未知キーの値長制限（例 各2000字）を設けて肥大化・悪用を防ぐ。
- **PG カットオーバー中**: schema 追加は additive（db push 安全）。`feat/postgres-migration` の移行 runbook と整合。
- **選択肢の移行**: 標準 select の選択肢はレジストリに保持（config.options は custom 用）。混同しないよう優先順位を明記（registry > config.options）。
