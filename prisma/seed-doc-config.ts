/**
 * 書類（出願・入学手続き）のフォーム管理用 seed。冪等（再実行安全）。
 * - ApplySchool 3校（schoolKey は出願フォームと一致：chuo-seminar / tdb / kanagawa-judo）
 * - 出願書類(section=書類) 全校共通 ＋ TDB・中央の学校別変更（#3/#4/#11/#12）
 * - 入学手続き書類(section=入学手続き書類) 全校共通
 * 既存の admin 編集を尊重するため upsert（あれば update、無ければ create）。
 *
 * 実行: DATABASE_URL=... npx tsx prisma/seed-doc-config.ts
 */
import { prisma } from "@/lib/prisma";

const APPLY_SCHOOLS = [
  {
    schoolKey: "chuo-seminar", name: "中央ゼミナール", hojin: "学校法人 羽場学園", icon: "📚", displayOrder: 0,
    departments: [
      { name: "大学・大学院受験科", duration: "1年制", courses: ["文系コース", "理系コース", "医歯薬コース", "芸術系コース", "総合コース"] },
      { name: "美術系受験科", duration: "1年制", courses: ["東京藝術大学コース", "多摩美・武蔵美コース", "デザインコース", "映像・メディアコース"] },
    ],
  },
  {
    schoolKey: "tdb", name: "東京デジタルビジネス専門学校（TDB）", hojin: "学校法人 羽場学園", icon: "💻", displayOrder: 1,
    departments: [
      { name: "デジタルビジネス科", duration: "2年制", courses: ["デジタルビジネスコース"] },
      { name: "中国語デジタルビジネス科", duration: "2年制", courses: ["中国語デジタルビジネスコース"] },
    ],
  },
  {
    schoolKey: "kanagawa-judo", name: "神奈川柔整鍼灸専門学校", hojin: "学校法人 平井学園", icon: "⚕️", displayOrder: 2,
    departments: [
      { name: "柔道整復師科", duration: "3年制", courses: ["昼間部", "夜間部"] },
      { name: "鍼灸師科", duration: "3年制", courses: ["昼間部", "夜間部"] },
      { name: "柔道整復師・鍼灸師ダブルライセンス科", duration: "3年制", courses: ["昼間部"] },
      { name: "大学進学科", duration: "1年制", courses: ["大学進学コース"] },
    ],
  },
];

type Field = {
  fieldKey: string; schoolId: string | null; label: string;
  section: string; isRequired: boolean; isEnabled?: boolean; displayOrder: number;
  description?: string | null;
};

// 出願書類（全校共通） section=書類
const APPLY_DOCS_GLOBAL: Field[] = [
  { fieldKey: "doc_photo",          schoolId: null, label: "証明写真（3×3cm）",          section: "書類", isRequired: true,  displayOrder: 100, description: "白背景・正面・3ヶ月以内撮影" },
  { fieldKey: "doc_transcript",     schoolId: null, label: "最終学校の成績証明書",        section: "書類", isRequired: true,  displayOrder: 101, description: "原本または公証済みコピー" },
  { fieldKey: "doc_attendance",     schoolId: null, label: "最終学校の出席状況証明書",    section: "書類", isRequired: true,  displayOrder: 102, description: "出席率が記載されたもの" },
  { fieldKey: "doc_jlpt",           schoolId: null, label: "JLPT成績証明書",             section: "書類", isRequired: false, displayOrder: 110, description: "日本語能力試験の合格証・成績証明書（いずれか1点）" },
  { fieldKey: "doc_eju",            schoolId: null, label: "EJU成績証明書",              section: "書類", isRequired: false, displayOrder: 111, description: "日本留学試験の成績証明書（いずれか1点）" },
  { fieldKey: "doc_hs_grad",        schoolId: null, label: "高校卒業証明書",             section: "書類", isRequired: false, displayOrder: 120, description: "高校卒業の方" },
  { fieldKey: "doc_hs_transcript",  schoolId: null, label: "高校成績証明書",             section: "書類", isRequired: false, displayOrder: 121, description: "高校卒業の方" },
  { fieldKey: "doc_univ_grad",      schoolId: null, label: "大学卒業証明書",             section: "書類", isRequired: false, displayOrder: 122, description: "大学院受験の方" },
  { fieldKey: "doc_univ_transcript",schoolId: null, label: "大学成績証明書",             section: "書類", isRequired: false, displayOrder: 123, description: "大学院受験の方" },
  { fieldKey: "doc_enrollment",     schoolId: null, label: "在学証明書",                section: "書類", isRequired: false, displayOrder: 124, description: "日本の大学に在学中の方" },
  { fieldKey: "doc_english",        schoolId: null, label: "英語能力証明書",             section: "書類", isRequired: false, displayOrder: 130, description: "TOEFL・IELTS・TOEIC等（任意）" },
  { fieldKey: "doc_other",          schoolId: null, label: "その他書類",                section: "書類", isRequired: false, displayOrder: 131, description: "上記以外の参考書類" },
];

// 学校別（TDB・中央）：#3 出席状況→卒業証明書 / #4 日本語学校の成績・出席証明書 追加 / #11 成績証明書 不要 / #12 証明写真 不要
const PER_SCHOOL_OVERRIDES: Field[] = [];
for (const sid of ["tdb", "chuo-seminar"]) {
  PER_SCHOOL_OVERRIDES.push(
    { fieldKey: "doc_attendance", schoolId: sid, label: "最終学校の卒業証明書", section: "書類", isRequired: true,  displayOrder: 102, description: "卒業を証明する書類（原本または公証済みコピー）" }, // #3
    { fieldKey: "doc_jp_school",  schoolId: sid, label: "日本語学校の成績・出席証明書", section: "書類", isRequired: true, displayOrder: 103, description: "在籍する日本語学校の成績・出席状況が分かるもの" }, // #4
    { fieldKey: "doc_transcript", schoolId: sid, label: "最終学校の成績証明書", section: "書類", isRequired: false, isEnabled: false, displayOrder: 101 }, // #11 不要
    { fieldKey: "doc_photo",      schoolId: sid, label: "証明写真（3×3cm）",   section: "書類", isRequired: false, isEnabled: false, displayOrder: 100 }, // #12 不要
  );
}

// 入学手続き書類（全校共通） section=入学手続き書類
const ENROLL_DOCS_GLOBAL: Field[] = [
  { fieldKey: "enr_pledge",     schoolId: null, label: "入学誓約書",                   section: "入学手続き書類", isRequired: true,  displayOrder: 200 },
  { fieldKey: "enr_funding",    schoolId: null, label: "経費支弁能力を証明する書類",     section: "入学手続き書類", isRequired: true,  displayOrder: 201 },
  { fieldKey: "enr_health",     schoolId: null, label: "健康診断書",                   section: "入学手続き書類", isRequired: false, displayOrder: 202 },
  { fieldKey: "enr_final_edu",  schoolId: null, label: "最終学歴証明書（原本）",         section: "入学手続き書類", isRequired: true,  displayOrder: 203 },
  { fieldKey: "enr_passport",   schoolId: null, label: "パスポートコピー",              section: "入学手続き書類", isRequired: true,  displayOrder: 204 },
  { fieldKey: "enr_residence",  schoolId: null, label: "在留カードコピー",              section: "入学手続き書類", isRequired: false, displayOrder: 205 },
  { fieldKey: "enr_photo",      schoolId: null, label: "証明写真（4枚）",               section: "入学手続き書類", isRequired: true,  displayOrder: 206 },
];

async function upsertField(f: Field) {
  const existing = await prisma.formFieldConfig.findFirst({
    where: { fieldKey: f.fieldKey, schoolId: f.schoolId },
    select: { id: true },
  });
  const data = {
    fieldKey: f.fieldKey, schoolId: f.schoolId, label: f.label, fieldType: "file",
    section: f.section, isRequired: f.isRequired, isEnabled: f.isEnabled ?? true,
    displayOrder: f.displayOrder, description: f.description ?? null,
  };
  if (existing) {
    await prisma.formFieldConfig.update({ where: { id: existing.id }, data });
  } else {
    await prisma.formFieldConfig.create({ data });
  }
}

async function main() {
  // ApplySchool
  for (const s of APPLY_SCHOOLS) {
    await prisma.applySchool.upsert({
      where: { schoolKey: s.schoolKey },
      update: { name: s.name, hojin: s.hojin, icon: s.icon, displayOrder: s.displayOrder, isActive: true, departments: JSON.stringify(s.departments) },
      create: { schoolKey: s.schoolKey, name: s.name, hojin: s.hojin, icon: s.icon, displayOrder: s.displayOrder, isActive: true, departments: JSON.stringify(s.departments) },
    });
  }
  // 書類
  const all = [...APPLY_DOCS_GLOBAL, ...PER_SCHOOL_OVERRIDES, ...ENROLL_DOCS_GLOBAL];
  for (const f of all) await upsertField(f);

  const schools = await prisma.applySchool.count();
  const docs = await prisma.formFieldConfig.count({ where: { fieldType: "file" } });
  console.log(`seed-doc-config done: ApplySchool=${schools}, file fields=${docs}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
