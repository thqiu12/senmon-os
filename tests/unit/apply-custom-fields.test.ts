import { describe, it, expect } from "vitest";
import { isCustomField, parseOptions, genericWidget } from "@/lib/applyCustomFields";

describe("applyCustomFields", () => {
  it("レジストリ登録キーは custom でない / file も custom でない", () => {
    expect(isCustomField("nationality", "select")).toBe(false);
    expect(isCustomField("doc_x", "file")).toBe(false);
    expect(isCustomField("custom_hobby", "text")).toBe(true);
  });
  it("options は改行/カンマ区切りを value/label にパース", () => {
    expect(parseOptions("赤\n青\n緑")).toEqual([
      { value: "赤", label: "赤" }, { value: "青", label: "青" }, { value: "緑", label: "緑" },
    ]);
    expect(parseOptions("")).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
  });
  it("fieldType→汎用widget", () => {
    expect(genericWidget("textarea")).toBe("textarea");
    expect(genericWidget("select")).toBe("select");
    expect(genericWidget("date")).toBe("month");
    expect(genericWidget("checkbox")).toBe("checkbox");
    expect(genericWidget("number")).toBe("text");
    expect(genericWidget(undefined)).toBe("text");
  });
});
