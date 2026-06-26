import { describe, it, expect } from "vitest";
import { mergeFormConfig, type ConfigRow } from "@/lib/applyFormConfigMerge";
import { FORM_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";

// ConfigRow ファクトリ（既定は「学校×日本人・有効」）。
// 設定は完全にタイプ別になり、全校共通(schoolId null)・共通タイプ(applicantType null)は
// どちらも廃止＝無視される。既定 schoolId は実在の学校キー、applicantType は japanese。
function row(partial: Partial<ConfigRow> & { fieldKey: string }): ConfigRow {
  return {
    label: partial.fieldKey,
    fieldType: "text",
    isEnabled: true,
    isRequired: false,
    displayOrder: 10,
    section: "在日情報",
    description: null,
    schoolId: "chuo-seminar",
    applicantType: "japanese",
    ...partial,
  };
}

const has = (out: { fieldKey: string }[], key: string) => out.some((c) => c.fieldKey === key);

// 留学生専用項目（日本人では既定オフ）
const FOREIGN_ONLY = ["residenceStatus", "residenceExpiry", "japaneseLevel", "jlptCertified"];
const NORMAL_KEY = FORM_FIELD_DEFAULTS.find((f) => !FOREIGN_ONLY.includes(f.fieldKey))!.fieldKey;
const defaultForeignOnly = FOREIGN_ONLY.filter((k) => FORM_FIELD_DEFAULTS.some((f) => f.fieldKey === k));

describe("mergeFormConfig — 型行が無ければ型別既定に従う", () => {
  it("留学生: 在日情報（在留資格等）は既定で表示される（行なし）", () => {
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "foreign");
    for (const k of defaultForeignOnly) expect(has(out, k)).toBe(true);
  });

  it("日本人: 在日情報は既定で非表示（行なしで defaultEnabledFor が効く）", () => {
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "japanese");
    for (const k of defaultForeignOnly) expect(has(out, k)).toBe(false);
  });

  it("日本人: 通常項目は既定で表示される（行なし）", () => {
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "japanese");
    expect(has(out, NORMAL_KEY)).toBe(true);
  });
});

describe("mergeFormConfig — 型行で明示有効化/無効化", () => {
  it("日本人: 学校×日本人 行で在留資格を明示有効化すれば表示される", () => {
    const rows = [row({ fieldKey: "residenceStatus", applicantType: "japanese", isEnabled: true })];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(has(out, "residenceStatus")).toBe(true);
  });

  it("日本人: 学校×日本人 行で明示無効化したら非表示", () => {
    const rows = [
      row({ fieldKey: NORMAL_KEY, applicantType: "japanese", isEnabled: false }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(has(out, NORMAL_KEY)).toBe(false);
  });

  it("留学生: 学校×留学生 行で在留資格を明示無効化したら非表示", () => {
    const rows = [row({ fieldKey: "residenceStatus", applicantType: "foreign", isEnabled: false })];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign");
    expect(has(out, "residenceStatus")).toBe(false);
  });

  it("型行は当該タイプにのみ効く（日本人行は留学生フォームに影響しない）", () => {
    const rows = [row({ fieldKey: NORMAL_KEY, applicantType: "japanese", isEnabled: false })];
    // 留学生フォームでは japanese 行は無視 → 既定 true で表示される
    expect(has(mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign"), NORMAL_KEY)).toBe(true);
    // 日本人フォームでは効く
    expect(has(mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese"), NORMAL_KEY)).toBe(false);
  });
});

describe("mergeFormConfig — applicantType=null(共通)行は無視される", () => {
  it("applicantType=null の行は出力に一切影響しない", () => {
    const rows = [
      row({
        fieldKey: NORMAL_KEY,
        applicantType: null,
        isEnabled: false,
        label: "共通行ラベル（無視されるべき）",
      }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign");
    // null 行の isEnabled:false は無視 → 既定 true で表示される
    expect(has(out, NORMAL_KEY)).toBe(true);
    // null 行のラベルは反映されない（既定ラベルのまま）
    const def = FORM_FIELD_DEFAULTS.find((f) => f.fieldKey === NORMAL_KEY)!;
    expect(out.find((c) => c.fieldKey === NORMAL_KEY)?.label).toBe(def.label);
  });

  it("schoolId=null（全校共通）行も無視される", () => {
    const rows = [row({ fieldKey: NORMAL_KEY, schoolId: null, applicantType: "foreign", isEnabled: false })];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign");
    expect(has(out, NORMAL_KEY)).toBe(true); // 全校共通は無視 → 既定 true
  });
});

describe("mergeFormConfig — プロパティ伝播", () => {
  it("custom select の options がマージ出力に伝播する", () => {
    const rows = [row({ fieldKey: "custom_color", applicantType: "foreign", isEnabled: true, options: "赤\n青\n緑" } as any)];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign");
    const c = out.find((x) => x.fieldKey === "custom_color");
    expect(c).toBeTruthy();
    expect((c as any).options).toBe("赤\n青\n緑");
  });

  it("条件付きカスタム項目の showWhenExamMode がマージ出力に伝播する", () => {
    const rows = [row({ fieldKey: "custom_aoreason", applicantType: "foreign", isEnabled: true, showWhenExamMode: "em_ao", section: "選考区分" } as any)];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign");
    const c = out.find((x) => x.fieldKey === "custom_aoreason") as any;
    expect(c).toBeTruthy();
    expect(c.showWhenExamMode).toBe("em_ao");
  });

  it("型行のラベル変更がマージ出力に反映される", () => {
    const rows = [row({ fieldKey: NORMAL_KEY, applicantType: "japanese", isEnabled: true, label: "編集後ラベル" })];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(out.find((c) => c.fieldKey === NORMAL_KEY)?.label).toBe("編集後ラベル");
  });
});

describe("mergeFormConfig — 各フォームが正常動作するか（総合）", () => {
  it("留学生フォーム: 全項目が表示される（在日情報を含む、行なし＝既定）", () => {
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "foreign");
    const keys = out.map((c) => c.fieldKey);
    for (const f of FORM_FIELD_DEFAULTS) expect(keys).toContain(f.fieldKey);
    for (const k of defaultForeignOnly) expect(keys).toContain(k);
  });

  it("日本人フォーム: 在日情報の4項目だけ非表示、その他は全て表示", () => {
    const foreign = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "foreign");
    const jp = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "japanese");
    const jpKeys = jp.map((c) => c.fieldKey);
    for (const f of FORM_FIELD_DEFAULTS) {
      if (FOREIGN_ONLY.includes(f.fieldKey)) expect(jpKeys).not.toContain(f.fieldKey);
      else expect(jpKeys).toContain(f.fieldKey);
    }
    expect(jp.length).toBe(foreign.length - defaultForeignOnly.length);
  });

  it("両フォームとも displayOrder 昇順で返る", () => {
    for (const t of ["foreign", "japanese"] as const) {
      const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], t);
      const orders = out.map((c) => c.displayOrder ?? 0);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    }
  });

  it("管理者が日本人タブで在留資格を明示有効化すれば日本人フォームに出せる（出し分け可能）", () => {
    const rows = [
      row({ fieldKey: "residenceStatus", applicantType: "japanese", schoolId: "chuo-seminar", isEnabled: true }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(has(out, "residenceStatus")).toBe(true); // 日本人でも明示で出せる
    expect(has(out, "japaneseLevel")).toBe(false); // 他の在日情報は依然非表示（行なし＝既定オフ）
  });
});
