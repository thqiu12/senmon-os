import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

// すべて 0-token の純統計/規則。申請データを1回読んで予測・チャネル・重複を一括算出。
const PIPELINE = new Set(["受付中", "書類待ち", "書類確認中", "面接待ち", "結果待ち"]);

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/[\s　]+/g, "");
const normEssay = (s: string | null | undefined) => (s || "").trim().replace(/[\s　]+/g, " ").toLowerCase();

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const [apps, quotas] = await Promise.all([
      prisma.application.findMany({
        where: { deletedAt: null },
        select: {
          id: true, schoolName: true, department: true, enrollmentYear: true, status: true,
          agentId: true, agent: { select: { name: true } },
          lastName: true, firstName: true, birthDate: true, email: true, phone: true,
          address: true, addressDetail: true, applicationReason: true,
          enrollmentProcedure: { select: { completedAt: true } },
          documents: { select: { status: true } },
        },
      }),
      prisma.enrollmentQuota.findMany(),
    ]);

    // ===== #6 入学予測 / 漏斗 =====
    const fkey = (s: string, d: string, y: string) => `${s}__${d}__${y}`;
    type FNode = {
      schoolName: string; department: string; enrollmentYear: string;
      total: number; pipeline: number; accepted: number; waitlist: number; hold: number; rejected: number; enrolled: number;
    };
    const fmap = new Map<string, FNode>();
    const node = (s: string, d: string, y: string): FNode => {
      const k = fkey(s, d, y);
      let n = fmap.get(k);
      if (!n) { n = { schoolName: s, department: d, enrollmentYear: y, total: 0, pipeline: 0, accepted: 0, waitlist: 0, hold: 0, rejected: 0, enrolled: 0 }; fmap.set(k, n); }
      return n;
    };
    for (const a of apps) {
      const n = node(a.schoolName, a.department, a.enrollmentYear);
      n.total++;
      if (a.status === "合格") n.accepted++;
      else if (a.status === "補欠合格") n.waitlist++;
      else if (a.status === "保留") n.hold++;
      else if (a.status === "不合格" || a.status === "辞退") n.rejected++;
      else if (PIPELINE.has(a.status)) n.pipeline++;
      if (a.enrollmentProcedure?.completedAt) n.enrolled++;
    }
    const quotaMap = new Map(quotas.map((q) => [fkey(q.schoolName, q.department, q.enrollmentYear), q.quota]));
    const forecast = Array.from(fmap.values()).map((n) => {
      const decided = n.accepted + n.rejected;
      const acceptRate = decided > 0 ? n.accepted / decided : null; // 観測値
      const enrollRate = n.accepted > 0 ? n.enrolled / n.accepted : null; // 観測値
      const effEnroll = enrollRate ?? 0.9; // データが無ければ「合格者の大半が入学」を仮定
      const projectedAccepted = n.accepted + Math.round(n.pipeline * (acceptRate ?? 0.5));
      const projectedEnrolled = Math.max(n.enrolled, Math.round(projectedAccepted * effEnroll));
      const quota = quotaMap.get(fkey(n.schoolName, n.department, n.enrollmentYear)) ?? null;
      return {
        ...n,
        quota,
        acceptRate: acceptRate != null ? Math.round(acceptRate * 100) : null,
        enrollRate: enrollRate != null ? Math.round(enrollRate * 100) : null,
        projectedEnrolled,
        fillNow: quota && quota > 0 ? Math.round((n.accepted / quota) * 100) : null,
        projectedFill: quota && quota > 0 ? Math.round((projectedEnrolled / quota) * 100) : null,
      };
    }).sort((a, b) => (a.schoolName + a.department).localeCompare(b.schoolName + b.department, "ja"));

    // ===== #7 チャネル品質 =====
    type CNode = { agentId: string | null; agentName: string; total: number; accepted: number; decided: number; declined: number; docIssue: number; essays: string[] };
    const cmap = new Map<string, CNode>();
    const cnode = (id: string | null, name: string): CNode => {
      const k = id ?? "__direct__";
      let c = cmap.get(k);
      if (!c) { c = { agentId: id, agentName: name, total: 0, accepted: 0, decided: 0, declined: 0, docIssue: 0, essays: [] }; cmap.set(k, c); }
      return c;
    };
    for (const a of apps) {
      const c = cnode(a.agentId, a.agent?.name ?? "（直接出願）");
      c.total++;
      if (a.status === "合格") { c.accepted++; c.decided++; }
      else if (a.status === "不合格") c.decided++;
      else if (a.status === "辞退") c.declined++;
      if (a.documents.some((d) => d.status === "差し戻し")) c.docIssue++;
      if (normEssay(a.applicationReason).length >= 20) c.essays.push(normEssay(a.applicationReason));
    }
    const channels = Array.from(cmap.values()).map((c) => {
      // 模板化: 同一エージェント内で重複する志望動機の割合
      const counts = new Map<string, number>();
      c.essays.forEach((e) => counts.set(e, (counts.get(e) ?? 0) + 1));
      let dup = 0;
      counts.forEach((v) => { if (v > 1) dup += v; });
      return {
        agentId: c.agentId,
        agentName: c.agentName,
        total: c.total,
        accepted: c.accepted,
        acceptRate: c.decided > 0 ? Math.round((c.accepted / c.decided) * 100) : null,
        declineRate: c.total > 0 ? Math.round((c.declined / c.total) * 100) : 0,
        docIssueRate: c.total > 0 ? Math.round((c.docIssue / c.total) * 100) : 0,
        templateRate: c.essays.length > 0 ? Math.round((dup / c.essays.length) * 100) : 0,
      };
    }).sort((a, b) => b.total - a.total);

    // ===== #8 重複 / 異常検知 =====
    type Group = { label: string; count: number; detail: string };
    const groupBy = (keyFn: (a: typeof apps[number]) => string | null, labelFn: (a: typeof apps[number]) => string) => {
      const m = new Map<string, typeof apps>();
      for (const a of apps) {
        const k = keyFn(a);
        if (!k) continue;
        const arr = m.get(k) ?? [];
        arr.push(a);
        m.set(k, arr);
      }
      const out: Group[] = [];
      m.forEach((arr) => {
        if (arr.length > 1) {
          const names = Array.from(new Set(arr.map((a) => `${a.lastName}${a.firstName}`)));
          const schools = Array.from(new Set(arr.map((a) => a.schoolName)));
          out.push({
            label: labelFn(arr[0]),
            count: arr.length,
            detail: `氏名: ${names.join("・")} ｜ 校: ${schools.join("・")}`,
          });
        }
      });
      return out.sort((a, b) => b.count - a.count).slice(0, 50);
    };

    const anomalies = {
      // 同一人物の可能性（氏名+生年月日）→ 併願や二重出願
      duplicatePeople: groupBy(
        (a) => (a.birthDate ? norm(a.lastName) + norm(a.firstName) + "|" + norm(a.birthDate) : null),
        (a) => `${a.lastName}${a.firstName}（${a.birthDate}）`,
      ),
      sameEmail: groupBy((a) => norm(a.email) || null, (a) => a.email),
      samePhone: groupBy((a) => norm(a.phone) || null, (a) => a.phone),
      sameAddress: groupBy(
        (a) => norm(a.address + (a.addressDetail || "")) || null,
        (a) => `${a.address}${a.addressDetail || ""}`.slice(0, 40),
      ),
      reusedEssays: (() => {
        const m = new Map<string, typeof apps>();
        for (const a of apps) {
          const e = normEssay(a.applicationReason);
          if (e.length < 20) continue;
          const arr = m.get(e) ?? [];
          arr.push(a);
          m.set(e, arr);
        }
        const out: Group[] = [];
        m.forEach((arr, e) => {
          if (arr.length > 1) {
            const names = Array.from(new Set(arr.map((a) => `${a.lastName}${a.firstName}`)));
            out.push({ label: e.slice(0, 50) + (e.length > 50 ? "…" : ""), count: arr.length, detail: `氏名: ${names.join("・")}` });
          }
        });
        return out.sort((a, b) => b.count - a.count).slice(0, 50);
      })(),
    };

    return NextResponse.json({
      generatedAt: new Date(),
      totalApplications: apps.length,
      forecast,
      channels,
      anomalies,
    });
  } catch (e) {
    logError("GET /api/admin/analytics", e);
    return NextResponse.json({ error: "分析に失敗しました" }, { status: 500 });
  }
}
