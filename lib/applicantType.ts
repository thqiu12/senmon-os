// 出願者タイプの定数と表示ラベル
export const APPLICANT_TYPES = ["foreign", "japanese"] as const;
export type ApplicantType = (typeof APPLICANT_TYPES)[number];

export const APPLICANT_TYPE_LABEL: Record<ApplicantType, string> = {
  foreign: "留学生",
  japanese: "日本人",
};

export function isApplicantType(v: unknown): v is ApplicantType {
  return v === "foreign" || v === "japanese";
}

// 日本人フォームで既定オフにする留学生専用フィールド
export const FOREIGN_ONLY_FIELDS = ["residenceStatus", "residenceExpiry", "japaneseLevel", "jlptCertified"];
