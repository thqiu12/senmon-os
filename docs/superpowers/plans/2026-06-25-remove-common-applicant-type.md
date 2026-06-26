# 「共通」出願者タイプ撤去 実装計画（A案・完全タイプ別）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps use checkbox (`- [ ]`)。spec=`docs/superpowers/specs/2026-06-25-remove-common-applicant-type-design.md`。

**Goal:** フォーム項目設定の「共通（applicantType=null）」スコープを撤去し、日本人/留学生で独立設定にする。タイプ別既定（defaultEnabledFor）は維持。既存共通設定は各タイプにコピー後に削除。

**Architecture:** mergeFormConfig から applicantType=null 段を撤去（「既定(type) < 学校×type」）。apply/admin ルートで null を読み書きしない・admin は type 必須。admin UI から共通タブ撤去・既定 foreign。冪等移行スクリプトで共通→各タイプコピー後に共通削除。

**Tech Stack:** Next.js14/React/TS/Prisma(Postgres)。branch `chore/security-hardening`。unit=`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run`。build env=DATABASE_URL/DIRECT_URL=...compass_test, SESSION_SECRET/CSRF_SECRET テスト値(32+), NODE_OPTIONS=--max-old-space-size=2048。e2e/live=compass_e2e。

---

## File Structure
- `lib/applyFormConfigMerge.ts` — MODIFY。applicantType=null 段撤去。
- `app/api/apply/form-config/route.ts` — MODIFY。typed where から null を外す、レガシーは既定。
- `app/api/admin/form-config/route.ts` — MODIFY。共通(null)GET 分岐撤去・type 必須。
- `app/admin/form-config/page.tsx` — MODIFY。共通タブ撤去・既定 foreign。
- `lib/migrateRemoveCommonType.ts`(新) + `tests/unit/migrate-remove-common-type.test.ts`(新)。
- `scripts/migrate-remove-common-type.ts`(新)。
- `scripts/deploy/auto-deploy.sh` — MODIFY。移行フック追加。
- `tests/unit/apply-form-config-merge.test.ts` — MODIFY（共通段前提を撤去）。

---

## Task 1: merge とルートから applicantType=null 段を撤去（+テスト書換）

**Files:** Modify `lib/applyFormConfigMerge.ts`, `app/api/apply/form-config/route.ts`, `app/api/admin/form-config/route.ts`, `tests/unit/apply-form-config-merge.test.ts`

> 現状（全校共通撤去後）の `tierOf`：schoolId=null は無視済み。学校行の applicantType=null→tier1（学校共通）、type→tier2。isEnabled 判定で commonEnabled(null行) と typeEnabled(type行) を使う。

- [ ] **Step 1: `mergeFormConfig` の tierOf で applicantType=null を無視**
```ts
const tierOf = (r: ConfigRow): number | null => {
  if (r.schoolId === null) return null;       // 全校共通は廃止（既）
  if (r.applicantType === null) return null;  // 共通タイプも廃止
  if (r.applicantType !== type) return null;  // 別タイプは無視
  return 1; // 学校×該当type のみ
};
```
isEnabled 最終判定を簡素化（commonEnabled 不要）:
```ts
map.forEach((cfg, key) => {
  if (typeEnabled.has(key)) cfg.isEnabled = typeEnabled.get(key)!;
  else cfg.isEnabled = defaultEnabledFor(key, type); // 型行なし→型別既定（在日情報オフ等を維持）
});
```
`commonEnabled` の記録・参照を削除。`for (const { r } of candidates)` では typeEnabled のみ記録（`typeEnabled.set(r.fieldKey, r.isEnabled)`）。コメントの「学校共通(null)」記述を更新。

- [ ] **Step 2: apply form-config route — null を読まない**
typed 経路の where を `applicantType: type`（`{OR:[{applicantType:null},{applicantType:type}]}` から null を外す）。`{ AND: [ schoolId?{schoolId}:{schoolId:"__none__"}, { applicantType: type } ] }`。レガシー（type無し）経路はそのまま `fallback()`（既定）を返す（既に school+default のみ、null 依存なし＝確認のみ）。

- [ ] **Step 3: admin form-config route — 共通(null)GET 分岐を撤去・type 必須化**
GET：`applicantType` が無い場合の「共通スコープ」分岐（synthDefault を返す legacy ブロック）を、**type 未指定なら既定の合成を返すだけ**にする（編集用の null スコープは無くす）。typed 経路（applicantType 指定）はそのまま（school×type findMany + 既定合成）。null スコープの findMany/返却を削除。PUT/POST は applicantType を japanese/foreign のみ受ける（`isApplicantType` で false→これまで null だったが、UI から null を送らない運用にするため挙動は変えなくてよい。null 行は移行で消える）。

- [ ] **Step 4: 既存ユニットテスト書換**
`tests/unit/apply-form-config-merge.test.ts` の「学校共通(applicantType null)」前提ケースを撤去/読み替え。`row()` の既定 applicantType を維持しつつ、null 行が「無視される」ことを検証するケースに変更。残す検証：「型行が無ければ defaultEnabledFor に従う（日本人は在日情報オフ／留学生はオン）」「型行で明示有効/無効が効く」「options/showWhenExamMode 伝播」「displayOrder 昇順」。null 行を使った『共通が型を上書きしない』系は撤去。全ケース pass。

- [ ] **Step 5: unit + tsc** → pass / 0。
- [ ] **Step 6: commit**
```bash
git add lib/applyFormConfigMerge.ts app/api/apply/form-config/route.ts app/api/admin/form-config/route.ts tests/unit/apply-form-config-merge.test.ts
git commit -m "feat(form-config): 共通(applicantType=null)段を撤去し完全タイプ別に（merge/apply/admin）"
```

---

## Task 2: 管理UIから共通タブ撤去・既定 foreign

**Files:** Modify `app/admin/form-config/page.tsx`

- [ ] **Step 1: 出願者タイプ選択から「共通」撤去**
`selectedApplicantType` の状態と type 切替 UI（共通/日本人学生/留学生）から「共通」を削除。`日本人学生 / 留学生` の2択に。`selectedApplicantType` の初期値・学校切替時の既定を `"foreign"`（留学生）にする（null にしない）。`APPLICANT_TYPE_LABEL` 等は流用。

- [ ] **Step 2: null 前提コードの除去**
`selectedApplicantType` が null を取り得る前提の分岐（あれば）を整理。fetchConfigs / 保存 payload は常に foreign/japanese を送る。examMode カード・カスタム項目・重複警告は type スコープで動く＝そのまま。

- [ ] **Step 3: tsc + build** → 0 / 78/78。
- [ ] **Step 4: commit**
```bash
git add app/admin/form-config/page.tsx
git commit -m "feat(admin): フォーム設定の共通タイプを撤去・日本人/留学生のみ（既定 留学生）"
```

---

## Task 3: 移行スクリプト（共通→各タイプコピー→共通削除・冪等）

**Files:** Create `lib/migrateRemoveCommonType.ts`, `tests/unit/migrate-remove-common-type.test.ts`, `scripts/migrate-remove-common-type.ts`

- [ ] **Step 1: 純関数 + テスト**
`lib/migrateRemoveCommonType.ts`：
```ts
type Row = { fieldKey: string };
/** 共通(null)行のうち、対象タイプにまだ無い fieldKey だけコピー対象に。 */
export function nullRowsToCopyForType<T extends Row>(nullRows: T[], typeRows: Row[]): T[] {
  const have = new Set(typeRows.map(r => r.fieldKey));
  return nullRows.filter(n => !have.has(n.fieldKey));
}
```
`tests/unit/migrate-remove-common-type.test.ts`：既存型行にある fieldKey はスキップ、無いものだけコピー対象、を検証。`DATABASE_URL_BASE=... npx vitest run tests/unit/migrate-remove-common-type.test.ts` pass。

- [ ] **Step 2: スクリプト本体（冪等）**
`scripts/migrate-remove-common-type.ts`：
1. 全 ApplySchool の schoolKey 取得。
2. 各校：`applicantType=null` 行を取得。`japanese` と `foreign` それぞれについて、その校の該当タイプ行を取得→`nullRowsToCopyForType`→`createMany`（新 id・schoolId 維持・applicantType=対象・updatedAt=now・他列コピー：label/section/fieldType/isEnabled/isRequired/displayOrder/description/options/showWhenExamMode）skipDuplicates。
3. コピー後、各校の `applicantType=null` 行を `deleteMany`。
4. 件数ログ。再実行＝null 行無し→no-op。
`prisma/migrate-sqlite-to-pg.ts` / `scripts/migrate-document-filePath.ts` の import/run 形（PrismaClient・async main・$disconnect・process.exit）に倣う。

- [ ] **Step 3: unit + tsc** → pass / 0。
- [ ] **Step 4: commit**
```bash
git add lib/migrateRemoveCommonType.ts tests/unit/migrate-remove-common-type.test.ts scripts/migrate-remove-common-type.ts
git commit -m "feat(migration): 共通タイプ→各タイプコピー後に共通を削除する冪等スクリプト"
```

---

## Task 4: 検証（unit 全＋build＋e2e＋live移行）＋auto-deploy フック＋push

**Files:** Modify `scripts/deploy/auto-deploy.sh`

- [ ] **Step 1: auto-deploy にフック追加**（既存 migrate-remove-common の直後）:
```bash
# 共通(applicantType=null) を各タイプへコピーしてから削除（冪等・ビルド前・撤去後は no-op）
if [ -f scripts/migrate-remove-common-type.ts ]; then
  log "共通タイプ→各タイプ 移行スクリプト実行（冪等）"
  npx tsx scripts/migrate-remove-common-type.ts >> "$LOG" 2>&1 || log "WARN: 共通タイプ移行でエラー（手動確認推奨）"
fi
```

- [ ] **Step 2: 全 unit** → pass。
- [ ] **Step 3: build** → 78/78。
- [ ] **Step 4: e2e** → `student-apply.spec.ts`（UI）＋`tests/e2e/api/`（API）全 pass。
- [ ] **Step 5: live 移行検証（compass_e2e）**
  1. 共通(null)に識別可能な設定を仕込む（例：applicationReason を null で「★共通TEST★」ラベル＋カスタム null 行）。各タイプ行は未作成。
  2. `npx tsx scripts/migrate-remove-common-type.ts`（compass_e2e env）実行。
  3. 確認：①japanese と foreign の両方に共通由来の行ができている ②applicantType=null 行が0件 ③`/api/apply/form-config?type=foreign&schoolId=chuo-seminar` と `type=japanese` が移行前と同じ項目集合（在日情報は日本人で既定オフのまま）④再実行 no-op。検証後クリーンアップ。
- [ ] **Step 6: commit + push**
```bash
git add scripts/deploy/auto-deploy.sh
git commit -m "chore(deploy): auto-deploy に共通タイプ→各タイプ移行を冪等フック"
git fetch origin && git rebase origin/chore/security-hardening
git push origin chore/security-hardening
```
> 本番：auto-deploy が配信＋（自己更新1デプロイ遅れのため）**本番で手動1回 `cd /srv/senmon/app && npx tsx scripts/migrate-remove-common-type.ts`** が必要。新コードは共通行を無視するので、移行前は各タイプがコード既定に一時フォールバックする隙間が出る（全校共通撤去と同じ）。

## 受け入れ基準
- 管理画面に「共通」タイプが無く、日本人/留学生で独立設定。タイプ別既定（在日情報オフ等）維持。
- 既存共通設定が各タイプにコピーされ、移行直後の出願フォームは従来どおり。null 行が消える。
- 全 unit/build/e2e グリーン。移行は冪等。

## Self-Review（spec 対応）
- spec マージ撤去→Task1。ルート→Task1。管理UI→Task2。移行（コピー→削除）→Task3。auto-deploy/検証→Task4。タイプ別既定維持＝Task1 の isEnabled 判定で `defaultEnabledFor` 使用。型一貫：nullRowsToCopyForType。プレースホルダ無し。
