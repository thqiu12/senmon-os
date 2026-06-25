import { describe, it, expect } from "vitest";
import { fieldEnabled, fieldRequired, type FieldConfigEntry } from "@/lib/applyFieldVisibility";

// API は「有効なフィールドのみ」を返す（無効化された項目は配列に含まれない）。
const populated: FieldConfigEntry[] = [
  { fieldKey: "lastName", isEnabled: true, isRequired: true },
  { fieldKey: "email", isEnabled: true, isRequired: true },
  // nationality / japaneseLevel は「無効化された」ため配列に存在しない
];

describe("fieldEnabled", () => {
  it("ロード済み configで存在する有効項目 → 表示", () => {
    expect(fieldEnabled(populated, "lastName")).toBe(true);
  });
  it("ロード済み configに存在しない項目（=管理画面で無効化）→ 非表示", () => {
    // これがバグの核心: 以前は不在を true(表示) と誤判定していた
    expect(fieldEnabled(populated, "nationality")).toBe(false);
    expect(fieldEnabled(populated, "japaneseLevel")).toBe(false);
  });
  it("config が null/空（未ロード・フォールバック）→ 既定で表示", () => {
    expect(fieldEnabled(null, "nationality")).toBe(true);
    expect(fieldEnabled([], "nationality")).toBe(true);
  });
});

describe("fieldRequired", () => {
  it("有効かつ必須 → 必須", () => {
    expect(fieldRequired(populated, "lastName")).toBe(true);
  });
  it("ロード済みで不在（無効化）→ 必須にしない（提出をブロックしない）", () => {
    expect(fieldRequired(populated, "nationality")).toBe(false);
    expect(fieldRequired(populated, "japaneseLevel")).toBe(false);
  });
  it("config 未ロード → defaultReq に従う", () => {
    expect(fieldRequired(null, "nationality")).toBe(true);
    expect(fieldRequired(null, "residenceStatus", false)).toBe(false);
  });
  it("有効だが任意 → 必須でない", () => {
    const cfg: FieldConfigEntry[] = [{ fieldKey: "x", isEnabled: true, isRequired: false }];
    expect(fieldRequired(cfg, "x")).toBe(false);
  });
});
