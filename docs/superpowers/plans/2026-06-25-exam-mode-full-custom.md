# 選考区分フル自由化 実装計画（方式A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps use checkbox (`- [ ]`)。spec=`docs/superpowers/specs/2026-06-25-exam-mode-full-custom-design.md`。

**Goal:** 選考区分を学校×タイプ別に 追加/改名/並べ替え/削除/筆記有無/推薦機関欄/説明 でき、区分ごとに専用入力欄（条件付きカスタム項目）を付けられるようにする。後方互換維持。

**Architecture:** 区分は examMode 設定行の `options` に JSON 配列 `[{id,label,exam,showReferrer,description}]` で保持（id 不変・label 編集可）。区分ごとの専用欄は `FormFieldConfig.showWhenExamMode`（新 nullable 列）で条件表示。ExamModeEnum 緩和＋API で区分ID検証。PDF は id→label 解決。

**Tech Stack:** Next.js14/React/TS/Prisma(Postgres)。branch `chore/security-hardening`。unit=`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run`。build env=DATABASE_URL/DIRECT_URL=...compass_test,SESSION_SECRET/CSRF_SECRET テスト値(32+),NODE_OPTIONS=--max-old-space-size=2048。e2e/live=compass_e2e。

---

## File Structure
- `prisma/schema.prisma` + `prisma/migrations/<ts>_add_showwhenexammode/migration.sql` — 新列 showWhenExamMode。
- `lib/applyExamModes.ts` — 型 ExamModeOption / DEFAULT_EXAM_MODES / parseExamModeOptions / examModesForConfig / examModeLabel。
- `lib/schemas.ts` — ExamModeEnum 緩和。
- `lib/applyExamModeValidate.ts`(新) — examMode 範囲検証の純関数。
- `app/api/applications/route.ts` — examMode 範囲検証を配線。
- `app/api/admin/form-config/route.ts` — POST/PUT に showWhenExamMode。
- `app/admin/form-config/page.tsx` — 区分リスト編集＋カスタム項目の表示条件。
- `app/apply/page.tsx` — 区分配置描画＋条件付きカスタム＋推薦/説明。
- `lib/pdf/exam-ticket.ts` + 呼び出し箇所 — label 印字。
- tests/unit/*。

---

## Task 1: スキーマに showWhenExamMode 列を追加

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20260625150000_add_showwhenexammode/migration.sql`

- [ ] **Step 1: schema に列追加**
`model FormFieldConfig` に（`options String?` の近くに）追加:
```prisma
  showWhenExamMode String? // 選考区分IDが入っていると、その区分選択時のみ表示（null=常時）
```

- [ ] **Step 2: マイグレーションファイル作成**
`prisma/migrations/20260625150000_add_showwhenexammode/migration.sql`:
```sql
ALTER TABLE "FormFieldConfig" ADD COLUMN "showWhenExamMode" TEXT;
```

- [ ] **Step 3: テストDBに反映＋generate**
```bash
DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_test" npx prisma db push
DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_e2e" npx prisma db push
npx prisma generate
```
Expected: 反映成功、generate 成功。

- [ ] **Step 4: tsc**
`npx tsc --noEmit` → 0。

- [ ] **Step 5: commit**
```bash
git add prisma/schema.prisma prisma/migrations/20260625150000_add_showwhenexammode/
git commit -m "feat(db): FormFieldConfig.showWhenExamMode 追加（区分条件付き項目用）"
```

---

## Task 2: lib/applyExamModes 拡張（型/既定/パーサ/ラベル）

**Files:** Modify `lib/applyExamModes.ts`; Create `tests/unit/apply-exam-modes-parse.test.ts`

> 既存 `lib/applyExamModes.ts` には `EXAM_MODE_VALUES`、`STRUCTURAL_KEYS`、`enabledExamModes` がある（#2）。`STRUCTURAL_KEYS` はそのまま維持。`enabledExamModes` は後続タスクで使わなくなるが、削除せず残す（他参照があれば破壊しない）。

- [ ] **Step 1: 失敗するテストを書く** — `tests/unit/apply-exam-modes-parse.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { parseExamModeOptions, DEFAULT_EXAM_MODES, examModeLabel } from "@/lib/applyExamModes";

describe("parseExamModeOptions", () => {
  it("空/null → 既定3区分", () => {
    expect(parseExamModeOptions(null).map(o => o.id)).toEqual(["一般","指定推薦","特待生"]);
    expect(parseExamModeOptions("")).toEqual(DEFAULT_EXAM_MODES);
  });
  it("旧CSV(#2) → 既定のうち列挙idだけ", () => {
    const r = parseExamModeOptions("一般\n特待生");
    expect(r.map(o => o.id)).toEqual(["一般","特待生"]);
    expect(r.find(o=>o.id==="一般")!.exam).toBe(true); // 既定属性が付く
  });
  it("JSON配列 → そのまま（欠損属性は補完）", () => {
    const r = parseExamModeOptions(JSON.stringify([{id:"em_1",label:"AO入試"}]));
    expect(r).toEqual([{id:"em_1",label:"AO入試",exam:false,showReferrer:false,description:""}]);
  });
  it("不正JSON → 既定", () => {
    expect(parseExamModeOptions("{bad").map(o=>o.id)).toEqual(["一般","指定推薦","特待生"]);
  });
});
describe("examModeLabel", () => {
  it("id→label 解決（未知は id）", () => {
    const opts = parseExamModeOptions(JSON.stringify([{id:"em_1",label:"AO入試"}]));
    expect(examModeLabel(opts,"em_1")).toBe("AO入試");
    expect(examModeLabel(opts,"unknown")).toBe("unknown");
  });
});
```

- [ ] **Step 2: 実行して落ちることを確認**
`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run tests/unit/apply-exam-modes-parse.test.ts` → FAIL。

- [ ] **Step 3: 実装** — `lib/applyExamModes.ts` に追記
```ts
export type ExamModeOption = {
  id: string;
  label: string;
  exam: boolean;        // 筆記試験あり=true / 免除=false
  showReferrer: boolean; // 推薦機関名・種別欄を出す
  description: string;   // 選択時の案内（任意）
};

export const DEFAULT_EXAM_MODES: ExamModeOption[] = [
  { id: "一般",   label: "一般選考", exam: true,  showReferrer: true,  description: "" },
  { id: "指定推薦", label: "指定推薦", exam: false, showReferrer: true,  description: "" },
  { id: "特待生",   label: "特待生選考", exam: false, showReferrer: false, description: "特待生選考の要件を満たす方が対象です。" },
];

function normalizeOption(o: any): ExamModeOption | null {
  if (!o || typeof o.id !== "string" || !o.id) return null;
  return {
    id: o.id,
    label: typeof o.label === "string" && o.label ? o.label : o.id,
    exam: o.exam === true,
    showReferrer: o.showReferrer === true,
    description: typeof o.description === "string" ? o.description : "",
  };
}

/** examMode 設定行の options(JSON or 旧CSV or 空) → 区分配列。 */
export function parseExamModeOptions(options: string | null | undefined): ExamModeOption[] {
  if (!options || !options.trim()) return DEFAULT_EXAM_MODES;
  const t = options.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) {
        const out = arr.map(normalizeOption).filter((x): x is ExamModeOption => x !== null);
        return out.length ? out : DEFAULT_EXAM_MODES;
      }
    } catch { /* fallthrough */ }
    return DEFAULT_EXAM_MODES;
  }
  // 旧CSV(#2): 既定のうち列挙された id だけ（既定属性付き）
  const ids = t.split(/[\n,、]/).map(s => s.trim()).filter(Boolean);
  const picked = DEFAULT_EXAM_MODES.filter(d => ids.includes(d.id));
  return picked.length ? picked : DEFAULT_EXAM_MODES;
}

type Cfg = { fieldKey: string; isEnabled?: boolean; options?: string | null };
/** formConfig 内 examMode 行から区分配列。行なし→既定。isEnabled=false→[]（節非表示）。 */
export function examModesForConfig(formConfig: Cfg[] | null | undefined): ExamModeOption[] {
  if (!formConfig) return DEFAULT_EXAM_MODES;
  const row = formConfig.find(c => c.fieldKey === "examMode");
  if (!row) return DEFAULT_EXAM_MODES;
  if (row.isEnabled === false) return [];
  return parseExamModeOptions(row.options);
}

export function examModeLabel(opts: ExamModeOption[], id: string): string {
  return opts.find(o => o.id === id)?.label ?? id;
}
```

- [ ] **Step 4: 実行して通す** → 全 pass。
- [ ] **Step 5: tsc** → 0。
- [ ] **Step 6: commit**
```bash
git add lib/applyExamModes.ts tests/unit/apply-exam-modes-parse.test.ts
git commit -m "feat(apply): 選考区分の JSON 配置パーサ＋既定＋ラベル解決"
```

---

## Task 3: ExamModeEnum 緩和＋範囲検証の純関数

**Files:** Modify `lib/schemas.ts`; Create `lib/applyExamModeValidate.ts`, `tests/unit/apply-exam-mode-validate.test.ts`

- [ ] **Step 1: schemas.ts の ExamModeEnum 緩和**
`export const ExamModeEnum = z.enum(["一般", "指定推薦", "特待生"]);` を:
```ts
export const ExamModeEnum = z.string().min(1).max(20);
```
（参照箇所 `examMode: ExamModeEnum.optional()` 等はそのまま型互換。）

- [ ] **Step 2: 検証純関数のテスト** — `tests/unit/apply-exam-mode-validate.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { isExamModeAllowed } from "@/lib/applyExamModeValidate";
import { DEFAULT_EXAM_MODES } from "@/lib/applyExamModes";

describe("isExamModeAllowed", () => {
  const opts = DEFAULT_EXAM_MODES;
  it("配置内のidは許可", () => expect(isExamModeAllowed(opts, "一般")).toBe(true));
  it("配置外は不許可", () => expect(isExamModeAllowed(opts, "AO入試")).toBe(false));
  it("空区分配置(節非表示)では examMode 空でも許可", () => {
    expect(isExamModeAllowed([], "")).toBe(true);
    expect(isExamModeAllowed([], "一般")).toBe(false);
  });
  it("空文字 examMode は配置ありなら不許可", () => expect(isExamModeAllowed(opts, "")).toBe(false));
});
```

- [ ] **Step 3: 実装** — `lib/applyExamModeValidate.ts`
```ts
import type { ExamModeOption } from "@/lib/applyExamModes";
/** examMode が学校の区分配置に含まれるか。区分0件(節非表示)なら空のみ許可。 */
export function isExamModeAllowed(opts: ExamModeOption[], examMode: string | null | undefined): boolean {
  if (opts.length === 0) return !examMode; // 節非表示時は未選択のみOK
  return !!examMode && opts.some(o => o.id === examMode);
}
```

- [ ] **Step 4: 実行 → pass。tsc → 0。**
- [ ] **Step 5: commit**
```bash
git add lib/schemas.ts lib/applyExamModeValidate.ts tests/unit/apply-exam-mode-validate.test.ts
git commit -m "feat(schema): ExamModeEnum 緩和＋区分範囲検証の純関数"
```

---

## Task 4: 出願API で examMode 範囲検証を配線

**Files:** Modify `app/api/applications/route.ts`

> #1 で追加した「必須カスタム項目のサーバ側検証」と同じ位置（primarySchoolKey 解決後・採番/create 前）。同じ form-config 解決ロジック（typed 経路）で区分配置を得る。

- [ ] **Step 1: import 追加**
`import { examModesForConfig } from "@/lib/applyExamModes";` と `import { isExamModeAllowed } from "@/lib/applyExamModeValidate";`。既に #1 で `mergeFormConfig`/`FORM_FIELD_DEFAULTS` を import 済ならそれを使う。merged 済 config から `examModesForConfig(merged)` を呼ぶ（merged は ConfigRow[]、examMode 行と options を含む）。

- [ ] **Step 2: 検証ブロック追加**（#1 のカスタム必須検証ブロックの直後）
```ts
const examOpts = examModesForConfig(merged as any);
if (!isExamModeAllowed(examOpts, body.examMode)) {
  return NextResponse.json(
    { error: `選考区分が不正です`, issues: { fieldErrors: { examMode: ["有効な選考区分を選択してください"] } } },
    { status: 400 },
  );
}
```
（`merged` は #1 で取得した同校×タイプの form-config。examMode 行が無ければ examModesForConfig が DEFAULT を返し、既定3つを許容＝後方互換。）

- [ ] **Step 3: tsc → 0。build → 78/78。**
- [ ] **Step 4: e2e 非回帰**
`DATABASE_URL=...compass_e2e DIRECT_URL=...compass_e2e SESSION_SECRET=... CSRF_SECRET=... npx playwright test tests/e2e/student-apply.spec.ts --reporter=line` → 6/6（demo は examMode=一般＝既定許容、ブロックされない）。
- [ ] **Step 5: commit**
```bash
git add app/api/applications/route.ts
git commit -m "feat(api): 出願APIで選考区分IDを学校配置で検証"
```

---

## Task 5: 管理 form-config ルートで showWhenExamMode を永続化

**Files:** Modify `app/api/admin/form-config/route.ts`

- [ ] **Step 1: POST に showWhenExamMode**
POST のボディ分割代入（`options = null,` の近く）に `showWhenExamMode = null,` を追加し、`prisma.formFieldConfig.create({ data: { ... options: options || null, showWhenExamMode: showWhenExamMode || null, ... } })` に含める。

- [ ] **Step 2: PUT に showWhenExamMode**
PUT の item 型に `showWhenExamMode?: string | null;` を追加し、`updateData` に `showWhenExamMode: item.showWhenExamMode ?? null,` を追加（#2 の options 永続化と同じ要領で update/create 両方に反映）。

- [ ] **Step 3: GET が showWhenExamMode を返すか確認**
typed/legacy 経路とも stored 行は `{...stored}` で全列返るため showWhenExamMode も含まれる（合成デフォルト行には無くてよい＝常時表示）。コード確認のみ。

- [ ] **Step 4: tsc → 0。build → 78/78。**
- [ ] **Step 5: commit**
```bash
git add app/api/admin/form-config/route.ts
git commit -m "feat(admin-api): form-config が showWhenExamMode を保存・返却"
```

---

## Task 6: 管理UI — 区分リスト編集＋カスタム項目の表示条件

**Files:** Modify `app/admin/form-config/page.tsx`

> 現状は examMode カードが3チェックボックス（#2）。これを区分リスト編集に置換。`examModeOptions: string[]` state を `examModeList: ExamModeOption[]` に変える。READ してから統合。

- [ ] **Step 1: import / state**
`import { parseExamModeOptions, DEFAULT_EXAM_MODES, type ExamModeOption } from "@/lib/applyExamModes";`。`examModeOptions` state を:
```tsx
const [examModeList, setExamModeList] = useState<ExamModeOption[]>(DEFAULT_EXAM_MODES);
```

- [ ] **Step 2: fetch 時に反映**
`fetchConfigs` の examMode 反映を `parseExamModeOptions` に置換:
```tsx
const em = (Array.isArray(data) ? data : []).find((c: any) => c.fieldKey === "examMode");
setExamModeList(parseExamModeOptions(em?.options ?? null));
```

- [ ] **Step 3: リスト編集UI**（旧3チェックボックスカードを置換）
各区分行：表示名(input)／筆記有無(checkbox exam)／推薦機関欄(checkbox showReferrer)／説明(input description 任意)／↑↓並べ替え／削除。＋「区分を追加」ボタン（`{ id: genId(), label:"", exam:false, showReferrer:false, description:"" }` を push。`genId = () => "em_" + Math.random().toString(36).slice(2,8)` ※ ただし plan 実装時は衝突回避に既存idと重複しないよう生成）。既定区分(id∈既定3)も編集可（label/exam/showReferrer/description 変更・削除可）。`setExamModeList` で更新。空ラベル行は保存時に id をフォールバック表示名にしない＝保存前にラベル必須バリデーション（空ならエラー表示）。

- [ ] **Step 4: 保存(PUT)に JSON で含める**
保存ハンドラの examModeRow を:
```tsx
const examModeRow = {
  fieldKey: "examMode", label: "選考区分", fieldType: "radio", section: "選考区分",
  isEnabled: examModeList.length > 0, isRequired: true, displayOrder: 5, description: null,
  options: JSON.stringify(examModeList), schoolId: selectedSchoolId, applicantType: selectedApplicantType,
};
```
（#2 の payload 連結はそのまま。options に JSON 文字列。）

- [ ] **Step 5: カスタム項目に「表示条件：選考区分」**
カスタム項目の追加モーダル(addForm)と各行編集に、`showWhenExamMode`（select: なし＝null ／ 各区分 label→value=id、`examModeList` から生成）を追加。addForm state に `showWhenExamMode: ""` を持ち、POST ボディに含める。既存行編集でも configs の該当行に `showWhenExamMode` を持たせ、PUT payload（`...c`）で送る（Task5 で受け取る）。

- [ ] **Step 6: tsc → 0。build → 78/78。**
- [ ] **Step 7: commit**
```bash
git add app/admin/form-config/page.tsx
git commit -m "feat(admin): 選考区分リスト編集＋カスタム項目の表示条件(選考区分)"
```

---

## Task 7: 出願フォーム — 区分配置描画＋条件付き表示

**Files:** Modify `app/apply/page.tsx`

> 現状 Step2 で `enabledExamModes(formConfig)`（固定3配列フィルタ, #2）。これを配置ベースに置換。READ して統合。

- [ ] **Step 1: import**
`import { examModesForConfig, examModeLabel, type ExamModeOption } from "@/lib/applyExamModes";`

- [ ] **Step 2: 区分配置を算出＆カード描画**
Step2 内 `const examModes = enabledExamModes(formConfig);` を `const examModes: ExamModeOption[] = examModesForConfig(formConfig);` に置換。カードの固定3インライン配列を `examModes.map(opt => ...)` に置換。各カード: `opt.label`、筆記バッジ=`opt.exam ? "筆記あり" : "筆記免除"`、選択値 `form.examMode === opt.id`、onChange→`onChange("examMode", opt.id)`。グリッド列数は `examModes.length` で可変（既存）。`examModes.length===0` で節非表示（既存）。

- [ ] **Step 3: 既定選択補正**
既存 useEffect を `examModesForConfig` ベースに:
```tsx
useEffect(() => {
  const opts = examModesForConfig(formConfig);
  if (opts.length > 0 && !opts.some(o => o.id === form.examMode)) onChange("examMode", opts[0].id);
}, [formConfig]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: 推薦機関欄/説明を区分属性で**
固定の `{form.examMode === "指定推薦" && (...)}`（推薦機関名/種別）と `{form.examMode === "特待生" && (...)}`（要件）と `{form.examMode === "一般" && (...)}` を、選択中区分 `const sel = examModes.find(o => o.id === form.examMode);` を使い:
- `sel?.showReferrer` の時に推薦機関名(`referrerName`)・種別(`referrerType`)欄を表示（既存の入力JSXを流用、ラベルは「推薦機関・推薦者名」「推薦機関の種別」で統一）。
- `sel?.description` があれば案内ボックス表示。
これで区分名ハードコード分岐を撤去。

- [ ] **Step 5: 条件付きカスタム項目を表示**
Step2（区分カードの直後）に、`formConfig` のうち `isCustomField(c.fieldKey, c.fieldType) && c.isEnabled && c.showWhenExamMode === form.examMode` の項目を DynamicField で描画（value=form.extraData、onChangeExtra）。Step1 の常時カスタム（showWhenExamMode が無い/null）と二重描画しないよう、Step1 のカスタムフィルタは `!c.showWhenExamMode`（条件なしのみ）に限定し、条件付きは Step2 の選択区分配下でのみ描画する。
（Step1 の personalEntries フィルタ `isCustomField(...)` を `isCustomField(...) && !c.showWhenExamMode` に変更。）

- [ ] **Step 6: 確認画面 label**
Step5 の `<Row label="選考区分" value={form.examMode} />` を `value={examModeLabel(examModesForConfig(formConfig), form.examMode)}` に。条件付きカスタム項目も確認画面に出す（既存カスタム表示が extraData 全体を出すならそのまま）。

- [ ] **Step 7: 必須検証**
条件付きカスタム必須は「その区分が選択中のときのみ必須」。validateStep1/isCurrentStepValid のカスタム必須判定に `(!c.showWhenExamMode || c.showWhenExamMode === form.examMode)` を AND（選択区分配下のみ必須）。

- [ ] **Step 8: tsc → 0。build → 78/78。**
- [ ] **Step 9: commit**
```bash
git add app/apply/page.tsx
git commit -m "feat(apply): 選考区分を配置から描画＋区分別の推薦/説明/条件付きカスタム項目"
```

---

## Task 8: 受験票PDF を label 印字に

**Files:** Modify `lib/pdf/exam-ticket.ts` + 呼び出し箇所

- [ ] **Step 1: 呼び出し箇所で label 解決**
PDF を生成する API/箇所（`grep -rn "exam-ticket\|ExamTicket\|examMode" app/api lib/pdf` で特定）で、対象出願の学校×タイプの form-config を解決し `examModeLabel(examModesForConfig(cfg), application.examMode)` を計算して PDF data の `examMode` に**表示名**を渡す（保存値=IDのまま、表示だけ label）。form-config 解決は既存の取得関数を流用。区分が解決できない場合は ID をそのまま（フォールバック）。

- [ ] **Step 2: lib/pdf/exam-ticket.ts は引数の文字列を印字するだけ**＝変更最小（渡す値が label になる）。必要ならコメント更新。

- [ ] **Step 3: tsc → 0。build → 78/78。**
- [ ] **Step 4: commit**
```bash
git add lib/pdf/exam-ticket.ts <呼び出し箇所>
git commit -m "feat(pdf): 受験票の選考区分を表示名(label)で印字"
```

---

## Task 9: 検証（unit 全＋build＋e2e＋実機通し）＋push

- [ ] **Step 1: 全 unit** → 全 pass。
- [ ] **Step 2: build** → 78/78。
- [ ] **Step 3: e2e** → `student-apply.spec.ts` 6/6。
- [ ] **Step 4: 実機通し（compass_e2e, dev server）**
  1. psql で chuo-seminar×foreign の examMode 行に JSON 区分（新区分「em_ao / AO入試 / exam:false」＋既定）を仕込み、条件付きカスタム項目（fieldKey=custom_aoreason, showWhenExamMode=em_ao, isRequired）を仕込む。
  2. `/api/apply/form-config?type=foreign&schoolId=chuo-seminar` で examMode 行 options(JSON)＋custom_aoreason(showWhenExamMode) が返る。
  3. dev で /apply → タイプ→学校→選考区分に「AO入試」カードが出る → 選択で custom_aoreason が出る・他区分では出ない。
  4. 確認画面で「AO入試」(label) 表示。examMode 値=em_ao 保存。
  5. 範囲外 examMode を直接 POST → 400（Task4）。
  6. 検証後 psql でクリーンアップ。
- [ ] **Step 5: push**
```bash
git fetch origin && git rebase origin/chore/security-hardening
git push origin chore/security-hardening
```
> 本番反映：auto-deploy が migrate deploy（showWhenExamMode 列追加）＋コード配信。デプロイ後、既存校は既定3区分のまま（無設定）、管理画面で区分を編集/追加可能に。

## 受け入れ基準
- 管理で区分を 追加/改名/並べ替え/削除/筆記/推薦欄/説明 でき、カスタム項目に表示条件(区分)を設定でき、保存が効く。
- 出願フォームで区分が配置どおり出て、選択区分の推薦/説明/条件付きカスタム項目が出る。確認/PDF は label、内部は ID。
- 既存出願・既定校は無改修で従来どおり。全 unit/build/e2e グリーン。schema 変更は showWhenExamMode 1列。

## Self-Review（spec 対応）
- spec① データモデル → Task1(列)/Task2(JSONパーサ)。② 後方互換 → Task2(CSV/空既定)/Task4(既定許容)/Task1(nullable)。③ 検証/PDF/学費 → Task3,4(検証)/Task8(PDF)/学費は id 既定不変(コード変更不要)。④ 出願フォーム → Task7。⑤ 管理UI → Task6/Task5。プレースホルダ無し。型: ExamModeOption/parseExamModeOptions/examModesForConfig/examModeLabel/isExamModeAllowed を全タスクで一貫使用。
