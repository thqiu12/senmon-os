import { FORM_FIELD_DEFAULTS, defaultEnabledFor } from "@/lib/formFieldDefaults";
import { type ApplicantType } from "@/lib/applicantType";

// マージ計算に必要な分類用フィールドを含む行の型。
// schoolId / applicantType は分類専用で、最終出力からは除外する。
export type ConfigRow = {
  fieldKey: string;
  label: string;
  fieldType: string;
  isEnabled: boolean;
  isRequired: boolean;
  displayOrder: number | null;
  section: string;
  description: string | null;
  options?: string | null;
  showWhenExamMode?: string | null;
  schoolId: string | null;
  applicantType: string | null;
};

export type OutputConfig = {
  fieldKey: string;
  label: string;
  fieldType: string;
  isEnabled: boolean;
  isRequired: boolean;
  displayOrder: number | null;
  section: string;
  description: string | null;
  options?: string | null;
  showWhenExamMode?: string | null;
};

/**
 * 純関数: 既定 + DB 行を出願者タイプに沿ってマージする（DB 非依存）。
 *
 * 優先順位（後勝ち、高いほど優先）:
 *   既定(type別) < 学校共通(null) < 学校(type)
 *
 * rows は schoolId / applicantType を含む DB 行。全校共通(schoolId null)は廃止＝無視し、
 * 学校行(schoolId 非 null)のみを採用する。applicantType が null なら共通、type 一致なら type 行。
 * 該当 type 以外の applicantType を持つ行は無視する。
 * 最終的に isEnabled の行のみを displayOrder 昇順で返す。
 *
 * 注: Next.js の route.ts はルートハンドラ以外の export を許さないため、
 * テスト可能な純関数はこの lib モジュールに置き、route から import する。
 */
export function mergeFormConfig(
  defaults: typeof FORM_FIELD_DEFAULTS,
  rows: ConfigRow[],
  type: ApplicantType
): OutputConfig[] {
  // tier: 大きいほど優先（後勝ち）
  const tierOf = (r: ConfigRow): number | null => {
    if (r.schoolId === null) return null; // 全校共通は廃止＝無視
    const typeMatch = r.applicantType === null ? "common" : r.applicantType === type ? "type" : null;
    if (typeMatch === null) return null;
    return typeMatch === "common" ? 1 : 2; // 学校共通(null) < 学校type
  };

  const map = new Map<string, OutputConfig>();

  // tier 0: 既定（プロパティのベース。isEnabled は後段の型別ルールで最終決定する）
  for (const f of defaults) {
    map.set(f.fieldKey, {
      fieldKey: f.fieldKey,
      label: f.label,
      fieldType: f.fieldType,
      isEnabled: defaultEnabledFor(f.fieldKey, type),
      isRequired: f.isRequired,
      displayOrder: f.displayOrder,
      section: f.section,
      description: null,
      options: null,
      showWhenExamMode: null,
    });
  }

  // DB 行を tier 昇順に適用（同 tier は入力順）。ラベル等のプロパティは後勝ちで上書き。
  // ascending tier => later writes always win; no per-key guard needed.
  // あわせて、isEnabled の最終判定用に「共通(null)行」「該当type行」それぞれの
  // 最優先 isEnabled を記録する（昇順適用なので最後の set が最優先＝学校 > 全校）。
  const typeEnabled = new Map<string, boolean>(); // applicantType === type（学校 type, tier 2）
  const commonEnabled = new Map<string, boolean>(); // applicantType === null（学校共通, tier 1）

  const candidates = rows
    .map((r) => ({ r, tier: tierOf(r) }))
    .filter((x): x is { r: ConfigRow; tier: number } => x.tier !== null)
    .sort((a, b) => a.tier - b.tier);

  for (const { r } of candidates) {
    map.set(r.fieldKey, {
      fieldKey: r.fieldKey,
      label: r.label,
      fieldType: r.fieldType,
      isEnabled: r.isEnabled,
      isRequired: r.isRequired,
      displayOrder: r.displayOrder,
      section: r.section,
      description: r.description,
      options: r.options ?? null,
      showWhenExamMode: r.showWhenExamMode ?? null,
    });
    if (r.applicantType === null) commonEnabled.set(r.fieldKey, r.isEnabled);
    else typeEnabled.set(r.fieldKey, r.isEnabled);
  }

  // isEnabled の最終判定（タイプ既定オフの項目を共通行が勝手に有効化しないようにする）:
  //   1. 該当type行がある → その値（管理者が型別に明示設定）
  //   2. type の既定がオフ（例: 日本人の在日情報）→ false（共通行では有効化できない）
  //   3. それ以外 → 共通行があればその値（共通の無効化は尊重）、無ければ既定 true
  map.forEach((cfg, key) => {
    if (typeEnabled.has(key)) {
      cfg.isEnabled = typeEnabled.get(key)!;
    } else if (!defaultEnabledFor(key, type)) {
      cfg.isEnabled = false;
    } else {
      cfg.isEnabled = commonEnabled.has(key) ? commonEnabled.get(key)! : true;
    }
  });

  return Array.from(map.values())
    .filter((c) => c.isEnabled)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}
