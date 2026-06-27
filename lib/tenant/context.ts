/**
 * テナント文脈(AsyncLocalStorage)。
 * リクエストごとに organizationId を持ち、getTenantDb() / tenantPrisma がこれを使う。
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type TenantCtx = { organizationId: string; isPlatform?: boolean };

const als = new AsyncLocalStorage<TenantCtx>();

export function runWithTenant<T>(ctx: TenantCtx, fn: () => T): T {
  return als.run(ctx, fn);
}

export function currentOrgId(): string | null {
  return als.getStore()?.organizationId ?? null;
}

export function isPlatform(): boolean {
  return als.getStore()?.isPlatform === true;
}

export function requireOrgId(): string {
  const id = currentOrgId();
  if (!id) throw new Error("テナント文脈が未設定です(runWithTenant の外で DB アクセス)");
  return id;
}
