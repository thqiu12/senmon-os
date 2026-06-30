# ネット広告連携（流入元捕捉＋分析）設計書（サブプロジェクトC）

**日付:** 2026-06-30 / **対象:** senmon/Compass / **ブランチ:** `chore/security-hardening`（本番・Postgres・マルチテナント）

## 位置づけ
「OC予約・フォーム・分析・広告連携」の **C（広告連携）**。A（OC予約）・B（OC分析）完了済み。本specは C の **①流入元捕捉＋②分析**（MVP）。③媒体への Conversion API 送信は将来（スコープ外）。

## 目的
出願フォームにも流入元（UTM/gclid/referrer）を捕捉し、**「広告 → OC → 出願」のフル経路を流入元別に可視化**する。どの広告/キャンペーンが出願を生んだかを測り、広告ROIを最適化する基盤にする。

## 確定した設計判断（ユーザー承認済み）
- 範囲＝**①出願フォームの流入元捕捉 ＋ ②流入元別分析**。**③ Conversion API は今回やらない**。
- 捕捉項目は OCReservation と対称（source/utmCampaign/utmMedium/gclid/referrer）。
- 分析は **`/admin/oc` 分析タブに「流入元/広告」セクション追加**（既存 OC分析基盤を流用・最小改修）。
- tenant パターン準拠（withTenant/getTenantDb/organizationId）。

---

## ① 出願フォームの流入元捕捉
- **Application に5列追加**（すべて nullable）：`source` `utmCampaign` `utmMedium` `gclid` `referrer`。schema変更＋migration（migrate deploy）。
- **捕捉**（`app/apply/page.tsx`）：マウント時に URL の `utm_source`/`utm_campaign`/`utm_medium`/`gclid` ＋ `document.referrer` を state に保持（OCの `/oc` と同方式）。preselect の `?school=` 処理と同じ effect で取得。
- **送信/保存**：出願POST（`/api/applications`）の body に同梱。`ApplicationCreateSchema`（`lib/schemas.ts`）に `source?/utmCampaign?/utmMedium?/gclid?/referrer?`（任意・max長）を追加し、`prisma.application.create` の data に保存。**非破壊**（未指定なら null）。
- resume（途中再開）では上書きしない（初回作成時のみ捕捉）。

## ② 流入元/広告 分析
- 純関数 `lib/attribution.ts` `computeAttribution(applications, reservations, opts)`：
  - 入力：Application（`{ email, source, createdAt }` 程度）、OCReservation（`{ email, source, status, createdAt }`）。
  - source 正規化（無/空→`"(直接)"`）。
  - 源別に集計：**出願数**（その source の Application 数）、**OC予約数**（その source の OCReservation 数）、**OC→出願転換数**（OC予約のメールが Application に存在＋出願日≥予約日。B の転換定義を流用）、**転換率**（OC→出願 / OC予約）。
  - 返す：`byAcquisition: [{ source, applications, ocReservations, ocConverted, ocConvRate }]`（出願数降順）。
- **API**：`app/api/admin/oc/analytics/route.ts` を拡張し、レスポンスに `byAcquisition` を追加（既存 OC指標はそのまま）。Application は B で既に email/createdAt を取得しているので、`source` を select に追加すれば流用できる。OCReservation も既に source 取得済み。学校/期間フィルタは B と同じ（出願側は期間=createdAt で絞るか全期間か → **出願は createdAt で同じ from/to 期間に絞る**）。
- **UI**：`/admin/oc` 分析タブに「**流入元/広告**」セクション（テーブル）を追加：流入元 / 出願数 / OC予約数 / OC経由出願 / 転換率。既存の分析タブ内に並べる。

## スコープ外（将来）
- **③ Google/Meta Conversion API** への成果（予約・出願）サーバー送信（広告自動最適化）。媒体認証情報・媒体別実装が必要なため別途。
- 出願フォーム以外（語学校文書等）の流入元捕捉。
- 高度な多タッチアトリビューション（ここはラストタッチ＝最後の source）。

## テスト / 検証
- ユニット `tests/unit/attribution.test.ts`：`computeAttribution`（源別の出願数/OC予約数/転換[email一致・日付]/(直接)集約/降順）。
- ApplicationCreateSchema に流入元を足しても既存出願が通る（e2e api 非回帰）。
- build。実機（compass_e2e + 既定org）：source付きの出願＋OC予約＋一致メールを仕込み→`/api/admin/oc/analytics` の `byAcquisition` が正しい源別数値を返す。捕捉：`/apply?school=X&utm_source=google` で出願→Application.source="google" が保存される。

## 受け入れ基準
- 出願フォームが `?utm_*`/`gclid`/`referrer` を捕捉し Application に保存（既存出願は非破壊）。
- `/admin/oc` 分析タブの「流入元/広告」で 源別の 出願数/OC予約数/OC経由出願/転換率 が表示。
- schema変更は Application 5列のみ。unit/build/e2e グリーン。

## 影響ファイル
- `prisma/schema.prisma` + migration（Application 5列）
- `lib/schemas.ts`（ApplicationCreateSchema に流入元）
- `app/apply/page.tsx`（UTM捕捉＋POST同梱）
- `app/api/applications/route.ts`（保存）
- `lib/attribution.ts` + `tests/unit/attribution.test.ts`
- `app/api/admin/oc/analytics/route.ts`（byAcquisition 追加）
- `app/admin/oc/page.tsx`（流入元/広告 セクション）
