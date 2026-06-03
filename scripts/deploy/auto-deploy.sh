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
#   ※ デプロイ確認用テストコミットあり（このコメント自体）
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

# ----- 一回限りのデータ移行（冪等） -----
# Document.filePath を新フォーマット (/api/documents/<id>/file) に揃える
if [ -f scripts/migrate-document-filePath.ts ]; then
  log "Document.filePath 移行スクリプト実行（冪等）"
  npx ts-node scripts/migrate-document-filePath.ts >> "$LOG" 2>&1 || log "WARN: 移行スクリプトでエラー（手動確認推奨）"
fi

# ロールバック用に直前のコミットを記録（CSS 失敗時に戻す）
ROLLBACK_SHA="$LOCAL_SHA"

# ----- クリーンビルド (.next のキャッシュ起因の CSS 崩壊を防止) -----
# 直前のビルド成果物を退避（ロールバック用）
if [ -d .next ]; then
  rm -rf .next.prev 2>>"$LOG" || true
  mv .next .next.prev 2>>"$LOG" || true
  log "前回ビルドを .next.prev に退避"
fi

# ----- ビルド -----
log "Next.js ビルド中..."
if ! NODE_OPTIONS="--max-old-space-size=1536" npm run build >> "$LOG" 2>&1; then
  log "ERROR: build failed, PM2 はリロードしません（前のビルドを継続使用）"
  # ビルド失敗 → 退避した前回ビルドを戻す
  if [ -d .next.prev ]; then
    rm -rf .next 2>>"$LOG" || true
    mv .next.prev .next 2>>"$LOG" || true
    log "  → .next.prev から復元しました"
  fi
  exit 1
fi
log "✓ ビルド成功"

# ----- ビルド成果物の検証 (CSS ファイルが正しく生成されているか) -----
CSS_COUNT=$(find .next/static/css -name "*.css" 2>/dev/null | wc -l | tr -d ' ')
if [ "${CSS_COUNT:-0}" -lt 1 ]; then
  log "ERROR: .next/static/css に CSS ファイルが無い → ビルド破損とみなしリロード中止"
  exit 1
fi
log "✓ CSS ファイル ${CSS_COUNT} 件を確認"

# ファイルシステムの flush を待つ（NFSや遅延書き込み対策）
sync

# ----- PM2 reload（zero-downtime） -----
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env >> "$LOG" 2>&1
  log "✓ PM2 reload 完了"
else
  pm2 start ecosystem.config.js >> "$LOG" 2>&1
  log "✓ PM2 新規起動"
fi
pm2 save >> "$LOG" 2>&1

# ----- ヘルスチェック (API + CSS 到達性の両方) -----
sleep 3
HEALTH_OK=0
CSS_OK=0
if curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok"'; then
  HEALTH_OK=1
fi
# トップページから CSS パスを抽出して実際に取得できるか確認
CSS_PATH=$(curl -fsS http://127.0.0.1:3000/ 2>/dev/null | grep -oE '/_next/static/css/[^"]+\.css' | head -1)
if [ -n "$CSS_PATH" ] && curl -fsS "http://127.0.0.1:3000${CSS_PATH}" >/dev/null 2>&1; then
  CSS_OK=1
fi

if [ "$HEALTH_OK" = "1" ] && [ "$CSS_OK" = "1" ]; then
  log "✓ ヘルスチェック OK (API + CSS 両方到達)"
  # 成功時は退避ファイルを削除
  rm -rf .next.prev 2>>"$LOG" || true
else
  log "ERROR: ヘルスチェック失敗 — API=$HEALTH_OK CSS=$CSS_OK (パス: $CSS_PATH)"
  # ----- 自動ロールバック -----
  if [ -d .next.prev ]; then
    log "→ 自動ロールバック開始: 前のビルドに戻します"
    git reset --hard "$ROLLBACK_SHA" --quiet 2>>"$LOG" || log "WARN: git reset 失敗"
    rm -rf .next 2>>"$LOG" || true
    mv .next.prev .next 2>>"$LOG" || true
    pm2 reload "$APP_NAME" --update-env >> "$LOG" 2>&1
    sleep 3
    if curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok"'; then
      log "✓ ロールバック完了 ($(git rev-parse --short HEAD))"
    else
      log "ERROR: ロールバック後もヘルスチェック失敗。手動対応が必要"
    fi
  else
    log "WARN: .next.prev が無いためロールバック不可"
  fi
fi

log "デプロイ完了 → $(git rev-parse --short HEAD)"
log ""
