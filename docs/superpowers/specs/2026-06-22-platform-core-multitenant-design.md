# Platform Core: マルチテナント基盤 + Neon(Postgres)移行 — 設計 (2026-06-22)

## ゴール / スコープ
Compass を「単一テナントの日本アプリ」から「**モジュール式マルチテナント SaaS の基盤**」にする最初の地基。これが全モジュール(招生/在籍/人事/会計)の土台。

**本 spec に含む:**
1. テナント階層モデル(Organization → 法人 → 校)＋全テーブルへの `organizationId` 付与。
2. テナント隔離の強制(Prisma 拡張で全クエリを tenant スコープ＋ Postgres RLS で纵深防御)。
3. SQLite → **Neon(Postgres, 東京区)** 移行(短メンテ窓でのカットオーバー)。
4. テナント解決(サブドメイン `{org}.compass.app` ＋学生端カスタムドメイン)＋テナント対応の認証/RBAC。
5. 最小の**モジュール枠組み**(テナント別に有効モジュールを ON/OFF)。
6. ファイルアップロードを **R2(テナント別パス)** へ。

**非ゴール(別 spec):** 計費/サブスク管理、セルフ開通フロー、各業務モジュール本体(招生/在籍/人事/会計)、i18n・SSO・多区域(グローバル化フェーズ)。

## アーキテクチャ

### 1. テナント階層
- **Organization(=テナント=契約/隔離/計費の境界)** 新規モデル。`id, name, slug(サブドメイン), plan, enabledModules(JSON), customDomain?`。
- **Hojin(学校法人)** 新規 or 既存 `ApplySchool.hojin` を昇格。`organizationId` 配下の分組軸(レポート/ビュー)。
- **School(既存 ApplySchool)** に `organizationId` + `hojinId`。
- 経営者は「複数法人を1 Organization に → 統一ビュー」or「別 Organization → 完全隔離」を選べる。
- 既存データ移行: 全件を 1 Organization「知日グループ」(配下: 法人 羽場学園/平井学園＋各校)に集約。

### 2. テナント隔離(多層)
- **主enforcement = Prisma Client 拡張(`$extends`)**: リクエストごとに `organizationId` を持つスコープ済みクライアントを作り、全 model の `findMany/update/delete` に自動で `where: { organizationId }` を注入、`create` に自動で `organizationId` をセット。全 DB アクセスはこのクライアント経由に統一 → 取りこぼし不能。
- **纵深防御 = Postgres RLS**: 主要テーブルに RLS ポリシー(`organization_id = current_setting('app.org')`)。トランザクション内で `SET LOCAL app.org` を張る。万一アプリ層のフィルタ漏れがあっても DB が遮断。
  - 注: Neon の pooled 接続 + RLS session 変数はトランザクション単位で扱う。RLS は「バックストップ」、正は Prisma 拡張。
- **プラットフォーム運営者(あなた)** は cross-tenant の super-operator(専用フラグ)。テナント管理画面のみ RLS バイパス可。

### 3. 認証 / RBAC(テナント対応)
- `AdminUser` に `organizationId`(所属テナント)。ログインはサブドメインの org に紐付く。
- 役割は**テナント内スコープ**(既存 super_admin/admin/sales/academic/interviewer はテナント内の役割に)。
- 新概念 **プラットフォーム運営者(PlatformAdmin)**: テナント横断(テナント作成/停止/プラン変更)。`organizationId = null` + フラグ。
- 既存 lib/permissions の能力マトリクスはテナント内でそのまま機能。`isAdmin` 過載の整理(能力ベース化)も本 spec で前進。

### 4. テナント解決
- 管理端: `{org}.compass.app` のサブドメインから Organization を解決(middleware)。
- 学生出願端: **カスタムドメイン**(`apply.学校.ac.jp`)→ Organization マッピング表で解決。Let's Encrypt ワイルドカード/オンデマンド証明書。
- middleware で org を解決し、リクエストコンテキスト(header/AsyncLocalStorage)に注入 → Prisma 拡張がそれを使う。

### 5. SQLite → Neon 移行(カットオーバー)
データ量は小(数百MB)。ゼロダウンタイム不要、**短メンテ窓**で十分。
1. schema.prisma `provider = "postgresql"`、`DATABASE_URL` を Neon に。`prisma generate`。
2. 移行スクリプト: SQLite から全テーブル読み出し → `organizationId`(知日グループ)を付与 → Neon へ投入(型差異: SQLite の String 日付等を検証)。
3. RLS ポリシー + インデックス(前回の audit で出た複合インデックス)を適用。
4. メンテ窓: 書込停止 → 最終差分移送 → `DATABASE_URL` 切替 → pm2 restart → 検証 → 解放。
5. 失敗時ロールバック: 旧 SQLite を温存、`DATABASE_URL` を戻すだけ。

### 6. ファイル → R2
- 現状 `private/uploads`(VPS ローカル)。R2(テナント別キー `org/{orgId}/app/{appId}/...`)へ。
- アップロードルートが R2 に put、ダウンロードは署名URL or 認証付きプロキシ。既存の R2(senmon-backup アカウント)を再利用。
- 移行: 既存ファイルを R2 にコピーするスクリプト。

### 7. モジュール枠組み(最小)
- `Organization.enabledModules`(例 `["admissions","enrollment"]`)。
- `requireModule(org, "enrollment")` ガード + UI のナビ出し分け。プラン連動。
- 本体は各モジュール spec。ここでは枠だけ。

## テスト
- **テナント隔離テスト(最重要)**: テナントA のユーザーがテナントB のデータに**一切アクセスできない**(list/get/update/delete 全部)ことを e2e で固定。Prisma 拡張のユニットテスト(スコープ注入)。
- 移行スクリプトのドライラン(件数照合)。
- 既存の unit/e2e が Postgres 上でも全 green(CI を Postgres に切替 or 併走)。
- RLS ポリシーの SQL テスト(session 変数なしでは 0 行)。

## ロールアウト順
1. Organization/Hojin モデル + `organizationId` 追加(後方互換: nullable→backfill→必須化)。
2. Prisma 拡張(スコープ) + middleware(org 解決) + 認証のテナント化。
3. Neon 移行(メンテ窓)。
4. RLS + インデックス。
5. ファイル→R2。
6. モジュール枠 + isAdmin 能力ベース整理。

## リスク / 留意
- Prisma + pooled + RLS の session 変数 → 主は拡張、RLS は纵深。RLS だけに依存しない。
- カットオーバーは小規模なので短メンテで可。要・本番DBバックアップ前提(既存 R2 backup)。
- 既存の単一テナント前提コード(全 query)に拡張を通す改修が広範 → 段階導入 + 隔離テストで担保。
- `isAdmin` 過載は本 spec で能力ベースへ(セキュリティ audit の指摘解消)。

## 未決定(実装計画で詰める)
- カスタムドメインの証明書方式(オンデマンド vs 事前)。
- RLS を当てる対象テーブルの範囲(全部 vs 機微のみ)。
- メンテ窓の長さ/タイミング(深夜)。
