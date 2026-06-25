# 出願フォーム フル動的化 — Phase 2 実装計画（最終学歴・志望動機を Step1 へ統合）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps use checkbox (`- [ ]`).

**Goal:** 「志望・学歴」セクション（志望動機・最終学歴・出席率・職務経歴）を form-config 駆動で Step1（申請情報）の動的リストに統合し、Step2 から該当の写死 JSX と検証を移す。Step2 は志望校選択＋選考区分のみに整理。挙動はパリティ（志望動機の300字・カウンタ・必須等を維持）。

**Architecture:** Phase1 の レジストリ＋`buildFormSections`＋`DynamicField` を拡張。`志望・学歴` の各 fieldKey をレジストリに登録すると Step1 のレジストリ会員フィルタが自動的に拾い、`志望・学歴` セクションが在日情報の後に動的描画される。検証は config 駆動で `validateStep1` に集約。Step2 からは該当 JSX/検証を削除。

**Tech Stack:** Next.js 14 / React / TS / Tailwind。検証: ローカルPG＋vitest＋`next build`＋Playwright e2e。リポ `~/senmon-fix`、ブランチ `feat/postgres-migration`。spec: `docs/superpowers/specs/2026-06-24-dynamic-application-form-design.md`。前提: Phase1 完了済み（`lib/applyFieldRegistry.ts`/`lib/applyFormSections.ts`/`app/apply/_components/DynamicField.tsx`/`primitives.tsx`、Step1 個人情報は動的描画）。

> 注: 確認画面(Step5)の動的化と カスタム項目(extraData) は Phase 3。本Phaseは既知の学歴/志望項目の Step1 統合のみ。examMode（一般/指定推薦/特待生）とその推薦欄、志望校/学科/コース/入学希望年月は **構造的UI** として Step2 に残す。
> テスト env: unit=`DATABASE_URL_BASE="postgresql://setsuiken@localhost:5432/compass_test" npx vitest run <file>`。e2e/build は `DATABASE_URL`/`DIRECT_URL` を `postgresql://setsuiken@localhost:5432/compass_e2e`（build は compass_test）に、`SESSION_SECRET`/`CSRF_SECRET` をテスト値に設定。

---

## File Structure
- `lib/applyFieldRegistry.ts` — 学歴/志望の5+1項目を追記（修正）
- `tests/unit/apply-field-registry.test.ts` — 追記（修正）
- `app/apply/_components/DynamicField.tsx` — `textarea` ウィジェット＋`lastSchoolGraduate` 選択肢＋志望動機カウンタ（修正）
- `app/apply/page.tsx` — Step1 に `志望・学歴` セクションのアイコン/タイトル/列を追加；Step2 の学歴/志望 JSX 削除；`validateStep1` に学歴/志望検証を移動、`validateStep2` から削除（修正）

---

## Task 1: レジストリに学歴・志望項目を追加

**Files:** Modify `lib/applyFieldRegistry.ts`、Test `tests/unit/apply-field-registry.test.ts`

実データ（`lib/formFieldDefaults.ts`）の section「志望・学歴」の fieldKey と型:
applicationReason(textarea), lastSchoolName(text), lastSchoolCountry(text), lastSchoolGraduate(select), lastSchoolGraduatedOn(month), priorAttendanceRate(text), workExperience(textarea)。

- [ ] **Step 1: 失敗テストを追記**

```ts
// tests/unit/apply-field-registry.test.ts の applyFieldRegistry describe に追記
it("学歴・志望項目が登録されている", () => {
  expect(registryEntry("applicationReason")!.widget).toBe("textarea");
  expect(registryEntry("applicationReason")!.meta?.minLength).toBe(300);
  expect(registryEntry("lastSchoolGraduate")!.widget).toBe("select");
  expect(registryEntry("lastSchoolGraduate")!.optionsKey).toBe("lastSchoolGraduate");
  expect(registryEntry("lastSchoolGraduatedOn")!.widget).toBe("month");
  expect(registryEntry("workExperience")!.widget).toBe("textarea");
  for (const k of ["applicationReason","lastSchoolName","lastSchoolCountry","lastSchoolGraduate","lastSchoolGraduatedOn","priorAttendanceRate","workExperience"]) {
    expect(FIELD_REGISTRY[k], k).toBeTruthy();
  }
});
```

- [ ] **Step 2: 失敗確認** — `DATABASE_URL_BASE=... npx vitest run tests/unit/apply-field-registry.test.ts` → FAIL

- [ ] **Step 3: レジストリに追記**

`FIELD_REGISTRY` に以下を追加（既存18項目の後）:
```ts
  applicationReason:  { widget: "textarea", column: "applicationReason", placeholder: "志望する理由、将来の目標、この学科で学びたいことなどをご記入ください。", meta: { minLength: 300, counter: true } },
  lastSchoolName:     { widget: "text", column: "lastSchoolName", placeholder: "○○大学" },
  lastSchoolCountry:  { widget: "text", column: "lastSchoolCountry", placeholder: "中国" },
  lastSchoolGraduate: { widget: "select", column: "lastSchoolGraduate", optionsKey: "lastSchoolGraduate" },
  lastSchoolGraduatedOn: { widget: "month", column: "lastSchoolGraduatedOn" },
  priorAttendanceRate:{ widget: "text", column: "priorAttendanceRate", placeholder: "例：95%" },
  workExperience:     { widget: "textarea", column: "workExperience", placeholder: "会社名、職種、期間などをご記入ください" },
```

- [ ] **Step 4: テスト通過確認** → PASS、`npx tsc --noEmit` 0

- [ ] **Step 5: コミット**
```bash
git add lib/applyFieldRegistry.ts tests/unit/apply-field-registry.test.ts
git commit -m "feat(apply): レジストリに学歴・志望項目を追加（Phase2）"
```

---

## Task 2: DynamicField に textarea ウィジェット・志望動機カウンタ・卒業状況選択肢

**Files:** Modify `app/apply/_components/DynamicField.tsx`

現状の `DynamicField` は textarea 未対応（default→null）。志望動機は「textarea＋300字ヒント＋文字数カウンタ」、職務経歴は素の textarea。`lastSchoolGraduate` の選択肢（卒業/卒業見込み/中退/在学中）を `optionsFor` に追加。既定ラベル/ヒント/任意設定も追加。

- [ ] **Step 1: optionsFor に lastSchoolGraduate を追加**

`optionsFor` の switch に追加:
```ts
    case "lastSchoolGraduate": return ["卒業","卒業見込み","中退","在学中"].map((v) => ({ value: v, label: t(v) }));
```

- [ ] **Step 2: 既定ラベル/ヒント/任意設定を追加**

`DEFAULT_LABELS` に追記:
```ts
  applicationReason: "志望動機", lastSchoolName: "学校名", lastSchoolCountry: "国",
  lastSchoolGraduate: "卒業状況", lastSchoolGraduatedOn: "卒業（見込）年月",
  priorAttendanceRate: "出身校での出席率", workExperience: "職務経歴（任意）",
```
`DEFAULT_HINTS` に追記:
```ts
  applicationReason: "300字以上で具体的にご記入ください",
  lastSchoolGraduatedOn: "例：2026-03",
  priorAttendanceRate: "例：95%、出席日数150日/総授業日数158日",
  workExperience: "直近の職務経歴をご記入ください",
```
`OPTIONAL_DEFAULT` に追記: `priorAttendanceRate`, `lastSchoolGraduatedOn`, `workExperience`。

- [ ] **Step 3: textarea ウィジェットを実装**

`switch (e.widget)` に `case "textarea"` を追加（`select` の前など）:
```tsx
    case "textarea": {
      const minLen = (e.meta?.minLength as number) | 0;
      const showCounter = !!e.meta?.counter;
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <textarea
            data-testid={`apply-${fieldKey}`}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y hover:border-gray-300"
            placeholder={e.placeholder ? t(e.placeholder) : undefined}
            value={String(val ?? "")}
            onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.value)} />
          {showCounter && (
            <p className="text-xs text-gray-400 mt-1">{String(val ?? "").length} {t("/ 300文字")}</p>
          )}
          {minLen > 0 ? null : null}
        </Field>
      );
    }
```
（カウンタ文言は現行 Step2 と同一の `{length} / 300文字`。i18n キーは既存 `t("/ 300文字")` を流用。存在しなければ `lib/i18n/en.ts` に `"/ 300文字": "/ 300 chars"` を追加してよい。）

- [ ] **Step 4: tsc** → `npx tsc --noEmit` 0 errors

- [ ] **Step 5: コミット**
```bash
git add app/apply/_components/DynamicField.tsx app/apply/_components/primitives.tsx lib/i18n/en.ts
git commit -m "feat(apply): DynamicField に textarea・卒業状況選択肢・志望動機カウンタ"
```
（lib/i18n/en.ts はキー追加した場合のみ）

---

## Task 3: Step1 に「志望・学歴」セクションを動的描画、Step2 の学歴/志望 JSX を削除

**Files:** Modify `app/apply/page.tsx`

Step1 はレジストリ会員でフィルタしているため、Task1 で学歴/志望をレジストリ登録した時点で `志望・学歴` セクションが Step1 に自動的に現れる。アイコン/タイトル/列の対応を足し、Step2 の該当 JSX を削除する。

- [ ] **Step 1: Step1 のセクション対応マップに「志望・学歴」を追加**

`SECTION_ICON` に `"志望・学歴": "graduation"` を追加（既存 Step2 で使用していた icon 名。`IconName` に存在することを確認。無ければ "id"）。必要なら `SECTION_COLS` に `"志望・学歴": "grid-cols-1 sm:grid-cols-2"`（既定2列でよい）。

- [ ] **Step 2: Step2 から学歴/志望の写死 JSX を削除**

`Step2` コンポーネントの「最終学歴」セクション（`isEnabled("lastSchoolName")` 等のブロック）と「志望動機」`Field`（applicationReason）を削除する。**志望校選択（schoolId/department/course/enrollmentYear）、SectionTitle「選考区分・推薦」、examMode カード、推薦欄（referrerName/referrerType）は残す。** 削除により Step2 で未使用になった `isEnabled`/`isRequired`/`labelFor`/`hintFor` が他で使われていないか確認し、未使用なら削除（志望校/examMode 描画で使っていれば残す）。

- [ ] **Step 3: tsc＋build**

Run: `npx tsc --noEmit` → 0。
Run: `DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_test" DIRECT_URL="postgresql://setsuiken@localhost:5432/compass_test" SESSION_SECRET="test-session-secret-32chars-1234567890abcdef" CSRF_SECRET="test-csrf-secret-32chars-1234567890abcdef" NODE_OPTIONS="--max-old-space-size=2048" npm run build` → Compiled successfully / 78/78。

- [ ] **Step 4: コミット**
```bash
git add app/apply/page.tsx
git commit -m "feat(apply): 志望・学歴をStep1動的描画へ統合しStep2から削除"
```

---

## Task 4: 検証ロジックの移動（学歴・志望を validateStep1 へ）

**Files:** Modify `app/apply/page.tsx`

学歴/志望項目が Step1 に移ったので、必須検証も Step1 へ移す（さもないと Step1 を必須未入力で通過できてしまう）。

- [ ] **Step 1: validateStep1 に学歴・志望の検証を追加**

`validateStep1` に追加（`isFieldRequired`/`isFieldEnabled` は Step1 側のヘルパー＝既存）:
```ts
    if (isFieldRequired("applicationReason")) {
      if (!form.applicationReason) e.applicationReason = "志望動機を入力してください";
      else if (form.applicationReason.length < 300) e.applicationReason = `${t("300文字以上入力してください（現在")}${form.applicationReason.length}${t("文字）")}`;
    }
    if (isFieldRequired("lastSchoolName") && !form.lastSchoolName) e.lastSchoolName = "学校名を入力してください";
    if (isFieldRequired("lastSchoolCountry") && !form.lastSchoolCountry) e.lastSchoolCountry = "国を入力してください";
    if (isFieldRequired("lastSchoolGraduate") && !form.lastSchoolGraduate) e.lastSchoolGraduate = "卒業状況を選択してください";
    if (isFieldRequired("priorAttendanceRate", false) && !form.priorAttendanceRate) e.priorAttendanceRate = "出席率を入力してください";
```
（Step1 に `isFieldRequired`/`isFieldEnabled` が無い場合は、Step1 が参照している同等ヘルパー名に合わせる。Phase1 で Step1 のローカル isEnabled/isRequired は削除したが、`validateStep1` はコンポーネント本体の `isFieldRequired`/`isFieldEnabled`（`app/apply/page.tsx:1836` 付近）を使用している。これらは引き続き存在するため、そのまま使う。）

- [ ] **Step 2: validateStep2 から同じ検証を削除**

`validateStep2` から applicationReason/lastSchoolName/lastSchoolCountry/lastSchoolGraduate/priorAttendanceRate の検証行を削除（schoolId/department/course/enrollmentYear の構造検証は残す）。

- [ ] **Step 3: tsc** → 0 errors

- [ ] **Step 4: コミット**
```bash
git add app/apply/page.tsx
git commit -m "feat(apply): 学歴・志望の必須検証を validateStep1 へ移動"
```

---

## Task 5: 検証（E2E＋全テスト＋実ブラウザ）

**Files:** Modify `tests/e2e/student-apply.spec.ts`

- [ ] **Step 1: E2E 追記（志望動機が Step1 に出る・300字で次へ）**

Step1 describe に追加:
```ts
test("留学生Step1: 志望・学歴セクションがStep1に表示される", async ({ page }) => {
  await page.goto("/apply?school=chuo-seminar");
  await page.getByTestId("applicant-type-foreign").click();
  await page.getByTestId("apply-lastName").waitFor({ state: "visible", timeout: 10_000 });
  await expect(page.getByTestId("apply-applicationReason")).toBeVisible();
  await expect(page.getByTestId("apply-lastSchoolName")).toBeVisible();
  await expect(page.getByTestId("apply-lastSchoolGraduate")).toBeVisible();
});
```

- [ ] **Step 2: 全 E2E 実行**

Run: `DATABASE_URL="postgresql://setsuiken@localhost:5432/compass_e2e" DIRECT_URL="postgresql://setsuiken@localhost:5432/compass_e2e" npx playwright test tests/e2e/student-apply.spec.ts --reporter=list`
Expected: 全 pass（既存 ＋ 新規）。**注意**: 既存テスト「必須項目を埋めると次へ進む」は Step1 で applicationReason(300字) と lastSchool* が必須になったため、そのままでは次へが有効化しない可能性。→ そのテストに志望動機(300字以上)・学校名・国・卒業状況の入力を追記して通す（学校により必須かは config 依存。chuo-seminar の既定で必須なら入力を足す）。

- [ ] **Step 3: 全ユニット** → `DATABASE_URL_BASE=... npx vitest run` 全 pass

- [ ] **Step 4: 実ブラウザ目視（任意）** — Step1 に 志望・学歴 が出て、志望動機カウンタ・300字検証が動き、Step2 は志望校＋選考区分のみになっていることを確認。

- [ ] **Step 5: コミット & push**
```bash
git add tests/e2e/student-apply.spec.ts
git commit -m "test(e2e): 志望・学歴のStep1統合を確認"
git fetch origin && git rebase origin/feat/postgres-migration
git push origin feat/postgres-migration
```

---

## 受け入れ基準（Phase 2）
- 志望動機・最終学歴・出席率・職務経歴が Step1（在日情報の後）に config 駆動で表示され、志望動機の300字カウンタ・必須・卒業状況選択肢が現状と一致。
- Step2 は志望校選択＋選考区分（examMode/推薦）のみ。学歴/志望の写死は無し。
- 必須検証は Step1 で機能（未入力で Step1 を通過できない）。
- 既存 E2E・ユニット回帰なし、`next build` 成功。

## Self-Review メモ
- spec §3.4（Step1集約の後半＝学歴/志望）を実装。確認画面(Step5)動的化と extraData は Phase3。
- 型整合: 追加 fieldKey は `FormData` の既存キー（applicationReason 等は既に存在）。`meta.minLength/counter` は DynamicField の textarea で参照。
- パリティ: 志望動機カウンタ文言・300字検証メッセージは現行 Step2 と同一文字列を使用。
- プレースホルダ無し。
