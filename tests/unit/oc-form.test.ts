import { describe, it, expect } from "vitest";
import { mergeOCForm, OC_FORM_DEFAULTS } from "@/lib/ocForm";

const row = (p: any) => ({ isEnabled: true, label: p.fieldKey, section: "予約者情報", isRequired: false, fieldType: "text", displayOrder: 10, ...p });

describe("mergeOCForm", () => {
  it("行なし→既定4項目が有効・順序通り", () => {
    const out = mergeOCForm(OC_FORM_DEFAULTS, []);
    expect(out.map((o) => o.fieldKey)).toEqual(["name", "email", "phone", "attendees"]);
  });
  it("行で既定を上書き（ラベル変更）", () => {
    const out = mergeOCForm(OC_FORM_DEFAULTS, [row({ fieldKey: "name", label: "氏名(漢字)" })]);
    expect(out.find((o) => o.fieldKey === "name")!.label).toBe("氏名(漢字)");
  });
  it("phone を無効化したら除外", () => {
    const out = mergeOCForm(OC_FORM_DEFAULTS, [row({ fieldKey: "phone", isEnabled: false })]);
    expect(out.some((o) => o.fieldKey === "phone")).toBe(false);
  });
  it("カスタム追加項目が出る", () => {
    const out = mergeOCForm(OC_FORM_DEFAULTS, [row({ fieldKey: "custom_q", label: "ご質問", displayOrder: 20 })]);
    expect(out.some((o) => o.fieldKey === "custom_q")).toBe(true);
  });
  it("displayOrder 昇順にソート", () => {
    const out = mergeOCForm(OC_FORM_DEFAULTS, [
      row({ fieldKey: "custom_a", displayOrder: 99 }),
      row({ fieldKey: "custom_b", displayOrder: 0 }),
    ]);
    const orders = out.map((o) => o.displayOrder ?? 0);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
