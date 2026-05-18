#!/usr/bin/env bash
# =============================================================================
# install-auto-deploy.sh
#   deploy ユーザーで実行: GitHub からの自動デプロイを cron に登録。
#
#   - 1 分ごとに GitHub の最新コミットをチェック
#   - 差分があれば pull → build → PM2 reload
#   - ログ: /srv/senmon/backup/auto-deploy.log
# =============================================================================
set -euo pipefail

if [ "$EUID" -eq 0 ]; then
  echo "deploy ユーザーで実行してください（root では実行しない）" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_DEPLOY="$SCRIPT_DIR/auto-deploy.sh"

chmod +x "$AUTO_DEPLOY"

# 1 分ごとに実行（GitHub の rate limit 60req/h を消費しないよう適度に）
# 細かくしたい場合は */1 → */2 等に調整
CRON_LINE="* * * * * $AUTO_DEPLOY"

CURRENT="$(crontab -l 2>/dev/null || true)"

if echo "$CURRENT" | grep -Fq "$AUTO_DEPLOY"; then
  echo "自動デプロイ cron は既に登録済み（スキップ）"
else
  echo "自動デプロイ cron を登録（1 分ごと）"
  (echo "$CURRENT"; echo "$CRON_LINE") | crontab -
fi

echo
echo "✓ 設定完了。現在の crontab:"
crontab -l

echo
echo "監視:"
echo "  tail -f /srv/senmon/backup/auto-deploy.log"
echo
echo "解除:"
echo "  crontab -l | grep -v auto-deploy.sh | crontab -"
