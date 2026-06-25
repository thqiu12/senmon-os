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
