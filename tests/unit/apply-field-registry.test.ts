import { describe, it, expect } from "vitest";
import { FIELD_REGISTRY, registryEntry } from "@/lib/applyFieldRegistry";
import { buildFormSections } from "@/lib/applyFormSections";
import type { FieldConfigEntry } from "@/lib/applyFieldVisibility";

describe("applyFieldRegistry", () => {
  it("既知項目はレジストリに存在し widget/column を持つ", () => {
    const e = registryEntry("nationality");
    expect(e).toBeTruthy();
    expect(e!.widget).toBe("select");
    expect(e!.column).toBe("nationality");
    expect(e!.optionsKey).toBe("nationality");
  });
  it("japaneseLevel は select / 専用 optionsKey", () => {
    expect(registryEntry("japaneseLevel")!.widget).toBe("select");
    expect(registryEntry("japaneseLevel")!.optionsKey).toBe("japaneseLevel");
  });
  it("birthDate は date-range, postalCode は postal, jlptCertified は checkbox", () => {
    expect(registryEntry("birthDate")!.widget).toBe("date-range");
    expect(registryEntry("postalCode")!.widget).toBe("postal");
    expect(registryEntry("jlptCertified")!.widget).toBe("checkbox");
  });
  it("未知キーは undefined", () => {
    expect(registryEntry("custom_xxx")).toBeUndefined();
  });
  it("個人情報の全標準キーが登録されている", () => {
    for (const k of ["lastName","firstName","lastNameKana","firstNameKana","birthDate","gender","nationality","phone","email","postalCode","prefecture","city","address","addressDetail","residenceStatus","residenceExpiry","japaneseLevel","jlptCertified"]) {
      expect(FIELD_REGISTRY[k], k).toBeTruthy();
    }
  });
  it("学歴・志望項目が登録されている", () => {
    expect(registryEntry("applicationReason")!.widget).toBe("textarea");
    expect(registryEntry("applicationReason")!.meta?.minLength).toBe(300);
    expect(registryEntry("lastSchoolGraduate")!.widget).toBe("select");
    expect(registryEntry("lastSchoolGraduate")!.optionsKey).toBe("lastSchoolGraduate");
    expect(registryEntry("lastSchoolGraduatedOn")!.widget).toBe("month");
    expect(registryEntry("workExperience")!.widget).toBe("textarea");
    for (const k of ["applicationReason","lastSchoolName","lastSchoolCountry","lastSchoolGraduate","lastSchoolGraduatedOn","priorAttendanceRate","workExperience"]) {
      expect(FIELD_REGISTRY[k], k).toBeTruthy();
    }
  });
});

describe("buildFormSections", () => {
  const cfg: (FieldConfigEntry & { section: string; displayOrder: number })[] = [
    { fieldKey: "email", isEnabled: true, isRequired: true, section: "連絡先", displayOrder: 20 },
    { fieldKey: "lastName", isEnabled: true, isRequired: true, section: "氏名", displayOrder: 1 },
    { fieldKey: "phone", isEnabled: true, isRequired: true, section: "連絡先", displayOrder: 10 },
  ];
  it("section でグルーピングし、section は最小 displayOrder 順、項目は displayOrder 昇順", () => {
    const secs = buildFormSections(cfg);
    expect(secs.map(s => s.section)).toEqual(["氏名", "連絡先"]);
    expect(secs[1].fields.map(f => f.fieldKey)).toEqual(["phone", "email"]);
  });
  it("空 config は空配列", () => {
    expect(buildFormSections([])).toEqual([]);
  });
  it("無効項目は除外", () => {
    const c = [{ fieldKey: "x", isEnabled: false, isRequired: false, section: "A", displayOrder: 1 }];
    expect(buildFormSections(c)).toEqual([]);
  });
});
