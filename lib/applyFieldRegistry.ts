export type FieldWidget =
  | "text" | "tel" | "email" | "textarea"
  | "select" | "date-range" | "month" | "checkbox" | "postal";

export interface RegistryEntry {
  widget: FieldWidget;
  column: string;          // Application のカラム名（コア項目）
  optionsKey?: string;     // 固定選択肢の参照キー（select のみ）
  placeholder?: string;
  meta?: Record<string, unknown>;
}

export const FIELD_REGISTRY: Record<string, RegistryEntry> = {
  lastName:       { widget: "text", column: "lastName", placeholder: "山田" },
  firstName:      { widget: "text", column: "firstName", placeholder: "太郎" },
  lastNameKana:   { widget: "text", column: "lastNameKana", placeholder: "ヤマダ" },
  firstNameKana:  { widget: "text", column: "firstNameKana", placeholder: "タロウ" },
  birthDate:      { widget: "date-range", column: "birthDate", meta: { minOffset: -73, maxOffset: -14 } },
  gender:         { widget: "select", column: "gender", optionsKey: "gender" },
  nationality:    { widget: "select", column: "nationality", optionsKey: "nationality" },
  phone:          { widget: "tel", column: "phone", placeholder: "09012345678" },
  email:          { widget: "email", column: "email", placeholder: "example@email.com" },
  postalCode:     { widget: "postal", column: "postalCode", placeholder: "1000001" },
  prefecture:     { widget: "select", column: "prefecture", optionsKey: "prefecture" },
  city:           { widget: "text", column: "city", placeholder: "新宿区" },
  address:        { widget: "text", column: "address", placeholder: "西新宿1-1-1" },
  addressDetail:  { widget: "text", column: "addressDetail", placeholder: "○○マンション 101号室" },
  residenceStatus:{ widget: "select", column: "residenceStatus", optionsKey: "residenceStatus" },
  residenceExpiry:{ widget: "month", column: "residenceExpiry" },
  japaneseLevel:  { widget: "select", column: "japaneseLevel", optionsKey: "japaneseLevel" },
  jlptCertified:  { widget: "checkbox", column: "jlptCertified" },
  applicationReason:  { widget: "textarea", column: "applicationReason", placeholder: "志望する理由、将来の目標、この学科で学びたいことなどをご記入ください。", meta: { minLength: 300, counter: true } },
  lastSchoolName:     { widget: "text", column: "lastSchoolName", placeholder: "○○大学" },
  lastSchoolCountry:  { widget: "text", column: "lastSchoolCountry", placeholder: "中国" },
  lastSchoolGraduate: { widget: "select", column: "lastSchoolGraduate", optionsKey: "lastSchoolGraduate" },
  lastSchoolGraduatedOn: { widget: "month", column: "lastSchoolGraduatedOn" },
  priorAttendanceRate:{ widget: "text", column: "priorAttendanceRate", placeholder: "例：95%" },
  workExperience:     { widget: "textarea", column: "workExperience", placeholder: "会社名、職種、期間などをご記入ください" },
};

export function registryEntry(fieldKey: string): RegistryEntry | undefined {
  return FIELD_REGISTRY[fieldKey];
}
