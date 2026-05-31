#!/usr/bin/env bash
# =============================================================================
# ci-deploy.sh — GitHub Actions から SSH 経由で呼ばれる本番デプロイスクリプト
#
# 流れ:
#   1. 前回デプロイの commit を .last-deploy.sha に保存（ロールバック用）
#   2. SQLite DB を即席バックアップ（破壊的変更からの保護）
#   3. git pull → 依存変更検出
#   4. npm ci（package.json/package-lock 変更時のみ）
#   5. prisma generate + db push（schema 変更時）
#   6. next build（メモリ抑制つき）
#   7. PM2 reload（zero-downtime）
#   8. ヘルスチェック（失敗時は自動ロールバック）
#   9. デプロイメタ情報を保存
#
# 既存の auto-deploy.sh（cron）と共存可能（flock 共有）。
# 終了コード: 0=成功 / 1=ビルド失敗 / 2=ヘルスチェック失敗（ロールバック済み）
# =============================================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/srv/senmon/app}"
LOG_DIR="${LOG_DIR:-/srv/senmon/backup}"
BACKUP_DIR="$LOG_DIR/pre-deploy"
DEPLOY_LOG="$LOG_DIR/ci-deploy.log"
LOCK="/tmp/senmon-deploy.lock"
LAST_SHA_FILE="$APP_DIR/.last-deploy.sha"
APP_NAME="senmon-nyuugaku"
HEALTHCHECK_URL="http://127.0.0.1:3000/api/health"
HEALTHCHECK_TIMEOUT=30   # 秒

mkdir -p "$LOG_DIR" "$BACKUP_DIR"

ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" | tee -a "$DEPLOY_LOG"; }
err() { echo "[$(ts)] ERROR: $*" | tee -a "$DEPLOY_LOG" >&2; }

# auto-deploy.sh と同じロックを共有して同時実行を防ぐ
exec 9>"$LOCK"
if ! flock -n 9; then
  err "デプロイが他のプロセスで進行中。10 秒待機して再試行..."
  if ! flock -w 10 9; then
    err "ロック取得失敗。中断。"
    exit 1
  fi
fi

cd "$APP_DIR" || { err "cd $APP_DIR 失敗"; exit 1; }
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

log "=================================================================="
log "CI デプロイ開始"
log "=================================================================="

# ---- 1. 現在 SHA を保存（ロールバック用） ----
CURRENT_SHA=$(git rev-parse HEAD)
echo "$CURRENT_SHA" > "$LAST_SHA_FILE"
log "ロールバック用 SHA を保存: $CURRENT_SHA"

# ---- 2. DB バックアップ（破壊的変更前の安全網） ----
if [ -f "prisma/data.db" ]; then
  BACKUP_FILE="$BACKUP_DIR/data-$(date +%Y%m%d-%H%M%S)-${CURRENT_SHA:0:7}.db.gz"
  sqlite3 prisma/data.db ".backup '$BACKUP_DIR/_tmp.db'" 2>/dev/null
  gzip -c "$BACKUP_DIR/_tmp.db" > "$BACKUP_FILE"
  rm -f "$BACKUP_DIR/_tmp.db"
  log "DB バックアップ: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  # 30 日より古いバックアップ削除
  find "$BACKUP_DIR" -name "data-*.db.gz" -mtime +30 -delete 2>/dev/null || true
fi

# ---- 3. git pull ----
if ! git fetch origin chore/security-hardening 2>>"$DEPLOY_LOG"; then
  err "git fetch 失敗"
  exit 1
fi
NEW_SHA=$(git rev-parse origin/chore/security-hardening)
if [ "$CURRENT_SHA" = "$NEW_SHA" ]; then
  log "新しいコミット無し、何もせず終了"
  exit 0
fi
if ! git pull --ff-only 2>>"$DEPLOY_LOG"; then
  err "git pull 失敗"
  exit 1
fi
log "✓ git pull 完了 ($(git rev-parse --short HEAD))"

# ---- 4. 依存変更検出 → npm ci ----
DEPS_CHANGED=0
if git diff --name-only "$CURRENT_SHA" "$NEW_SHA" 2>/dev/null | grep -qE "^package(-lock)?\.json$"; then
  DEPS_CHANGED=1
  log "package.json 変更検出 → npm ci 実行"
  if ! npm ci --no-audit --no-fund 2>>"$DEPLOY_LOG"; then
    err "npm ci 失敗"
    exit 1
  fi
fi

# ---- 5. Prisma 変更検出 → generate + db push ----
if git diff --name-only "$CURRENT_SHA" "$NEW_SHA" 2>/dev/null | grep -q "^prisma/schema.prisma$"; then
  log "schema.prisma 変更検出 → prisma generate + db push"
  npx prisma generate 2>>"$DEPLOY_LOG"
  npx prisma db push --skip-generate --accept-data-loss 2>>"$DEPLOY_LOG" \
    || log "WARN: db push でエラー（手動確認推奨、デプロイ継続）"
fi
# 依存だけ変わって schema 未変更でも prisma generate は走らせておく（@prisma/client 同期）
if [ "$DEPS_CHANGED" = "1" ]; then
  npx prisma generate 2>>"$DEPLOY_LOG"
fi

# ---- 6. Next.js ビルド ----
log "Next.js ビルド開始（NODE_OPTIONS=--max-old-space-size=1024）"
if ! NODE_OPTIONS="--max-old-space-size=1024" npm run build >> "$DEPLOY_LOG" 2>&1; then
  err "Next.js ビルド失敗 → PM2 はリロードしません（旧ビルド継続稼働）"
  err "ログ末尾を確認: tail -60 $DEPLOY_LOG"
  exit 1
fi
log "✓ ビルド成功"

# ---- 7. PM2 reload（zero-downtime） ----
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env >> "$DEPLOY_LOG" 2>&1
  log "✓ PM2 reload 完了"
else
  pm2 start ecosystem.config.js >> "$DEPLOY_LOG" 2>&1
  log "✓ PM2 新規起動"
fi
pm2 save >> "$DEPLOY_LOG" 2>&1

# ---- 8. ヘルスチェック（失敗時は自動ロールバック） ----
log "ヘルスチェック実行中（最大 ${HEALTHCHECK_TIMEOUT} 秒）"
HEALTHY=0
for i in $(seq 1 "$HEALTHCHECK_TIMEOUT"); do
  if curl -fsS "$HEALTHCHECK_URL" 2>/dev/null | grep -q '"ok"'; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "$HEALTHY" != "1" ]; then
  err "ヘルスチェック失敗（${HEALTHCHECK_TIMEOUT}秒応答なし）→ 自動ロールバック開始"
  bash "$APP_DIR/scripts/deploy/rollback.sh" "$CURRENT_SHA" 2>&1 | tee -a "$DEPLOY_LOG"
  exit 2
fi

log "✓ ヘルスチェック OK"

# ---- 9. デプロイメタ情報を保存 ----
cat > "$APP_DIR/.deploy-meta.json" <<EOF
{
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sha": "$(git rev-parse HEAD)",
  "shortSha": "$(git rev-parse --short HEAD)",
  "previousSha": "$CURRENT_SHA",
  "branch": "$(git rev-parse --abbrev-ref HEAD)",
  "deployedBy": "${GITHUB_ACTOR:-ci-deploy}",
  "buildId": "$(cat .next/BUILD_ID 2>/dev/null || echo unknown)"
}
EOF

log "=================================================================="
log "✓ デプロイ完了 → $(git rev-parse --short HEAD)"
log "=================================================================="
exit 0
