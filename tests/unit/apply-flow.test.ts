/**
 * 学生の出願フローが「壊れない」ことを守る単体テスト。
 *
 * カバー範囲:
 *  - mergeFormConfig: 出願者タイプ(日本人/留学生)別にフォーム項目が正しく出し分けされるか
 *    （学生が入力する項目を決める中核。ここが壊れると誤った/空のフォームが出る）
 *  - 出願フローのレート上限: 学校PCルームからの一斉出願を許容できる下限を満たすか
 *    （過去に create=5件/時 で一斉出願がブロックされた回帰を再発させない）
 */
import { describe, it, expect } from "vitest";
import { mergeFormConfig, type ConfigRow } from "@/lib/applyFormConfigMerge";
import { FORM_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";
import { APPLY_RATE_LIMITS } from "@/lib/rateLimits";
import { ApplicationCreateSchema } from "@/lib/schemas";

const keysOf = (out: { fieldKey: string }[]) => out.map((c) => c.fieldKey);

function row(p: Partial<ConfigRow> & { fieldKey: string }): ConfigRow {
  return {
    label: p.fieldKey,
    fieldType: "text",
    isEnabled: true,
    isRequired: false,
    displayOrder: 0,
    section: "個人情報",
    description: null,
    schoolId: null,
    applicantType: null,
    ...p,
  };
}

describe("mergeFormConfig — 出願者タイプ別フォーム", () => {
  it("留学生(foreign)は在留資格・在留期限・日本語レベルを表示する", () => {
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "foreign");
    const keys = keysOf(out);
    expect(keys).toContain("residenceStatus");
    expect(keys).toContain("residenceExpiry");
    expect(keys).toContain("japaneseLevel");
  });

  it("日本人(japanese)は留学生専用項目を既定で非表示にする（共通項目は残す）", () => {
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "japanese");
    const keys = keysOf(out);
    expect(keys).not.toContain("residenceStatus");
    expect(keys).not.toContain("residenceExpiry");
    expect(keys).not.toContain("japaneseLevel");
    expect(keys).not.toContain("jlptCertified");
    // 氏名・メール等の共通項目は両タイプで必要
    expect(keys).toContain("lastName");
    expect(keys).toContain("email");
  });

  it("学校×タイプの行が既定・全校共通を上書きする（後勝ち）", () => {
    // 全校共通で lastName を無効化しても、学校×japanese で有効化すれば表示される
    const rows: ConfigRow[] = [
      row({ fieldKey: "lastName", isEnabled: false, schoolId: null, applicantType: null }),
      row({ fieldKey: "lastName", isEnabled: true, schoolId: "chuo-seminar", applicantType: "japanese" }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(keysOf(out)).toContain("lastName");
  });

  it("別タイプの設定行は無視される", () => {
    // japanese で取得時、foreign 専用に在留資格を有効化した行は効かない
    const rows: ConfigRow[] = [
      row({ fieldKey: "residenceStatus", isEnabled: true, schoolId: "chuo-seminar", applicantType: "foreign" }),
    ];
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, rows, "japanese");
    expect(keysOf(out)).not.toContain("residenceStatus");
  });

  it("どのタイプでも空フォームにはならない（最低限の項目が出る）", () => {
    for (const t of ["foreign", "japanese"] as const) {
      const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], t);
      expect(out.length).toBeGreaterThan(3);
      expect(keysOf(out)).toContain("email");
    }
  });

  it("displayOrder 昇順で返る", () => {
    const out = mergeFormConfig(FORM_FIELD_DEFAULTS, [], "foreign");
    const orders = out.map((c) => c.displayOrder ?? 0);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });
});

describe("出願フローのレート上限 — 共有IP(学校PCルーム)の一斉出願を許容", () => {
  // 過去の障害: create=5件/時 で 6人目以降がブロックされた。下限を固定して再発を防ぐ。
  it("出願作成は同一IPで十分な同時数を許容する（>=50）", () => {
    expect(APPLY_RATE_LIMITS.create.max).toBeGreaterThanOrEqual(50);
  });

  it("最終送信も一斉送信を許容する（>=50）", () => {
    expect(APPLY_RATE_LIMITS.submit.max).toBeGreaterThanOrEqual(50);
  });

  it("アップロードは複数ファイル×多人数を許容する（>=100）", () => {
    expect(APPLY_RATE_LIMITS.upload.max).toBeGreaterThanOrEqual(100);
  });

  it("窓は正の有限値である", () => {
    for (const k of ["create", "submit", "upload"] as const) {
      expect(APPLY_RATE_LIMITS[k].windowMs).toBeGreaterThan(0);
    }
  });
});

describe("ApplicationCreateSchema — 日本人/留学生 と実入力の受理", () => {
  const base = {
    lastName: "山田", firstName: "太郎", lastNameKana: "ヤマダ", firstNameKana: "タロウ",
    birthDate: "2003-04-15", gender: "男性", nationality: "中国",
    phone: "09012345678", email: "taro@example.com",
    postalCode: "1234567", prefecture: "東京都", city: "新宿区", address: "1-2-3",
    japaneseLevel: "N2", schoolName: "中央ゼミナール", department: "大学受験科",
    enrollmentYear: "2026", enrollmentMonth: "4",
  };

  it("留学生(日本語レベルあり)を受理する", () => {
    const r = ApplicationCreateSchema.safeParse({ ...base, applicantType: "foreign" });
    expect(r.success).toBe(true);
  });

  it("日本人(日本語レベル非表示=空・在留情報なし)を受理する", () => {
    // 日本人フォームは japaneseLevel/在留資格/在留期限 を非表示にするため空で届く。
    // ここで弾くと日本人が出願できなくなる（出願破壊バグ）。
    const jp = { ...base, applicantType: "japanese", japaneseLevel: "", residenceStatus: "", residenceExpiry: "" };
    const r = ApplicationCreateSchema.safeParse(jp);
    expect(r.success).toBe(true);
  });

  it("代表的な電話番号フォーマットを受理する", () => {
    for (const phone of ["09012345678", "090-1234-5678", "+81 90-1234-5678", "(03) 1234-5678"]) {
      const r = ApplicationCreateSchema.safeParse({ ...base, phone });
      expect(r.success, `phone=${phone}`).toBe(true);
    }
  });

  it("不正な applicantType は foreign に倒れ、400 にしない", () => {
    const r = ApplicationCreateSchema.safeParse({ ...base, applicantType: "???" });
    expect(r.success).toBe(true);
  });
});
