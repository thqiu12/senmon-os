export interface FormFieldDefault {
  fieldKey: string;
  label: string;
  section: string;
  isRequired: boolean;
  displayOrder: number;
  fieldType: string;
}

export interface SchoolOption {
  id: string;
  name: string;
}

// 注: フォーム設定の校別タブ用に使われるハードコード id。
// 実データの schoolKey と一致させること（/admin/schools の一覧と整合する）。
export const SCHOOLS: SchoolOption[] = [
  { id: "chuo-seminar",      name: "中央ゼミナール" },
  { id: "tdb",               name: "東京デジタルビジネス専門学校（TDB）" },
  { id: "kanagawa-judo",     name: "神奈川柔整鍼灸専門学校" },
];

export const FORM_FIELD_DEFAULTS: FormFieldDefault[] = [
  // 氏名
  { fieldKey: "lastName",       label: "姓（漢字・ローマ字）",     section: "個人情報", isRequired: true,  displayOrder: 1,  fieldType: "text" },
  { fieldKey: "firstName",      label: "名（漢字・ローマ字）",     section: "個人情報", isRequired: true,  displayOrder: 2,  fieldType: "text" },
  { fieldKey: "lastNameKana",   label: "姓（カナ）",               section: "個人情報", isRequired: true,  displayOrder: 3,  fieldType: "text" },
  { fieldKey: "firstNameKana",  label: "名（カナ）",               section: "個人情報", isRequired: true,  displayOrder: 4,  fieldType: "text" },

  // 基本情報
  { fieldKey: "birthDate",      label: "生年月日",                 section: "個人情報", isRequired: true,  displayOrder: 5,  fieldType: "date" },
  { fieldKey: "gender",         label: "性別",                     section: "個人情報", isRequired: true,  displayOrder: 6,  fieldType: "select" },
  { fieldKey: "nationality",    label: "国籍",                     section: "個人情報", isRequired: true,  displayOrder: 7,  fieldType: "select" },

  // 連絡先
  { fieldKey: "phone",          label: "電話番号",                 section: "連絡先",   isRequired: true,  displayOrder: 10, fieldType: "tel" },
  { fieldKey: "email",          label: "メールアドレス",           section: "連絡先",   isRequired: true,  displayOrder: 11, fieldType: "email" },

  // 住所
  { fieldKey: "postalCode",     label: "郵便番号",                 section: "住所",     isRequired: true,  displayOrder: 20, fieldType: "text" },
  { fieldKey: "prefecture",     label: "都道府県",                 section: "住所",     isRequired: true,  displayOrder: 21, fieldType: "select" },
  { fieldKey: "city",           label: "市区町村",                 section: "住所",     isRequired: true,  displayOrder: 22, fieldType: "text" },
  { fieldKey: "address",        label: "番地",                     section: "住所",     isRequired: true,  displayOrder: 23, fieldType: "text" },
  { fieldKey: "addressDetail",  label: "建物名・部屋番号",         section: "住所",     isRequired: false, displayOrder: 24, fieldType: "text" },

  // 在日情報
  { fieldKey: "residenceStatus", label: "在留資格",               section: "在日情報", isRequired: false, displayOrder: 30, fieldType: "select" },
  { fieldKey: "residenceExpiry", label: "在留期限",               section: "在日情報", isRequired: false, displayOrder: 31, fieldType: "date" },
  { fieldKey: "japaneseLevel",   label: "日本語レベル",           section: "在日情報", isRequired: true,  displayOrder: 32, fieldType: "select" },
  { fieldKey: "jlptCertified",   label: "JLPT合格証明書",         section: "在日情報", isRequired: false, displayOrder: 33, fieldType: "checkbox" },

  // 志望・学歴
  { fieldKey: "applicationReason",  label: "志望動機",            section: "志望・学歴", isRequired: true,  displayOrder: 40, fieldType: "textarea" },
  { fieldKey: "lastSchoolName",     label: "最終学校名",          section: "志望・学歴", isRequired: true,  displayOrder: 41, fieldType: "text" },
  { fieldKey: "lastSchoolCountry",  label: "最終学校の国",        section: "志望・学歴", isRequired: true,  displayOrder: 42, fieldType: "text" },
  { fieldKey: "lastSchoolGraduate", label: "卒業状況",            section: "志望・学歴", isRequired: true,  displayOrder: 43, fieldType: "select" },
  { fieldKey: "priorAttendanceRate", label: "出身校での出席率",   section: "志望・学歴", isRequired: false, displayOrder: 44, fieldType: "text" },
  { fieldKey: "workExperience",     label: "職務経歴",            section: "志望・学歴", isRequired: false, displayOrder: 45, fieldType: "textarea" },
];

export const FILE_FIELD_DEFAULTS: FormFieldDefault[] = [
  { fieldKey: "doc_passport",    label: "パスポート",          section: "書類", isRequired: true,  displayOrder: 100, fieldType: "file" },
  { fieldKey: "doc_photo",       label: "証明写真",            section: "書類", isRequired: true,  displayOrder: 101, fieldType: "file" },
  { fieldKey: "doc_transcript",  label: "成績証明書",          section: "書類", isRequired: true,  displayOrder: 102, fieldType: "file" },
  { fieldKey: "doc_graduation",  label: "卒業証明書",          section: "書類", isRequired: true,  displayOrder: 103, fieldType: "file" },
  { fieldKey: "doc_attendance",  label: "出席証明書",          section: "書類", isRequired: false, displayOrder: 104, fieldType: "file" },
  { fieldKey: "doc_jlpt",        label: "JLPT成績証明書",      section: "書類", isRequired: false, displayOrder: 105, fieldType: "file" },
  { fieldKey: "doc_other",       label: "その他書類",          section: "書類", isRequired: false, displayOrder: 106, fieldType: "file" },
];
