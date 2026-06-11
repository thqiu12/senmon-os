#!/usr/bin/env bash
# =============================================================================
# backup-daily.sh
#   毎日 03:00 に cron で実行する DB + uploads のバックアップ。
#
#   - SQLite は sqlite3 .backup で安全にコピー（書き込み中でも OK）
#   - uploads は rsync で差分コピー
#   - 7 日より古いバックアップは削除
#
# cron 設定（deploy ユーザーで crontab -e）:
#   0 3 * * * /srv/senmon/app/scripts/deploy/backup-daily.sh >> /srv/senmon/backup/backup.log 2>&1
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/senmon/app}"
UPLOAD_DIR="${UPLOAD_DIR:-/srv/senmon/private/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/srv/senmon/backup}"
KEEP_DAYS="${KEEP_DAYS:-7}"

TS="$(date +%Y%m%d-%H%M%S)"
DAY="$(date +%Y%m%d)"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"

echo "[$(date '+%F %T')] バックアップ開始"

# ---- SQLite DB ----
# DATABASE_URL の相対解決により実体は app/prisma/prisma/data.db（prisma二重）に置かれる。
if   [ -f "$APP_DIR/prisma/prisma/data.db" ]; then DB_PATH="$APP_DIR/prisma/prisma/data.db"
elif [ -f "$APP_DIR/prisma/data.db" ];        then DB_PATH="$APP_DIR/prisma/data.db"
else DB_PATH="$APP_DIR/prisma/prisma/data.db"; fi
if [ -f "$DB_PATH" ]; then
  DB_OUT="$BACKUP_DIR/db/data-$TS.db"
  echo "  DB: $DB_PATH -> $DB_OUT"
  sqlite3 "$DB_PATH" ".backup '$DB_OUT'"
  gzip -9 "$DB_OUT"
  echo "    サイズ: $(du -h "$DB_OUT.gz" | cut -f1)"
else
  echo "  ⚠ DB が見つかりません: $DB_PATH"
fi

# ---- uploads（差分 rsync） ----
if [ -d "$UPLOAD_DIR" ]; then
  UP_OUT="$BACKUP_DIR/uploads/uploads-$DAY"
  echo "  uploads: $UPLOAD_DIR -> $UP_OUT"
  rsync -a --delete "$UPLOAD_DIR/" "$UP_OUT/"
  echo "    サイズ: $(du -sh "$UP_OUT" | cut -f1)"
else
  echo "  ⚠ uploads ディレクトリが見つかりません: $UPLOAD_DIR"
fi

# ---- 古いバックアップ削除 ----
echo "  $KEEP_DAYS 日より古いバックアップを削除"
find "$BACKUP_DIR/db" -name 'data-*.db.gz' -mtime "+$KEEP_DAYS" -print -delete || true
find "$BACKUP_DIR/uploads" -mindepth 1 -maxdepth 1 -type d -name 'uploads-*' -mtime "+$KEEP_DAYS" -print -exec rm -rf {} \; || true

echo "[$(date '+%F %T')] ✓ バックアップ完了"
echo "  合計使用量: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo "----"
