#!/usr/bin/env bash
# =============================================================================
# 02-app-deploy.sh
#   senmon-nyuugaku の本番デプロイ。
#   deploy ユーザーで実行（root では実行しない）。
#
#   - 依存インストール
#   - .env 生成（無い場合）
#   - prisma generate + db push
#   - 初期シード（管理者作成）
#   - Next.js build
#   - PM2 起動 / リロード
#
# 実行方法（deploy ユーザーで /srv/senmon/app にチェックアウト後）:
#   bash scripts/deploy/02-app-deploy.sh
#
# 冪等。既に動いていれば pm2 reload で zero-downtime 更新。
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/senmon/app}"
UPLOAD_DIR="${UPLOAD_DIR:-/srv/senmon/private/uploads}"
APP_NAME="senmon-nyuugaku"

log() { echo -e "\e[36m[deploy]\e[0m $*"; }
err() { echo -e "\e[31m[error]\e[0m $*" >&2; }

if [ "$EUID" -eq 0 ]; then
  err "このスクリプトは root では実行しないでください。deploy ユーザーで実行してください。"
  exit 1
fi

if [ ! -d "$APP_DIR/.git" ]; then
  err "$APP_DIR が git リポジトリではありません。先に git clone してください："
  err "  cd $APP_DIR && git clone -b chore/security-hardening <REPO_URL> ."
  exit 1
fi

cd "$APP_DIR"

# ------------------------------------------------------------
# 1. リポジトリ更新
# ------------------------------------------------------------
log "git pull --ff-only"
git pull --ff-only

# ------------------------------------------------------------
# 2. .env ファイル（無ければ生成、SESSION_SECRET 自動生成）
# ------------------------------------------------------------
if [ ! -f .env ]; then
  log ".env が無いので生成します"
  SESSION_SECRET="$(openssl rand -hex 32)"
  CSRF_SECRET="$(openssl rand -hex 32)"
  ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)Aa1!"

  cat > .env <<EOF
# ============================================================
# 自動生成: $(date)
# 重要: 編集後は systemctl reload-or-restart pm2-deploy か pm2 reload $APP_NAME を実行
# ============================================================

NODE_ENV=production
PORT=3000

# データベース（Postgres/Supabase。事前に export するか、生成後に実値へ置換）
DATABASE_URL="${DATABASE_URL:-postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true&sslmode=require}"
DIRECT_URL="${DIRECT_URL:-postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require}"

# セッション・CSRF（自動生成）
SESSION_SECRET="$SESSION_SECRET"
CSRF_SECRET="$CSRF_SECRET"

# 公開 URL（後で nginx + ドメイン設定したら https に変更）
NEXT_PUBLIC_BASE_URL="http://160.16.132.198"

# ファイルアップロード
UPLOAD_DIR="$UPLOAD_DIR"
MAX_FILE_SIZE_MB="10"

# Puppeteer (Google Chrome を /usr/bin/google-chrome から参照)
PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome"

# プロキシヘッダ（nginx の X-Real-IP を信頼）
TRUSTED_PROXY_HEADER="x-real-ip"

# 初期管理者シード（自動生成、初回ログイン後に必ず変更）
SEED_ADMIN_USERNAME="admin"
SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD"

# メール（任意 - 後で設定。今は空でも動く）
RESEND_API_KEY=""
RESEND_FROM=""
ADMIN_EMAIL=""
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
EOF
  chmod 600 .env

  log "================================================================="
  log "初期管理者の認証情報（必ず安全な場所にメモしてください）："
  log "    ユーザー名: admin"
  log "    パスワード: $ADMIN_PASSWORD"
  log "================================================================="
else
  log ".env は既存（変更せずスキップ）"
fi

# ------------------------------------------------------------
# 3. 依存インストール
# ------------------------------------------------------------
log "npm ci で依存をインストール"
npm ci

# ------------------------------------------------------------
# 4. Prisma generate + migrate deploy
# ------------------------------------------------------------
log "Prisma クライアント生成 + マイグレーション適用"
npx prisma generate
npx prisma migrate deploy

# ------------------------------------------------------------
# 5. seed 実行用に tsx を確保
#   ts-node は Node 20 + ESM 環境で .ts 拡張子を解決できないことが多いので、
#   ゼロ設定で動く tsx を使う。--no-save で package.json は汚さない。
# ------------------------------------------------------------
if [ ! -x node_modules/.bin/tsx ]; then
  log "tsx をインストール（seed 用）"
  npm install --no-save --no-audit --no-fund tsx
fi

# ------------------------------------------------------------
# 6. 初期シード（冪等：既に admin がいれば作らない）
# ------------------------------------------------------------
if [ -f prisma/seed.ts ]; then
  log "初期管理者をシード"
  npx tsx prisma/seed.ts || log "seed 失敗（既に存在の可能性、続行）"
fi

# ------------------------------------------------------------
# 7. デモシード（任意：先生のテスト用。本番稼働時はコメントアウト）
# ------------------------------------------------------------
if [ -f prisma/demo-seed.ts ] && [ "${SEED_DEMO:-0}" = "1" ]; then
  log "デモデータをシード（SEED_DEMO=1 が指定された）"
  npx tsx prisma/demo-seed.ts
fi

# ------------------------------------------------------------
# 7. Next.js ビルド
# ------------------------------------------------------------
log "Next.js を本番ビルド"
npm run build

# ------------------------------------------------------------
# 8. PM2 起動 / リロード
# ------------------------------------------------------------
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  log "PM2: 既存プロセスを zero-downtime reload"
  pm2 reload "$APP_NAME" --update-env
else
  log "PM2: 新規起動"
  pm2 start ecosystem.config.js
fi

pm2 save

# ------------------------------------------------------------
# 9. ヘルスチェック
# ------------------------------------------------------------
sleep 3
if curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok"' \
   || curl -fsS http://127.0.0.1:3000/ -o /dev/null; then
  log "✓ アプリ起動確認 OK (localhost:3000)"
else
  err "アプリが起動していないようです。ログを確認してください: pm2 logs $APP_NAME"
  exit 1
fi

log "================================================================="
log "✓ デプロイ完了"
log "================================================================="
log ""
log "次のステップ:"
log "  1. nginx 設定を反映（root で）:"
log "       sudo bash scripts/deploy/03-nginx-setup.sh"
log ""
log "  2. ブラウザで http://160.16.132.198 を開いて確認"
log ""
log "  3. ドメインを設定したら HTTPS 化（root で）:"
log "       sudo bash scripts/deploy/04-enable-https.sh your-domain.example.com"
log ""
log "監視:"
log "  pm2 status                  # プロセス一覧"
log "  pm2 logs $APP_NAME --lines 50"
log "  pm2 monit                   # リアルタイム CPU/MEM"
