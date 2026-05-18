#!/usr/bin/env bash
# =============================================================================
# auto-deploy.sh
#   cron で定期実行: GitHub の chore/security-hardening が更新されていたら
#   自動的に pull → build → PM2 reload する。
#
#   - 同じコミットなら何もしない（ノーオペ・ログ抑制）
#   - 同時起動防止に lock file 使用
#   - ビルド失敗時は pm2 reload しない（壊れた状態にしない）
#   - 全部のステップをログに残す
#
# 設定:
#   AUTO_DEPLOY_BRANCH=chore/security-hardening （デフォルト）
#   APP_DIR=/srv/senmon/app
#   LOG=/srv/senmon/backup/auto-deploy.log
# =============================================================================
set -uo pipefail

BRANCH="${AUTO_DEPLOY_BRANCH:-chore/security-hardening}"
APP_DIR="${APP_DIR:-/srv/senmon/app}"
LOG_DIR="${LOG_DIR:-/srv/senmon/backup}"
LOG="$LOG_DIR/auto-deploy.log"
LOCK="/tmp/senmon-auto-deploy.lock"
APP_NAME="senmon-nyuugaku"

mkdir -p "$LOG_DIR"

ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" >> "$LOG"; }
silent_log() { :; }   # 通常時はログ抑制（ログ肥大防止）

# ----- ロック取得（多重起動防止） -----
exec 9>"$LOCK"
if ! flock -n 9; then
  silent_log "another instance is running, skip"
  exit 0
fi

cd "$APP_DIR" || { log "ERROR: cannot cd $APP_DIR"; exit 1; }

# git が安全に動くように（ファイル所有権の問題回避）
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

# ----- リモートをフェッチして差分確認 -----
git fetch origin "$BRANCH" --quiet 2>/dev/null || { log "ERROR: git fetch failed"; exit 1; }

LOCAL_SHA=$(git rev-parse HEAD 2>/dev/null)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH" 2>/dev/null)

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  # 差分なし → ノーオペ、ログにも書かない
  exit 0
fi

# ===== ここから差分があるパス =====
log "================================================================="
log "新しいコミットを検出: $LOCAL_SHA → $REMOTE_SHA"
log "================================================================="

# ----- pull -----
if ! git checkout "$BRANCH" --quiet 2>>"$LOG"; then
  log "ERROR: git checkout $BRANCH failed, abort"
  exit 1
fi
if ! git pull --ff-only --quiet 2>>"$LOG"; then
  log "ERROR: git pull --ff-only failed, abort"
  exit 1
fi
log "✓ git pull 完了 ($(git rev-parse --short HEAD))"

# 直前のコミットメッセージをログ
git log -1 --pretty=format:"  msg: %s" >> "$LOG"
echo >> "$LOG"

# ----- 依存変更があれば npm ci -----
# package-lock.json の変更で判定
if git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA" | grep -qE "^(package(-lock)?\.json|prisma/)" ; then
  log "依存またはスキーマに変更あり → npm ci 実行"
  if ! npm ci --no-audit --no-fund 2>>"$LOG"; then
    log "ERROR: npm ci failed, abort"
    exit 1
  fi

  # スキーマ変更があれば prisma 更新
  if git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA" | grep -q "^prisma/schema.prisma$"; then
    log "schema.prisma 変更 → prisma generate + db push"
    npx prisma generate 2>>"$LOG"
    npx prisma db push --skip-generate --accept-data-loss 2>>"$LOG" || log "WARN: prisma db push でエラー（手動確認推奨）"
  fi
fi

# ----- ビルド -----
log "Next.js ビルド中..."
if ! NODE_OPTIONS="--max-old-space-size=1536" npm run build >> "$LOG" 2>&1; then
  log "ERROR: build failed, PM2 はリロードしません（前のビルドを継続使用）"
  exit 1
fi
log "✓ ビルド成功"

# ----- PM2 reload（zero-downtime） -----
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env >> "$LOG" 2>&1
  log "✓ PM2 reload 完了"
else
  pm2 start ecosystem.config.js >> "$LOG" 2>&1
  log "✓ PM2 新規起動"
fi
pm2 save >> "$LOG" 2>&1

# ----- ヘルスチェック -----
sleep 3
if curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok"'; then
  log "✓ ヘルスチェック OK ($(curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null | head -c 100))"
else
  log "WARN: ヘルスチェック失敗。pm2 logs $APP_NAME を確認してください"
fi

log "デプロイ完了 → $(git rev-parse --short HEAD)"
log ""
