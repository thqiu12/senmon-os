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
