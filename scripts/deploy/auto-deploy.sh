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
# lock は LOG_DIR 配下（実行ユーザー所有）に置く。
# /tmp だと過去に root が作った lock を別ユーザーが開けず "Permission denied" になった。
LOCK="${LOG_DIR}/auto-deploy.lock"
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

# ----- デプロイ前 DB バックアップ（破壊的変更=prisma db push の前の安全網） -----
# 実体は app/prisma/prisma/data.db（Prisma の相対解決による）。旧構成もフォールバック。
if   [ -f "$APP_DIR/prisma/prisma/data.db" ]; then DB_SRC="$APP_DIR/prisma/prisma/data.db"
elif [ -f "$APP_DIR/prisma/data.db" ];        then DB_SRC="$APP_DIR/prisma/data.db"
else DB_SRC=""; fi
if [ -n "$DB_SRC" ]; then
  mkdir -p "$LOG_DIR/db"
  PD_OUT="$LOG_DIR/db/predeploy-$(date +%Y%m%d-%H%M%S)-${LOCAL_SHA:0:7}.db"
  if sqlite3 "$DB_SRC" ".backup '$PD_OUT'" 2>>"$LOG"; then
    gzip -9 "$PD_OUT" 2>>"$LOG" || true
    log "✓ デプロイ前DBバックアップ: ${PD_OUT}.gz"
    find "$LOG_DIR/db" -name 'predeploy-*.db.gz' -mtime +30 -delete 2>/dev/null || true
  else
    log "WARN: デプロイ前DBバックアップ失敗（続行）"
  fi
else
  log "WARN: DB が見つからずデプロイ前バックアップをスキップ"
fi

# ----- 同期（reset --hard で確実に origin に合わせる） -----
# ビルド時に Next.js が tsconfig.json / next-env.d.ts を自動書き換えするため、
# pull --ff-only だと「ローカル変更で上書き不可」で失敗する。デプロイ専用機なので
# 作業ツリーは常に origin と一致させる方針（fetch は上で実施済み）。
if ! git checkout "$BRANCH" --quiet 2>>"$LOG"; then
  # 既に detached 等でも reset で復帰できるよう checkout 失敗は致命にしない
  log "WARN: git checkout $BRANCH 失敗（reset で続行）"
fi
if ! git reset --hard "origin/$BRANCH" --quiet 2>>"$LOG"; then
  log "ERROR: git reset --hard origin/$BRANCH failed, abort"
  exit 1
fi
log "✓ origin/$BRANCH に同期 ($(git rev-parse --short HEAD))"

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

  # スキーマ/マイグレーション変更があれば prisma 更新（Postgres: migrate deploy）
  if git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA" | grep -qE "^prisma/(schema\.prisma|migrations/)"; then
    log "Prisma 変更 → prisma generate + migrate deploy"
    npx prisma generate 2>>"$LOG"
    # migrate deploy は非破壊（保留中のマイグレーションのみ適用）。失敗時は新スキーマ前提の
    # 新コードを配信しないため、ここで中止して旧プロセスを継続させる。
    if ! npx prisma migrate deploy 2>>"$LOG"; then
      log "ERROR: prisma migrate deploy 失敗 → デプロイ中止（旧プロセス継続・手動確認必須）"
      exit 1
    fi
  fi
fi

# ----- 一回限りのデータ移行（冪等） -----
# Document.filePath を新フォーマット (/api/documents/<id>/file) に揃える
if [ -f scripts/migrate-document-filePath.ts ]; then
  log "Document.filePath 移行スクリプト実行（冪等）"
  npx ts-node scripts/migrate-document-filePath.ts >> "$LOG" 2>&1 || log "WARN: 移行スクリプトでエラー（手動確認推奨）"
fi

# 全校共通(schoolId=null / payment __global__) を各校へコピーしてから共通を削除（冪等）。
# ビルド前に実行＝新コード配信前に各校へ移行完了するため「共通無視で一時的に既定へ戻る」隙間が出ない。
# 共通撤去後は global 行が無く no-op。
if [ -f scripts/migrate-remove-common.ts ]; then
  log "全校共通→各校 移行スクリプト実行（冪等）"
  npx tsx scripts/migrate-remove-common.ts >> "$LOG" 2>&1 || log "WARN: 全校共通移行でエラー（手動確認推奨）"
fi

# ロールバック用に直前のコミットを記録（失敗時に戻す）
ROLLBACK_SHA="$LOCAL_SHA"

# =============================================================================
# Atomic deploy: ビルドは別ディレクトリ (.next.build) で行い、現行 .next は
# ビルド中もそのまま稼働させる。ビルド成功 & CSS 検証 OK の時だけ、
#   .next → .next.prev,  .next.build → .next
# と一瞬で差し替えて pm2 restart する。
# これにより「ビルド中に .next が消えて CSS が落ちる」窓を無くす。
# =============================================================================
BUILD_DIR=".next.build"
rm -rf "$BUILD_DIR" 2>>"$LOG" || true

log "Next.js ビルド中（出力先: $BUILD_DIR、現行サイトは稼働継続）..."
if ! NEXT_DIST_DIR="$BUILD_DIR" NODE_OPTIONS="--max-old-space-size=1536" npm run build >> "$LOG" 2>&1; then
  log "ERROR: build failed → 現行 .next を維持（サイトは無傷）"
  rm -rf "$BUILD_DIR" 2>>"$LOG" || true
  exit 1
fi

# ----- ビルド成果物を差し替え前に検証 -----
CSS_COUNT=$(find "$BUILD_DIR/static/css" -name "*.css" 2>/dev/null | wc -l | tr -d ' ')
if [ "${CSS_COUNT:-0}" -lt 1 ]; then
  log "ERROR: $BUILD_DIR/static/css に CSS が無い → 破損ビルドとみなし差し替え中止（現行維持）"
  rm -rf "$BUILD_DIR" 2>>"$LOG" || true
  exit 1
fi
if [ ! -f "$BUILD_DIR/BUILD_ID" ]; then
  log "ERROR: $BUILD_DIR/BUILD_ID が無い → 不完全ビルド、差し替え中止（現行維持）"
  rm -rf "$BUILD_DIR" 2>>"$LOG" || true
  exit 1
fi
log "✓ ビルド成功・検証 OK (CSS ${CSS_COUNT} 件)"
sync

# ----- 原子的差し替え（ここがダウン窓ゼロの肝。mv はミリ秒） -----
rm -rf .next.prev 2>>"$LOG" || true
if [ -d .next ]; then mv .next .next.prev 2>>"$LOG" || true; fi
mv "$BUILD_DIR" .next 2>>"$LOG" || { log "ERROR: 差し替え失敗"; [ -d .next.prev ] && mv .next.prev .next; exit 1; }
log "✓ .next を新ビルドに差し替え"

# ----- PM2 restart（reload でなく restart で全ワーカーのビルドIDを揃える） -----
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env >> "$LOG" 2>&1
  log "✓ PM2 restart 完了"
else
  pm2 start ecosystem.config.js >> "$LOG" 2>&1
  log "✓ PM2 新規起動"
fi
pm2 save >> "$LOG" 2>&1

# ----- ヘルスチェック (API + 実 CSS 到達性) -----
sleep 3
HEALTH_OK=0
CSS_OK=0
if curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok"'; then HEALTH_OK=1; fi
CSS_PATH=$(curl -fsS http://127.0.0.1:3000/ 2>/dev/null | grep -oE '/_next/static/css/[^"]+\.css' | head -1)
if [ -n "$CSS_PATH" ] && curl -fsS "http://127.0.0.1:3000${CSS_PATH}" >/dev/null 2>&1; then CSS_OK=1; fi

if [ "$HEALTH_OK" = "1" ] && [ "$CSS_OK" = "1" ]; then
  log "✓ ヘルスチェック OK (API + CSS 両方到達)"
  rm -rf .next.prev 2>>"$LOG" || true
else
  log "ERROR: ヘルスチェック失敗 — API=$HEALTH_OK CSS=$CSS_OK (パス: $CSS_PATH)"
  # ----- 自動ロールバック（前ビルド + 前コミットに戻す） -----
  if [ -d .next.prev ]; then
    log "→ 自動ロールバック開始"
    git reset --hard "$ROLLBACK_SHA" --quiet 2>>"$LOG" || log "WARN: git reset 失敗"
    rm -rf .next 2>>"$LOG" || true
    mv .next.prev .next 2>>"$LOG" || true
    pm2 restart "$APP_NAME" --update-env >> "$LOG" 2>&1
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
