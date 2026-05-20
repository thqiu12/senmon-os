import { prisma } from "@/lib/prisma";

/**
 * システム全体の設定を扱う共通ヘルパ。
 *
 * - 値は SystemSetting テーブルに JSON-encoded で格納される。
 * - 既存レコードが無い場合は KNOWN_DEFAULTS が初期値として返る。
 *
 * 新しい設定を追加するときは:
 *   1. KNOWN_DEFAULTS にデフォルト値を追加
 *   2. 必要なら専用ヘルパ関数を export
 *   3. UI / API で getSetting / setSetting を呼ぶ
 */

export type AllowedSettingKey =
  | "enrollmentYears" // string[] 例: ["2026", "2027", "2028"]
  | "enrollmentMonth"; // string 例: "4"

interface KnownDefaults {
  enrollmentYears: string[];
  enrollmentMonth: string;
}

const KNOWN_DEFAULTS: KnownDefaults = {
  // デフォルトは現年〜+2 の 3 年。管理画面で上書き可能。
  enrollmentYears: (() => {
    const y = new Date().getFullYear();
    return [String(y), String(y + 1), String(y + 2)];
  })(),
  enrollmentMonth: "4",
};

export async function getSetting<K extends AllowedSettingKey>(
  key: K,
): Promise<KnownDefaults[K]> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return KNOWN_DEFAULTS[key];
  try {
    return JSON.parse(row.value) as KnownDefaults[K];
  } catch {
    return KNOWN_DEFAULTS[key];
  }
}

export async function setSetting<K extends AllowedSettingKey>(
  key: K,
  value: KnownDefaults[K],
  updatedBy?: string | null,
): Promise<void> {
  const valueStr = JSON.stringify(value);
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: valueStr, updatedBy: updatedBy ?? null },
    update: { value: valueStr, updatedBy: updatedBy ?? null },
  });
}

/** 入学希望年の選択肢を取得。常に文字列配列。 */
export async function getEnrollmentYears(): Promise<string[]> {
  const v = await getSetting("enrollmentYears");
  if (!Array.isArray(v)) return KNOWN_DEFAULTS.enrollmentYears;
  // 重複排除 + 並び替え + 4 桁数値のみ受理（防御的）
  const cleaned = Array.from(new Set(v.map((x) => String(x))))
    .filter((x) => /^\d{4}$/.test(x))
    .sort();
  return cleaned.length > 0 ? cleaned : KNOWN_DEFAULTS.enrollmentYears;
}
