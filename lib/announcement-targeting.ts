import type { Prisma } from "@prisma/client";

/**
 * お知らせの送信対象フィルター。
 * 選考バッチ(第N期) × 学校 × ステータス を AND で組み合わせる。
 * 各フィールドが空なら「指定なし（全件）」。
 *
 * このビルダーを実送信(handleSend)と件数プレビューの両方で共有し、
 * プレビュー件数と実際の送信件数が必ず一致するようにする。
 */
export interface TargetFilter {
  /** "合格者" のとき status を 合格＋補欠合格 に展開（レガシー互換／合格者プリセット） */
  targetType?: string | null;
  targetCohortId?: string | null;
  targetSchool?: string | null;
  targetStatus?: string | null;
}

export function buildRecipientWhere(f: TargetFilter): Prisma.ApplicationWhereInput {
  // 論理削除（ゴミ箱）された出願は通知対象から除外
  const where: Prisma.ApplicationWhereInput = { deletedAt: null };

  // ステータス：合格者プリセットは合格＋補欠合格、それ以外は単一指定
  if (f.targetType === "合格者") {
    where.status = { in: ["合格", "補欠合格"] };
  } else if (f.targetStatus) {
    where.status = f.targetStatus;
  }

  // 選考バッチ（第N期）
  if (f.targetCohortId) {
    where.cohortId = f.targetCohortId;
  }

  // 学校（主志望 schoolName または 併願 applicationSchools のいずれかに一致）
  if (f.targetSchool) {
    where.OR = [
      { schoolName: f.targetSchool },
      { applicationSchools: { some: { schoolName: f.targetSchool } } },
    ];
  }

  return where;
}
