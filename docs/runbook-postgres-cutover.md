# 本番カットオーバー Runbook：SQLite → Postgres(Supabase 東京)

> Plan 1 / Task 6。**メンテナンス窓**で実施。所要 ~30–60 分。各ステップは戻せる。
> 前提：`feat/postgres-migration` が CI 緑、Supabase(東京)プロジェクト作成済、接続文字列入手済。

接続文字列(Supabase → Connect → ORM/Prisma):
- `DATABASE_URL` = **Pooler 6543** + `?pgbouncer=true&sslmode=require`
- `DIRECT_URL` = **Direct 5432** + `?sslmode=require`

---

## 0. 事前(窓の外・無停止)
- [ ] CI: `feat/postgres-migration` が緑(unit/e2e/typecheck)
- [ ] Supabase の `DATABASE_URL` / `DIRECT_URL` を手元に用意
- [ ] 自動デプロイ cron を一時停止(窓中の暴発防止)
  ```bash
  # 例: crontab を退避(環境に合わせる)
  crontab -l > /tmp/crontab.bak && crontab -r
  ```

## 1. メンテ開始・停止
- [ ] アプリ停止(書き込みを止める)
  ```bash
  cd /srv/senmon/app
  pm2 stop all     # もしくはメンテページに切替
  ```

## 2. バックアップ(命綱)
- [ ] SQLite 実体 + uploads を退避(Prisma の相対解決で実体は `prisma/prisma/data.db`)
  ```bash
  cd /srv/senmon/app
  ts=$(date +%Y%m%d_%H%M%S)
  cp prisma/prisma/data.db /srv/senmon/backup/data_$ts.db 2>/dev/null \
    || cp prisma/data.db   /srv/senmon/backup/data_$ts.db
  cp .env /srv/senmon/backup/env_$ts.bak
  tar czf /srv/senmon/backup/uploads_$ts.tgz private/uploads 2>/dev/null || true
  ls -la /srv/senmon/backup/ | tail -3
  ```

## 3. 新コードを取得(まだ配信しない)
- [ ] `feat` を取得(マイグレーション + 移行スクリプト + Postgres schema が入る)
  ```bash
  cd /srv/senmon/app
  git fetch origin
  git checkout feat/postgres-migration
  git reset --hard origin/feat/postgres-migration
  npm ci --no-audit --no-fund
  ```

## 4. .env を Supabase に切替
- [ ] `.env` の DB を Postgres に(他の値は触らない)
  ```bash
  # .env を編集して以下を設定(古い DATABASE_URL=file:... は削除/置換)
  # DATABASE_URL="postgresql://...pooler...:6543/postgres?pgbouncer=true&sslmode=require"
  # DIRECT_URL="postgresql://...:5432/postgres?sslmode=require"
  grep -E "DATABASE_URL|DIRECT_URL" .env
  ```

## 5. スキーマ作成(Supabase)
- [ ] baseline migration を適用(空の Supabase にテーブル作成)
  ```bash
  npx prisma migrate deploy        # 0_init を適用。.env の DATABASE_URL/DIRECT_URL を使用
  ```
  期待: `All migrations have been successfully applied.`

## 6. データ移行(SQLite → Supabase)
- [ ] 件数突合つきコピー(`OLD_DATABASE_URL` だけ別途指定)
  ```bash
  OLD_DATABASE_URL="file:./prisma/prisma/data.db" \
    npx tsx prisma/migrate-sqlite-to-pg.ts
  # 旧構成なら OLD_DATABASE_URL="file:./prisma/data.db"
  ```
  期待: 全モデルで `SQLite → Postgres` の件数が一致し `✓ 全モデルの件数が一致しました`。
  不一致(exit 1)なら **ロールバック(§9)**。
  > 注: Phase3 で追加した `Application.extraData`(Json)/`FormFieldConfig.options` は旧 SQLite に存在せず、Json は SQLite 未対応のため、移行スクリプトが読み取りスキーマから自動除外する（移行先 PG は §5 の migrate deploy で作成済み・null 既定なので欠損なし）。空DB→空DB の通し実行で全モデル件数一致を検証済み。

## 7. ビルド・起動・確認
- [ ] ビルド & 起動
  ```bash
  NODE_OPTIONS="--max-old-space-size=2048" npm run build
  pm2 restart all && pm2 save
  bash scripts/deploy/healthcheck.sh || true
  ```
- [ ] 目視確認: 管理ログイン / 出願一覧件数 / 志望校 / 操作ログ / 1 件詳細表示
- [ ] アップロード画像が表示される(uploads は移動していないのでパスはそのまま)

## 8. 確定(自動デプロイを Postgres 運用へ)
- [ ] `feat` を `chore/security-hardening` にマージ(以後の自動デプロイが `migrate deploy` + Postgres で回る)
  ```bash
  # ローカル or サーバで
  git checkout chore/security-hardening && git merge --no-ff feat/postgres-migration
  git push origin chore/security-hardening
  ```
- [ ] cron を再開
  ```bash
  crontab /tmp/crontab.bak
  ```
- [ ] メンテ解除

## 9. ロールバック(どこで失敗しても）
1. `.env` を元に戻す(SQLite): `cp /srv/senmon/backup/env_<ts>.bak .env`
2. 旧ブランチへ: `git checkout chore/security-hardening && git reset --hard origin/chore/security-hardening`
3. `npm ci && npm run build && pm2 restart all`
4. 必要なら data.db を復元: `cp /srv/senmon/backup/data_<ts>.db prisma/prisma/data.db`
5. cron 再開
> SQLite 実体は無傷で残るので、§8 のマージ前ならいつでも安全に戻せる。

## 10. 後片付け(安定確認後・数日後)
- [ ] Postgres バックアップ運用に切替(Supabase 自動バックアップ/PITR + 既存 R2 offsite を pg_dump ベースへ)
- [ ] SQLite 用の旧バックアップ cron を停止
- [ ] `feat/postgres-migration` ブランチ削除(マージ済)

---

### メモ
- `migrate deploy` は**非破壊**(保留中マイグレーションのみ適用)。`--accept-data-loss` の db push は廃止済。
- 移行スクリプトは `createMany + skipDuplicates` で**再実行可**。途中で止まっても再度流せる(`--wipe` で入れ直しも可)。
- テスト/CI は引き続き `db push`(使い捨て Postgres)。本番のみ `migrate deploy`。
