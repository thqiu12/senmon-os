# CI/CD ガイド

```
┌─────────────────────────────────────────────────────────────────────┐
│                    push to chore/security-hardening                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                ▼                                   ▼
       ┌────────────────┐               ┌────────────────────┐
       │  CI: test.yml  │               │ CD: deploy.yml     │
       │ (3 並列 job)    │               │ (test 通過後実行)   │
       │  - unit         │  ─────────►  │  - SSH to VPS       │
       │  - typecheck    │   needs      │  - DB backup        │
       │  - e2e          │              │  - git pull         │
       └────────────────┘               │  - build + reload   │
                                        │  - health check     │
                                        │  - auto rollback    │
                                        └────────────────────┘
                                                  │
                                                  ▼
                                        ┌────────────────────┐
                                        │  本番 VPS 即時反映  │
                                        │  http://160.16...   │
                                        └────────────────────┘

問題発生時 → Rollback (rollback.yml): 手動トリガーで前バージョンに戻す
バックアップ → /srv/senmon/backup/pre-deploy/ にデプロイ前 DB 自動保管
fallback   → cron auto-deploy.sh が 1 分毎に動き続けるので二重保険
```

---

## 構成

### ワークフロー

| ファイル | トリガー | 役割 |
|---|---|---|
| `.github/workflows/test.yml` | push / PR | テスト（unit + typecheck + e2e）|
| `.github/workflows/deploy.yml` | push to main/chore branch | テスト通過後、本番デプロイ |
| `.github/workflows/rollback.yml` | 手動（workflow_dispatch） | 前バージョンに戻す |

### VPS 側スクリプト

| ファイル | 呼び出し元 | 役割 |
|---|---|---|
| `scripts/deploy/ci-deploy.sh` | GitHub Actions (SSH) | pull + build + reload + ヘルスチェック + 自動ロールバック |
| `scripts/deploy/rollback.sh` | ci-deploy.sh の失敗時 + 手動 workflow | 指定 SHA に reset + rebuild + restart |
| `scripts/deploy/healthcheck.sh` | GitHub Actions runner | 外部から `/api/health`, `/apply`, `/admin` 200 検証 |
| `scripts/deploy/auto-deploy.sh` | cron 1 分毎 | 既存のフォールバック polling（GitHub Actions が落ちた時用）|

### API エンドポイント

| URL | 用途 |
|---|---|
| `/api/health` | 軽量ヘルスチェック |
| `/api/deploy-meta` | 現在デプロイ中の SHA・ビルド ID・デプロイ時刻 |

---

## 初回セットアップ（GitHub Secrets 登録）

GitHub リポジトリ → Settings → Secrets and variables → Actions → New repository secret

### 必須 Secrets（暗号化保管）

| 名前 | 値の例 | 取得方法 |
|---|---|---|
| `SSH_PRIVATE_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | ローカル `~/.ssh/id_ed25519` の中身（後述の手順で生成）|
| `SSH_HOST` | `160.16.132.198` | VPS の IP |
| `SSH_USER` | `deploy` | デプロイユーザー名 |

### 任意 Variables（平文 OK）

| 名前 | 値の例 | 用途 |
|---|---|---|
| `PRODUCTION_URL` | `http://160.16.132.198` | ヘルスチェック対象 URL（独自ドメインがあれば差し替え）|

---

## SSH 鍵生成と VPS 登録（一度だけ）

ローカル Mac で：

```bash
# 1. デプロイ専用 SSH 鍵を生成（パスワード無し）
ssh-keygen -t ed25519 -f ~/.ssh/senmon_deploy -N "" -C "github-actions-deploy"

# 2. 公開鍵を VPS の deploy ユーザーに追加
cat ~/.ssh/senmon_deploy.pub | ssh ubuntu@160.16.132.198 \
  "sudo tee -a /home/deploy/.ssh/authorized_keys && \
   sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys && \
   sudo chmod 600 /home/deploy/.ssh/authorized_keys"

# 3. 接続テスト
ssh -i ~/.ssh/senmon_deploy deploy@160.16.132.198 "whoami && pwd"
# → deploy
#   /home/deploy

# 4. 秘密鍵を GitHub Secrets にコピペ
cat ~/.ssh/senmon_deploy
# ↑ 全部コピーして GitHub の SSH_PRIVATE_KEY に貼り付け
```

---

## デプロイの流れ（自動）

```
あなた                GitHub                VPS
  │                     │                    │
  │ git push            │                    │
  ├────────────────────►│                    │
  │                     │ Actions 起動        │
  │                     ├──► test job        │
  │                     │    - unit          │
  │                     │    - typecheck     │
  │                     │    - e2e           │
  │                     │                    │
  │                     ├──► deploy job      │
  │                     │    SSH 接続 ───────►│
  │                     │                    ├─ ci-deploy.sh 実行
  │                     │                    │   1. .last-deploy.sha 保存
  │                     │                    │   2. DB 自動バックアップ
  │                     │                    │   3. git pull
  │                     │                    │   4. npm ci (必要時)
  │                     │                    │   5. prisma 同期 (必要時)
  │                     │                    │   6. next build
  │                     │                    │   7. pm2 reload
  │                     │                    │   8. health check
  │                     │                    │   9. メタ情報保存
  │                     │ healthcheck.sh ───►│
  │                     │                    │
  │                     │ ✅ Summary 表示    │
  │ ◄───────────────────┤                    │
  │   ステータス通知    │                    │
  │  (PR コメント等)    │                    │
```

所要時間: 5〜10 分（テスト 3-5 分 + デプロイ 2-5 分）

---

## ロールバックの流れ（手動）

### GitHub UI から
1. GitHub → Actions タブ → "Rollback" ワークフローを選択
2. "Run workflow" ボタン
3. パラメータ入力：
   - `target_sha`: 空欄で直前デプロイに戻る、または指定 SHA
   - `reason`: 必須。監査ログに残る。
4. 実行 → 3〜5 分後に完了

### または VPS で直接
```bash
ssh deploy@160.16.132.198
cd /srv/senmon/app
bash scripts/deploy/rollback.sh           # 直前デプロイに戻る
# または
bash scripts/deploy/rollback.sh abc1234   # 特定 SHA に戻る
```

---

## 自動ロールバック発動条件

`ci-deploy.sh` 内で以下を満たすと `rollback.sh` が自動実行：
- `npm run build` 成功
- `pm2 reload` 完了
- **`/api/health` への curl が 30 秒以内に "ok" を返さない**

ロールバック発動 → 旧 SHA に reset → 再ビルド → 再起動 → ヘルスチェック再実行。
ロールバックでも復活しない場合は緊急手動対応が必要（PM2 logs / dmesg 等確認）。

---

## DB バックアップ（自動）

各デプロイ前に `scripts/deploy/ci-deploy.sh` が以下を実行：

```
/srv/senmon/backup/pre-deploy/data-20260520-153000-abc1234.db.gz
                                  ↑日付↑              ↑前 SHA
```

- 圧縮済み (.gz)
- 30 日経過すると自動削除
- 復元: `gunzip -c <file> > prisma/data.db`

---

## 監視・確認コマンド

### CI/CD の動作確認

```bash
# 最後のデプロイ結果を見る
ssh deploy@160.16.132.198 'tail -30 /srv/senmon/backup/ci-deploy.log'

# ロールバック履歴
ssh deploy@160.16.132.198 'tail -30 /srv/senmon/backup/rollback.log'

# 現在動いているコミット
curl -s http://160.16.132.198/api/deploy-meta | jq

# ヘルスチェック（手元 Mac から）
bash scripts/deploy/healthcheck.sh

# 特定 SHA がデプロイされているか
EXPECTED_SHA=abc1234 bash scripts/deploy/healthcheck.sh
```

### よくあるコマンド

```bash
# 強制的に再デプロイ（同じコミットでも）
gh workflow run deploy.yml

# テスト失敗を無視して緊急デプロイ
gh workflow run deploy.yml -f skip_tests=true

# ロールバック実行
gh workflow run rollback.yml -f reason="バグ発覚"

# 任意の SHA にロールバック
gh workflow run rollback.yml -f target_sha=abc1234 -f reason="..."
```

---

## トラブルシューティング

### ❌ "Permission denied (publickey)" でデプロイ失敗
→ GitHub Secrets の `SSH_PRIVATE_KEY` が正しい秘密鍵か確認。`SSH_USER` が `deploy` か確認。VPS の `/home/deploy/.ssh/authorized_keys` に対応する公開鍵が登録されているか確認。

### ❌ "ヘルスチェック失敗（30 秒応答なし）→ 自動ロールバック"
→ `ssh deploy@<vps> tail -80 /srv/senmon/backup/ci-deploy.log` で原因確認。よくある原因：
- スキーマ変更で Prisma db push がデータ破壊
- 環境変数の追加忘れ
- メモリ不足で起動失敗（dmesg | grep -i killed）

### ❌ "ロールバックも失敗"
→ 緊急事態。`ssh deploy@<vps>` して：
```bash
pm2 stop senmon-nyuugaku
cd /srv/senmon/app
git reset --hard $(cat .last-deploy.sha)   # 最後の既知正常 SHA に戻す
npm ci
npx prisma generate
rm -rf .next
NODE_OPTIONS="--max-old-space-size=1024" npm run build
pm2 restart senmon-nyuugaku
```

それでもダメなら DB バックアップから復元：
```bash
ls -lt /srv/senmon/backup/pre-deploy/ | head -5   # 直近のバックアップ確認
gunzip -c /srv/senmon/backup/pre-deploy/data-...db.gz > prisma/data.db
pm2 restart senmon-nyuugaku
```

### ⚠️ cron auto-deploy が GitHub Actions と衝突
→ `flock` で排他制御済み（同じロックを使用）。並行実行で壊れない設計。ただし両方が同時にコミット検知して二重ビルドする可能性は低確率で存在。重い変更時は cron を一時停止：
```bash
crontab -l | grep -v auto-deploy.sh | crontab -    # 一時停止
# デプロイ完了後に再登録
bash /srv/senmon/app/scripts/deploy/install-auto-deploy.sh
```

### ✅ デプロイ通知を Slack/Discord に飛ばしたい
`deploy.yml` の最後の `notify-failure` job を以下のように拡張：
```yaml
- uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      { "text": "Deploy ${{ job.status }}: ${{ github.sha }}" }
```

---

## セキュリティチェックリスト

- [x] SSH 鍵はパスフレーズ無し → GitHub Secrets で暗号化保管
- [x] 秘密鍵は deploy 専用（他用途と分離）
- [x] deploy ユーザーは sudo 制限済み（systemctl reload nginx のみ）
- [x] `ssh-keyscan` で SSH ホスト鍵を known_hosts に固定（MITM 対策）
- [x] PR ブランチからの本番デプロイ不可（main / chore/security-hardening のみ）
- [x] テスト失敗時のデプロイは workflow_dispatch + skip_tests=true 明示が必要
- [x] DB は デプロイ前に自動バックアップ
- [x] ロールバック理由は必須入力 → 監査ログに残る

---

## ファイル一覧（このセットアップで追加・変更）

```
.github/workflows/
├── test.yml         (CI: テスト)
├── deploy.yml       (CD: 本番デプロイ)
└── rollback.yml     (CD: ロールバック)

scripts/deploy/
├── ci-deploy.sh     (VPS 側デプロイスクリプト)
├── rollback.sh      (VPS 側ロールバックスクリプト)
├── healthcheck.sh   (外部ヘルスチェック)
└── auto-deploy.sh   (既存 cron 用 — フォールバック保持)

app/api/deploy-meta/
└── route.ts         (デプロイメタ情報 API)

CICD.md              (このファイル)
TESTING.md           (既存 — テスト体系のドキュメント)
```
