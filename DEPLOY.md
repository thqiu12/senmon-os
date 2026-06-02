# 本番公開（上線）ランブック — 専門学校 出願システム

このドキュメントは、本システムを安全に本番公開するための手順をまとめたものです。
**上から順に実施してください。** 🔴 はブロッカー（未対応だと動かない／情報漏えい）です。

---

## 0. 前提
- サーバ: 単一VM（PM2 `instances:1`）、Next.js 14 を `next start`（:3000）で常駐。
- DB: SQLite（単一ファイル）。アップロード書類はローカルディスク（`storage/uploads`）。

---

## 1. 🔴 環境変数（`.env.local` または systemd/PM2 env）

```bash
# 必須
DATABASE_URL="file:/absolute/path/to/prod.db"     # 絶対パス推奨
SESSION_SECRET="$(openssl rand -hex 32)"           # 16文字以上。未設定だと管理API全拒否
RESEND_API_KEY="re_xxx"                            # メール送信に必須
RESEND_FROM="出願システム <noreply@hirai-gakuen.ac.jp>"  # 認証済みドメインのアドレス
NEXT_PUBLIC_BASE_URL="https://nyuugaku.hirai-gakuen.ac.jp"
ADMIN_EMAIL="admin@hirai-gakuen.ac.jp"             # 新規出願の通知先

# アップロード保存先（必ず public/ の外）
UPLOAD_DIR="/absolute/path/to/storage/uploads"
MAX_FILE_SIZE_MB="10"

# 振込先（申請者に表示される）
PAYMENT_BANK_NAME="..."; PAYMENT_ACCOUNT_TYPE="普通"
PAYMENT_ACCOUNT_NUMBER="..."; PAYMENT_ACCOUNT_HOLDER="..."
```

> `SESSION_SECRET` 未設定だと、認証は**フェイルクローズ**（全拒否）になります。

---

## 2. 🔴 初期管理者の作成（バックドア廃止に伴い必須）

旧バージョンは固定トークンのバックドアで super_admin に入れましたが、これは塞ぎました。
最初の管理者はスクリプトで作成します。

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='十分に強いパスワード' ADMIN_NAME='システム管理者' \
  npx ts-node scripts/create-admin.ts
```

---

## 3. 🔴 HTTPS 化（必須・これが無いとログイン不能）

本番は `NODE_ENV=production` のため cookie が `Secure` 属性付きになります。
**平文HTTPだとログイン用cookieが送信されず、ログインできません。** 必ずHTTPSにします。

1. DNS の A レコードをサーバIPへ向ける（例 `nyuugaku.hirai-gakuen.ac.jp`）。
2. リバースプロキシで443終端 → `127.0.0.1:3000` へ。設定例は `ops/Caddyfile`（推奨・証明書自動）または `ops/nginx.conf.example`。
3. プロキシが `X-Forwarded-For` / `X-Forwarded-Proto` を渡すこと（レート制限・スキーム判定に使用）。

---

## 4. 🔴 メール到達性（出願番号メールが届かないと申請者が進めない）

- Resend で**独自ドメインを認証**（SPF / DKIM の DNS レコード追加）。
- `RESEND_FROM` を認証済みドメインのアドレスに（`onboarding@resend.dev` のままにしない）。
- テスト送信で受信・迷惑メール判定を確認。

---

## 5. 🟠 データ移行・バックアップ

- 既存アップロードの移行（旧 `public/uploads` → 保護配信）:
  ```bash
  DRY_RUN=1 npx ts-node scripts/migrate-uploads.ts   # まず確認
  npx ts-node scripts/migrate-uploads.ts             # 実行
  rm -rf public/uploads                              # 完了後、公開配信を停止
  ```
- スキーマ反映: `DATABASE_URL=... npx prisma db push`
- バックアップを cron 登録（DB + uploads）:
  ```cron
  0 3 * * *  /path/to/senmon-nyuugaku/scripts/backup.sh
  ```
  `backups/` は**別ホスト/オブジェクトストレージへ転送**すること（VM障害=全消失を防ぐ）。

---

## 6. 🟠 ビルド・起動

```bash
npm ci
npm run build          # prisma generate + next build
pm2 start ecosystem.config.js   # cwd を本番パスに合わせる
pm2 save
```

---

## 7. 🟡 法務・コンプライアンス（公開前）

- パスポート・在留カード・学歴など**機微な個人情報**を収集します。
  - プライバシーポリシーの掲示、**取得時の同意取得**（出願フォームに同意チェックを追加推奨）。
  - 保存期間・削除方針の明記。
- 推奨: 出願フォーム最終ステップに「個人情報の取扱いに同意する」必須チェックを追加（文面は要法務確認）。

---

## 8. 🟡 公開前スモークテスト（本番同等env）

1. 出願フォーム送信 → **出願番号メール受信**を確認
2. `/apply/status` で出願番号+メールでログイン → 書類アップロード（PDF/画像）
3. 選考料: 振込証明アップロード → ステータス「確認中」
4. 管理ログイン → 一覧/詳細表示、CSVエクスポート
5. ステータスを「合格」 → 入学手続き自動作成 → `/apply/status` に手続き表示
6. 電子署名 → 入学許可書PDF生成
7. **権限確認**: 未ログインで `/api/applications` が 401、他人の書類URL（`/api/documents/<id>/file`）が 403 になること

---

## 9. ⚪ 監視・運用（公開後すぐ）
- エラー監視（Sentry 等）。現状は `console.error` のみ。
- ログ収集・ローテーション、ディスク使用量アラート（uploads増加）。
- 規模拡大時: SQLite → PostgreSQL、レート制限を共有ストア（Redis）へ。

---

## 上線可否チェック（要約）
- [ ] 1 env（SESSION_SECRET/DATABASE_URL/RESEND/BASE_URL）
- [ ] 2 初期管理者作成
- [ ] 3 HTTPS（cookieのSecure対応）
- [ ] 4 メールドメイン認証
- [ ] 5 移行＋バックアップ自動化
- [ ] 6 ビルド・PM2常駐
- [ ] 7 プライバシー対応
- [ ] 8 スモークテスト全項目
