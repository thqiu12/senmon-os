# 出願フォーム フル動的化 — Phase 3 実装計画（カスタム項目＋確認画面動的＋管理表示）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps use checkbox (`- [ ]`)。

**Goal:** 管理画面で追加した任意の「カスタム入力項目」を出願フォームに描画し、回答を `Application.extraData`(JSON) に保存、確認画面・申請詳細に表示できるようにする。確認画面(Step5)も config 駆動に。これで「何でも管理画面だけで増やせる」が完成。

**Architecture:** `Application.extraData Json?` と `FormFieldConfig.options String?`（select の選択肢）を追加（PG・追加のみ）。出願 state に `extraData` を持たせ、レジストリ非登録の config 項目を `DynamicField` が `fieldType` で汎用描画（値は extraData）。submit で extraData を保存。確認画面・申請詳細・管理 form 追加UI を config 反復に。

**Tech Stack:** Next.js 14 / React / TS / Prisma / PostgreSQL。検証: ローカルPG＋vitest＋next build＋Playwright e2e。リポ `~/senmon-fix`、ブランチ `feat/postgres-migration`。spec: `docs/superpowers/specs/2026-06-24-dynamic-application-form-design.md`。前提: Phase1/2 完了（個人情報＋志望・学歴が Step1 動的描画、レジストリ＋buildFormSections＋DynamicField＋applyFieldVisibility）。

> env: unit=`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run`。build/e2e は `DATABASE_URL`/`DIRECT_URL`=`postgresql://setsuiken@localhost:5432/compass_e2e`（build は compass_test）、`SESSION_SECRET`/`CSRF_SECRET` テスト値、`NODE_OPTIONS=--max-old-space-size=2048`。prisma 変更後は `DATABASE_URL=... DIRECT_URL=... npx prisma db push --skip-generate --accept-data-loss` でローカル反映。

---

## File Structure
- `prisma/schema.prisma` — `Application.extraData Json?`、`FormFieldConfig.options String?`（修正）
- `lib/applyCustomFields.ts` — カスタム項目判定・options パース・汎用widget解決の純関数（新規）
- `tests/unit/apply-custom-fields.test.ts` — 上記の純関数ユニット（新規）
- `app/apply/_components/DynamicField.tsx` — カスタム項目（非レジストリ）の汎用描画を追加（修正）
- `app/apply/page.tsx` — form state に extraData＋onChangeExtra、Step1 にカスタム項目を含める、確認画面(Step5)を config 反復、submit に extraData（修正）
- `lib/schemas.ts` — ApplicationCreateSchema に extraData（修正）
- `app/api/applications/route.ts` — POST で extraData 保存（修正）
- `app/admin/applications/[id]/page.tsx` — extraData をラベル付き表示（修正）
- `app/admin/form-config/page.tsx` — 追加モーダルに options 入力＋POST に options/applicantType（修正）
- `app/api/admin/form-config/route.ts` — POST に options/applicantType 対応（修正）

---

## Task 1: スキーマに extraData / options を追加

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: カラム追加**

`model Application` に: `extraData Json?`（既存カラム付近、agentId 近辺）。
`model FormFieldConfig` に: `options String?`（applicantType の近く）。

- [ ] **Step 2: db push（ローカルPG）**

Run: `DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_test" DIRECT_URL="postgresql://setsuiken@localhost:5432/compass_test" npx prisma db push --skip-generate --accept-data-loss && DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_e2e" DIRECT_URL="postgresql://setsuiken@localhost:5432/compass_e2e" npx prisma db push --skip-generate --accept-data-loss && npx prisma generate`
Expected: 両DB in sync、generate 成功。

- [ ] **Step 3: tsc** → `npx tsc --noEmit` 0（Prisma 型に extraData/options が出る）

- [ ] **Step 4: コミット**
```bash
git add prisma/schema.prisma
git commit -m "feat(schema): Application.extraData / FormFieldConfig.options 追加（Phase3）"
```

---

## Task 2: カスタム項目ヘルパー（純関数）

**Files:** Create `lib/applyCustomFields.ts`、Test `tests/unit/apply-custom-fields.test.ts`

- [ ] **Step 1: 失敗テスト**

```ts
// tests/unit/apply-custom-fields.test.ts
import { describe, it, expect } from "vitest";
import { isCustomField, parseOptions, genericWidget } from "@/lib/applyCustomFields";

describe("applyCustomFields", () => {
  it("レジストリ登録キーは custom でない / file も custom でない", () => {
    expect(isCustomField("nationality", "select")).toBe(false);   // registry
    expect(isCustomField("doc_x", "file")).toBe(false);           // file
    expect(isCustomField("custom_hobby", "text")).toBe(true);
  });
  it("options は改行/カンマ区切りを value/label にパース", () => {
    expect(parseOptions("赤\n青\n緑")).toEqual([
      { value: "赤", label: "赤" }, { value: "青", label: "青" }, { value: "緑", label: "緑" },
    ]);
    expect(parseOptions("")).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
  });
  it("fieldType→汎用widget", () => {
    expect(genericWidget("textarea")).toBe("textarea");
    expect(genericWidget("select")).toBe("select");
    expect(genericWidget("date")).toBe("month");
    expect(genericWidget("checkbox")).toBe("checkbox");
    expect(genericWidget("number")).toBe("text"); // 未知は text
    expect(genericWidget(undefined)).toBe("text");
  });
});
```

- [ ] **Step 2: 失敗確認** → vitest FAIL（module 無し）

- [ ] **Step 3: 実装**

```ts
// lib/applyCustomFields.ts
import { registryEntry } from "@/lib/applyFieldRegistry";

// カスタム＝レジストリ未登録 かつ file 以外（file は書類として別描画、構造項目は config に無い）
export function isCustomField(fieldKey: string, fieldType?: string | null): boolean {
  if (fieldType === "file") return false;
  return !registryEntry(fieldKey);
}

export function parseOptions(options?: string | null): { value: string; label: string }[] {
  if (!options) return [];
  return options
    .split(/[\n,、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => ({ value: s, label: s }));
}

export type GenericWidget = "text" | "textarea" | "select" | "month" | "checkbox";
export function genericWidget(fieldType?: string | null): GenericWidget {
  switch (fieldType) {
    case "textarea": return "textarea";
    case "select": return "select";
    case "date": case "month": return "month";
    case "checkbox": return "checkbox";
    default: return "text";
  }
}
```

- [ ] **Step 4: テスト通過** → vitest PASS、`npx tsc --noEmit` 0

- [ ] **Step 5: コミット**
```bash
git add lib/applyCustomFields.ts tests/unit/apply-custom-fields.test.ts
git commit -m "feat(apply): カスタム項目ヘルパー（判定/options/汎用widget）"
```

---

## Task 3: 出願 state に extraData、Step1 にカスタム項目、DynamicField 汎用描画

**Files:** Modify `app/apply/page.tsx`、`app/apply/_components/DynamicField.tsx`

- [ ] **Step 1: FormData/initialForm に extraData**

`primitives.tsx` の `FormData` に `extraData: Record<string, string | boolean>` を追加。`page.tsx` の `initialForm`（または FORM_DEFAULTS）に `extraData: {}` を追加。

- [ ] **Step 2: onChangeExtra ハンドラ**

`ApplyPageInner` に追加:
```tsx
const handleChangeExtra = (key: string, value: string | boolean) => {
  setForm(prev => ({ ...prev, extraData: { ...prev.extraData, [key]: value } }));
  setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
};
```
Step1 へ `onChangeExtra={handleChangeExtra}` を渡す（props 追加）。

- [ ] **Step 3: DynamicField にカスタム対応**

`DynamicField` の props に `formConfig`（既存）に加え `onChangeExtra?: (key: string, v: string|boolean) => void` を追加。`const e = registryEntry(fieldKey); if (!e) { ...custom render... }` に変更（return null をやめる）。カスタム描画:
```tsx
  // --- custom（非レジストリ）---
  if (!e) {
    const cfg = (formConfig ?? []).find(c => c.fieldKey === fieldKey);
    if (!cfg) return null;
    const w = genericWidget(cfg.fieldType);
    const cval = form.extraData?.[fieldKey];
    const set = (v: string | boolean) => onChangeExtra?.(fieldKey, v);
    const clabel = fieldLabel(formConfig, fieldKey, cfg.label || fieldKey);
    const chint = fieldHint(formConfig, fieldKey, "");
    const creq = fieldRequired(formConfig, fieldKey, false);
    if (w === "select") {
      const opts = parseOptions((cfg as any).options);
      return (<Field label={clabel} required={creq} hint={chint} error={errors[fieldKey]}>
        <Select data-testid={`apply-${fieldKey}`} value={String(cval ?? "")} error={!!errors[fieldKey]} onChange={(ev)=>set(ev.target.value)}>
          <option value="">{t("選択してください")}</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select></Field>);
    }
    if (w === "textarea") {
      return (<Field label={clabel} required={creq} hint={chint} error={errors[fieldKey]}>
        <textarea data-testid={`apply-${fieldKey}`} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y hover:border-gray-300"
          value={String(cval ?? "")} onChange={(ev)=>set(ev.target.value)} /></Field>);
    }
    if (w === "month") {
      return (<Field label={clabel} required={creq} hint={chint} error={errors[fieldKey]}>
        <DateSelect testId={`apply-${fieldKey}`} value={String(cval ?? "")} onChange={(v:string)=>set(v)} minYear={new Date().getFullYear()-80} maxYear={new Date().getFullYear()+10} /></Field>);
    }
    if (w === "checkbox") {
      return (<Field label={clabel} hint={chint}>
        <label className="flex items-center gap-3 h-[42px] cursor-pointer">
          <input type="checkbox" data-testid={`apply-${fieldKey}`} className="w-4 h-4 rounded border-gray-300 accent-blue-600" checked={!!cval} onChange={(ev)=>set(ev.target.checked)} />
          <span className="text-sm text-gray-700">{clabel}</span></label></Field>);
    }
    // text
    return (<Field label={clabel} required={creq} hint={chint} error={errors[fieldKey]}>
      <Input data-testid={`apply-${fieldKey}`} value={String(cval ?? "")} error={!!errors[fieldKey]} onChange={(ev)=>set(ev.target.value)} /></Field>);
  }
```
import 追加: `import { genericWidget, parseOptions } from "@/lib/applyCustomFields";`。`FormFieldConfig` 型に `options?: string | null` が無ければ primitives.tsx の型へ追加（Prisma とは別の UI 型）。

- [ ] **Step 4: Step1 のフィルタにカスタム項目を含める**

Step1 の `PERSONAL_KEYS` フィルタは「レジストリ会員のみ」。これを「レジストリ会員 ∪ カスタム（file以外の非レジストリ config 項目）」に拡張。実装: `source` を `formConfig`（ロード時）にし、`personalEntries = source.filter(c => PERSONAL_KEYS.has(c.fieldKey) || isCustomField(c.fieldKey, c.fieldType))`。これで管理画面で足したカスタム項目が、その section に動的描画される。`buildFormSections` はそのまま。`DynamicField` 呼び出しに `onChangeExtra={onChangeExtra}` を渡す。
import: `import { isCustomField } from "@/lib/applyCustomFields";`。
（フォールバック時は FORM_FIELD_DEFAULTS にカスタムは無いので従来通り。カスタムはDB行が前提＝formConfig 経由でのみ出る。）

- [ ] **Step 5: tsc＋build** → 0 / 78/78

- [ ] **Step 6: コミット**
```bash
git add app/apply/page.tsx app/apply/_components/DynamicField.tsx app/apply/_components/primitives.tsx
git commit -m "feat(apply): カスタム項目を出願フォームに動的描画（extraData state）"
```

---

## Task 4: submit に extraData、schema/API 保存

**Files:** Modify `lib/schemas.ts`、`app/api/applications/route.ts`、`app/apply/page.tsx`

- [ ] **Step 1: schema に extraData**

`lib/schemas.ts` の `ApplicationCreateSchema` に追加:
```ts
  extraData: z.record(z.union([z.string().max(5000), z.boolean()])).optional().default({}),
```

- [ ] **Step 2: POST で保存**

`app/api/applications/route.ts` の `prisma.application.create({ data: { ... } })` に `extraData: body.extraData ?? {},` を追加。

- [ ] **Step 3: submit ボディ**

出願 POST は `{ ...form, status }` を送る。`form.extraData` が含まれるため自動送信される。確認（form.extraData が body に乗ること）。

- [ ] **Step 4: カスタム必須バリデーション**

`validateStep1` の末尾に、カスタム必須項目チェックを追加（formConfig を参照できる位置で）:
```ts
    for (const c of (formConfig ?? [])) {
      if (isCustomField(c.fieldKey, c.fieldType) && c.isEnabled && c.isRequired) {
        const v = form.extraData?.[c.fieldKey];
        if (v === undefined || v === "" || v === false) e[c.fieldKey] = `${c.label}を入力してください`;
      }
    }
```
（`isCustomField` を page.tsx に import。`isCurrentStepValid` の step1 分岐にも同等の充足チェックを足す。）

- [ ] **Step 5: tsc＋build** → 0 / 78/78

- [ ] **Step 6: コミット**
```bash
git add lib/schemas.ts app/api/applications/route.ts app/apply/page.tsx
git commit -m "feat(api): カスタム項目の回答を extraData に保存＋必須検証"
```

---

## Task 5: 確認画面(Step5)を config 反復に＋カスタム表示

**Files:** Modify `app/apply/page.tsx`

- [ ] **Step 1: Step5 にカスタム項目の確認行を追加**

確認画面（Step5 / Confirm）に、`formConfig` のカスタム項目（`isCustomField` かつ enabled）を反復し、`label: form.extraData[fieldKey]` を表示する行を追加（既存の Row/確認UI コンポーネントに合わせる）。コア項目の確認表示は現状維持。

- [ ] **Step 2: tsc＋build** → 0 / 78/78

- [ ] **Step 3: コミット**
```bash
git add app/apply/page.tsx
git commit -m "feat(apply): 確認画面にカスタム項目を表示"
```

---

## Task 6: 管理画面 — 申請詳細表示＋カスタム追加UI（options/applicantType）

**Files:** Modify `app/admin/applications/[id]/page.tsx`、`app/admin/form-config/page.tsx`、`app/api/admin/form-config/route.ts`

- [ ] **Step 1: 申請詳細に extraData 表示**

`app/admin/applications/[id]/page.tsx` で `application.extraData`（取得済みか確認。`/api/applications/[id]` が全カラム返すなら含まれる）を、各 fieldKey のラベル付きで表示するセクションを追加（値が空でない項目のみ）。ラベルは `/api/admin/form-config` か `application` に含まれる config から。簡易には fieldKey をそのまま見出し、もしくは extraData をキー:値で一覧。

- [ ] **Step 2: form-config 追加モーダルに options 入力**

`app/admin/form-config/page.tsx` のカスタム項目追加モーダル（`addForm`）に、fieldType=select のとき「選択肢（改行区切り）」テキストエリアを表示し、POST ボディに `options` を含める。POST に `applicantType: selectedApplicantType` も含める（現在のタブのタイプで作成）。

- [ ] **Step 3: API POST に options/applicantType**

`app/api/admin/form-config/route.ts` の POST(create) で `options` と `applicantType` を受け取り保存（`isApplicantType` で検証、不正は null）。DELETE の findFirst にも `applicantType` を含める（誤スコープ削除防止）。

- [ ] **Step 4: tsc＋build** → 0 / 78/78

- [ ] **Step 5: コミット**
```bash
git add "app/admin/applications/[id]/page.tsx" app/admin/form-config/page.tsx app/api/admin/form-config/route.ts
git commit -m "feat(admin): 申請詳細にカスタム項目表示＋form管理の選択肢/タイプ対応追加"
```

---

## Task 7: 検証（E2E＋全テスト＋実ブラウザ＋push）

**Files:** Modify `tests/e2e/student-apply.spec.ts`

- [ ] **Step 1: カスタム項目の E2E（DBにカスタム行を仕込み→描画→入力→提出）**

compass_e2e に `INSERT` でカスタム text 行（例 `custom_hobby`, section 個人情報, isEnabled true, isRequired false, schoolId null, applicantType null）を仕込み、`/apply?school=chuo-seminar` → foreign → `apply-custom_hobby` が表示され入力でき、提出後に確認画面に値が出ることを検証。テスト後に行を削除（or テスト内で seed/clean）。

```ts
test("カスタム項目: 管理画面で追加した項目が出願フォームに出て入力できる", async ({ page }) => {
  await page.goto("/apply?school=chuo-seminar");
  await page.getByTestId("applicant-type-foreign").click();
  await page.getByTestId("apply-lastName").waitFor({ state: "visible", timeout: 10_000 });
  await expect(page.getByTestId("apply-custom_hobby")).toBeVisible();
  await page.getByTestId("apply-custom_hobby").fill("読書");
});
```
（事前に psql でカスタム行を挿入する手順を test の前提として記述。CI では別途 seed が要るが、ローカル検証が主目的。）

- [ ] **Step 2: 全 E2E＋全ユニット**

Run: e2e（compass_e2e、カスタム行挿入後）、`npx vitest run`（compass_test）。全 pass。

- [ ] **Step 3: build** → 78/78

- [ ] **Step 4: 実ブラウザ目視（任意）** — 管理 form管理でカスタム select 項目を追加→出願フォームに出る→提出→確認画面＋申請詳細に値、を確認。

- [ ] **Step 5: コミット & push**
```bash
git add tests/e2e/student-apply.spec.ts
git commit -m "test(e2e): カスタム項目の出願フロー"
git fetch origin && git rebase origin/feat/postgres-migration
git push origin feat/postgres-migration
```

---

## 受け入れ基準（Phase 3）
- 管理画面 form管理でカスタム項目（text/textarea/select/date/checkbox）を追加 → 出願フォーム（該当 section）に表示 → 出願 → 回答が `Application.extraData` に保存 → 確認画面・申請詳細に表示。
- select のカスタム項目は管理画面で入力した選択肢が出る。
- 既存項目・既存出願は不変（extraData/options は null 既定で非破壊）。
- 全テスト・build グリーン。

## Self-Review メモ
- spec §3.1（extraData/options）/§3.3（汎用描画）/§3.4（確認画面動的）/§3.6（保存）/§3.7（管理表示・追加UI）を実装。
- 型整合: `isCustomField`/`parseOptions`/`genericWidget`/`extraData`/`onChangeExtra` を全タスクで統一。UI 型 `FormFieldConfig` に `options?` を追加（Prisma 型とは別、API レスポンス整合）。
- 非破壊: extraData/options nullable、submit は form.extraData={} 既定。
- プレースホルダ無し。
- 既知の注意: カスタム項目は formConfig 経由でのみ描画（FORM_FIELD_DEFAULTS には無い）。フォールバック（未ロード）時はカスタム非表示で問題なし。
