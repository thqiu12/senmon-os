/**
 * lib/applyCustomRequired.ts の単体テスト。
 * 出願 API のサーバ側必須カスタム項目検証が、クライアント
 * (app/apply/page.tsx validateStep1 / isCurrentStepValid) の判定を
 * 厳密にミラーすることを保証する。
 *
 * クライアント判定:
 *   if (isCustomField && isEnabled && isRequired) {
 *     const v = form.extraData?.[c.fieldKey];
 *     if (v === undefined || v === "" || v === false) // 未入力
 *   }
 * サーバがこれより厳しくなると正当な出願を誤って弾くため、ここで固定する。
 */
import { describe, it, expect } from "vitest";
import { missingRequiredCustomFields } from "@/lib/applyCustomRequired";

// カスタム項目（レジストリ未登録・file以外・構造的キーでない）
const customText = { fieldKey: "favoriteColor", fieldType: "text", label: "好きな色", isRequired: true, isEnabled: true };
const customCheckbox = { fieldKey: "agreeRules", fieldType: "checkbox", label: "規約同意", isRequired: true, isEnabled: true };

describe("missingRequiredCustomFields", () => {
  it("必須カスタム項目が未入力(undefined) → 返す", () => {
    expect(missingRequiredCustomFields([customText], {})).toEqual([
      { fieldKey: "favoriteColor", label: "好きな色" },
    ]);
  });

  it("必須カスタム項目が空文字 → 返す", () => {
    expect(missingRequiredCustomFields([customText], { favoriteColor: "" })).toEqual([
      { fieldKey: "favoriteColor", label: "好きな色" },
    ]);
  });

  it("必須カスタム項目が入力済み → 返さない", () => {
    expect(missingRequiredCustomFields([customText], { favoriteColor: "青" })).toEqual([]);
  });

  it("必須でないカスタム項目は未入力でも無視", () => {
    const optional = { ...customText, isRequired: false };
    expect(missingRequiredCustomFields([optional], {})).toEqual([]);
  });

  it("無効(isEnabled=false)なカスタム項目は必須でも無視", () => {
    const disabled = { ...customText, isEnabled: false };
    expect(missingRequiredCustomFields([disabled], {})).toEqual([]);
  });

  it("非カスタム(レジストリ標準フィールド)は必須・未入力でも無視", () => {
    const standard = { fieldKey: "applicationReason", fieldType: "textarea", label: "志望動機", isRequired: true, isEnabled: true };
    const standard2 = { fieldKey: "lastName", fieldType: "text", label: "姓", isRequired: true, isEnabled: true };
    expect(missingRequiredCustomFields([standard, standard2], {})).toEqual([]);
  });

  it("file 型は isCustomField=false なので無視", () => {
    const fileField = { fieldKey: "transcript", fieldType: "file", label: "成績証明書", isRequired: true, isEnabled: true };
    expect(missingRequiredCustomFields([fileField], {})).toEqual([]);
  });

  it("チェックボックス未チェック(false) → 未入力として返す（クライアントと一致）", () => {
    expect(missingRequiredCustomFields([customCheckbox], { agreeRules: false })).toEqual([
      { fieldKey: "agreeRules", label: "規約同意" },
    ]);
  });

  it("チェックボックスがチェック済み(true) → 返さない", () => {
    expect(missingRequiredCustomFields([customCheckbox], { agreeRules: true })).toEqual([]);
  });

  it("extraData が null/undefined でも必須未入力を検出", () => {
    expect(missingRequiredCustomFields([customText], null)).toEqual([
      { fieldKey: "favoriteColor", label: "好きな色" },
    ]);
    expect(missingRequiredCustomFields([customText], undefined)).toEqual([
      { fieldKey: "favoriteColor", label: "好きな色" },
    ]);
  });

  it("複数項目: 未入力のみを順に返す", () => {
    const a = { fieldKey: "fieldA", fieldType: "text", label: "A", isRequired: true, isEnabled: true };
    const b = { fieldKey: "fieldB", fieldType: "text", label: "B", isRequired: true, isEnabled: true };
    expect(missingRequiredCustomFields([a, b], { fieldA: "x" })).toEqual([
      { fieldKey: "fieldB", label: "B" },
    ]);
  });

  it("label 無し → fieldKey をラベルにフォールバック", () => {
    const noLabel = { fieldKey: "fieldC", fieldType: "text", isRequired: true, isEnabled: true };
    expect(missingRequiredCustomFields([noLabel], {})).toEqual([
      { fieldKey: "fieldC", label: "fieldC" },
    ]);
  });

  it("空白のみの文字列は未入力扱いしない（クライアントは trim しない）", () => {
    expect(missingRequiredCustomFields([customText], { favoriteColor: "   " })).toEqual([]);
  });
});
