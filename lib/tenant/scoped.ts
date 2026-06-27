/**
 * ルート/サーバ処理から使う scoped DB ヘルパ。
 * 文脈(runWithTenant)の organizationId にスコープされた Prisma クライアントを返す。
 */
import { tenantPrisma } from "./prisma-tenant";
import { requireOrgId } from "./context";

export function getTenantDb() {
  return tenantPrisma(requireOrgId());
}
