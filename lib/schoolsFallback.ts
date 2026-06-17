// 志望校の学科の正規データ（フォールバック単一ソース）。
// DB（ApplySchool.departments / ApplyDepartment）が空のとき、管理画面・出願フォーム
// の双方でこの内容を表示し、表示を一致させる。管理画面で保存すると DB に確定する。
// schoolKey をキーに学科を引く。

export interface FallbackDept {
  name: string;
  duration: string;
  courses: string[];
}

export const FALLBACK_DEPARTMENTS: Record<string, FallbackDept[]> = {
  "chuo-seminar": [
    { name: "大学・大学院受験科", duration: "1年制", courses: ["文系コース", "理系コース", "医歯薬コース", "芸術系コース", "総合コース"] },
    { name: "美術系受験科", duration: "1年制", courses: ["東京藝術大学コース", "多摩美・武蔵美コース", "デザインコース", "映像・メディアコース"] },
  ],
  "tdb": [
    { name: "デジタルビジネス科", duration: "2年制", courses: ["デジタルビジネスコース"] },
    { name: "中国語デジタルビジネス科", duration: "2年制", courses: ["中国語デジタルビジネスコース"] },
  ],
  "kanagawa-judo": [
    { name: "柔道整復師科", duration: "3年制", courses: ["昼間部", "夜間部"] },
    { name: "鍼灸師科", duration: "3年制", courses: ["昼間部", "夜間部"] },
    { name: "柔道整復師・鍼灸師ダブルライセンス科", duration: "3年制", courses: ["昼間部"] },
    { name: "大学進学科", duration: "1年制", courses: ["大学進学コース"] },
  ],
};
