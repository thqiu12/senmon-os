# OC自動メール（リマインド／フォロー／出願案内）設計書

**日付:** 2026-07-02 / **対象:** senmon/Compass / **ブランチ:** `chore/security-hardening`（本番・Postgres・マルチテナント）

## 位置づけ
OC Phase 2 の **サブプロジェクト A**（3分割の1つ目。A→B→C の順。B=当日チェックイン、C=広告ROIレポートは後続）。ユーザー要望「#1 リマインド＆フォロー自動化」＋「#4 OC→出願導線強化」を1機能に統合。

## 目的
OC予約者の**出席率**と**予約→出願転換**という招生ファネルの最も弱い2点を、自動メールで直接底上げする。前日リマインドで欠席を減らし、出席者へ出願案内（?school=&utm付）を送り、欠席者・未出願者をフォローする。

## 確定した設計判断（ユーザー承認済み）
- 送信は **日次 cron スクリプト** `scripts/oc-send-reminders.ts`（バックアップ cron・backfill スクリプトと同じ運用。HTTP/tenant 不要）。RESEND 未設定なら no-op。
- テンプレートは **管理画面で編集可能**。保存は **SystemSetting の JSON 1件**（key=`oc_email_templates`。新テーブル・マイグレーション不要、payment-config と同パターン）。
- 差し込みは純関数 `renderTemplate`。対象抽出も純関数 `selectDueReminders` にして unit。
- 二重送信防止は OCReservation の **送信済みフラグ4列**（nullable DateTime・追加式マイグレーション）。
- タイミングは **v1 固定**（前日／翌日／7日後）。可変化・多言語文面は将来（YAGNI）。

---

## ① メール4種と対象・タイミング

| キー | メール | 対象 | タイミング（cron 日次） | フラグ列 |
|---|---|---|---|---|
| `reminder` | 前日リマインド | status=`予約` | イベント開始が「翌日」 | `reminderSentAt` |
| `attendedApply` | 出席御礼＋出願案内 | status=`出席` | イベントが「昨日」終了 | `attendedMailSentAt` |
| `absentFollowup` | 欠席フォロー | status=`欠席` | イベントが「昨日」終了 | `absentMailSentAt` |
| `unappliedFollowup` | 未出願フォロー | status=`出席` かつ 未出願（email照合） | イベントから「7日後」 | `unappliedMailSentAt` |

- 「キャンセル」（`canceledAt` 非null）は全対象から除外。
- 各テンプレの `enabled=false` はスキップ。フラグ済み（該当列が非null）は再送しない。
- 「未出願」判定＝OCReservation.email に一致する Application が **予約日時以降** に存在しない（既存 `lib/ocAnalytics` の email 照合ロジックを踏襲）。
- `applyUrl` = `${PUBLIC_BASE_URL}/apply?school=<event.schoolKey>&utm_source=oc&utm_medium=email&utm_campaign=oc_followup`。`reminder` はイベント案内が主目的なので `applyUrl` は使わなくてよい（`cancelUrl` を提供）。

## ② テンプレート保存＋差し込み（`lib/ocEmailTemplates.ts`）
- SystemSetting `oc_email_templates` に JSON:
  ```json
  {
    "reminder":         { "enabled": true, "subject": "…", "body": "…" },
    "attendedApply":    { "enabled": true, "subject": "…", "body": "…" },
    "absentFollowup":   { "enabled": true, "subject": "…", "body": "…" },
    "unappliedFollowup":{ "enabled": true, "subject": "…", "body": "…" }
  }
  ```
- `OC_EMAIL_DEFAULTS`：4キーの既定文面（enabled 既定は reminder/attendedApply=true、absentFollowup/unappliedFollowup=true でよい。全 true 既定）。未設定キー・欠損フィールドは既定へフォールバック。
- `parseTemplates(raw): Record<Key, {enabled,subject,body}>`（防御的パース → 常に4キー揃う）。
- `renderTemplate(str: string, vars: Record<string,string>): string`：`{{key}}` を置換。未知プレースホルダは空文字。プレーンテキスト前提（HTML エスケープ不要・text メールで送る）。純関数。
- 利用可能変数：`name` / `eventTitle` / `startAt`（JST整形済み文字列）/ `schoolName` / `applyUrl` / `cancelUrl`。

## ③ 対象抽出（純関数 `selectDueReminders`）
- `lib/ocReminders.ts` に:
  ```
  type DueKind = "reminder" | "attendedApply" | "absentFollowup" | "unappliedFollowup";
  type EventLite = { id; title; startAt: Date; schoolKey };
  type ResvLite = { id; eventId; name; email; status; canceledAt: Date|null; createdAt: Date;
                    reminderSentAt; attendedMailSentAt; absentMailSentAt; unappliedMailSentAt: Date|null };
  selectDueReminders(events: EventLite[], reservations: ResvLite[], appliedEmails: {email:string; createdAt:Date}[], now: Date)
    => { kind: DueKind; reservation: ResvLite; event: EventLite }[]
  ```
- 日付窓は JST 基準の「日」で判定：
  - reminder：`event.startAt` が now の翌日（同一 JST 日）。status=予約、canceledAt=null、reminderSentAt=null。
  - attendedApply：`event.startAt` が now の前日。status=出席、attendedMailSentAt=null。
  - absentFollowup：`event.startAt` が now の前日。status=欠席、absentMailSentAt=null。
  - unappliedFollowup：`event.startAt` が now の7日前。status=出席、unappliedMailSentAt=null、かつ `appliedEmails` に「email 一致 & createdAt ≥ reservation.createdAt」が無い。
- enabled 判定は呼び出し側（cron）でテンプレ設定を見て絞る（純関数は候補抽出まで）。

## ④ 送信スクリプト（`scripts/oc-send-reminders.ts`）
- 生 `PrismaClient`。イベント（直近±10日程度）と予約、直近の Application email を取得 → `selectDueReminders` → 各件で該当テンプレ enabled 確認 → `renderTemplate` → `sendEmail({to,subject,text})` → 成功したら該当フラグ列に now を UPDATE。
- RESEND 未設定（`sendEmail` no-op）でもフラグは立てる／立てない？ → **送信が no-op の場合はフラグを立てない**（本番で RESEND 設定後に送れるよう）。`sendEmail` の戻り値（`SendEmailResult`）で送信成功時のみ stamp。
- 件数ログ（kind 別 送信/スキップ）。例外は1件失敗で全体を止めない（try/catch 個別）。
- 引数任意 `--dry-run`（送信せず対象件数のみ表示）。

## ⑤ 管理UI（`app/admin/oc` に「自動メール」タブ）
- 4テンプレを縦に：enabled トグル＋件名 input＋本文 textarea＋利用可能変数の凡例（`{{name}}` 等）＋タイミング説明（「前日」等・固定表示）。
- 取得/保存 API `app/api/admin/oc/email-templates/route.ts`（`withTenant`＋`getSession`＋`isCoreAdmin`）：GET＝`parseTemplates(SystemSetting)`、PUT＝body を sanitize（4キー・enabled boolean・subject/body string）して SystemSetting upsert（`updatedBy`）。
- 既存 OC 管理ページのタブUI（イベント/予約/分析）に「自動メール」を追加。

## ⑥ スキーマ追加
`OCReservation` に nullable DateTime 4列：`reminderSentAt` `attendedMailSentAt` `absentMailSentAt` `unappliedMailSentAt`。追加式（非破壊）マイグレーション `prisma/migrations/<ts>_oc_reservation_mail_flags`。

## テスト / 検証
- unit `tests/unit/oc-email-templates.test.ts`：`renderTemplate`（差し込み・未知プレースホルダ空・欠損なし）、`parseTemplates`（未設定→全既定、部分→フォールバック、enabled boolean 強制）。
- unit `tests/unit/oc-reminders.test.ts`：`selectDueReminders` の各 kind（日付窓・status 条件・フラグ済み除外・キャンセル除外・未出願 email 照合）。now を固定 Date で注入。
- build／既存 e2e 非回帰。
- 実機：`--dry-run` で対象抽出を確認。RESEND 未設定なら送信 no-op（フラグ立たず）。

## 受け入れ基準
- 管理画面で4種のメール文面/有効無効を編集・保存でき、日次 cron で該当対象に自動送信される（前日リマインド・出席御礼＋出願案内・欠席/未出願フォロー）。
- 二重送信されない（フラグ）。RESEND 未設定なら no-op でフラグも立たず既存フロー非破壊。SystemSetting 未設定なら既定文面。
- unit（renderTemplate/parseTemplates/selectDueReminders）＋ build 緑。

## スコープ外（将来 / 別Phase）
- タイミングの管理画面可変化、言語別文面、HTML メール、A/Bテスト。
- 当日チェックイン（サブプロジェクト B）、広告ROIレポート（C）。
- 送信履歴の詳細画面（フラグのみで v1 は足りる）。

## 影響ファイル
- `prisma/schema.prisma`（OCReservation に4列）＋ 追加マイグレーション
- `lib/ocEmailTemplates.ts`（既定・parse・renderTemplate）＋ `tests/unit/oc-email-templates.test.ts`
- `lib/ocReminders.ts`（selectDueReminders）＋ `tests/unit/oc-reminders.test.ts`
- `scripts/oc-send-reminders.ts`（cron）
- `app/api/admin/oc/email-templates/route.ts`（新）
- `app/admin/oc/page.tsx`（「自動メール」タブ）
- 運用：VPS crontab に日次1行（例 `0 9 * * *`）追加（ユーザー作業）
