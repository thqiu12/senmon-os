import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability, DECISION_STATUSES } from "@/lib/permissions";
import { ApplicationPatchSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";
import { getClientIp } from "@/lib/security";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export const GET = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const session = await getSession(request);
    const isAdmin = checkAdmin(session);

    const application = await getTenantDb().application.findFirst({
      where: { id: params.id },
      include: {
        documents: true,
        adminNotes: { orderBy: { createdAt: "desc" } },
        enrollmentProcedure: true,
        enrollmentSignature: true,
        agent: true,
        cohort: { select: { id: true, name: true } },
        applicationSchools: { orderBy: { priority: "asc" }, include: { applyDepartment: { select: { hasWrittenExam: true } } } },
        changeRequests: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    if (!isAdmin) {
      if (!email || application.email !== email) {
        return NextResponse.json({ error: "アクセスが拒否されました" }, { status: 403 });
      }
      const { adminMemo: _m, interviewEmailSent: _ies, resultEmailSent: _res, ...publicData } = application as
        & typeof application
        & { adminMemo?: unknown; interviewEmailSent?: unknown; resultEmailSent?: unknown };
      return NextResponse.json(publicData);
    }

    return NextResponse.json(application);
  } catch (error) {
    logError("GET /api/applications/[id]", error);
    return NextResponse.json({ error: "申請の取得に失敗しました" }, { status: 500 });
  }
});

export const PATCH = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);
  if (!checkAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const db = getTenantDb();
    const parsed = ApplicationPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // 操作ログ用に変更前の状態を控える（status の from→to に使う）
    const before = await db.application.findFirst({
      where: { id: params.id },
      select: { status: true, applicationNo: true, lastName: true, firstName: true },
    });

    if (body.cohortId) {
      const exists = await db.cohort.findFirst({ where: { id: body.cohortId }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: "cohortId が無効です" }, { status: 400 });
    }
    if (body.agentId) {
      const exists = await db.agent.findFirst({ where: { id: body.agentId }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: "agentId が無効です" }, { status: 400 });
    }

    const updateData: Prisma.ApplicationUpdateInput = {};
    if (body.status !== undefined) {
      // 合否「決定」への変更は result.decide 権限が必要（一般編集は admin/sales 可）
      if (DECISION_STATUSES.includes(body.status) && !(await hasCapability(session, "result.decide"))) {
        return NextResponse.json({ error: "合否を決定する権限がありません" }, { status: 403 });
      }
      updateData.status = body.status;
    }
    if (body.adminMemo !== undefined) updateData.adminMemo = body.adminMemo;
    if (body.interviewDate !== undefined) updateData.interviewDate = body.interviewDate;
    if (body.interviewTime !== undefined) updateData.interviewTime = body.interviewTime;
    if (body.interviewPlace !== undefined) updateData.interviewPlace = body.interviewPlace;
    if (body.interviewNotes !== undefined) updateData.interviewNotes = body.interviewNotes;
    if (body.interviewEmailSent !== undefined) updateData.interviewEmailSent = body.interviewEmailSent;
    if (body.resultEmailSent !== undefined) updateData.resultEmailSent = body.resultEmailSent;
    if (body.agentId !== undefined) {
      updateData.agent = body.agentId ? { connect: { id: body.agentId } } : { disconnect: true };
    }
    if (body.cohortId !== undefined) {
      updateData.cohort = body.cohortId ? { connect: { id: body.cohortId } } : { disconnect: true };
    }
    if (body.examMode !== undefined) updateData.examMode = body.examMode;
    if (body.referrerName !== undefined) updateData.referrerName = body.referrerName;
    if (body.referrerType !== undefined) updateData.referrerType = body.referrerType;

    const includeFull = {
      documents: true,
      adminNotes: { orderBy: { createdAt: "desc" } },
      enrollmentProcedure: true,
      enrollmentSignature: true,
      agent: true,
      cohort: { select: { id: true, name: true } },
      applicationSchools: { orderBy: { priority: "asc" }, include: { applyDepartment: { select: { hasWrittenExam: true } } } },
      changeRequests: { orderBy: { createdAt: "desc" } },
    } as const;

    const application = await db.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: params.id },
        data: updateData,
        include: includeFull,
      });

      if (body.status === "合格" || body.status === "補欠合格") {
        const existing = await tx.enrollmentProcedure.findFirst({
          where: { applicationId: params.id },
        });
        if (!existing) {
          const cohort = updated.cohort
            ? await tx.cohort.findFirst({ where: { id: updated.cohort.id } })
            : null;
          // 入学手続き書類は フォーム管理（section=入学手続き書類・学校別）から生成。
          // 学校固有が全校共通(schoolId=null)を上書き。未設定なら従来の既定にフォールバック。
          let appSchoolKey: string | null = null;
          if (updated.applySchoolId) {
            const as = await tx.applySchool.findFirst({ where: { id: updated.applySchoolId }, select: { schoolKey: true } });
            appSchoolKey = as?.schoolKey ?? null;
          }
          const enrollDocFields = await tx.formFieldConfig.findMany({
            where: {
              fieldType: "file",
              section: "入学手続き書類",
              OR: [{ schoolId: null }, ...(appSchoolKey ? [{ schoolId: appSchoolKey }] : [])],
            },
            orderBy: { displayOrder: "asc" },
          });
          const byKey = new Map<string, (typeof enrollDocFields)[number]>();
          for (const f of enrollDocFields) {
            const prev = byKey.get(f.fieldKey);
            if (!prev || (f.schoolId && !prev.schoolId)) byKey.set(f.fieldKey, f); // 学校固有を優先
          }
          const configured = Array.from(byKey.values())
            .filter((f) => f.isEnabled)
            .sort((a, b) => a.displayOrder - b.displayOrder);
          const checklistItems = configured.length > 0
            ? configured.map((f) => ({ name: f.label, required: f.isRequired, done: false }))
            : [
                { name: "入学誓約書", required: true, done: false },
                { name: "経費支弁能力を証明する書類", required: true, done: false },
                { name: "健康診断書", required: false, done: false },
                { name: "最終学歴証明書（原本）", required: true, done: false },
                { name: "パスポートコピー", required: true, done: false },
                { name: "在留カードコピー", required: false, done: false },
                { name: "証明写真（4枚）", required: true, done: false },
              ];
          const defaultChecklist = JSON.stringify(checklistItems);
          // 選考モード別の学費があれば、Application.examMode に対応する金額を採用
          let tuitionAmount = cohort?.defaultTuitionAmount ?? null;
          if (cohort?.examModeTuitionAmounts && updated.examMode) {
            try {
              const map = JSON.parse(cohort.examModeTuitionAmounts) as Record<string, string>;
              if (map[updated.examMode]) tuitionAmount = map[updated.examMode];
            } catch { /* ignore parse errors, fall back to default */ }
          }
          await tx.enrollmentProcedure.create({
            data: {
              applicationId: params.id,
              instructions:
                "おめでとうございます！入学手続きを以下の手順で完了してください。\n\n① 学費をお振込みください\n② 必要書類をアップロードしてください\n③ 入学誓約書に電子署名してください\n④ すべて完了したら「手続き完了を報告する」ボタンを押してください\n\nご不明な点は入学相談室（平日9:00〜17:00）までお問い合わせください。",
              status: "案内済み",
              publishedAt: new Date(),
              docChecklist: defaultChecklist,
              tuitionPlan: cohort?.defaultTuitionPlan ?? "全額",
              tuitionAmount,
              tuitionAmount2: cohort?.defaultTuitionAmount2 ?? null,
              tuitionBankInfo: cohort?.defaultTuitionBankInfo ?? null,
              step1Deadline: cohort?.defaultTuitionDeadline ?? null,
              tuitionDeadline2: cohort?.defaultTuitionDeadline2 ?? null,
              step2Deadline: cohort?.defaultStep2Deadline ?? null,
              step3Deadline: cohort?.defaultStep3Deadline ?? null,
            },
          });
        } else if (!existing.publishedAt) {
          await tx.enrollmentProcedure.update({
            where: { applicationId: params.id },
            data: { publishedAt: new Date(), status: "案内済み" },
          });
        }
      }

      if (body.addNote) {
        const user = session ? await tx.adminUser.findFirst({
          where: { id: session.userId },
          select: { displayName: true, username: true },
        }) : null;
        await tx.adminNote.create({
          data: {
            applicationId: params.id,
            content: body.addNote,
            author: user?.displayName || user?.username || "管理者",
            // フラグが明示的に true で来た時のみ学生公開。後方互換: 未指定は内部メモ。
            visibleToStudent: body.noteVisibleToStudent === true,
          },
        });
      }

      // 副作用（procedure 作成・note 追加）後の最新状態を返す
      return tx.application.findFirst({ where: { id: params.id }, include: includeFull });
    });

    // 操作ログ: ステータス変更はそれ専用、それ以外の編集は update として記録
    const label = `${before?.applicationNo ?? params.id} ${before?.lastName ?? ""}${before?.firstName ?? ""}`.trim();
    if (body.status !== undefined && body.status !== before?.status) {
      await logAudit(session, {
        action: AUDIT_ACTIONS.APPLICATION_STATUS,
        targetType: "Application", targetId: params.id, targetLabel: label,
        summary: `出願「${label}」を ${before?.status ?? "?"} → ${body.status} に変更`,
        meta: { from: before?.status ?? null, to: body.status },
        ip: getClientIp(request),
      });
    } else {
      await logAudit(session, {
        action: AUDIT_ACTIONS.APPLICATION_UPDATE,
        targetType: "Application", targetId: params.id, targetLabel: label,
        summary: `出願「${label}」を編集`,
        ip: getClientIp(request),
      });
    }

    return NextResponse.json(application);
  } catch (error) {
    logError("PATCH /api/applications/[id]", error);
    return NextResponse.json({ error: "申請の更新に失敗しました" }, { status: 500 });
  }
});

export const DELETE = withTenant(async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const session = await getSession(request);
  try {
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!(await hasCapability(session, "application.delete"))) {
      return NextResponse.json({ error: "申請を削除する権限がありません" }, { status: 403 });
    }
    const db = getTenantDb();
    // 論理削除（ゴミ箱へ）。データ・書類・履歴は保持され、削除済みビューから復元できる。
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
    const admin = await db.adminUser.findFirst({ where: { id: session.userId }, select: { displayName: true } });
    const deleted = await db.application.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), deletedBy: admin?.displayName || session.userId, deleteReason: reason },
    });
    const delLabel = `${deleted.applicationNo} ${deleted.lastName}${deleted.firstName}`.trim();
    await logAudit(session, {
      action: AUDIT_ACTIONS.APPLICATION_DELETE,
      targetType: "Application", targetId: params.id, targetLabel: delLabel,
      summary: `出願「${delLabel}」を削除${reason ? `（理由: ${reason}）` : ""}`,
      meta: reason ? { reason } : null,
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("DELETE /api/applications/[id]", error);
    return NextResponse.json({ error: "申請の削除に失敗しました" }, { status: 500 });
  }
});
