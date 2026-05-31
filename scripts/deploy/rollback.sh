#!/usr/bin/env bash
# =============================================================================
# rollback.sh — 直前のデプロイ状態に戻す
#
# 使い方:
#   bash rollback.sh                # .last-deploy.sha に保存された SHA に戻す
#   bash rollback.sh <commit-sha>   # 指定 SHA に戻す
#
# ci-deploy.sh のヘルスチェック失敗時に自動呼び出しされる。
# 手動でも GitHub Actions の rollback ワークフローから呼び出し可能。
#
# 終了コード: 0=ロールバック成功 / 1=失敗
# =============================================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/srv/senmon/app}"
LOG_DIR="${LOG_DIR:-/srv/senmon/backup}"
ROLLBACK_LOG="$LOG_DIR/rollback.log"
LAST_SHA_FILE="$APP_DIR/.last-deploy.sha"
APP_NAME="senmon-nyuugaku"
HEALTHCHECK_URL="http://127.0.0.1:3000/api/health"

ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" | tee -a "$ROLLBACK_LOG"; }
err() { echo "[$(ts)] ERROR: $*" | tee -a "$ROLLBACK_LOG" >&2; }

cd "$APP_DIR" || { err "cd $APP_DIR 失敗"; exit 1; }

# ターゲット SHA 決定
TARGET_SHA="${1:-}"
if [ -z "$TARGET_SHA" ]; then
  if [ ! -f "$LAST_SHA_FILE" ]; then
    err ".last-deploy.sha がありません。ロールバック先 SHA を引数で指定してください。"
    exit 1
  fi
  TARGET_SHA=$(cat "$LAST_SHA_FILE")
fi

CURRENT_SHA=$(git rev-parse HEAD)

log "=================================================================="
log "ロールバック開始: $CURRENT_SHA → $TARGET_SHA"
log "=================================================================="

if [ "$CURRENT_SHA" = "$TARGET_SHA" ]; then
  log "現在と同じ SHA、何もせず終了"
  exit 0
fi

# 1. git reset
if ! git reset --hard "$TARGET_SHA" >> "$ROLLBACK_LOG" 2>&1; then
  err "git reset --hard $TARGET_SHA 失敗"
  exit 1
fi
log "✓ git reset 完了 → $(git rev-parse --short HEAD)"

# 2. 依存巻き戻し（package-lock 不一致対策）
if ! npm ci --no-audit --no-fund >> "$ROLLBACK_LOG" 2>&1; then
  err "npm ci 失敗"
  exit 1
fi
log "✓ npm ci 完了"

# 3. Prisma 再生成（旧 schema に合わせる）
npx prisma generate >> "$ROLLBACK_LOG" 2>&1 || true

# 4. 旧 .next を完全削除して再ビルド
rm -rf .next
log "Next.js 再ビルド開始"
if ! NODE_OPTIONS="--max-old-space-size=1024" npm run build >> "$ROLLBACK_LOG" 2>&1; then
  err "ビルド失敗 — 緊急事態：手動対応が必要"
  err "ログ: tail -80 $ROLLBACK_LOG"
  exit 1
fi
log "✓ ビルド成功"

# 5. PM2 再起動
pm2 restart "$APP_NAME" --update-env >> "$ROLLBACK_LOG" 2>&1
log "✓ PM2 再起動"

# 6. ヘルスチェック
sleep 5
HEALTHY=0
for i in $(seq 1 30); do
  if curl -fsS "$HEALTHCHECK_URL" 2>/dev/null | grep -q '"ok"'; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "$HEALTHY" != "1" ]; then
  err "ロールバック後もヘルスチェック失敗。手動対応が必要。"
  err "pm2 logs $APP_NAME --lines 100 で詳細確認"
  exit 1
fi

# 7. メタ情報更新
cat > "$APP_DIR/.deploy-meta.json" <<EOF
{
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sha": "$(git rev-parse HEAD)",
  "shortSha": "$(git rev-parse --short HEAD)",
  "branch": "$(git rev-parse --abbrev-ref HEAD)",
  "deployedBy": "rollback",
  "rolledBackFrom": "$CURRENT_SHA"
}
EOF

log "=================================================================="
log "✓ ロールバック完了 → $(git rev-parse --short HEAD)"
log "=================================================================="
exit 0
