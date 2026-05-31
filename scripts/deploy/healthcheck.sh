#!/usr/bin/env bash
# =============================================================================
# healthcheck.sh — 外部 (GitHub Actions runner や ローカル Mac) から本番 URL を検証
#
# 使い方:
#   bash healthcheck.sh                      # http://160.16.132.198 をチェック
#   BASE_URL=https://example.com bash healthcheck.sh
#   EXPECTED_SHA=abc1234 bash healthcheck.sh # 期待コミットと一致確認
#
# 検査項目:
#   1. /api/health が {"status":"ok"} を返す                ← 必須
#   2. /apply が 200                                       ← 必須
#   3. /admin が 200                                       ← 必須
#   4. (任意) /api/deploy-meta が指定 SHA と一致           ← 情報のみ・失敗してもOK
#
# 終了コード: 0=サイト稼働確認 OK / 1=サイト稼働に問題あり
# =============================================================================
# 注: set -e は使わない。
# `grep -oE` がマッチ無しで exit 1 を返すと set -e が起動して
# サブシェル内なのにスクリプト全体が落ちる bash の挙動回避のため。
# 各 step で明示的に exit 1 を発行する形式に統一。
set -uo pipefail

BASE_URL="${BASE_URL:-http://160.16.132.198}"
TIMEOUT="${TIMEOUT:-60}"
EXPECTED_SHA="${EXPECTED_SHA:-}"

echo "🔍 Health check: $BASE_URL (timeout ${TIMEOUT}s)"

# ---- 1. /api/health ----
ok=0
uptime=""
for i in $(seq 1 "$TIMEOUT"); do
  response=$(curl -fsS --max-time 5 "$BASE_URL/api/health" 2>/dev/null) || response=""
  if [ -n "$response" ] && echo "$response" | grep -q '"ok"'; then
    ok=1
    # grep が見つからなくても落ちないように || true
    uptime=$(echo "$response" | grep -oE '"uptime":[0-9.]+' | cut -d: -f2 || true)
    echo "  ✓ /api/health → ok (uptime=${uptime:-?}s)"
    break
  fi
  sleep 1
done
if [ "$ok" != "1" ]; then
  echo "  ✗ /api/health 応答なし"
  exit 1
fi

# ---- 2. /apply ----
code=$(curl -fsS -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/apply" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
  echo "  ✓ /apply → 200"
else
  echo "  ✗ /apply → $code"
  exit 1
fi

# ---- 3. /admin ----
code=$(curl -fsS -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/admin" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
  echo "  ✓ /admin → 200"
else
  echo "  ✗ /admin → $code"
  exit 1
fi

# ---- 4. SHA 一致確認（情報レベル、失敗してもヘルスチェック全体は通す） ----
if [ -n "$EXPECTED_SHA" ]; then
  meta=$(curl -fsS --max-time 5 "$BASE_URL/api/deploy-meta" 2>/dev/null || echo "{}")
  # grep が no-match でも || true で抑制
  actual_sha=$(echo "$meta" | grep -oE '"shortSha":"[^"]+"' | cut -d'"' -f4 || true)
  expected_short="${EXPECTED_SHA:0:7}"
  if [ -z "$actual_sha" ]; then
    echo "  ⚠ デプロイ SHA 不明（/api/deploy-meta が未デプロイ or .deploy-meta.json 未作成）"
    echo "    期待 SHA: $expected_short（情報のみ・サイト本体は正常）"
  elif [ "$actual_sha" = "$expected_short" ]; then
    echo "  ✓ デプロイ SHA 一致 (${actual_sha})"
  else
    echo "  ⚠ デプロイ SHA 不一致: 期待=${expected_short}, 実際=${actual_sha}"
    echo "    （cron auto-deploy 経由で別 SHA が反映されている可能性・サイト本体は正常）"
  fi
fi

echo "✓ 全ヘルスチェック PASS"
exit 0
