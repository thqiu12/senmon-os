#!/usr/bin/env bash
# =============================================================================
# offsite-restore.sh
#   R2 のオフサイト暗号化バックアップから DB を復元（ダウンロード→復号→展開）。
#   安全のため本番DBは自動上書きしない。復元先に出力し、手順を表示する。
#
# 使い方:
#   一覧:   bash offsite-restore.sh list
#   復元:   bash offsite-restore.sh db <ファイル名>   例) data-20260610-101500.db.gz.gpg
#           bash offsite-restore.sh uploads <ファイル名>
# =============================================================================
set -uo pipefail

PASS_FILE="${BACKUP_PASS_FILE:-/srv/senmon/secrets/backup.pass}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-senmon-backup}"
OUT_DIR="${OUT_DIR:-/srv/senmon/backup/restore}"

command -v rclone >/dev/null 2>&1 || { echo "rclone 未インストール"; exit 1; }
command -v gpg    >/dev/null 2>&1 || { echo "gpg 未インストール"; exit 1; }
[ -f "$PASS_FILE" ] || { echo "パスフレーズファイルが無い: $PASS_FILE（サーバー喪失時は控えからファイルを作成）"; exit 1; }

CMD="${1:-}"; NAME="${2:-}"
mkdir -p "$OUT_DIR"

case "$CMD" in
  list)
    echo "=== R2: db/ ==="; rclone lsl "$RCLONE_REMOTE:$R2_BUCKET/db/" | sort -k4
    echo "=== R2: uploads/ ==="; rclone lsl "$RCLONE_REMOTE:$R2_BUCKET/uploads/" | sort -k4
    ;;
  db)
    [ -n "$NAME" ] || { echo "ファイル名を指定: bash offsite-restore.sh db <name>"; exit 1; }
    rclone copyto "$RCLONE_REMOTE:$R2_BUCKET/db/$NAME" "$OUT_DIR/$NAME" || { echo "DL失敗"; exit 1; }
    gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASS_FILE" \
        -o "$OUT_DIR/${NAME%.gpg}" -d "$OUT_DIR/$NAME" || { echo "復号失敗（パスフレーズ確認）"; exit 1; }
    gunzip -f "$OUT_DIR/${NAME%.gpg}"   # → .db
    DB_OUT="$OUT_DIR/$(basename "${NAME%.gz.gpg}").db"
    # 念のため整合性チェック
    sqlite3 "$DB_OUT" "PRAGMA integrity_check;" | head -1
    echo "復元完了: $DB_OUT"
    echo "本番反映する場合（停止してから）:"
    echo "  pm2 stop senmon-nyuugaku"
    echo "  cp /srv/senmon/app/prisma/data.db /srv/senmon/app/prisma/data.db.bak.\$(date +%s)"
    echo "  cp '$DB_OUT' /srv/senmon/app/prisma/data.db"
    echo "  pm2 start senmon-nyuugaku"
    ;;
  uploads)
    [ -n "$NAME" ] || { echo "ファイル名を指定: bash offsite-restore.sh uploads <name>"; exit 1; }
    rclone copyto "$RCLONE_REMOTE:$R2_BUCKET/uploads/$NAME" "$OUT_DIR/$NAME" || { echo "DL失敗"; exit 1; }
    gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASS_FILE" \
        -o "$OUT_DIR/${NAME%.gpg}" -d "$OUT_DIR/$NAME" || { echo "復号失敗"; exit 1; }
    echo "復号完了: $OUT_DIR/${NAME%.gpg}（tar）。展開: tar -xzf '$OUT_DIR/${NAME%.gpg}' -C <復元先>"
    ;;
  *)
    echo "使い方: bash offsite-restore.sh {list|db <name>|uploads <name>}"; exit 1;;
esac
