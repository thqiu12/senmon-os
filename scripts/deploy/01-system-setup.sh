#!/usr/bin/env bash
# =============================================================================
# 01-system-setup.sh
#   Ubuntu 24.04 LTS のホスト初期セットアップ。root 権限で実行。
#   - スワップ作成（RAM 2GB のため必須）
#   - apt 更新 + セキュリティ自動更新
#   - Node.js 20 LTS (NodeSource)
#   - Chromium + Puppeteer 用フォント・依存
#   - nginx, certbot, fail2ban, ufw
#   - deploy ユーザー作成（sudo 不可、git pull / pm2 のみ）
#   - /private/uploads の作成（プライベート chmod 700）
#
# 実行方法:
#   sudo bash 01-system-setup.sh
#
# 冪等：再実行しても壊れません。
# =============================================================================
set -euo pipefail

# ---------- 設定（必要に応じて変更） ----------
DEPLOY_USER="deploy"
SWAP_SIZE_MB=2048
UPLOAD_DIR="/srv/senmon/private/uploads"
APP_DIR="/srv/senmon/app"
BACKUP_DIR="/srv/senmon/backup"
GITHUB_USER_FOR_SSH_KEYS="${GITHUB_USER_FOR_SSH_KEYS:-thqiu12}"  # deploy ユーザーの SSH 公開鍵を引く GitHub ユーザー
# ---------------------------------------------

log() { echo -e "\e[36m[setup]\e[0m $*"; }
err() { echo -e "\e[31m[error]\e[0m $*" >&2; }

if [ "$EUID" -ne 0 ]; then
  err "このスクリプトは root で実行してください: sudo bash $0"
  exit 1
fi

if ! grep -q "Ubuntu 24.04" /etc/os-release; then
  err "想定 OS は Ubuntu 24.04 LTS です。/etc/os-release を確認してください。"
  exit 1
fi

# ------------------------------------------------------------
# 1. タイムゾーン
# ------------------------------------------------------------
log "タイムゾーンを Asia/Tokyo に設定"
timedatectl set-timezone Asia/Tokyo

# ------------------------------------------------------------
# 2. スワップ作成（既存があればスキップ）
# ------------------------------------------------------------
if [ ! -f /swapfile ]; then
  log "スワップファイル ${SWAP_SIZE_MB}MB を作成"
  fallocate -l "${SWAP_SIZE_MB}M" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q "^/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
  # swappiness を下げて RAM 優先（10 = 推奨値）
  sysctl -w vm.swappiness=10
  echo "vm.swappiness=10" > /etc/sysctl.d/99-swappiness.conf
else
  log "スワップは既に作成済み（スキップ）"
fi

# ------------------------------------------------------------
# 3. apt 更新 + 自動セキュリティ更新
# ------------------------------------------------------------
log "apt インデックス更新"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

log "基本ツールをインストール"
apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg lsb-release \
  git build-essential pkg-config python3 \
  ufw fail2ban unattended-upgrades \
  tzdata sqlite3 cron rsync logrotate jq

# unattended-upgrades の有効化（Ubuntu の Security pocket を自動適用）
log "自動セキュリティ更新を有効化"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades

# ------------------------------------------------------------
# 4. Node.js 20 LTS (NodeSource)
# ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "^v20"; then
  log "Node.js 20 LTS を NodeSource からインストール"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  log "Node.js 20 は既にインストール済み（$(node -v)）"
fi

# PM2 のグローバルインストール
if ! command -v pm2 >/dev/null 2>&1; then
  log "PM2 を npm でインストール"
  npm install -g pm2
else
  log "PM2 は既にインストール済み（$(pm2 -v)）"
fi

# ------------------------------------------------------------
# 5. Google Chrome + Puppeteer 依存
#   Ubuntu 24.04 標準の chromium-browser は snap 経由になっており
#   Puppeteer から起動するとサンドボックスで詰まりやすい。
#   Google 公式 apt リポジトリから google-chrome-stable を入れる。
#   注意: libasound2 は Ubuntu 24.04 で libasound2t64 にリネーム済み。
# ------------------------------------------------------------
log "Puppeteer 用フォントと共有ライブラリをインストール"
apt-get install -y --no-install-recommends \
  libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 \
  libasound2t64 libxss1 libxtst6 libxshmfence1 \
  libxkbcommon0 libpango-1.0-0 libcairo2 \
  fonts-noto-cjk fonts-noto-color-emoji fonts-ipafont \
  libatk1.0-0 libcups2 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libnspr4

if ! command -v google-chrome >/dev/null 2>&1; then
  log "Google Chrome を Google 公式 apt リポジトリからインストール"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list
  apt-get update -y
  apt-get install -y google-chrome-stable
else
  log "Google Chrome は既にインストール済み"
fi

if ! command -v google-chrome >/dev/null 2>&1; then
  err "google-chrome が見つかりません。インストールに失敗した可能性があります。"
  exit 1
fi

# 確認用にバージョンを記録
google-chrome --version || true

# ------------------------------------------------------------
# 6. nginx + certbot
# ------------------------------------------------------------
log "nginx と certbot をインストール"
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable --now nginx

# ------------------------------------------------------------
# 7. deploy ユーザー作成（既存ならスキップ）
# ------------------------------------------------------------
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  log "ユーザー $DEPLOY_USER を作成"
  useradd -m -s /bin/bash "$DEPLOY_USER"
  # sudo は与えない（pm2 / git pull / npm install のみ）
fi

# deploy ユーザーが nginx の reload を呼べるよう、systemctl の最小権限を付与
# （nginx 設定書き換えは root 側で行うので、reload だけ許可）
if [ ! -f /etc/sudoers.d/deploy-nginx ]; then
  log "deploy に nginx reload 限定の sudo を付与"
  cat > /etc/sudoers.d/deploy-nginx <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx, /usr/bin/systemctl status nginx, /usr/sbin/nginx -t
EOF
  chmod 0440 /etc/sudoers.d/deploy-nginx
fi

# deploy 用に GitHub から公開鍵を取得（任意）
if [ -n "$GITHUB_USER_FOR_SSH_KEYS" ]; then
  log "deploy ユーザーの authorized_keys を GitHub の鍵で初期化"
  install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  if curl -fsSL "https://github.com/${GITHUB_USER_FOR_SSH_KEYS}.keys" -o "/home/$DEPLOY_USER/.ssh/authorized_keys.new"; then
    if [ -s "/home/$DEPLOY_USER/.ssh/authorized_keys.new" ]; then
      mv "/home/$DEPLOY_USER/.ssh/authorized_keys.new" "/home/$DEPLOY_USER/.ssh/authorized_keys"
      chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
      chmod 0600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
    else
      rm -f "/home/$DEPLOY_USER/.ssh/authorized_keys.new"
      log "GitHub に公開鍵が無いようなので authorized_keys は作成しません"
    fi
  fi
fi

# ------------------------------------------------------------
# 8. アプリケーション用ディレクトリ作成
# ------------------------------------------------------------
log "アプリ用ディレクトリを作成"
install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /srv/senmon
install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /srv/senmon/private
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$UPLOAD_DIR"
install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BACKUP_DIR"

# ------------------------------------------------------------
# 9. ufw（OS 側ファイアウォール）
# ------------------------------------------------------------
log "ufw を構成"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# ------------------------------------------------------------
# 10. fail2ban（SSH ブルートフォース対策）
# ------------------------------------------------------------
log "fail2ban の SSH jail を設定"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 5
findtime = 600
bantime = 3600
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# ------------------------------------------------------------
# 11. sshd_config を強化（パスワード認証を完全に無効化）
# ------------------------------------------------------------
log "SSH 設定を強化（鍵認証のみ）"
SSHD_CFG="/etc/ssh/sshd_config.d/99-hardening.conf"
cat > "$SSHD_CFG" <<'EOF'
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

# sshd -t は /run/sshd の存在を前提とする（Ubuntu 24.04 の挙動）。
# 通常 systemd の RuntimeDirectory が作るが、初期セットアップ中はまだ無いことがあるので明示作成。
mkdir -p /run/sshd
chmod 0755 /run/sshd

# 設定が正しいか検査
if sshd -t; then
  systemctl reload ssh || systemctl reload sshd || systemctl restart ssh
else
  err "sshd_config に問題があります。$SSHD_CFG を確認してください。"
  exit 1
fi

# ------------------------------------------------------------
# 12. logrotate（pm2 ログ）
# ------------------------------------------------------------
cat > /etc/logrotate.d/senmon-pm2 <<EOF
/home/$DEPLOY_USER/.pm2/logs/*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
}
EOF

# ------------------------------------------------------------
# 13. PM2 を deploy ユーザーで systemd 化（初回のみ）
# ------------------------------------------------------------
if ! systemctl list-unit-files | grep -q "^pm2-${DEPLOY_USER}"; then
  log "PM2 を systemd ユニットとして登録"
  sudo -u "$DEPLOY_USER" -H bash -lc "pm2 startup systemd -u $DEPLOY_USER --hp /home/$DEPLOY_USER" \
    | tail -n 1 \
    | sed -n 's/^sudo //p' \
    | bash || true
fi

# ------------------------------------------------------------
# 完了表示
# ------------------------------------------------------------
log "================================================================="
log "✓ システムセットアップ完了"
log "================================================================="
log ""
log "次のステップ:"
log "  1. deploy ユーザーに切り替え"
log "       sudo -i -u $DEPLOY_USER"
log "  2. リポジトリをクローン"
log "       cd $APP_DIR"
log "       git clone -b chore/security-hardening <YOUR_REPO_URL> ."
log "  3. デプロイスクリプトを実行"
log "       bash scripts/deploy/02-app-deploy.sh"
log ""
log "重要なパス:"
log "  APP_DIR    : $APP_DIR"
log "  UPLOAD_DIR : $UPLOAD_DIR"
log "  BACKUP_DIR : $BACKUP_DIR"
log ""
log "確認コマンド:"
log "  free -h           # スワップが 2GB 出ているはず"
log "  node -v           # v20.x"
log "  google-chrome --version"
log "  systemctl status nginx fail2ban"
log "  ufw status"
