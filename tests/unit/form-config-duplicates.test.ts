import { describe, it, expect } from "vitest";
import { findDuplicateLabels } from "@/lib/formConfigDuplicates";

const row = (fieldKey: string, label: string, section = "志望・学歴", isEnabled = true) => ({ fieldKey, label, section, isEnabled });

describe("findDuplicateLabels", () => {
  it("同一セクション×同名(有効)が2つ → 検出", () => {
    const out = findDuplicateLabels([row("lastSchoolName", "日本語学校名"), row("custom_x", "日本語学校名")]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("日本語学校名");
    expect(out[0].fieldKeys.sort()).toEqual(["custom_x", "lastSchoolName"]);
  });
  it("無効な項目は重複に数えない", () => {
    const out = findDuplicateLabels([row("a", "氏名"), row("b", "氏名", "志望・学歴", false)]);
    expect(out).toHaveLength(0);
  });
  it("セクションが違えば重複ではない", () => {
    const out = findDuplicateLabels([row("a", "名前", "個人情報"), row("b", "名前", "連絡先")]);
    expect(out).toHaveLength(0);
  });
  it("空ラベルは無視", () => {
    expect(findDuplicateLabels([row("a", ""), row("b", "")])).toHaveLength(0);
  });
  it("重複なし → 空", () => {
    expect(findDuplicateLabels([row("a", "志望動機"), row("b", "出席率")])).toEqual([]);
  });
  it("3つ重複 → fieldKeys 3件", () => {
    const out = findDuplicateLabels([row("a", "X"), row("b", "X"), row("c", "X")]);
    expect(out[0].fieldKeys).toHaveLength(3);
  });
});
