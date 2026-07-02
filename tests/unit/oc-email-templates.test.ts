import { describe, it, expect } from "vitest";
import { renderTemplate, parseTemplates, OC_EMAIL_KEYS, OC_EMAIL_DEFAULTS } from "@/lib/ocEmailTemplates";

describe("renderTemplate", () => {
  it("{{var}} を置換する", () => {
    expect(renderTemplate("こんにちは {{name}} 様（{{eventTitle}}）", { name: "田中", eventTitle: "OC体験" }))
      .toBe("こんにちは 田中 様（OC体験）");
  });
  it("未知プレースホルダは空文字にする", () => {
    expect(renderTemplate("{{name}}/{{missing}}", { name: "A" })).toBe("A/");
  });
  it("プレースホルダが無ければそのまま", () => {
    expect(renderTemplate("固定文言", {})).toBe("固定文言");
  });
});

describe("parseTemplates", () => {
  it("未設定(null)なら全キー既定を返す", () => {
    const t = parseTemplates(null);
    expect(Object.keys(t).sort()).toEqual([...OC_EMAIL_KEYS].sort());
    expect(t.reminder.subject).toBe(OC_EMAIL_DEFAULTS.reminder.subject);
    expect(t.reminder.enabled).toBe(OC_EMAIL_DEFAULTS.reminder.enabled);
  });
  it("不正JSONでも既定にフォールバック", () => {
    const t = parseTemplates("{ not json");
    expect(t.attendedApply.body).toBe(OC_EMAIL_DEFAULTS.attendedApply.body);
  });
  it("部分指定はマージ（欠損は既定・enabledはboolean強制）", () => {
    const raw = JSON.stringify({ reminder: { enabled: false, subject: "カスタム件名" } });
    const t = parseTemplates(raw);
    expect(t.reminder.enabled).toBe(false);
    expect(t.reminder.subject).toBe("カスタム件名");
    expect(t.reminder.body).toBe(OC_EMAIL_DEFAULTS.reminder.body); // 欠損→既定
    expect(t.absentFollowup.subject).toBe(OC_EMAIL_DEFAULTS.absentFollowup.subject);
  });
  it("enabled が boolean でなければ既定を使う", () => {
    const raw = JSON.stringify({ reminder: { enabled: "yes" } });
    expect(parseTemplates(raw).reminder.enabled).toBe(OC_EMAIL_DEFAULTS.reminder.enabled);
  });
});
