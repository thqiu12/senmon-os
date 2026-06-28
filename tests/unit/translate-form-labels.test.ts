import { describe, it, expect } from "vitest";
import { translateLabelsToEn } from "@/lib/translateFormLabels";

describe("translateLabelsToEn", () => {
  it("APIキー未設定なら空オブジェクト（no-op）", async () => {
    expect(await translateLabelsToEn([{ key: "a", ja: "日本語学校名" }])).toEqual({});
  });
  it("対象が空なら空", async () => {
    expect(await translateLabelsToEn([])).toEqual({});
    expect(await translateLabelsToEn([{ key: "a", ja: "  " }])).toEqual({});
  });
});
