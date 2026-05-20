/**
 * 基本情報変更申請で許可するフィールド一覧（route.ts から export 不可なので別モジュール）。
 *
 * Application カラム名そのままをキーとして、ラベル / 入力タイプ / select の選択肢を持つ。
 */

export interface ChangeRequestFieldDef {
  label: string;
  type: "text" | "date" | "tel" | "email" | "select";
  options?: string[];
}

export const ALLOWED_FIELDS: Record<string, ChangeRequestFieldDef> = {
  lastName:        { label: "姓",                type: "text" },
  firstName:       { label: "名",                type: "text" },
  lastNameKana:    { label: "姓（カナ）",         type: "text" },
  firstNameKana:   { label: "名（カナ）",         type: "text" },
  birthDate:       { label: "生年月日",          type: "date" },
  gender:          { label: "性別",              type: "select", options: ["男性", "女性", "その他"] },
  nationality:     { label: "国籍",              type: "text" },
  phone:           { label: "電話番号",          type: "tel" },
  email:           { label: "メールアドレス",     type: "email" },
  postalCode:      { label: "郵便番号",          type: "text" },
  prefecture:      { label: "都道府県",          type: "text" },
  city:            { label: "市区町村",          type: "text" },
  address:         { label: "番地",              type: "text" },
  addressDetail:   { label: "建物名・部屋番号",   type: "text" },
  residenceStatus: { label: "在留資格",          type: "text" },
  residenceExpiry: { label: "在留期限",          type: "date" },
  japaneseLevel:   { label: "日本語レベル",       type: "select", options: ["N1", "N2", "N3", "N4", "N5", "なし"] },
};
