import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";

/**
 * 操作ログ（監査ログ）。管理側の書込操作を1行ずつ記録する。
 *
 * 方針:
 *  - logAudit は「本処理の後始末」。失敗しても本処理を壊さない（内部 try/catch、console.error のみ）。
 *  - 操作者名・対象ラベルは操作時のスナップショットで保存（後のリネーム/削除でも読める）。
 *  - キー定数・ラベルは lib/auditActions.ts（prisma 非依存＝クライアントからも使える）に置く。
 */

export { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, auditActionLabel } from "@/lib/auditActions";

export interface AuditEntry {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  summary: string;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * 操作ログを1件記録する。失敗しても呼び出し元の処理は壊さない（throw しない）。
 * actor は session から補完し、表示名は AdminUser からスナップショットする。
 */
export async function logAudit(session: AdminSession | null, entry: AuditEntry): Promise<void> {
  try {
    let actorId: string | null = null;
    let actorName = "システム";
    let actorRole: string | null = null;

    if (session?.userId) {
      actorId = session.userId;
      actorRole = session.role ?? null;
      const user = await prisma.adminUser
        .findUnique({ where: { id: session.userId }, select: { displayName: true, username: true, role: true } })
        .catch(() => null);
      if (user) {
        actorName = user.displayName || user.username || actorId;
        actorRole = user.role || actorRole;
      } else {
        actorName = actorId;
      }
    }

    await prisma.auditLog.create({
      data: {
        actorId,
        actorName,
        actorRole,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ?? null,
        summary: entry.summary,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    // 監査ログの失敗は本処理に影響させない。
    console.error("logAudit failed:", err);
  }
}
