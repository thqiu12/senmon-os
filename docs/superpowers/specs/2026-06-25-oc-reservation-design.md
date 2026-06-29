# オープンキャンパス(OC) 予約・フォーム 設計書（サブプロジェクトA）

**日付:** 2026-06-25 / **対象:** senmon/Compass / **ブランチ:** `chore/security-hardening`（本番・Postgres）

## 位置づけ
「OC予約・フォーム・分析・広告連携」のうち、**土台となるA（OCイベント＋予約＋フォーム）**。B(分析)・C(広告連携)はAの予約データを前提に後続。本specはAのみ。

## 目的
オープンキャンパスの**イベント定義・公開予約・確認/キャンセル**を提供し、見込み客の予約データを蓄積する（招生強化＋後続の分析/広告アトリビューションの基盤）。

## 確定した設計判断（ユーザー承認済み）
- 予約フォームは**設定駆動**（既存 FormFieldConfig の仕組みを `formType` 次元で共用）。
- **1イベント=1日時+定員**（複数時間帯は別イベント）。
- **匿名＋メール**：確認メール＋**本人キャンセルリンク**。定員は自動管理。
- スコープ外（YAGNI）：待機リスト／リマインダーメール／OC決済／複数時間枠。
- 並行のマルチテナント化に合わせ新モデルに `organizationId?`(+index)。

---

## データモデル（新規2モデル ＋ FormFieldConfig 拡張）

### OCEvent
```
id            String @id @default(cuid())
organizationId String?
schoolKey     String          // ApplySchool.schoolKey 連動
title         String
description   String?
startAt       DateTime        // 開催日時
endAt         DateTime?
capacity      Int             // 定員（参加人数合計の上限）
location      String?         // 会場（対面時）
isOnline      Boolean @default(false)
onlineUrl     String?         // オンライン時の参加URL
status        String  @default("下書き")  // 下書き/公開/締切
createdAt/updatedAt
@@index([organizationId]) @@index([schoolKey, status, startAt])
```

### OCReservation
```
id            String @id @default(cuid())
organizationId String?
ocEventId     String          // FK OCEvent
reservationNo String @unique  // 例 OC-YYMMDD-xxxx
name          String
email         String
phone         String?
attendees     Int @default(1) // 参加人数（定員消費）
extraData     Json?           // 設定フォームの追加項目回答
status        String @default("予約")  // 予約/キャンセル/出席/欠席
source        String?         // 流入元(utm_source 等。Cで活用)
utmCampaign   String?
utmMedium     String?
gclid         String?
referrer      String?
canceledAt    DateTime?
createdAt/updatedAt
@@index([organizationId]) @@index([ocEventId, status]) @@index([email])
```

### FormFieldConfig 拡張
- `formType String @default("apply")` を追加（"apply" | "oc"）。一意制約を `[fieldKey, schoolId, applicantType, formType]` に拡張。
- OCフォームは `formType="oc"`・`applicantType=null`（OCはタイプ次元を使わない）でスコープ＝`(schoolKey, formType=oc)`。
- OC用の最小既定セット（OC_FORM_DEFAULTS）：氏名/メール/電話/参加人数（コア）＋任意の追加項目。コア項目は OCReservation 列にマップ、追加項目は extraData。レンダリングは既存 **DynamicField** を再利用（formType に応じた既定・レジストリを切替）。

> 既存の出願フォーム挙動は `formType="apply"`（既定）で**完全非破壊**。merge/各APIは formType で絞る。

---

## 公開フロー（`/oc`）
1. `/oc`（または `/oc?school=<schoolKey>`）：**公開中(status=公開)・未来(startAt>now)** のOC一覧。学校・日時・残席を表示。
2. イベント詳細 → 予約フォーム（設定駆動・formType=oc・DynamicField）。
3. 送信時：**定員チェック**（有効予約の attendees 合計 + 今回 ≤ capacity）→ OK なら作成（reservationNo 採番）。満席なら 409/「満席」。
4. 完了画面＋**確認メール**（予約番号・日時・会場/URL・**キャンセルリンク**）。
5. `/oc/status?reservationNo=...&email=...`：予約照会・**本人キャンセル**（status=キャンセル、定員復帰）。

source 捕捉：ランディング/予約時に `utm_*`/`gclid`/`referrer` を拾って OCReservation に保存。

## 学校サイト連携（リンク誘導・UTM付）— ユーザー確定
- 学校の（外部）ウェブサイトに「**オープンキャンパス予約**」ボタンを置き、**Compass の予約ページ `/oc?school=<schoolKey>&utm_source=...&utm_campaign=...&utm_medium=...` へリンク**する。埋め込み/API は当面なし（最小結合・即運用）。
- `/oc` 側：`?school=` で**学校を preselect**（出願フローの `?school=` preselect と同方式）。一覧/詳細はその学校のOCに絞る。
- ランディング時に URL の `utm_*`/`gclid`/`referrer` を**capture → 予約に保存**（学校サイト経由・広告経由のどちらの流入かが残る＝B/C のアトリビューションに直結）。
- 学校サイトに貼るリンク例とブランド表示（`?school=` で校名/ロゴ切替）を運用ドキュメント化（学校ごとのリンクを配布）。
- 発展（スコープ外・将来）：埋め込みウィジェット(iframe/JS) / 公開API。今回はリンク誘導で十分。

## 管理（`/admin/oc`）
- **イベントCRUD**（学校・日時・定員・会場/オンライン・公開状態）。
- **予約一覧**（イベント別、予約人数 vs 定員、氏名/連絡先/追加項目/source）。**出席チェック**(出席/欠席)・**キャンセル**・**CSV出力**。
- OCフォーム項目設定：既存「各種設定」に **formType=OC** の切替を追加（学校別、apply と同じ編集UI・重複警告・AI英訳を流用）。
- 権限：既存 `form.edit` 等のケイパビリティに準拠（OC管理用に必要なら追加）。

## 定員・整合
- 残席 = capacity − Σ(status∈{予約,出席} の attendees)。
- 二重取り防止：作成時にトランザクション内で件数を再集計してから insert（または条件付き挿入）。MVPは「再集計→超過なら409」で許容（単一管理校・低頻度前提）。

## メール
既存メール基盤(RESEND, `lib/email`)を再利用。確認メール（予約番号＋キャンセルリンク）。RESEND 未設定時は完了画面のみ（メール送信スキップ・エラーにしない、出願と同方針）。

## 再利用 / 影響
- 再利用：ApplySchool・FormFieldConfig・DynamicField・lib/email・i18n・採番(出願の番号採番ロジック準拠で OC-…)。
- 影響：FormFieldConfig に formType（出願APIは formType="apply" で絞る＝非破壊）。schema 変更（新2モデル＋formType列）＝migrate deploy。
- 並行のマルチテナント(withTenant/getTenantDb/organizationId)に整合：新ルートは既存の tenant ラッパ方針に倣う（実装時に現行パターンを確認して合わせる）。

## テスト / 検証
- ユニット：定員計算・残席・採番・OCフォーム解決(formType絞り込み)。
- API/E2E：OC一覧→予約→満席409→確認→キャンセルで定員復帰。出願フォームが formType 追加後も非回帰。
- build 78+/0、実機(compass_e2e)で OC作成→予約→管理一覧→出席→キャンセル の通し。

## 受け入れ基準
- 管理でOCイベントを作成・公開でき、公開ページで予約→確認メール→本人キャンセルができる。定員超過は防がれる。
- OC予約フォームが学校別に設定駆動で項目を出せる（出願フォームは非破壊）。
- 管理で予約一覧・出席・CSV・キャンセルができる。source が予約に保存される。
- 全 unit/build/e2e グリーン。schema 変更は新2モデル＋formType列のみ。

## スコープ外（YAGNI / 後続）
- 待機リスト・リマインダーメール・複数時間枠・OC決済（A対象外）。
- OC→出願 転換率や流入元別分析（B）。広告プラットフォームへの Conversion API 送信（C）。
- 既存出願フォームへの source 捕捉の作り込み（C で全経路に展開）。

## 影響ファイル（概略）
- `prisma/schema.prisma` + migration（OCEvent/OCReservation/formType）
- `lib/ocReservation*`（定員/採番/フォーム解決 純関数）
- `app/oc/*`（公開：一覧/詳細/予約/完了/status）+ `app/api/oc/*`（events/reservations/cancel/form-config）
- `app/admin/oc/*` + 既存 form-config 管理に formType 切替
- `lib/email` の OC 確認メールテンプレ
