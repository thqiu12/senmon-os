/**
 * テナント隔離の心臓 — Prisma `$extends` で全クエリを organizationId にスコープする。
 *
 * - フィルタ可能 op(findMany/findFirst/count/aggregate/groupBy/updateMany/deleteMany):
 *     where に organizationId を注入。
 * - create/createMany: data に organizationId を注入。
 * - findUnique/findUniqueOrThrow(unique where は追加フィルタ不可): 実行後に org を後検査。
 * - update/delete(unique where): where に organizationId を併記 → 他テナント行は Record not found。
 * - upsert: where に併記 + create に注入。
 *
 * 主enforcement。万一の漏れは Plan 3 の Postgres RLS が backstop。
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models.map((m) => m.name).filter((n) => n !== "Organization"),
);

const FILTER_WHERE = new Set([
  "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
  "updateMany", "deleteMany",
]);
const UNIQUE_READ = new Set(["findUnique", "findUniqueOrThrow"]);
const UNIQUE_WRITE = new Set(["update", "delete"]);

export function tenantPrisma(organizationId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const a: any = args ?? {};

          if (FILTER_WHERE.has(operation)) {
            a.where = { ...(a.where ?? {}), organizationId };
            return query(a);
          }
          if (operation === "create") {
            a.data = { ...(a.data ?? {}), organizationId };
            return query(a);
          }
          if (operation === "createMany") {
            const d = a.data;
            a.data = Array.isArray(d)
              ? d.map((x: any) => ({ ...x, organizationId }))
              : { ...(d ?? {}), organizationId };
            return query(a);
          }
          if (UNIQUE_WRITE.has(operation)) {
            // unique where に organizationId を併記 → 他テナントの行は一致せず Record not found
            a.where = { ...(a.where ?? {}), organizationId };
            return query(a);
          }
          if (operation === "upsert") {
            a.where = { ...(a.where ?? {}), organizationId };
            a.create = { ...(a.create ?? {}), organizationId };
            return query(a);
          }
          if (UNIQUE_READ.has(operation)) {
            // unique where は追加フィルタ不可。実行後に org を後検査。
            const res: any = await query(a);
            if (res && res.organizationId !== organizationId) {
              if (operation === "findUniqueOrThrow") {
                throw new Prisma.PrismaClientKnownRequestError(
                  "No record found for the given tenant", { code: "P2025", clientVersion: Prisma.prismaVersion.client },
                );
              }
              return null;
            }
            return res;
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantPrisma>;
