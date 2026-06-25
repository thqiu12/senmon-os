# 出願フォーム フル動的化 — Phase 1 実装計画（基盤＋個人情報の動的描画・現状パリティ）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 出願フォーム Step1 の個人情報系（氏名/基本情報/連絡先/住所/在日情報）を、写死 JSX から「項目レジストリ＋config 駆動の動的描画」に置換する。挙動・見た目・検証・保存は現状と完全一致（パリティ）。

**Architecture:** 既知の標準項目の描画仕様（ウィジェット種別・選択肢・対応カラム）をコードの単一ソース `lib/applyFieldRegistry.ts` に集約。config（有効/必須/ラベル/ヒント/section/displayOrder）と組み合わせ、純関数 `buildFormSections` がセクション×並び順の描画モデルを生成。`<DynamicField>` がレジストリに従って既存と同じウィジェットを描画。Step1 の個人情報ブロックのみ置換し、フォーム state(FormData) と保存経路は変更しない（＝レンダリングのみのリファクタ）。

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind。検証は vitest（純関数）＋ `next build` ＋ Playwright E2E（PGローカル）。リポ `~/senmon-fix`、ブランチ `feat/postgres-migration`。仕様: `docs/superpowers/specs/2026-06-24-dynamic-application-form-design.md`。

> 注（Phase 範囲）: スキーマ変更（extraData/options）とカスタム項目保存は Phase 3。本 Phase は **個人情報系の描画をレジストリ駆動に置換し現状パリティ** に限定（最小リスク）。最終学歴・志望動機の統合は Phase 2。
> テスト環境: ローカル PG 起動済み前提（`brew services start postgresql@16`、`compass_test`/`compass_e2e` 作成済み）。ユニット: `DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run <file>`。E2E は `DATABASE_URL/DIRECT_URL` を `postgresql://setsuiken@localhost:5432/compass_e2e` に上書きして実行。

---

## File Structure

- `lib/applyFieldRegistry.ts` — 既知標準項目のレジストリ（新規）
- `lib/applyFormSections.ts` — `buildFormSections` 純関数（config×レジストリ→描画モデル）（新規）
- `tests/unit/apply-field-registry.test.ts` — レジストリ＋buildFormSections のユニット（新規）
- `app/apply/_components/DynamicField.tsx` — 1項目を描画する React コンポーネント（新規。app/apply 配下の private フォルダ）
- `app/apply/page.tsx` — Step1 の個人情報ブロックを動的描画に置換（修正）

---

## Task 1: 項目レジストリの型と個人情報項目の定義

**Files:**
- Create: `lib/applyFieldRegistry.ts`
- Test: `tests/unit/apply-field-registry.test.ts`

レジストリは「既知 fieldKey → 描画仕様」。Phase1 は個人情報系のみ（氏名/基本情報/連絡先/住所/在日情報）。`options` の固定リストは既存定数（`NATIONALITIES`/`PREFECTURES`）を後続タスクで参照するが、本タスクでは型と非選択肢項目を定義し、選択肢は `optionsKey` で間接参照する設計にする。

- [ ] **Step 1: 失敗するユニットテストを書く**

```ts
// tests/unit/apply-field-registry.test.ts
import { describe, it, expect } from "vitest";
import { FIELD_REGISTRY, registryEntry } from "@/lib/applyFieldRegistry";

describe("applyFieldRegistry", () => {
  it("既知項目はレジストリに存在し widget/column を持つ", () => {
    const e = registryEntry("nationality");
    expect(e).toBeTruthy();
    expect(e!.widget).toBe("select");
    expect(e!.column).toBe("nationality");
    expect(e!.optionsKey).toBe("nationality");
  });
  it("japaneseLevel は select / 専用 optionsKey", () => {
    expect(registryEntry("japaneseLevel")!.widget).toBe("select");
    expect(registryEntry("japaneseLevel")!.optionsKey).toBe("japaneseLevel");
  });
  it("birthDate は date-range, postalCode は postal, jlptCertified は checkbox", () => {
    expect(registryEntry("birthDate")!.widget).toBe("date-range");
    expect(registryEntry("postalCode")!.widget).toBe("postal");
    expect(registryEntry("jlptCertified")!.widget).toBe("checkbox");
  });
  it("未知キーは undefined", () => {
    expect(registryEntry("custom_xxx")).toBeUndefined();
  });
  it("個人情報の全標準キーが登録されている", () => {
    for (const k of ["lastName","firstName","lastNameKana","firstNameKana","birthDate","gender","nationality","phone","email","postalCode","prefecture","city","address","addressDetail","residenceStatus","residenceExpiry","japaneseLevel","jlptCertified"]) {
      expect(FIELD_REGISTRY[k], k).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/apply-field-registry.test.ts`
Expected: FAIL（`Cannot find module '@/lib/applyFieldRegistry'`）

- [ ] **Step 3: レジストリを実装**

```ts
// lib/applyFieldRegistry.ts
export type FieldWidget =
  | "text" | "tel" | "email" | "textarea"
  | "select" | "date-range" | "month" | "checkbox" | "postal";

export interface RegistryEntry {
  widget: FieldWidget;
  // Application のカラム名（コア項目）。custom_ は登録されないため常に存在。
  column: string;
  // 固定選択肢の参照キー（select のみ）。実際の選択肢は DynamicField 側で解決。
  optionsKey?: string;
  // text/textarea のプレースホルダ（既存と一致させる）
  placeholder?: string;
  // birthDate の年範囲などウィジェット固有パラメータ
  meta?: Record<string, unknown>;
}

export const FIELD_REGISTRY: Record<string, RegistryEntry> = {
  lastName:       { widget: "text", column: "lastName", placeholder: "山田" },
  firstName:      { widget: "text", column: "firstName", placeholder: "太郎" },
  lastNameKana:   { widget: "text", column: "lastNameKana", placeholder: "ヤマダ" },
  firstNameKana:  { widget: "text", column: "firstNameKana", placeholder: "タロウ" },
  birthDate:      { widget: "date-range", column: "birthDate", meta: { minOffset: -73, maxOffset: -14 } },
  gender:         { widget: "select", column: "gender", optionsKey: "gender" },
  nationality:    { widget: "select", column: "nationality", optionsKey: "nationality" },
  phone:          { widget: "tel", column: "phone", placeholder: "09012345678" },
  email:          { widget: "email", column: "email", placeholder: "example@email.com" },
  postalCode:     { widget: "postal", column: "postalCode", placeholder: "1000001" },
  prefecture:     { widget: "select", column: "prefecture", optionsKey: "prefecture" },
  city:           { widget: "text", column: "city", placeholder: "新宿区" },
  address:        { widget: "text", column: "address", placeholder: "西新宿1-1-1" },
  addressDetail:  { widget: "text", column: "addressDetail", placeholder: "○○マンション 101号室" },
  residenceStatus:{ widget: "select", column: "residenceStatus", optionsKey: "residenceStatus" },
  residenceExpiry:{ widget: "month", column: "residenceExpiry" },
  japaneseLevel:  { widget: "select", column: "japaneseLevel", optionsKey: "japaneseLevel" },
  jlptCertified:  { widget: "checkbox", column: "jlptCertified" },
};

export function registryEntry(fieldKey: string): RegistryEntry | undefined {
  return FIELD_REGISTRY[fieldKey];
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/apply-field-registry.test.ts`
Expected: PASS

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit` → 0 errors

- [ ] **Step 6: コミット**

```bash
git add lib/applyFieldRegistry.ts tests/unit/apply-field-registry.test.ts
git commit -m "feat(apply): 出願フォーム項目レジストリ（個人情報・既知標準項目）"
```

---

## Task 2: セクション描画モデルの純関数 buildFormSections

**Files:**
- Create: `lib/applyFormSections.ts`
- Test: `tests/unit/apply-field-registry.test.ts`（追記）

config（有効項目のみ）から「section ごと・displayOrder 昇順」の描画モデルを作る。セクションの並び順は各セクション内の最小 displayOrder。未知キーも含める（Phase3 で使用、ここでは通す）。

- [ ] **Step 1: 失敗するテストを追記**

```ts
// tests/unit/apply-field-registry.test.ts に追記
import { buildFormSections } from "@/lib/applyFormSections";
import type { FieldConfigEntry } from "@/lib/applyFieldVisibility";

describe("buildFormSections", () => {
  const cfg: (FieldConfigEntry & { section: string; displayOrder: number })[] = [
    { fieldKey: "email", isEnabled: true, isRequired: true, section: "連絡先", displayOrder: 20 },
    { fieldKey: "lastName", isEnabled: true, isRequired: true, section: "氏名", displayOrder: 1 },
    { fieldKey: "phone", isEnabled: true, isRequired: true, section: "連絡先", displayOrder: 10 },
  ];
  it("section でグルーピングし、section は最小 displayOrder 順、項目は displayOrder 昇順", () => {
    const secs = buildFormSections(cfg);
    expect(secs.map(s => s.section)).toEqual(["氏名", "連絡先"]);
    expect(secs[1].fields.map(f => f.fieldKey)).toEqual(["phone", "email"]);
  });
  it("空 config は空配列", () => {
    expect(buildFormSections([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/apply-field-registry.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 実装**

```ts
// lib/applyFormSections.ts
import type { FieldConfigEntry } from "@/lib/applyFieldVisibility";

export interface SectionField { fieldKey: string; displayOrder: number; }
export interface FormSection { section: string; fields: SectionField[]; }

type Entry = FieldConfigEntry & { section?: string; displayOrder?: number };

// 有効項目のみを section でグルーピング。section は最小 displayOrder 順、
// 各 section 内は displayOrder 昇順。
export function buildFormSections(config: Entry[]): FormSection[] {
  const groups = new Map<string, SectionField[]>();
  for (const c of config) {
    if (c.isEnabled === false) continue;
    const sec = c.section || "その他";
    if (!groups.has(sec)) groups.set(sec, []);
    groups.get(sec)!.push({ fieldKey: c.fieldKey, displayOrder: c.displayOrder ?? 0 });
  }
  const sections: FormSection[] = [];
  groups.forEach((fields, section) => {
    fields.sort((a, b) => a.displayOrder - b.displayOrder);
    sections.push({ section, fields });
  });
  sections.sort((a, b) => {
    const minA = Math.min(...a.fields.map(f => f.displayOrder));
    const minB = Math.min(...b.fields.map(f => f.displayOrder));
    return minA - minB;
  });
  return sections;
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/apply-field-registry.test.ts`
Expected: PASS（全ケース）

- [ ] **Step 5: tsc** → `npx tsc --noEmit` 0 errors

- [ ] **Step 6: コミット**

```bash
git add lib/applyFormSections.ts tests/unit/apply-field-registry.test.ts
git commit -m "feat(apply): セクション描画モデル buildFormSections（純関数）"
```

---

## Task 3: DynamicField コンポーネント（既知ウィジェットを現状と同一に描画）

**Files:**
- Create: `app/apply/_components/DynamicField.tsx`
- Modify: `app/apply/page.tsx`（`NATIONALITIES`/`PREFECTURES`/`Field`/`Input`/`Select`/`DateSelect` を export して再利用 — 既存定義を移動せず export 付与）

DynamicField は registry の widget に応じて、**現在の Step1 と同一の見た目・挙動**で描画する。選択肢は optionsKey で解決（gender/nationality/prefecture/japaneseLevel/residenceStatus）。ラベル/ヒント/必須は `fieldLabel`/`fieldHint`/`fieldRequired`（既存 lib）。

> 重要: 既存の `Field`/`Input`/`Select`/`DateSelect` プリミティブと `NATIONALITIES`/`PREFECTURES` 定数を再利用すること（新規に作らない＝パリティ維持）。`app/apply/page.tsx` 内のこれらに `export` を付け、DynamicField から import する。

- [ ] **Step 1: page.tsx のプリミティブ/定数を export 化**

`app/apply/page.tsx` で以下に `export` を付ける（定義位置は変えない）:
`function Field`, `function Input`, `function Select`, `function DateSelect`, `const NATIONALITIES`, `const PREFECTURES`, `interface FormData`, `interface FormFieldConfig`。
（既に const/function 宣言済み。`export` キーワードを前置するのみ。）

- [ ] **Step 2: DynamicField を実装**

```tsx
// app/apply/_components/DynamicField.tsx
"use client";
import React from "react";
import { Field, Input, Select, DateSelect, NATIONALITIES, PREFECTURES, type FormData, type FormFieldConfig } from "@/app/apply/page";
import { registryEntry } from "@/lib/applyFieldRegistry";
import { fieldLabel, fieldHint, fieldRequired } from "@/lib/applyFieldVisibility";
import { useT } from "@/lib/i18n";

// optionsKey -> 選択肢解決（既存 Step1 と同一の選択肢）
function optionsFor(key: string, t: (s: string) => string): { value: string; label: string }[] {
  switch (key) {
    case "gender": return [{ value: "男性", label: t("男性") }, { value: "女性", label: t("女性") }];
    case "nationality": return NATIONALITIES.map((n) => ({ value: n, label: t(n) }));
    case "prefecture": return PREFECTURES.map((p) => ({ value: p, label: t(p) }));
    case "residenceStatus": return ["留学","技術・人文知識・国際業務","特定技能","技能実習","永住者","定住者","日本人の配偶者等","家族滞在","その他"].map((v) => ({ value: v, label: t(v) }));
    case "japaneseLevel": return [
      { value: "N1", label: t("N1（最上級）") }, { value: "N2", label: "N2" }, { value: "N3", label: "N3" },
      { value: "N4", label: "N4" }, { value: "N5", label: t("N5（初級）") }, { value: "なし", label: t("資格なし") },
    ];
    default: return [];
  }
}

const DEFAULT_LABELS: Record<string, string> = {
  lastName: "姓（漢字・ローマ字）", firstName: "名（漢字・ローマ字）", lastNameKana: "姓（カナ）", firstNameKana: "名（カナ）",
  birthDate: "生年月日", gender: "性別", nationality: "国籍", phone: "電話番号", email: "メールアドレス",
  postalCode: "郵便番号", prefecture: "都道府県", city: "市区町村", address: "番地", addressDetail: "建物名・部屋番号（任意）",
  residenceStatus: "在留資格（日本在住の方）", residenceExpiry: "在留期限（日本在住の方）", japaneseLevel: "日本語レベル", jlptCertified: "JLPT合格証明書",
};
const DEFAULT_HINTS: Record<string, string> = { phone: "ハイフンなし", email: "審査結果の通知に使用", postalCode: "ハイフンなし7桁" };
// 在日情報の任意項目（既定 required=false）
const OPTIONAL_DEFAULT = new Set(["residenceStatus", "residenceExpiry", "addressDetail", "jlptCertified"]);

export function DynamicField({ fieldKey, form, onChange, errors, formConfig }: {
  fieldKey: string; form: FormData;
  onChange: (f: keyof FormData, v: string | boolean) => void;
  errors: Record<string, string>; formConfig: FormFieldConfig[] | null;
}) {
  const { t } = useT();
  const e = registryEntry(fieldKey);
  if (!e) return null; // Phase1 は既知項目のみ（custom は Phase3）
  const label = fieldLabel(formConfig, fieldKey, DEFAULT_LABELS[fieldKey] ?? fieldKey);
  const hint = fieldHint(formConfig, fieldKey, DEFAULT_HINTS[fieldKey] ?? "");
  const req = fieldRequired(formConfig, fieldKey, !OPTIONAL_DEFAULT.has(fieldKey));
  const val = form[fieldKey as keyof FormData];
  const err = errors[fieldKey];

  switch (e.widget) {
    case "text": case "tel": case "email":
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <Input data-testid={`apply-${fieldKey}`} type={e.widget === "text" ? "text" : e.widget}
            placeholder={e.placeholder} value={String(val ?? "")} error={!!err}
            onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.value)} />
        </Field>
      );
    case "postal":
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <Input data-testid={`apply-${fieldKey}`} placeholder={e.placeholder} maxLength={7} value={String(val ?? "")} error={!!err}
            onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.value.replace(/\D/g, ""))} />
        </Field>
      );
    case "select": {
      const opts = optionsFor(e.optionsKey!, t);
      const emptyLabel = !req && (fieldKey === "residenceStatus") ? t("選択してください（任意）") : (["gender","nationality","prefecture"].includes(fieldKey) ? t("選択") : t("選択してください"));
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <Select data-testid={`apply-${fieldKey}`} value={String(val ?? "")} error={!!err}
            onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.value)}>
            <option value="">{emptyLabel}</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      );
    }
    case "date-range": {
      const now = new Date().getFullYear();
      const minOff = (e.meta?.minOffset as number) ?? -73;
      const maxOff = (e.meta?.maxOffset as number) ?? -14;
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <DateSelect testId={`apply-${fieldKey}`} value={String(val ?? "")} onChange={(v: string) => onChange(fieldKey as keyof FormData, v)}
            minYear={now + minOff} maxYear={now + maxOff} hasError={!!err} />
        </Field>
      );
    }
    case "month":
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <DateSelect value={String(val ?? "")} onChange={(v: string) => onChange(fieldKey as keyof FormData, v)}
            minYear={new Date().getFullYear()} maxYear={new Date().getFullYear() + 10} />
        </Field>
      );
    case "checkbox":
      return (
        <Field label={label} hint={hint}>
          <label className="flex items-center gap-3 h-[42px] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-blue-600"
              checked={!!val} onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.checked)} />
            <span className="text-sm text-gray-700">{t("JLPT合格証明書を持っている")}</span>
          </label>
        </Field>
      );
    default: return null;
  }
}
```

- [ ] **Step 3: tsc 検証**

Run: `npx tsc --noEmit`
Expected: 0 errors（循環 import に注意。DynamicField は page.tsx から型/プリミティブを import、page.tsx は DynamicField を import。型のみ/関数 export なら Next/TS は解決可。エラーが出る場合は Field/Input/Select/DateSelect/定数/型を `app/apply/_components/primitives.tsx` に切り出して両者から import するよう変更し、その旨コミットメッセージに記載）

- [ ] **Step 4: コミット**

```bash
git add app/apply/_components/DynamicField.tsx app/apply/page.tsx
git commit -m "feat(apply): DynamicField（既知ウィジェットを現状同一に描画）+ プリミティブ export"
```

---

## Task 4: Step1 個人情報ブロックを動的描画に置換（パリティ）

**Files:**
- Modify: `app/apply/page.tsx`（Step1 の return 内、氏名〜在日情報の各セクション）

現在の `{hasNameFields && (<>...<Field .../>...</>)}` の写死ブロックを、`buildFormSections(formConfig)` でセクションを生成し、各セクションを既存の `SectionTitle` ＋グリッド＋`DynamicField` で描画する形に置換。**セクション見出しのアイコン/グリッド列数は現状を維持**するため、section 名→アイコンのマップを用意。

- [ ] **Step 1: Step1 にセクション→アイコン定義と動的描画を実装**

`app/apply/page.tsx` の `Step1` コンポーネント内、`isEnabled`/`isRequired` 等のヘルパー定義の直後に追加:

```tsx
const SECTION_ICON: Record<string, IconName> = {
  "氏名": "user", "基本情報": "id", "連絡先": "phone", "住所": "home", "在日情報": "globe",
};
const sections = buildFormSections((formConfig ?? []) as any)
  .filter(s => ["氏名","基本情報","連絡先","住所","在日情報"].includes(s.section)); // Phase1 は個人情報系のみ
```

return の個人情報ブロック（氏名〜在日情報の `{hasNameFields && ...}` 〜 `{hasResidenceFields && ...}`）を以下に置換:

```tsx
{sections.map((sec, i) => (
  <React.Fragment key={sec.section}>
    {i > 0 && <Divider />}
    <SectionTitle icon={SECTION_ICON[sec.section] ?? "id"}>{sec.section}</SectionTitle>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {sec.fields.map(f => (
        <DynamicField key={f.fieldKey} fieldKey={f.fieldKey} form={form} onChange={onChange} errors={errors} formConfig={formConfig} />
      ))}
    </div>
  </React.Fragment>
))}
```

import に `import { DynamicField } from "@/app/apply/_components/DynamicField";` と `buildFormSections` を追加。

> 注: 旧ブロックの `hasNameFields`/`hasBasicFields` 等の定義と未使用になる旧 JSX は削除する。`config 未ロード`時は `formConfig` が null → `buildFormSections([])` で空になるため、**未ロード時のフォールバック表示**を維持するには `formConfig` が null/空のときは全既知項目を既定 section/order で表示する分岐を入れる（fallback：`FORM_FIELD_DEFAULTS` から個人情報キーのセクション構造を生成）。fallback 構造は `lib/applyFieldRegistry.ts` に `PERSONAL_FALLBACK_SECTIONS` として定義して再利用する。

- [ ] **Step 2: fallback セクションを registry に追加**

`lib/applyFieldRegistry.ts` に追記（未ロード時に現状と同じ並びを保証）:

```ts
export const PERSONAL_FALLBACK_SECTIONS: { section: string; fields: string[] }[] = [
  { section: "氏名", fields: ["lastName","firstName","lastNameKana","firstNameKana"] },
  { section: "基本情報", fields: ["birthDate","gender","nationality"] },
  { section: "連絡先", fields: ["phone","email"] },
  { section: "住所", fields: ["postalCode","prefecture","city","address","addressDetail"] },
  { section: "在日情報", fields: ["residenceStatus","residenceExpiry","japaneseLevel","jlptCertified"] },
];
```

Step1 の `sections` 生成を「formConfig が空なら PERSONAL_FALLBACK_SECTIONS を `{section, fields:[{fieldKey,displayOrder}]}` 形へ変換、そうでなければ buildFormSections」に変更。

- [ ] **Step 3: tsc** → `npx tsc --noEmit` 0 errors

- [ ] **Step 4: next build（実ゲート）**

Run: `DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_test" DIRECT_URL="postgresql://setsuiken@localhost:5432/compass_test" SESSION_SECRET="test-session-secret-32chars-1234567890abcdef" CSRF_SECRET="test-csrf-secret-32chars-1234567890abcdef" NODE_OPTIONS="--max-old-space-size=2048" npm run build`
Expected: Compiled successfully / Generating static pages (78/78)

- [ ] **Step 5: コミット**

```bash
git add app/apply/page.tsx lib/applyFieldRegistry.ts
git commit -m "feat(apply): Step1 個人情報を動的描画に置換（buildFormSections + DynamicField）"
```

---

## Task 5: パリティ検証（E2E＋実ブラウザ）

**Files:**
- Modify: `tests/e2e/student-apply.spec.ts`（個人情報フィールドの存在・ラベルを確認するアサーション追記）

- [ ] **Step 1: E2E にパリティ確認を追記**

`tests/e2e/student-apply.spec.ts` の Step1 describe に追加（留学生フォームで個人情報の主要項目が描画されること）:

```ts
test("留学生Step1: 個人情報の主要フィールドが描画される（動的描画パリティ）", async ({ page }) => {
  await page.goto("/apply?school=chuo-seminar");
  await page.getByTestId("applicant-type-foreign").click();
  await page.getByTestId("apply-lastName").waitFor({ state: "visible", timeout: 30000 });
  for (const tid of ["apply-lastName","apply-firstName","apply-gender","apply-nationality","apply-phone","apply-email","apply-postalCode","apply-prefecture","apply-japaneseLevel"]) {
    await expect(page.getByTestId(tid)).toBeVisible();
  }
});
```

- [ ] **Step 2: E2E 実行**

Run: `DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_e2e" DIRECT_URL="postgresql://setsuiken@localhost:5432/compass_e2e" npx playwright test tests/e2e/student-apply.spec.ts --reporter=list`
Expected: 全 pass（既存4件＋新規1件）

- [ ] **Step 3: 既存ユニット全件**

Run: `DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run`
Expected: 全 pass（回帰なし）

- [ ] **Step 4: 実ブラウザでの目視確認（任意・推奨）**

dev サーバを起動し、`/apply?school=chuo-seminar` → 留学生/日本人 を切替え、個人情報セクションの見た目・選択肢・必須マーク・日付ピッカーが従来と同一であることを確認。無効化した項目が消える/必須が外れることも確認。

- [ ] **Step 5: コミット & push**

```bash
git add tests/e2e/student-apply.spec.ts
git commit -m "test(e2e): Step1 個人情報 動的描画パリティの確認"
git fetch origin && git rebase origin/feat/postgres-migration
git push origin feat/postgres-migration
```

---

## 受け入れ基準（Phase 1）
- Step1 個人情報（氏名/基本情報/連絡先/住所/在日情報）が config×レジストリ駆動で描画され、見た目・選択肢・必須・日付ピッカー・郵便番号挙動が**現状と一致**。
- 表示/非表示・必須・ラベル・ヒント・**セクション/並び順**が config 連動（管理画面で並べ替え→反映）。
- 既存 E2E・ユニットが回帰なし、`next build` 成功。
- フォーム state と保存経路は不変（カスタム保存・最終学歴/志望動機統合は Phase 2/3）。

## Self-Review メモ
- スペック対応: 本 Phase は spec §3.2(レジストリ)/§3.3(レンダラー)/§3.4(Step1集約の一部=個人情報)。extraData/options/カスタム保存(§3.1,3.6,3.7)と最終学歴・志望動機統合(§3.4後半)・確認画面(§3.4)は Phase2/3。
- 型整合: `registryEntry`/`FIELD_REGISTRY`/`buildFormSections`/`FormSection`/`DynamicField` を全タスクで統一。`fieldLabel`/`fieldHint`/`fieldRequired` は既存 `lib/applyFieldVisibility`。
- 循環 import リスク（page.tsx ⇄ DynamicField）を Task3 Step3 で明示し、解決策（primitives 切り出し）も提示済み。
- プレースホルダ無し。選択肢・既定ラベル・既定必須は現状コードと一致させて記載。
