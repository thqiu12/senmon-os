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
#   1. /api/health が {"status":"ok"} を返す
#   2. /apply が 200
#   3. /admin が 200
#   4. (任意) /api/deploy-meta が指定 SHA と一致
#
# 終了コード: 0=全て OK / 1=どれか失敗
# =============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://160.16.132.198}"
TIMEOUT="${TIMEOUT:-60}"
EXPECTED_SHA="${EXPECTED_SHA:-}"

echo "🔍 Health check: $BASE_URL (timeout ${TIMEOUT}s)"

# 1. /api/health
ok=0
for i in $(seq 1 "$TIMEOUT"); do
  if response=$(curl -fsS --max-time 5 "$BASE_URL/api/health" 2>/dev/null); then
    if echo "$response" | grep -q '"ok"'; then
      ok=1
      uptime=$(echo "$response" | grep -oE '"uptime":[0-9.]+' | cut -d: -f2)
      echo "  ✓ /api/health → ok (uptime=${uptime}s)"
      break
    fi
  fi
  sleep 1
done
if [ "$ok" != "1" ]; then
  echo "  ✗ /api/health 応答なし"
  exit 1
fi

# 2. /apply
code=$(curl -fsS -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/apply" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
  echo "  ✓ /apply → 200"
else
  echo "  ✗ /apply → $code"
  exit 1
fi

# 3. /admin
code=$(curl -fsS -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/admin" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
  echo "  ✓ /admin → 200"
else
  echo "  ✗ /admin → $code"
  exit 1
fi

# 4. SHA 一致確認（オプション）
if [ -n "$EXPECTED_SHA" ]; then
  meta=$(curl -fsS --max-time 5 "$BASE_URL/api/deploy-meta" 2>/dev/null || echo "{}")
  actual_sha=$(echo "$meta" | grep -oE '"shortSha":"[^"]+"' | cut -d'"' -f4)
  if [ "$actual_sha" = "${EXPECTED_SHA:0:7}" ]; then
    echo "  ✓ デプロイ SHA 一致 (${actual_sha})"
  else
    echo "  ✗ デプロイ SHA 不一致: 期待=${EXPECTED_SHA:0:7}, 実際=${actual_sha}"
    exit 1
  fi
fi

echo "✓ 全ヘルスチェック PASS"
exit 0
