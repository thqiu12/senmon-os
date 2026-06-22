import type { IconName } from "@/components/ui/Icon";

// 志望校カードのアイコン候補（管理画面のアイコンピッカーで選択）。
// 値は @/components/ui/Icon の IconName キー。旧データの絵文字は表示時に "school" へフォールバック。
export const SCHOOL_ICON_CHOICES: IconName[] = [
  "school", "book", "monitor", "stethoscope", "graduation",
  "globe", "award", "pencil", "lightbulb", "handshake", "chart", "star",
];

const VALID = new Set<string>(SCHOOL_ICON_CHOICES);

/** DB に入っている icon 値が IconName でなければ "school" にフォールバック（旧絵文字対策）。 */
export function schoolIconOrDefault(icon: string | null | undefined): IconName {
  return icon && VALID.has(icon) ? (icon as IconName) : "school";
}
