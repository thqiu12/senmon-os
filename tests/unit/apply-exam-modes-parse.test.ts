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
    expect(r.find(o=>o.id==="一般")!.exam).toBe(true);
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
