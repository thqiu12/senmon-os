#!/usr/bin/env bash
# =============================================================================
# offsite-backup.sh
#   本番DB(Postgres / Supabase)とアップロード書類を gpg(AES256) で暗号化し、
#   Cloudflare R2（S3互換, rclone経由）へ日次アップロードする。
#
#   - サーバー / Supabase が失われても、別ロケーション(R2)に暗号化済みコピーが残る
#     （Supabase 自体の日次バックアップ/PITR に加えた「自前の異地コピー」= 多重防御）
#   - 暗号化パスフレーズはサーバー外にも控えること（復号に必須）
#   - 復元は scripts/deploy/offsite-restore.sh（pg_restore ベース）
#
# 前提（VPS側に用意。詳細は OFFSITE-BACKUP.md）:
#   - rclone インストール済み、remote "r2" 設定済み
#   - pg_dump インストール済み（postgresql-client。バージョンは Supabase の PG 以上）
#   - パスフレーズファイル: /srv/senmon/secrets/backup.pass (chmod 600, root)
#   - 接続: APP_DIR/.env の DIRECT_URL(セッションプーラ5432)を使用。
#           env PG_DUMP_URL で上書き可。
#
# 環境変数で上書き可:
#   APP_DIR=/srv/senmon/app  UPLOAD_DIR=/srv/senmon/private/uploads
#   PG_DUMP_URL=postgresql://...  RCLONE_REMOTE=r2  R2_BUCKET=senmon-backup  KEEP_DAYS=90
# =============================================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/srv/senmon/app}"
WORK_DIR="${WORK_DIR:-/srv/senmon/backup/offsite-tmp}"
LOG="${OFFSITE_LOG:-/srv/senmon/backup/offsite.log}"
PASS_FILE="${BACKUP_PASS_FILE:-/srv/senmon/secrets/backup.pass}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-senmon-backup}"
KEEP_DAYS="${KEEP_DAYS:-90}"

# ---- 接続文字列の解決 ----
# pg_dump は pgbouncer のトランザクションモード(6543)では失敗するため、
# セッションモード/直結の DIRECT_URL(5432)を使う。env で上書きも可。
resolve_pg_url() {
  if [ -n "${PG_DUMP_URL:-}" ]; then printf '%s' "$PG_DUMP_URL"; return; fi
  local v
  v=$(grep -E '^DIRECT_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\"']//; s/[\"']$//")
  [ -z "$v" ] && v=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\"']//; s/[\"']$//")
  printf '%s' "$v"
}
PG_URL="$(resolve_pg_url)"

ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

mkdir -p "$WORK_DIR" "$(dirname "$LOG")"

# アップロード書類のパス検出（実体は app/private/uploads。旧/絶対構成もフォールバック）
if [ -z "${UPLOAD_DIR:-}" ]; then
  if   [ -d "$APP_DIR/private/uploads" ];    then UPLOAD_DIR="$APP_DIR/private/uploads"
  elif [ -d "/srv/senmon/private/uploads" ]; then UPLOAD_DIR="/srv/senmon/private/uploads"
  else UPLOAD_DIR="$APP_DIR/private/uploads"; fi
fi

# ---- 失敗通知（任意） ----
# /srv/senmon/secrets/backup-alert.env があれば読み込む（無ければ通知なしで通常動作）:
#   RESEND_API_KEY="re_..."   RESEND_FROM="...<...>"   ALERT_EMAIL="you@example.com"
#   HEALTHCHECK_URL="https://hc-ping.com/xxxx"   # 任意: 成功pingが途絶えたら外部監視が通知
ALERT_ENV="${ALERT_ENV:-/srv/senmon/secrets/backup-alert.env}"
# shellcheck disable=SC1090
[ -f "$ALERT_ENV" ] && . "$ALERT_ENV"

notify_failure() {
  [ -n "${RESEND_API_KEY:-}" ] && [ -n "${RESEND_FROM:-}" ] && [ -n "${ALERT_EMAIL:-}" ] || return 0
  curl -s -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer ${RESEND_API_KEY}" -H "Content-Type: application/json" \
    -d "{\"from\":\"${RESEND_FROM}\",\"to\":\"${ALERT_EMAIL}\",\"subject\":\"[senmon] オフサイトバックアップ失敗\",\"text\":\"$1\"}" \
    >/dev/null 2>&1 || true
}

# 終了時フック: 失敗ならメール通知＋死活監視に fail ping、成功なら ok ping。
on_exit() {
  ec=$?
  if [ "$ec" -ne 0 ]; then
    log "ERROR: バックアップ異常終了 (exit=$ec) → 通知送信"
    notify_failure "$(ts): senmon オフサイトバックアップが失敗しました (exit=$ec)。サーバーで $LOG を確認してください。"
    [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "${HEALTHCHECK_URL}/fail" >/dev/null 2>&1 || true
  else
    [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "${HEALTHCHECK_URL}" >/dev/null 2>&1 || true
  fi
}
trap on_exit EXIT

# ---- 事前チェック ----
command -v rclone  >/dev/null 2>&1 || { log "ERROR: rclone 未インストール"; exit 1; }
command -v gpg     >/dev/null 2>&1 || { log "ERROR: gpg 未インストール"; exit 1; }
command -v pg_dump >/dev/null 2>&1 || { log "ERROR: pg_dump 未インストール（apt install postgresql-client）"; exit 1; }
[ -f "$PASS_FILE" ] || { log "ERROR: パスフレーズファイルが無い: $PASS_FILE"; exit 1; }
[ -n "$PG_URL" ]    || { log "ERROR: 接続文字列が解決できない（PG_DUMP_URL か $APP_DIR/.env の DIRECT_URL）"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
encrypt() { # $1=平文ファイル → $1.gpg を生成
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASS_FILE" \
      --cipher-algo AES256 -c "$1"
}

# ---- 1) DB: pg_dump(custom形式・public スキーマのみ) → gpg ----
# -Fc=圧縮付きcustom(pg_restore用) / -n public=アプリのスキーマのみ(Supabase内部schema除外)
# --no-owner --no-privileges=別ロールへ復元しても問題が出ないように
DB_TMP="$WORK_DIR/db-$STAMP.dump"
if ! pg_dump "$PG_URL" -Fc -n public --no-owner --no-privileges -f "$DB_TMP" 2>>"$LOG"; then
  log "ERROR: pg_dump 失敗（接続/権限/バージョンを確認。pg_dump は Supabase の PG 以上が必要）"
  rm -rf "${WORK_DIR:?}/"* 2>/dev/null; exit 1
fi
encrypt "$DB_TMP" || { log "ERROR: DB 暗号化失敗"; rm -rf "${WORK_DIR:?}/"* 2>/dev/null; exit 1; }
DB_ENC="$DB_TMP.gpg"

# ---- 2) uploads: tar.gz → gpg（書類はディスク上のまま=引き続き要バックアップ） ----
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
