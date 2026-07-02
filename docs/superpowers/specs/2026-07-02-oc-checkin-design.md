# OC当日チェックイン（受付ページ＋飛び込み登録）設計書

**日付:** 2026-07-02 / **対象:** senmon/Compass / **ブランチ:** `chore/security-hardening`（本番・Postgres・マルチテナント）

## 位置づけ
OC Phase 2 の **サブプロジェクト B**（A→B→C の2つ目。A=自動メール完成済み、C=広告ROIレポートは後続）。ユーザー要望「#2 当日チェックイン運営」。

## 目的
OC当日の受付で、予約者の**出席登録を高速化**する（現状は管理画面のドロップダウンで1件ずつ手動）。加えて予約なしの**飛び込み来場者**もその場で出席登録できるようにする。

## 現状
- 予約ステータス変更は `PATCH /api/admin/oc/reservations {id,status}`（管理OC画面のドロップダウン）で可能。
- 名簿取得は `GET /api/admin/oc/reservations?eventId=`。
- `app/api/admin/oc/reservations/route.ts` は GET＋PATCH のみ（POST なし）。
- `generateReservationNo`（`OC-YYMMDD-xxxx`）は公開ルート `app/api/oc/reservations/route.ts` 内のローカル関数。

## 確定した設計判断（ユーザー承認済み）
- 方式＝**スタッフ受付ページ**（QR無し）。既存 GET/PATCH を再利用。
- **飛び込み登録を含める**：定員は**ハードブロックしない**（受付判断で超過可・残席は表示）、`source="walkin"`、メールは**任意（空文字可）**、確認メールは送らない。
- `generateReservationNo` を **`lib/ocReservationNo.ts` に共通化**（公開ルートも置換）。
- **スキーマ変更なし。**

---

## ① 受付ページ `app/admin/oc/checkin/page.tsx`（新規・"use client"）
- 管理レイアウト配下（既存 `/admin/oc` と同じ認証境界）。
- **イベント選択**：`GET /api/admin/oc/events` から一覧。既定は「本日開催（startAt が今日・JST）」を優先選択。クエリ `?eventId=` があればそれを選択。
- **名簿**：`GET /api/admin/oc/reservations?eventId=<id>` を再利用。各行に 氏名 / 予約番号 / 人数(attendees) / ステータスchip。
- **検索**：氏名 or 予約番号でクライアント側フィルタ（イベント単位なので件数は小さい）。
- **ワンタップ 出席／取消**：`PATCH /api/admin/oc/reservations {id,status}` を再利用。`予約`⇔`出席` をトグル（楽観更新→失敗時ロールバック）。既に `欠席`/`キャンセル` の行も 出席 に変更可。
- **カウント表示**：純関数 `rosterCounts(reservations, capacity)` → `{ reserved, attended, attendedSeats, remaining }`（`reserved`=キャンセル以外の件数、`attended`=status出席の件数、`attendedSeats`=出席のattendees合計、`remaining`=capacity−attendedSeats、下限0）。
- スマホ/タブレット向けの大きめタップUI（既存 Tailwind 慣習に合わせる）。
- OC管理ページ（`app/admin/oc/page.tsx`）のイベント行に「受付」リンク（`/admin/oc/checkin?eventId=<id>`）を追加。

## ② 飛び込み登録（受付ページ内フォーム）
- フォーム項目：氏名(必須)・メール(任意)・電話(任意)・人数(既定1)。
- 送信 → `POST /api/admin/oc/reservations`（下記③）で `status="出席"`・`source="walkin"` の予約を即作成 → 名簿に追加・カウント更新。
- 定員ハードブロックなし。残席は表示（超過時は警告表示のみ、登録は可）。

## ③ API：`app/api/admin/oc/reservations/route.ts` に POST 追加
- `POST`（既存 GET/PATCH と同じ管理者 guard を踏襲）：
  - body `{ ocEventId: string, name: string, email?: string, phone?: string, attendees?: number }`。
  - バリデーション：`ocEventId` 必須・実在確認、`name` 必須（空trim不可）、`attendees` は 1 以上の整数（既定1）。不正は 400。
  - 作成：`getTenantDb().oCReservation.create({ data: { ocEventId, name, email: email ?? "", phone: phone || null, attendees, status: "出席", source: "walkin", reservationNo: generateReservationNo() } })`（organizationId はテナント拡張が top-level create に注入）。
  - 返却：作成した予約（名簿へ即追加できる形）。
- Google Ads 送信は**しない**（飛び込みは gclid 無し・受付起点のため。既存の公開予約フローの送信は不変）。

## ④ 共通化：`lib/ocReservationNo.ts`
- `export function generateReservationNo(): string`（現行と同一ロジック：`OC-YYMMDD-xxxx`、xxxx は base36 ランダム4文字）。
- `app/api/oc/reservations/route.ts` のローカル関数を削除し、この lib を import に置換（挙動不変）。

## テスト / 検証
- unit `tests/unit/oc-checkin.test.ts`：
  - `rosterCounts`：予約/出席/出席席数/残席、キャンセル除外、残席下限0、飛び込み(出席)を含む集計。
  - `generateReservationNo`：`/^OC-\d{6}-[0-9A-Z]{4}$/` にマッチ。
- build／既存 e2e 非回帰（公開予約フローが reservationNo 共通化後も動く：`tests/unit/oc-form.test.ts` 等が緑）。
- 実機（compass_e2e）：受付ページで 予約→出席 トグル＋飛び込み登録 → 名簿反映・カウント更新を確認。POST が `source="walkin"`・`status="出席"` で作成することを確認。

## 受け入れ基準
- 受付ページでイベントを選び、名簿を検索してワンタップで出席/取消でき、予約/出席/残のカウントが更新される。
- 飛び込み来場者を氏名等で即出席登録でき（`source="walkin"`）、定員超過でもブロックされない。
- `generateReservationNo` 共通化後も公開予約フローが不変。unit（rosterCounts/generateReservationNo）＋ build 緑。スキーマ変更なし。

## スコープ外（将来 / 別Phase）
- QRスキャン受付、セルフ受付。
- 飛び込みフォームのカスタム項目（FormFieldConfig）対応（v1 はコア項目のみ）。
- 広告ROIレポート（サブプロジェクト C）。

## 影響ファイル
- `app/admin/oc/checkin/page.tsx`（新規・受付ページ）
- `app/api/admin/oc/reservations/route.ts`（POST 追加）
- `lib/ocReservationNo.ts`（新規・共通化）＋ `app/api/oc/reservations/route.ts`（import 置換）
- `lib/ocCheckin.ts`（`rosterCounts` 純関数）＋ `tests/unit/oc-checkin.test.ts`
- `app/admin/oc/page.tsx`（イベント行に「受付」リンク）
