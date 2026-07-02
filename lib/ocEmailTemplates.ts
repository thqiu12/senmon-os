// OC自動メールのテンプレート。SystemSetting(key=oc_email_templates) に4キーの JSON で保存。
// 差し込みは renderTemplate（{{var}} 置換）。未設定/欠損は OC_EMAIL_DEFAULTS へフォールバック。
export type OCEmailKey = "reminder" | "attendedApply" | "absentFollowup" | "unappliedFollowup";
export type OCEmailTemplate = { enabled: boolean; subject: string; body: string };

export const OC_EMAIL_KEYS: OCEmailKey[] = ["reminder", "attendedApply", "absentFollowup", "unappliedFollowup"];

export const OC_EMAIL_SETTING_KEY = "oc_email_templates";

// 利用可能変数: {{name}} {{eventTitle}} {{startAt}} {{schoolName}} {{applyUrl}} {{cancelUrl}}
export const OC_EMAIL_DEFAULTS: Record<OCEmailKey, OCEmailTemplate> = {
  reminder: {
    enabled: true,
    subject: "【{{schoolName}}】明日のオープンキャンパスのご案内",
    body:
      "{{name}} 様\n\n" +
      "明日 {{startAt}} 開催のオープンキャンパス「{{eventTitle}}」のご予約ありがとうございます。\n" +
      "お気をつけてお越しください。\n\n" +
      "※ご都合が悪くなった場合はこちらからご確認ください: {{cancelUrl}}",
  },
  attendedApply: {
    enabled: true,
    subject: "【{{schoolName}}】オープンキャンパスご参加ありがとうございました",
    body:
      "{{name}} 様\n\n" +
      "本日はオープンキャンパス「{{eventTitle}}」にご参加いただきありがとうございました。\n" +
      "ご出願はこちらから承っております:\n{{applyUrl}}",
  },
  absentFollowup: {
    enabled: true,
    subject: "【{{schoolName}}】次回オープンキャンパスのご案内",
    body:
      "{{name}} 様\n\n" +
      "先日はオープンキャンパス「{{eventTitle}}」へのご予約ありがとうございました。\n" +
      "次回もぜひご参加ください。ご不明点はお気軽にお問い合わせください。",
  },
  unappliedFollowup: {
    enabled: true,
    subject: "【{{schoolName}}】ご出願について",
    body:
      "{{name}} 様\n\n" +
      "先日はオープンキャンパスにご参加いただきありがとうございました。\n" +
      "ご出願をご検討中でしたら、こちらから承っております:\n{{applyUrl}}",
  },
};

export function renderTemplate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (k in vars ? vars[k] : ""));
}

export function parseTemplates(raw: string | null | undefined): Record<OCEmailKey, OCEmailTemplate> {
  let obj: unknown = {};
  if (raw) {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  const src = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
  const out = {} as Record<OCEmailKey, OCEmailTemplate>;
  for (const k of OC_EMAIL_KEYS) {
    const d = OC_EMAIL_DEFAULTS[k];
    const v = src[k] && typeof src[k] === "object" ? (src[k] as Record<string, unknown>) : {};
    out[k] = {
      enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
      subject: typeof v.subject === "string" && v.subject ? v.subject : d.subject,
      body: typeof v.body === "string" && v.body ? v.body : d.body,
    };
  }
  return out;
}

// PUT 保存時の sanitize（4キー・enabled boolean・subject/body string）。常に4キー揃う。
export function sanitizeTemplates(input: unknown): Record<OCEmailKey, OCEmailTemplate> {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out = {} as Record<OCEmailKey, OCEmailTemplate>;
  for (const k of OC_EMAIL_KEYS) {
    const d = OC_EMAIL_DEFAULTS[k];
    const v = src[k] && typeof src[k] === "object" ? (src[k] as Record<string, unknown>) : {};
    out[k] = {
      enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
      subject: typeof v.subject === "string" ? v.subject : d.subject,
      body: typeof v.body === "string" ? v.body : d.body,
    };
  }
  return out;
}
