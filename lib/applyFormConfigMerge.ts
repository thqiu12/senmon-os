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
 *   既定(type別) < 学校×type
 *
 * rows は schoolId / applicantType を含む DB 行。設定は完全にタイプ別になり、
 * 全校共通(schoolId null) と 共通タイプ(applicantType null) はどちらも廃止＝無視する。
 * 採用するのは「学校行(schoolId 非 null) かつ applicantType が当該 type に一致」する行のみ。
 * 型行が無い項目は型別既定（defaultEnabledFor。日本人の在日情報オフ等）に従う。
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
  // 採用対象は「学校×当該type」行のみ。それ以外（全校共通 / 共通タイプ / 別タイプ）は無視。
  const tierOf = (r: ConfigRow): number | null => {
    if (r.schoolId === null) return null; // 全校共通は廃止＝無視
    if (r.applicantType === null) return null; // 共通タイプも廃止＝無視
    if (r.applicantType !== type) return null; // 別タイプは無視
    return 1; // 学校×該当type のみ
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

  // 採用行を適用。ラベル等のプロパティは後勝ちで上書き。
  // あわせて、isEnabled の最終判定用に該当type行の isEnabled を記録する。
  const typeEnabled = new Map<string, boolean>(); // 学校×当該type 行の isEnabled

  const candidates = rows
    .map((r) => ({ r, tier: tierOf(r) }))
    .filter((x): x is { r: ConfigRow; tier: number } => x.tier !== null);

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
    typeEnabled.set(r.fieldKey, r.isEnabled);
  }

  // isEnabled の最終判定:
  //   1. 学校×type行がある → その値（管理者が型別に明示設定）
  //   2. 無ければ型別既定（例: 日本人の在日情報はオフ）
  map.forEach((cfg, key) => {
    if (typeEnabled.has(key)) {
      cfg.isEnabled = typeEnabled.get(key)!;
    } else {
      cfg.isEnabled = defaultEnabledFor(key, type);
    }
  });

  return Array.from(map.values())
    .filter((c) => c.isEnabled)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}
