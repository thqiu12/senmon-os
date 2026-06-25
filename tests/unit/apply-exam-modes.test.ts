import { describe, it, expect } from "vitest";
import { enabledExamModes, EXAM_MODE_VALUES } from "@/lib/applyExamModes";
import { isCustomField } from "@/lib/applyCustomFields";

describe("enabledExamModes", () => {
  it("examMode 行が無ければ3区分すべて", () => {
    expect(enabledExamModes([])).toEqual([...EXAM_MODE_VALUES]);
    expect(enabledExamModes(null)).toEqual([...EXAM_MODE_VALUES]);
  });
  it("options で一般のみ指定 → 一般だけ", () => {
    expect(enabledExamModes([{ fieldKey: "examMode", isEnabled: true, options: "一般" }])).toEqual(["一般"]);
  });
  it("options の順序によらず EXAM_MODE_VALUES 順で返す", () => {
    expect(enabledExamModes([{ fieldKey: "examMode", isEnabled: true, options: "特待生,一般" }])).toEqual(["一般", "特待生"]);
  });
  it("isEnabled:false なら空（節ごと非表示）", () => {
    expect(enabledExamModes([{ fieldKey: "examMode", isEnabled: false, options: "一般" }])).toEqual([]);
  });
  it("行はあるが options 空 → 3区分すべて", () => {
    expect(enabledExamModes([{ fieldKey: "examMode", isEnabled: true, options: "" }])).toEqual([...EXAM_MODE_VALUES]);
  });
  it("未知の値は無視される", () => {
    expect(enabledExamModes([{ fieldKey: "examMode", isEnabled: true, options: "一般,AO入試" }])).toEqual(["一般"]);
  });
});

describe("isCustomField: examMode 等の構造的キーは custom 扱いしない", () => {
  it("examMode は false", () => { expect(isCustomField("examMode")).toBe(false); });
  it("referrerName は false", () => { expect(isCustomField("referrerName")).toBe(false); });
  it("通常のカスタムキーは true", () => { expect(isCustomField("custom_hobby")).toBe(true); });
});
