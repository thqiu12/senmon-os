# Google Ads オフラインコンバージョン送信 設計書（サブプロジェクトC-③）

**日付:** 2026-07-01 / **対象:** senmon/Compass / **ブランチ:** `chore/security-hardening`（本番・Postgres・マルチテナント）

## 位置づけ
広告連携 C の **③ Conversion API**（A/B/C-①② 完了済み）。gclid 付きの成果（出願・OC予約）を **Google Ads のオフラインコンバージョン**として送信し、広告の自動最適化に還元する。Meta は将来（スコープ外）。

## 目的
「広告クリック(gclid) → OC予約/出願」の成果を Google Ads に返し、実際に出願を生む広告に予算を最適化できるようにする。

## 確定した設計判断（ユーザー承認済み）
- **Google Ads のみ**（Meta は将来）。**設定駆動**（認証情報未設定なら no-op＝AI英訳と同方針）。
- 送信する成果＝**出願＋OC予約の2コンバージョン**。
- トリガ＝**作成時に fire-and-forget**（作成を壊さない）＋ **backfill スクリプト**。
- ペイロード生成は純関数化して unit。実疎通は認証情報が揃ってから。
- tenant パターンに影響なし（送信は外部API・DB書き込みなし）。

---

## ① 設定（env, `lib/env.ts` に追加）
- 認証：`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`（数字ハイフンなし）, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`（任意・MCC時）。
- コンバージョンアクションID（数値）：`GOOGLE_ADS_CONV_APPLICATION`, `GOOGLE_ADS_CONV_OC`。
- `adsEnabled(): boolean` = 認証6点（developer/client id/secret/refresh/customer）が全て非空。個別送信は該当アクションIDも必須。

## ② 送信lib `lib/googleAds.ts`
- `adsEnabled()`。
- OAuth：`getAccessToken()` — POST `https://oauth2.googleapis.com/token`（client_id/client_secret/refresh_token/grant_type=refresh_token）→ access_token。短期メモ化可（任意）。
- **純関数** `buildClickConversion({ gclid, conversionActionId, customerId, conversionDateTime, value?, currency? })` → Google Ads の conversion オブジェクト：
  - `conversionAction: "customers/{customerId}/conversionActions/{conversionActionId}"`
  - `gclid`
  - `conversionDateTime`（`yyyy-MM-dd HH:mm:ss+09:00` 形式。JST）
  - 任意で `conversionValue` + `currencyCode`。
  - 日時フォーマッタ `formatAdsDateTime(date, tz="+09:00")` も純関数化。
- `uploadClickConversion({ gclid, conversionActionId, at }): Promise<{ok:boolean; error?:string}>`：
  - `adsEnabled()` と gclid と conversionActionId が揃わなければ `{ok:false}`（no-op）。
  - access token 取得 → POST `https://googleads.googleapis.com/v17/customers/{cid}:uploadClickConversions`。
  - ヘッダ：`Authorization: Bearer …`, `developer-token: …`, （MCCなら）`login-customer-id: …`。
  - ボディ：`{ conversions: [buildClickConversion(...)], partialFailure: true }`。
  - try/catch で例外を握り `{ok:false,error}`（呼び出し側の作成を壊さない）。ログは logError。

## ③ トリガ（fire-and-forget）
- 出願作成成功後（`app/api/applications/route.ts`）：`if (created.gclid) void uploadClickConversion({ gclid: created.gclid, conversionActionId: ENV.GOOGLE_ADS_CONV_APPLICATION, at: created.createdAt })`（await しない／失敗ログのみ）。
- OC予約作成成功後（`app/api/oc/reservations/route.ts`）：同様に `GOOGLE_ADS_CONV_OC`。
- どちらも `adsEnabled()` false や gclid 無しなら実質何もしない。

## ④ backfill スクリプト `scripts/upload-conversions.ts`
- 既存の gclid 付き Application / OCReservation を Google Ads に送信（一回限り・冪等寄り）。引数 `--from=YYYY-MM-DD`（既定 過去30日）・`--type=application|oc|all`。
- 各行を `uploadClickConversion` で送信、件数ログ。Google Ads 側が gclid+アクション+時刻で dedup するため多重送信は概ね安全。
- `adsEnabled()` false なら警告して終了（0件）。

## ⑤ 前提・運用（重要）
- 本番で有効化するには：Google Ads API 開発者トークン（申請・承認）／OAuth（client id/secret＋refresh token）／顧客ID／「インポート（クリックコンバージョン）」型コンバージョンアクション2つ（出願・OC予約）を作成し、その ID を env に設定。
- 未設定なら全経路 no-op（本番を壊さない）。設定投入＋pm2 restart で送信開始。

## テスト / 検証
- ユニット `tests/unit/google-ads.test.ts`：`buildClickConversion`（resource name 生成・日時フォーマット・value有無）、`adsEnabled()`（未設定=false）、`uploadClickConversion` が未設定時 `{ok:false}` で no-op（fetch を呼ばない）。
- build／既存 e2e 非回帰（fire-and-forget は未設定で no-op＝出願/予約に影響なし）。
- 実疎通：認証情報を投入後、backfill で 1件テスト送信 → Google Ads 管理画面でコンバージョン反映を確認（ユーザー作業）。

## 受け入れ基準
- 認証情報が設定されていれば、出願・OC予約作成時に gclid 付きコンバージョンが Google Ads に送信される（fire-and-forget）。未設定なら no-op で既存フロー非破壊。
- backfill で既存 gclid 行を送信できる。unit/build/e2e 緑。

## スコープ外（将来）
- Meta Conversions API。
- 送信済みフラグ列・厳密な再送管理・値(value)の動的設定。
- Enhanced Conversions（ハッシュ化メール併用）。

## 影響ファイル
- `lib/env.ts`（GOOGLE_ADS_* 追加）
- `lib/googleAds.ts` ＋ `tests/unit/google-ads.test.ts`
- `app/api/applications/route.ts`（出願作成後 送信）
- `app/api/oc/reservations/route.ts`（OC予約作成後 送信）
- `scripts/upload-conversions.ts`（backfill）
