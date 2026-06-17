// =============================================================================
// 権限（ケイパビリティ）管理
//   ロール × 操作 のマトリクスを超管理者が GUI で調整できるようにする中核。
//
//   - 権限設定は SystemSetting(key="role_permissions") に JSON 保存
//     形式: { "admin": ["result.decide", ...], "sales": [...], "interviewer": [...] }
//   - 未設定（キー無し）なら DEFAULT_ROLE_CAPS（＝現状の挙動）にフォールバック
//   - super_admin は常に全権限（ロックアウト不能）
//   - account.manage は super_admin 固定（マトリクスでは編集不可）
//   - 30秒の簡易キャッシュ。保存時に invalidate。
// =============================================================================
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";

export interface CapabilityDef {
  key: string;
  label: string;
  group: string;
  desc: string;
}

export const CAPABILITIES: CapabilityDef[] = [
  { key: "result.decide",      label: "合否を決定する",             group: "選考",   desc: "合格/不合格/補欠合格/保留 の設定（申請・志望校）" },
  { key: "notification.send",  label: "合否・案内メールを送信する", group: "選考",   desc: "面接案内・合否・手続き通知メールの送信" },
  { key: "document.review",    label: "書類を審査・差し戻す",       group: "選考",   desc: "提出書類の確認・差し戻し" },
  { key: "enrollment.manage",  label: "入学手続きを管理する",       group: "手続き", desc: "STEP承認・署名確認・許可書発行" },
  { key: "announcement.send",  label: "お知らせを一斉送信する",     group: "通知",   desc: "お知らせの一斉配信" },
  { key: "cohort.manage",      label: "選考（回次）を操作する",     group: "設定",   desc: "選考バッチの作成/編集/削除" },
  { key: "form.edit",          label: "出願フォームを編集する",     group: "設定",   desc: "出願フォーム項目の編集" },
  { key: "data.export",        label: "データをエクスポートする",   group: "データ", desc: "申請データのCSV出力" },
  { key: "application.delete", label: "申請を削除する",             group: "データ", desc: "申請レコードの削除" },
  { key: "account.manage",     label: "アカウントを管理する",       group: "設定",   desc: "管理者アカウントの作成/編集（超管理者のみ）" },
];

export const ALL_CAPS: string[] = CAPABILITIES.map((c) => c.key);

// マトリクスで編集できるロール（super_admin は常に全権限なので対象外）
export const MANAGEABLE_ROLES = ["admin", "sales", "academic", "interviewer"] as const;
export type ManageableRole = (typeof MANAGEABLE_ROLES)[number];

// 超管理者固定の権限（マトリクスでは付与不可）
export const SUPERADMIN_ONLY: string[] = ["account.manage"];

// 合否「決定」とみなすステータス（これらに変更する時だけ result.decide を要求）
export const DECISION_STATUSES = ["合格", "不合格", "補欠合格", "保留"];

// デフォルト権限（＝現状の挙動を保持。未設定時に適用）
//   admin: アカウント管理以外すべて
//   sales: フォーム編集・選考操作・アカウント管理 以外（従来の営業ロール）
//   academic: 教務。選考（合否・書類・回次）と通知（案内/合否/お知らせ）を担当
//   interviewer: 既定は空（従来どおりゲート操作不可。必要なら超管理者が付与）
export const DEFAULT_ROLE_CAPS: Record<string, string[]> = {
  admin: ALL_CAPS.filter((c) => !SUPERADMIN_ONLY.includes(c)),
  sales: ["result.decide", "notification.send", "document.review", "enrollment.manage", "announcement.send", "data.export", "application.delete"],
  academic: ["result.decide", "notification.send", "document.review", "announcement.send", "cohort.manage"],
  interviewer: [],
};

const SETTING_KEY = "role_permissions";
let cache: { value: Record<string, string[]> | null; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

export function invalidatePermissionCache(): void {
  cache = null;
}

async function loadConfig(): Promise<Record<string, string[]> | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  let value: Record<string, string[]> | null = null;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    if (row) value = JSON.parse(row.value) as Record<string, string[]>;
  } catch {
    value = null;
  }
  cache = { value, at: Date.now() };
  return value;
}

/** ロールの有効権限集合。super_admin は全権限、未設定ロールはデフォルト。 */
export async function getRoleCapabilities(role: string): Promise<Set<string>> {
  if (role === "super_admin") return new Set(ALL_CAPS);
  const cfg = await loadConfig();
  const caps = cfg && Array.isArray(cfg[role]) ? cfg[role] : (DEFAULT_ROLE_CAPS[role] ?? []);
  return new Set(caps);
}

/** セッションが指定権限を持つか。super_admin は常に true。 */
export async function hasCapability(session: AdminSession | null, cap: string): Promise<boolean> {
  if (!session) return false;
  if (session.role === "super_admin") return true;
  if (SUPERADMIN_ONLY.includes(cap)) return false;
  const caps = await getRoleCapabilities(session.role);
  return caps.has(cap);
}

/** UI/保存用の現在マトリクス（編集可能ロールのみ）。 */
export async function getMatrix(): Promise<Record<string, string[]>> {
  const cfg = await loadConfig();
  const out: Record<string, string[]> = {};
  for (const r of MANAGEABLE_ROLES) {
    out[r] = cfg && Array.isArray(cfg[r]) ? cfg[r] : (DEFAULT_ROLE_CAPS[r] ?? []);
  }
  return out;
}

/** マトリクス保存。編集可能ロール・有効cap のみに正規化（account.manage は除外）。 */
export async function saveMatrix(
  matrix: Record<string, string[]>,
  updatedBy?: string | null,
): Promise<void> {
  const clean: Record<string, string[]> = {};
  for (const r of MANAGEABLE_ROLES) {
    const list = Array.isArray(matrix[r]) ? matrix[r] : [];
    clean[r] = ALL_CAPS.filter((c) => !SUPERADMIN_ONLY.includes(c) && list.includes(c));
  }
  const value = JSON.stringify(clean);
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value, updatedBy: updatedBy ?? null },
    update: { value, updatedBy: updatedBy ?? null },
  });
  invalidatePermissionCache();
}
