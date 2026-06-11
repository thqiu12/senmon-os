#!/usr/bin/env bash
# =============================================================================
# offsite-backup.sh
#   本番DB(SQLite)とアップロード書類を gpg(AES256) で暗号化し、
#   Cloudflare R2（S3互換, rclone経由）へ日次アップロードする。
#
#   - サーバーが丸ごと失われても、別ロケーション(R2)に暗号化済みコピーが残る
#   - 暗号化パスフレーズはサーバー外にも控えること（復号に必須）
#
# 前提（VPS側に用意。詳細は OFFSITE-BACKUP.md）:
#   - rclone インストール済み、remote "r2" 設定済み
#   - パスフレーズファイル: /srv/senmon/secrets/backup.pass (chmod 600, root)
#
# 環境変数で上書き可:
#   APP_DIR=/srv/senmon/app  UPLOAD_DIR=/srv/senmon/private/uploads
#   RCLONE_REMOTE=r2  R2_BUCKET=senmon-backup  KEEP_DAYS=90
# =============================================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/srv/senmon/app}"
UPLOAD_DIR="${UPLOAD_DIR:-/srv/senmon/private/uploads}"
WORK_DIR="${WORK_DIR:-/srv/senmon/backup/offsite-tmp}"
LOG="${OFFSITE_LOG:-/srv/senmon/backup/offsite.log}"
PASS_FILE="${BACKUP_PASS_FILE:-/srv/senmon/secrets/backup.pass}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-senmon-backup}"
KEEP_DAYS="${KEEP_DAYS:-90}"

# DB パス検出:
#   DATABASE_URL="file:./prisma/data.db" を Prisma が schema.prisma のディレクトリ
#   (app/prisma/) 基準で解決するため、実体は app/prisma/prisma/data.db に置かれる。
#   旧構成 app/prisma/data.db も一応フォールバックで見る。DB_PATH 環境変数で上書き可。
if [ -z "${DB_PATH:-}" ]; then
  if   [ -f "$APP_DIR/prisma/prisma/data.db" ]; then DB_PATH="$APP_DIR/prisma/prisma/data.db"
  elif [ -f "$APP_DIR/prisma/data.db" ];        then DB_PATH="$APP_DIR/prisma/data.db"
  else DB_PATH="$APP_DIR/prisma/prisma/data.db"; fi
fi

ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

mkdir -p "$WORK_DIR" "$(dirname "$LOG")"

# ---- 事前チェック ----
command -v rclone >/dev/null 2>&1 || { log "ERROR: rclone 未インストール"; exit 1; }
command -v gpg    >/dev/null 2>&1 || { log "ERROR: gpg 未インストール"; exit 1; }
command -v sqlite3>/dev/null 2>&1 || { log "ERROR: sqlite3 未インストール"; exit 1; }
[ -f "$PASS_FILE" ] || { log "ERROR: パスフレーズファイルが無い: $PASS_FILE"; exit 1; }
[ -f "$DB_PATH" ]   || { log "ERROR: DB が無い: $DB_PATH"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
encrypt() { # $1=平文ファイル → $1.gpg を生成
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASS_FILE" \
      --cipher-algo AES256 -c "$1"
}

# ---- 1) DB: ホットコピー → gzip → gpg ----
DB_TMP="$WORK_DIR/data-$STAMP.db"
if ! sqlite3 "$DB_PATH" ".backup '$DB_TMP'"; then
  log "ERROR: sqlite3 .backup 失敗"; exit 1
fi
gzip -f "$DB_TMP"                      # → data-$STAMP.db.gz
encrypt "$DB_TMP.gz" || { log "ERROR: DB 暗号化失敗"; exit 1; }
DB_ENC="$DB_TMP.gz.gpg"

# ---- 2) uploads: tar.gz → gpg ----
UP_ENC=""
if [ -d "$UPLOAD_DIR" ]; then
  UP_TMP="$WORK_DIR/uploads-$STAMP.tar.gz"
  tar -czf "$UP_TMP" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")" 2>>"$LOG" || true
  if [ -f "$UP_TMP" ]; then
    encrypt "$UP_TMP" || { log "WARN: uploads 暗号化失敗（DBのみ続行）"; UP_TMP=""; }
    [ -n "${UP_TMP:-}" ] && UP_ENC="$UP_TMP.gpg"
  fi
fi

# ---- 3) R2 へアップロード ----
if ! rclone copyto "$DB_ENC" "$RCLONE_REMOTE:$R2_BUCKET/db/$(basename "$DB_ENC")" >>"$LOG" 2>&1; then
  log "ERROR: DB の R2 アップロード失敗"; rm -rf "${WORK_DIR:?}/"* 2>/dev/null; exit 1
fi
if [ -n "$UP_ENC" ]; then
  rclone copyto "$UP_ENC" "$RCLONE_REMOTE:$R2_BUCKET/uploads/$(basename "$UP_ENC")" >>"$LOG" 2>&1 \
    || log "WARN: uploads の R2 アップロード失敗"
fi

# ---- 4) ローカル一時ファイル削除（平文を残さない） ----
rm -rf "${WORK_DIR:?}/"* 2>/dev/null || true

# ---- 5) R2 上の古い世代を削除（KEEP_DAYS より古い） ----
rclone delete --min-age "${KEEP_DAYS}d" "$RCLONE_REMOTE:$R2_BUCKET/db/"      >>"$LOG" 2>&1 || true
rclone delete --min-age "${KEEP_DAYS}d" "$RCLONE_REMOTE:$R2_BUCKET/uploads/" >>"$LOG" 2>&1 || true

log "✓ オフサイトバックアップ完了 (db=$(basename "$DB_ENC")${UP_ENC:+, uploads=$(basename "$UP_ENC")}) → $RCLONE_REMOTE:$R2_BUCKET"
