# オープンキャンパス(OC) 分析 設計書（サブプロジェクトB）

**日付:** 2026-06-30 / **対象:** senmon/Compass / **ブランチ:** `chore/security-hardening`（本番・Postgres・マルチテナント）

## 位置づけ
「OC予約・フォーム・分析・広告連携」の **B（OC分析）**。A（予約・フォーム）完了済み。C（広告連携）は後続。本specはBのみ。

## 目的
OC予約データを集計し、**予約数・出席率・キャンセル率・OC→出願の転換率・OC流入元別**を管理画面で可視化する。招生施策とOCの効果測定に使う。

## 確定した設計判断（ユーザー承認済み）
- 転換＝**メール一致**（OC予約のメール = 出願のメール、かつ **出願日 ≥ 予約日**）。明示紐付け/schema変更はしない。
- 置き場所＝**`/admin/oc` の「分析」タブ**。
- 流入元軸は **OC側(source/utm)のみ**（出願側の流入元捕捉は C）。
- **schema 変更なし**（既存 OCReservation + Application の読み取りのみ）。都度集計（キャッシュ/集計テーブルは作らない＝YAGNI）。

---

## 指標の定義
スコープ＝テナント（withTenant/getTenantDb）内の OCReservation（と Application）。フィルタ：`?school=`（OCEvent.schoolKey）・期間 `from`/`to`（OCEvent.startAt 基準）。

- **予約者数**: 対象OC予約の件数。**参加人数合計**: attendees 合計。
- **status別**: 予約 / 出席 / 欠席 / キャンセル の件数。
- **出席率**: 出席 / (出席 + 欠席)（＝開催済みで結果が付いたもの基準）。開催前(予約のまま)は分母外。
- **キャンセル率**: キャンセル / 全予約。
- **OC→出願 転換**:
  - 出願メール集合 = 論理削除でない Application の email（小文字正規化）。
  - OC予約者(メール正規化)について、同メールの Application が存在し `application.createdAt ≥ reservation.createdAt` なら「転換」。
  - **予約→出願 転換率** = 転換した予約者数 / 全予約者数（メール重複は予約単位でカウント。同一人の複数予約は各予約で判定）。
  - **出席→出願 転換率** = status=出席 の予約者のうち転換した割合。
- **流入元別**: OC予約を `source`（無ければ "(直接)"）でグルーピング → 予約数・転換数・転換率。`utmCampaign` でも同様（任意で2軸目）。
- **イベント別**: 各OCイベントの 予約/出席/欠席/キャンセル/残席/転換。

## API: `app/api/admin/oc/analytics/route.ts`
- `withTenant` + `getSession`/`isAdmin` + `hasCapability(session, "form.edit")`。
- GET `?school=&from=&to=`。実装：
  1. 対象 OCEvent を取得（school/期間でフィルタ）。
  2. その events の OCReservation を取得（status/email/attendees/source/utmCampaign/createdAt/ocEventId）。
  3. Application の email 一覧を取得（`deletedAt: null`、email + createdAt）→ メール→最古createdAt等のマップ（小文字）。
  4. コードで集計：全体サマリ・status別・出席率・キャンセル率・転換（メール照合＋日付）・流入元別・イベント別。
- 純関数 `lib/ocAnalytics.ts`（reservations + applicationEmails → 集計結果）に集計ロジックを置き、route は DB取得＋呼び出しのみ（テスト可能）。
- レスポンス JSON：`{ summary, byStatus, byEvent[], bySource[], conversion: {reservedToApplied, attendedToApplied} }`。

## UI: `/admin/oc` 「分析」タブ
- `app/admin/oc/page.tsx` にタブ（イベント管理 / 分析）を追加、または分析を別コンポーネント。
- 学校 select＋期間（from/to の date 入力、既定=直近3ヶ月など）。
- **サマリカード**：予約者数 / 出席率 / キャンセル率 / 予約→出願転換率。
- **イベント別テーブル**：イベント・日時・予約/出席/欠席/キャンセル/残・転換率。
- **流入元別テーブル**：source・予約数・転換数・転換率。
- 既存管理UIのスタイル流用。

## テスト / 検証
- ユニット `tests/unit/oc-analytics.test.ts`：`lib/ocAnalytics` の集計（status別・出席率・キャンセル率・メール照合転換[日付条件含む]・流入元別・正規化）。
- build。実機(compass_e2e + 既定org)：OCイベント+予約+一部出席+同メールの出願を仕込み→`/api/admin/oc/analytics` が正しい数値を返す。
- tenant パターン準拠。

## 受け入れ基準
- `/admin/oc` 分析タブで、学校×期間の 予約数・出席率・キャンセル率・OC→出願転換率・イベント別・流入元別 が表示される。
- 転換はメール一致（出願日≥予約日）。schema 変更なし。unit/build グリーン。

## スコープ外（YAGNI / 後続C）
- 出願フォームの流入元(UTM)捕捉・ad→OC→出願 のフル経路・Google/Meta Conversion API は **C**。
- 集計の事前計算/キャッシュ・期間粒度の高度な時系列グラフ（まずはテーブル＋カード）。

## 影響ファイル
- `lib/ocAnalytics.ts`（集計純関数）+ `tests/unit/oc-analytics.test.ts`
- `app/api/admin/oc/analytics/route.ts`（新）
- `app/admin/oc/page.tsx`（分析タブ追加）
