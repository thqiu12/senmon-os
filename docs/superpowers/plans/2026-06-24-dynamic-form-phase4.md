# 出願フォーム フル動的化 — Phase 4 実装計画（仕上げ：申請詳細のカスタム項目ラベル化＋最終検証）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps use checkbox (`- [ ]`)。

**Goal:** 管理画面の申請詳細で、カスタム項目を `fieldKey`（例 `custom_1718...`）ではなく **設定したラベル**（例「趣味」）で表示する。あわせてフル動的化の通し検証を行い、本番デプロイ可能な状態にする。

**Architecture:** 申請詳細ページが `/api/admin/form-config`（全項目=共通設定）を取得して `fieldKey → label` のマップを作り、`extraData` の各キーをラベル表示。見つからないキーは fieldKey にフォールバック。

**Tech Stack:** Next.js 14 / React / TS。検証: ローカルPG＋vitest＋next build＋実ブラウザ。リポ `~/senmon-fix`、ブランチ `feat/postgres-migration`。spec: `docs/superpowers/specs/2026-06-24-dynamic-application-form-design.md`。前提: Phase1-3 完了。

> スコープ外（繰越・低優先）: カスタム必須項目の**サーバ側**検証（現状クライアントゲートのみ＝低濫用リスク）、カスタム項目の **CI e2e**（webServer seed 整備が必要、今回はローカル実機検証で代替）。over-engineering 回避のため本Phaseでは実施しない。
> env: unit=`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run`。build は `DATABASE_URL`/`DIRECT_URL`=...compass_test、`SESSION_SECRET`/`CSRF_SECRET` テスト値、`NODE_OPTIONS=--max-old-space-size=2048`。

---

## File Structure
- `app/admin/applications/[id]/page.tsx` — extraData をラベル表示（form-config から label 解決）（修正）

---

## Task 1: 申請詳細のカスタム項目をラベル表示

**Files:** Modify `app/admin/applications/[id]/page.tsx`

現状: 「カスタム項目」セクションが `application.extraData` を `fieldKey: value` で表示（ラベルが fieldKey）。これを設定ラベルに変える。

- [ ] **Step 1: form-config を取得して label マップを作る**

申請詳細ページ（クライアントコンポーネント）で、マウント時に `GET /api/admin/form-config`（schoolId/applicantType 無し＝全校共通の全項目）を fetch し、`fieldKey → label` の `Record<string,string>` を state に保持する。
```tsx
const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
useEffect(() => {
  fetch("/api/admin/form-config")
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      if (Array.isArray(rows)) {
        const m: Record<string, string> = {};
        for (const c of rows) if (c?.fieldKey) m[c.fieldKey] = c.label || c.fieldKey;
        setFieldLabels(m);
      }
    })
    .catch(() => {});
}, []);
```
（`/api/admin/form-config` GET は applicantType 無しで共通スコープの全項目を返す＝カスタム項目含む。カスタム項目は学校×タイプ別にも作れるが、ラベルは共通取得で大半カバー。見つからなければ fieldKey にフォールバックするので破綻しない。）

- [ ] **Step 2: カスタム項目セクションの見出しを fieldLabels で解決**

既存の「カスタム項目」セクションの各行のラベルを `fieldLabels[key] ?? key` にする（値の整形 fmt はそのまま）。

- [ ] **Step 3: tsc＋build**

Run: `npx tsc --noEmit` → 0。
Run: build（上記env）→ Compiled successfully / 78/78。

- [ ] **Step 4: コミット**
```bash
git add "app/admin/applications/[id]/page.tsx"
git commit -m "feat(admin): 申請詳細のカスタム項目をラベル表示（form-config 連動）"
```

---

## Task 2: 最終検証（全テスト＋build＋実ブラウザ通し）＋ push

- [ ] **Step 1: 全ユニット** — `DATABASE_URL_BASE=...compass_test npx vitest run` 全 pass。

- [ ] **Step 2: 既存 E2E** — `DATABASE_URL/DIRECT_URL=...compass_e2e npx playwright test tests/e2e/student-apply.spec.ts --reporter=list` 全 pass（Phase1/2 の回帰）。

- [ ] **Step 3: build** → 78/78。

- [ ] **Step 4: 実ブラウザ通し（任意・推奨）** — compass_e2e にカスタム項目を psql で仕込み、dev サーバで /apply → 出願者タイプ→ Step1 にカスタム項目表示→入力→（可能なら提出）→ 申請詳細でラベル表示を確認。検証後 psql でカスタム行を削除。

- [ ] **Step 5: push**
```bash
git fetch origin && git rebase origin/feat/postgres-migration
git push origin feat/postgres-migration
```

---

## 受け入れ基準（Phase 4）
- 申請詳細のカスタム項目が設定ラベルで表示される（未知キーは fieldKey フォールバック）。
- 全ユニット・E2E・build グリーン。フル動的化が本番デプロイ可能。

## Self-Review メモ
- 小規模仕上げ。サーバ側カスタム必須検証と CI e2e seed は意図的に繰越（低優先・over-engineering 回避）。
- プレースホルダ無し。
