#!/usr/bin/env bash
# DB（SQLite）とアップロード書類のバックアップを取得する。
# cron 例（毎日 3:00）:  0 3 * * *  /home/work/.openclaw/workspace/senmon-nyuugaku/scripts/backup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# DB ファイルパスを DATABASE_URL から解決（file:... 形式）。未設定なら dev.db。
DB_URL="${DATABASE_URL:-file:./dev.db}"
DB_PATH="${DB_URL#file:}"
case "$DB_PATH" in
  /*) : ;;                       # 絶対パスはそのまま
  *)  DB_PATH="$APP_DIR/$DB_PATH" ;;  # 相対は APP_DIR 基準
esac

UPLOAD_DIR="${UPLOAD_DIR:-$APP_DIR/storage/uploads}"

mkdir -p "$BACKUP_DIR"

# DB: sqlite3 があれば整合性のある .backup を、無ければファイルコピー
if [ -f "$DB_PATH" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/db-$STAMP.sqlite'"
  else
    cp "$DB_PATH" "$BACKUP_DIR/db-$STAMP.sqlite"
  fi
  gzip -f "$BACKUP_DIR/db-$STAMP.sqlite"
  echo "DB backup: $BACKUP_DIR/db-$STAMP.sqlite.gz"
else
  echo "WARN: DB not found at $DB_PATH" >&2
fi

# アップロード書類
if [ -d "$UPLOAD_DIR" ]; then
  tar czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
  echo "Uploads backup: $BACKUP_DIR/uploads-$STAMP.tar.gz"
else
  echo "WARN: upload dir not found at $UPLOAD_DIR" >&2
fi

# 古い世代を削除
find "$BACKUP_DIR" -name "*.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
echo "Done. Retention: ${RETENTION_DAYS}d. ※ backups/ は別ホスト/ストレージへ転送推奨。"
