# 操作ログ（監査ログ）設計 — 2026-06-22

## 目的
管理画面の「削除済み」ナビを「操作ログ」に置き換え、**管理側の全書込操作**を記録・閲覧できるようにする。
削除も操作ログの1イベントとして表示し、その行から**復元**できる。件数が増えても**1ページ最大50件**で表示する。

## 決定事項（ヒアリング結果）
- 記録対象 = **管理側の書込操作すべて**（職員の操作）。出願者（学生）側の操作は対象外。
- 「削除済み（復元）」画面は **操作ログに統合**（削除行から復元）。
- 1件あたり = **誰が / いつ / 何を / 対象 + 概要**（before→after の差分は meta に任意で持つが必須ではない）。

## アプローチ
専用 `AuditLog` テーブル + 各操作ルートで `logAudit()` を明示呼び出し。
（Prisma ミドルウェア自動記録は内部書込まで拾い要約不能・ノイズ過多のため不採用。ファイルログは UI 一覧/ページング不可のため不採用。）

## データモデル `AuditLog`（新規・追加のみ＝非破壊）
- `id` (cuid)
- `actorId` (String?) — 管理ユーザーID（system は null）
- `actorName` (String) — 操作時の表示名スナップショット（後のリネーム/削除でも残す）
- `actorRole` (String?) — 操作時のロール
- `action` (String) — 操作キー（例 `application.status`）
- `targetType` (String?) — `Application` / `Cohort` / `User` / `EnrollmentProcedure` 等
- `targetId` (String?)
- `targetLabel` (String?) — 人が読めるラベル（例「25-1-001 山田太郎」）
- `summary` (String) — 日本語1行（例「出願 25-1-001 を 受付中→合格 に変更」）
- `meta` (String? JSON) — 任意の構造化情報（{from,to} 等）
- `ip` (String?)
- `createdAt` (DateTime @default(now()))
- 索引: `@@index([createdAt])` / `@@index([targetType, targetId])` / `@@index([action])`

## ヘルパ `lib/audit.ts`
- `logAudit(session, { action, targetType, targetId, targetLabel, summary, meta, ip })`
  - **失敗しても本処理を壊さない**（内部 try/catch、失敗は console.error のみ）。
  - 操作者は session から補完（actorId/actorName/actorRole）。
- `AUDIT_ACTIONS`（キー定数）+ `AUDIT_ACTION_LABELS`（キー→日本語ラベル）を export。UI のフィルタ・表示で共有。

## 記録する操作（今回カバーする主要ルート）
- 出願 `app/api/applications/[id]/route.ts`: PATCH（編集 / ステータス・合否変更, meta に from→to）, DELETE（削除）。
- 出願 `app/api/applications/[id]/restore`: 復元。
- 入学手続き `app/api/enrollment/route.ts`: POST（公開 / 学費確認）, PATCH（完了）。
- 入学手続き `app/api/enrollment/confirm/route.ts`: 校方確認・許可書発行。
- 通知 `app/api/notifications/route.ts`: 送信。
- 選考 `app/api/cohorts/route.ts`: POST（作成）/ PATCH（編集）/ DELETE（削除, あれば）。
- アカウント `app/api/admin/accounts`（または該当ルート）: 作成 / 更新（権限変更含む）。
- ログイン `app/api/admin/login`: 成功時。
- **未カバーのルートは段階的に1行追加で拡張可能**（logAudit を呼ぶだけ）。本実装でカバーした範囲は実装時に列挙する。

## API `/api/admin/audit-logs`（GET）
- ページング **50件/ページ**（`page`, 既定50）。`{ logs, total, totalPages, page }`。
- 絞り込み（任意）: `action` / `actorId` / `targetType` / `from`,`to`（期間）/ `search`（targetLabel・summary 部分一致）。
- 認可: **isCoreAdmin（super_admin / admin）のみ**（全職員の操作が見えるため）。それ以外は 401/403。

## UI: ナビ「削除済み」→「操作ログ」
- `components/admin/AdminShell.tsx`: 当該ナビの label を「操作ログ」、href を `/admin/audit` に変更（icon は `trash`→任意の履歴系、なければ流用）。
- `/admin/audit`（`app/admin/trash/page.tsx` を置換）: 表（日時 / 操作者 / 操作 / 対象 / 概要）、新しい順、**50件/ページ**、フィルタ（操作種別・操作者・期間・検索）。
- **削除行（action=application.delete で対象が現存）には「復元」ボタン** → 既存 `POST /api/applications/[id]/restore` を流用。復元したらその操作自体も `application.restore` として記録。
- 旧 `/admin/trash` は `/admin/audit` へ集約（リンク差し替え）。

## 非機能 / 注意
- 過去（導入前）の操作は記録なし。導入後から蓄積（想定どおり）。
- 新テーブル追加のみ＝非破壊。デプロイの `prisma db push` で自動作成。
- ログ書込は本処理と同一リクエスト内の after 処理（失敗は握り潰し）。重い処理は無し。

## テスト
- 単体（vitest）: `summary`/`targetLabel` 生成・`AUDIT_ACTION_LABELS` の網羅・`logAudit` が例外時も throw しない。
- e2e（playwright api）: 管理者がステータス変更 → `GET /api/admin/audit-logs` に operator/action/target 付きで出る / 50件ページングの形状 / 非 coreAdmin は閲覧不可。
