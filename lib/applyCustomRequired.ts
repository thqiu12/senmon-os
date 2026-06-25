import { isCustomField } from "@/lib/applyCustomFields";

type Cfg = {
  fieldKey: string;
  fieldType?: string | null;
  label?: string | null;
  isRequired?: boolean;
  isEnabled?: boolean;
};

/**
 * 必須のカスタム項目で extraData が未入力のものを返す（クライアント検証と同じ判定）。
 *
 * クライアント側（app/apply/page.tsx validateStep1 / isCurrentStepValid）の判定を
 * 厳密にミラーする:
 *   if (isCustomField && isEnabled && isRequired) {
 *     const v = form.extraData?.[c.fieldKey];
 *     if (v === undefined || v === "" || v === false) // 未入力
 *   }
 * サーバ側がクライアントより厳しくなると正当な出願を誤って弾くため、
 * 「未入力」の条件は v === undefined / "" / false の3つだけに限定する
 * （trim はしない・null も追加しない）。
 */
export function missingRequiredCustomFields(
  config: Cfg[],
  extraData: Record<string, unknown> | null | undefined,
): { fieldKey: string; label: string }[] {
  const data = extraData ?? {};
  const missing: { fieldKey: string; label: string }[] = [];
  for (const c of config) {
    if (c.isEnabled === false) continue;
    if (!c.isRequired) continue;
    if (!isCustomField(c.fieldKey, c.fieldType)) continue;
    const v = (data as Record<string, unknown>)[c.fieldKey];
    // クライアント判定をミラー: undefined / 空文字 / false（チェックボックス未チェック）を未入力とする。
    const empty = v === undefined || v === "" || v === false;
    if (empty) missing.push({ fieldKey: c.fieldKey, label: c.label || c.fieldKey });
  }
  return missing;
}
