import { describe, it, expect } from "vitest";
import { mergeFormConfig, type ConfigRow } from "@/lib/applyFormConfigMerge";
import { FORM_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";

// ConfigRow ファクトリ（既定は「全校共通(null)・有効」）。
function row(partial: Partial<ConfigRow> & { fieldKey: string }): ConfigRow {
  return {
    label: partial.fieldKey,
    fieldType: "text",
    isEnabled: true,
    isRequired: false,
    displayOrder: 10,
    section: "在日情報",
    description: null,
    schoolId: null,
    applicantType: null,
    ...partial,
  };
}

const has = (out: { fieldKey: string }[], key: string) => out.some((c) => c.fieldKey === key);

// 留学生専用項目（日本人では既定オフ）
const FOREIGN_ONLY = ["residenceStatus", "residenceExpiry", "japaneseLevel", "jlptCertified"];
const NORMAL_KEY = FORM_FIELD_DEFAULTS.find((f) => !FOREIGN_ONLY.includes(f.fieldKey))!.fieldKey;

describe("mergeFormConfig — 出願者タイプ別の有効/無効", () => {
  it("日本人: 全校共通(null)で在留資格が有効でも、日本人フォームでは非表示（共通行が日本人の既定オフを上書きしない）", () => {
    // 管理画面 GET が自動生成する『全校共通・isEnabled:true』行を再現
    const rows = [row({ fieldKey: "residenceStatus", applicantType: null, isEnabled: true })];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(has(out, "residenceStatus")).toBe(false);
  });

  it("日本人: 全在日情報フィールドが共通(true)でも一括で非表示になる", () => {
    const rows = FOREIGN_ONLY.map((k) => row({ fieldKey: k, applicantType: null, isEnabled: true }));
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    for (const k of FOREIGN_ONLY) expect(has(out, k)).toBe(false);
  });

  it("日本人: 明示的な『日本人』行で有効化すれば表示される（管理者が個別に出せる）", () => {
    const rows = [
      row({ fieldKey: "residenceStatus", applicantType: null, isEnabled: true }),
      row({ fieldKey: "residenceStatus", applicantType: "japanese", isEnabled: true }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(has(out, "residenceStatus")).toBe(true);
  });

  it("留学生: 全校共通で在留資格が有効なら表示（従来動作を維持）", () => {
    const rows = [row({ fieldKey: "residenceStatus", applicantType: null, isEnabled: true })];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign");
    expect(has(out, "residenceStatus")).toBe(true);
  });

  it("留学生: 管理者が全校共通で在留資格を無効化したら非表示（共通の無効化は尊重）", () => {
    const rows = [row({ fieldKey: "residenceStatus", applicantType: null, isEnabled: false })];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign");
    expect(has(out, "residenceStatus")).toBe(false);
  });

  it("日本人: 学校×日本人で明示的に無効化したら非表示", () => {
    const rows = [
      row({ fieldKey: "residenceStatus", applicantType: "japanese", schoolId: "kanaju-iryo", isEnabled: false }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(has(out, "residenceStatus")).toBe(false);
  });

  it("通常項目: 全校共通で無効化すればどのタイプでも非表示（共通の無効化は全タイプに効く）", () => {
    const rows = [row({ fieldKey: NORMAL_KEY, applicantType: null, isEnabled: false })];
    expect(has(mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese"), NORMAL_KEY)).toBe(false);
    expect(has(mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign"), NORMAL_KEY)).toBe(false);
  });

  it("学校×日本人 が 学校×共通 を上書きする（優先順位の確認）", () => {
    const rows = [
      row({ fieldKey: NORMAL_KEY, applicantType: null, schoolId: "kanaju-iryo", isEnabled: true, label: "共通ラベル" }),
      row({ fieldKey: NORMAL_KEY, applicantType: "japanese", schoolId: "kanaju-iryo", isEnabled: false }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(has(out, NORMAL_KEY)).toBe(false); // 学校×日本人(off) が勝つ
  });
});

// 本番状態(管理画面 GET が全デフォルトを全校共通・有効で自動生成済み)を再現し、
// 「他のフォームも正常に動くか」を総合的に検証する。
const ALL_COMMON_ENABLED = FORM_FIELD_DEFAULTS.map((f) =>
  row({
    fieldKey: f.fieldKey,
    applicantType: null,
    schoolId: null,
    isEnabled: true,
    section: f.section,
    displayOrder: f.displayOrder,
    label: f.label,
  }),
);
const defaultForeignOnly = FOREIGN_ONLY.filter((k) => FORM_FIELD_DEFAULTS.some((f) => f.fieldKey === k));

describe("mergeFormConfig — 各フォームが正常動作するか（総合）", () => {
  it("留学生フォーム: 全項目が表示される（在日情報を含む・従来動作）", () => {
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, ALL_COMMON_ENABLED, "foreign");
    const keys = out.map((c) => c.fieldKey);
    for (const f of FORM_FIELD_DEFAULTS) expect(keys).toContain(f.fieldKey);
    for (const k of defaultForeignOnly) expect(keys).toContain(k); // 在日情報も出る
  });

  it("日本人フォーム: 在日情報の4項目だけ非表示、その他は全て表示", () => {
    const foreign = mergeFormConfig(FORM_FIELD_DEFAULTS, ALL_COMMON_ENABLED, "foreign");
    const jp = mergeFormConfig(FORM_FIELD_DEFAULTS, ALL_COMMON_ENABLED, "japanese");
    const jpKeys = jp.map((c) => c.fieldKey);
    for (const f of FORM_FIELD_DEFAULTS) {
      if (FOREIGN_ONLY.includes(f.fieldKey)) expect(jpKeys).not.toContain(f.fieldKey);
      else expect(jpKeys).toContain(f.fieldKey);
    }
    // 日本人は「留学生 − 在日情報4項目」だけ減る
    expect(jp.length).toBe(foreign.length - defaultForeignOnly.length);
  });

  it("両フォームとも displayOrder 昇順で返る", () => {
    for (const t of ["foreign", "japanese"] as const) {
      const out = mergeFormConfig(FORM_FIELD_DEFAULTS, ALL_COMMON_ENABLED, t);
      const orders = out.map((c) => c.displayOrder ?? 0);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    }
  });

  it("共通行のラベル変更は両フォームに反映される（編集が効く）", () => {
    const rows = ALL_COMMON_ENABLED.map((r) =>
      r.fieldKey === NORMAL_KEY ? { ...r, label: "編集後ラベル" } : r,
    );
    for (const t of ["foreign", "japanese"] as const) {
      const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, t);
      expect(out.find((c) => c.fieldKey === NORMAL_KEY)?.label).toBe("編集後ラベル");
    }
  });

  it("学校×留学生: 学校が通常項目を無効化しても在日情報は表示維持（学校別フォームが効く）", () => {
    const rows = [
      ...ALL_COMMON_ENABLED,
      row({ fieldKey: NORMAL_KEY, applicantType: null, schoolId: "chuo-seminar", isEnabled: false }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "foreign");
    expect(has(out, NORMAL_KEY)).toBe(false); // 学校で無効化が効く
    for (const k of defaultForeignOnly) expect(has(out, k)).toBe(true); // 在日情報は維持
  });

  it("管理者が日本人タブで在留資格を明示有効化すれば日本人フォームに出せる（出し分け可能）", () => {
    const rows = [
      ...ALL_COMMON_ENABLED,
      row({ fieldKey: "residenceStatus", applicantType: "japanese", schoolId: null, isEnabled: true }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(has(out, "residenceStatus")).toBe(true); // 日本人でも明示で出せる
    expect(has(out, "japaneseLevel")).toBe(false); // 他の在日情報は依然非表示
  });
});
