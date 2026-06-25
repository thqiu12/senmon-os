// 出願フォーム（申請者側）のフィールド表示/必須判定。
//
// 前提: /api/apply/form-config は「有効なフィールドのみ」を返す
// （無効化された項目は配列に含まれない）。したがって config がロード済みなのに
// 配列に存在しないフィールドは「管理画面で無効化された」とみなす。
//
// 注: route.ts はルートハンドラ以外を export できないため、純関数はこの lib に置く。
export interface FieldConfigEntry {
  fieldKey: string;
  isEnabled: boolean;
  isRequired: boolean;
  label?: string;
  description?: string | null;
}

// config 未ロード/空（フォールバック）= 既定で表示。
// ロード済みで不在 = 無効化されている → 非表示。
export function fieldEnabled(
  formConfig: FieldConfigEntry[] | null | undefined,
  key: string,
): boolean {
  if (!formConfig || formConfig.length === 0) return true;
  const cfg = formConfig.find((c) => c.fieldKey === key);
  return cfg ? cfg.isEnabled : false;
}

// config 未ロード/空 = defaultReq に従う。
// ロード済みで不在（無効化）= 必須にしない（提出をブロックしない）。
// 存在する場合は「有効 かつ 必須」のときのみ必須。
export function fieldRequired(
  formConfig: FieldConfigEntry[] | null | undefined,
  key: string,
  defaultReq = true,
): boolean {
  if (!formConfig || formConfig.length === 0) return defaultReq;
  const cfg = formConfig.find((c) => c.fieldKey === key);
  if (!cfg) return false;
  return cfg.isEnabled && cfg.isRequired;
}

// ラベル: ロード済み config に有効な label があればそれを、無ければ fallback（コード既定）。
// 管理画面でラベルを編集すると出願フォームに反映される。未編集なら既定のまま（i18n 維持）。
export function fieldLabel(
  formConfig: FieldConfigEntry[] | null | undefined,
  key: string,
  fallback: string,
): string {
  if (!formConfig || formConfig.length === 0) return fallback;
  const cfg = formConfig.find((c) => c.fieldKey === key);
  const l = cfg?.label?.trim();
  return l ? l : fallback;
}

// ヒント（説明文）: config の description があればそれを、無ければ fallback。
export function fieldHint(
  formConfig: FieldConfigEntry[] | null | undefined,
  key: string,
  fallback = "",
): string {
  if (!formConfig || formConfig.length === 0) return fallback;
  const cfg = formConfig.find((c) => c.fieldKey === key);
  const d = cfg?.description?.trim();
  return d ? d : fallback;
}
