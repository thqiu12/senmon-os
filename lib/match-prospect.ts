import { getTenantDb } from "@/lib/tenant/scoped";

/**
 * 希望者リスト（Prospect）と Application の自動マッチング。
 *
 * テナント文脈内（withTenant ハンドラ）からのみ呼ばれる前提。
 * getTenantDb() で organizationId スコープの Prisma を取得する。
 * （呼び出し元: applications POST の自動マッチ・prospects/duplicates GET。いずれも withTenant 配下）
 *
 * 優先順位:
 *  1. email 完全一致（最強の識別子）
 *  2. lastName + firstName + birthDate 一致（メール変更時の保険）
 *  3. lastName + firstName のみ一致（最終手段。複数ヒット時はマッチ無し扱い）
 *
 * 既にマッチ済みの Prospect は除外。複数候補ヒット時は最古を採用（最初のエージェント優先）。
 */

export interface MatchInput {
  applicationId: string;
  email: string;
  lastName: string;
  firstName: string;
  birthDate?: string | null;
}

export interface MatchResult {
  prospect: { id: string; agentId: string; agentName: string } | null;
  matchType: "email" | "name-birth" | "name-only" | "none";
  candidates: number;
}

export async function matchProspect(input: MatchInput): Promise<MatchResult> {
  const db = getTenantDb();
  // email は大文字小文字を無視して照合するため小文字化（SQLite は既定で case-sensitive）
  const normEmail = input.email ? input.email.trim().toLowerCase() : "";

  // Step 1: email 一致（保存側も normalize 済み前提。後方互換のため両方の可能性に備える）
  if (normEmail) {
    const emailMatches = await db.prospect.findMany({
      where: { matchedApplicationId: null, NOT: { email: null } },
      orderBy: { referredAt: "asc" },
      include: { agent: { select: { name: true } } },
    });
    const byEmail = emailMatches.find(
      (p) => (p.email || "").trim().toLowerCase() === normEmail,
    );
    if (byEmail) {
      return {
        prospect: { id: byEmail.id, agentId: byEmail.agentId, agentName: byEmail.agent.name },
        matchType: "email",
        candidates: 1,
      };
    }
  }

  // Step 2: 氏名 + 生年月日。複数のエージェントがヒットした場合は曖昧なので
  // 自動採用せず admin の手動紐付けに委ねる（commission 誤付与防止）。
  if (input.birthDate) {
    const byNameBirth = await db.prospect.findMany({
      where: {
        lastName: input.lastName,
        firstName: input.firstName,
        birthDate: input.birthDate,
        matchedApplicationId: null,
      },
      orderBy: { referredAt: "asc" },
      include: { agent: { select: { name: true } } },
    });
    if (byNameBirth.length === 1) {
      const first = byNameBirth[0];
      return {
        prospect: { id: first.id, agentId: first.agentId, agentName: first.agent.name },
        matchType: "name-birth",
        candidates: 1,
      };
    }
    if (byNameBirth.length > 1) {
      // 曖昧。マッチ無し扱い（admin が /admin/prospects で手動紐付け）。
      return { prospect: null, matchType: "none", candidates: byNameBirth.length };
    }
  }

  // Step 3: 氏名のみ。複数ヒットは曖昧なのでマッチ無し扱い（admin が手動紐付け）
  const byName = await db.prospect.findMany({
    where: {
      lastName: input.lastName,
      firstName: input.firstName,
      matchedApplicationId: null,
    },
    orderBy: { referredAt: "asc" },
    include: { agent: { select: { name: true } } },
  });
  if (byName.length === 1) {
    return {
      prospect: { id: byName[0].id, agentId: byName[0].agentId, agentName: byName[0].agent.name },
      matchType: "name-only",
      candidates: 1,
    };
  }

  return { prospect: null, matchType: "none", candidates: byName.length };
}

/**
 * Application 作成後に Prospect をマッチして紐付ける。
 * Application.agentId にも prospect.agentId をセット（紐付け成功時のみ）。
 */
export async function linkProspectToApplication(input: MatchInput): Promise<MatchResult> {
  const db = getTenantDb();
  const result = await matchProspect(input);
  if (result.prospect) {
    await db.$transaction([
      db.prospect.update({
        where: { id: result.prospect.id },
        data: {
          matchedApplicationId: input.applicationId,
          matchedAt: new Date(),
          matchedBy: "auto",
          status: "出願済",
        },
      }),
      db.application.update({
        where: { id: input.applicationId },
        data: { agentId: result.prospect.agentId },
      }),
    ]);
  }
  return result;
}

/**
 * 重複検知: 同じ学生（email or 氏名+誕生日）が複数のエージェントから登録されているか調べる。
 * 名前のアルファベット順でソートして返す。
 */
export interface DuplicateGroup {
  key: string;
  reason: "email" | "name-birth" | "name";
  prospects: Array<{
    id: string;
    lastName: string;
    firstName: string;
    email: string | null;
    birthDate: string | null;
    agentName: string;
    referredAt: Date;
    status: string;
  }>;
}

export async function findDuplicateProspects(): Promise<DuplicateGroup[]> {
  const db = getTenantDb();
  const all = await db.prospect.findMany({
    where: { status: { not: "無効" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { referredAt: "asc" }],
    include: { agent: { select: { name: true } } },
  });

  const byEmail = new Map<string, typeof all>();
  const byNameBirth = new Map<string, typeof all>();
  const byName = new Map<string, typeof all>();

  for (const p of all) {
    if (p.email) {
      // email は小文字化キーでグループ化（casing 差を同一とみなす）
      const ek = p.email.trim().toLowerCase();
      const list = byEmail.get(ek) || [];
      list.push(p);
      byEmail.set(ek, list);
    }
    if (p.birthDate) {
      const key = `${p.lastName}|${p.firstName}|${p.birthDate}`;
      const list = byNameBirth.get(key) || [];
      list.push(p);
      byNameBirth.set(key, list);
    }
    const nameKey = `${p.lastName}|${p.firstName}`;
    const list = byName.get(nameKey) || [];
    list.push(p);
    byName.set(nameKey, list);
  }

  const groups: DuplicateGroup[] = [];
  const seenIds = new Set<string>();

  type RowT = typeof all[number];
  const toSummary = (p: RowT) => ({
    id: p.id, lastName: p.lastName, firstName: p.firstName,
    email: p.email, birthDate: p.birthDate, agentName: p.agent.name,
    referredAt: p.referredAt, status: p.status,
  });

  // Email 重複 (最も信頼性高い)
  Object.entries(Object.fromEntries(byEmail)).forEach(([email, list]) => {
    if (list.length > 1) {
      groups.push({
        key: email,
        reason: "email",
        prospects: list.map(toSummary),
      });
      list.forEach((p: RowT) => seenIds.add(p.id));
    }
  });

  // 氏名+誕生日 重複（既にいずれかのメンバーが email 重複で計上済みなら、
  // 同じ顔ぶれの再掲を避けるためスキップ）
  Object.entries(Object.fromEntries(byNameBirth)).forEach(([key, list]) => {
    if (list.length > 1 && !list.some((p: RowT) => seenIds.has(p.id))) {
      groups.push({
        key, reason: "name-birth",
        prospects: list.map(toSummary),
      });
      list.forEach((p: RowT) => seenIds.add(p.id));
    }
  });

  // 氏名のみ重複 (要 admin 判断。上位グループで計上済みは除外)
  Object.entries(Object.fromEntries(byName)).forEach(([key, list]) => {
    if (list.length > 1 && !list.some((p: RowT) => seenIds.has(p.id))) {
      groups.push({
        key, reason: "name",
        prospects: list.map(toSummary),
      });
      list.forEach((p: RowT) => seenIds.add(p.id));
    }
  });

  // 名前順（安全な文字列連結 + 同名は referredAt で安定ソート）
  groups.sort((a, b) => {
    const ap = a.prospects[0];
    const bp = b.prospects[0];
    const aName = `${ap?.lastName ?? ""}${ap?.firstName ?? ""}`;
    const bName = `${bp?.lastName ?? ""}${bp?.firstName ?? ""}`;
    const cmp = aName.localeCompare(bName, "ja");
    if (cmp !== 0) return cmp;
    return String(ap?.referredAt ?? "").localeCompare(String(bp?.referredAt ?? ""));
  });

  return groups;
}
