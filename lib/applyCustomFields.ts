import { registryEntry } from "@/lib/applyFieldRegistry";
import { STRUCTURAL_KEYS } from "@/lib/applyExamModes";

// カスタム＝レジストリ未登録 かつ file 以外
export function isCustomField(fieldKey: string, fieldType?: string | null): boolean {
  if (fieldType === "file") return false;
  if (STRUCTURAL_KEYS.has(fieldKey)) return false; // examMode 等の構造的フィールドは汎用描画に出さない
  return !registryEntry(fieldKey);
}

export function parseOptions(options?: string | null): { value: string; label: string }[] {
  if (!options) return [];
  return options
    .split(/[\n,、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => ({ value: s, label: s }));
}

export type GenericWidget = "text" | "textarea" | "select" | "month" | "checkbox";
export function genericWidget(fieldType?: string | null): GenericWidget {
  switch (fieldType) {
    case "textarea": return "textarea";
    case "select": return "select";
    case "date": case "month": return "month";
    case "checkbox": return "checkbox";
    default: return "text";
  }
}
