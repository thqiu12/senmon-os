// OCコア項目（OCReservation 列にマップ）＋既定。追加項目は extraData。
export const OC_CORE_KEYS = new Set(["name", "email", "phone", "attendees"]);
export type OCFieldDefault = { fieldKey: string; label: string; section: string; isRequired: boolean; fieldType: string; displayOrder: number };
export const OC_FORM_DEFAULTS: OCFieldDefault[] = [
  { fieldKey: "name",      label: "お名前",         section: "予約者情報", isRequired: true,  fieldType: "text",  displayOrder: 1 },
  { fieldKey: "email",     label: "メールアドレス", section: "予約者情報", isRequired: true,  fieldType: "email", displayOrder: 2 },
  { fieldKey: "phone",     label: "電話番号",       section: "予約者情報", isRequired: false, fieldType: "tel",   displayOrder: 3 },
  { fieldKey: "attendees", label: "参加人数",       section: "予約者情報", isRequired: true,  fieldType: "text",  displayOrder: 4 },
];
export type OCFormRow = {
  fieldKey: string; isEnabled: boolean; label: string; section: string; isRequired: boolean;
  fieldType: string; displayOrder: number | null;
  description?: string | null; options?: string | null; labelEn?: string | null; descriptionEn?: string | null;
};
/** OCの設定行(formType=oc, 該当school)＋既定 をマージ。applicantType 次元なし。有効のみ displayOrder 昇順。 */
export function mergeOCForm(defaults: OCFieldDefault[], rows: OCFormRow[]): OCFormRow[] {
  const map = new Map<string, OCFormRow>();
  for (const d of defaults) {
    map.set(d.fieldKey, { fieldKey: d.fieldKey, isEnabled: true, label: d.label, section: d.section, isRequired: d.isRequired, fieldType: d.fieldType, displayOrder: d.displayOrder, description: null, options: null, labelEn: null, descriptionEn: null });
  }
  for (const r of rows) map.set(r.fieldKey, { ...map.get(r.fieldKey), ...r });
  return Array.from(map.values()).filter((r) => r.isEnabled).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}
