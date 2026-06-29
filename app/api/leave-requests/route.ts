import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin, verifyStudentOwnership } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { LeaveRequestSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const LEAVE_STATUSES = new Set(["申請中", "承認", "却下"]);

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const status = searchParams.get("status");
    const where: Prisma.LeaveRequestWhereInput = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    const requests = await getTenantDb().leaveRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { id: true, studentNo: true, lastName: true, firstName: true } },
      },
      take: 1000,
    });
    return NextResponse.json(requests);
  } catch (e) {
    logError("GET /api/leave-requests", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

const StudentPostSchema = LeaveRequestSchema.extend({
  applicationNo: z.string().max(50).optional(),
  email: z.string().email().max(254).optional(),
});

export const POST = withTenant(async (request: NextRequest) => {
  try {
    const parsed = StudentPostSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { studentId, type, startDate, endDate, reason, applicationNo, email } = parsed.data;

    const db = getTenantDb();
    const session = await getSession(request);
    if (!isAdmin(session)) {
      if (!applicationNo || !email) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      }
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) {
        return NextResponse.json({ error: "本人確認に失敗しました" }, { status: 401 });
      }
      const student = await db.student.findFirst({
        where: { id: studentId },
        select: { applicationId: true },
      });
      if (!student || student.applicationId !== ownership.applicationId) {
        return NextResponse.json({ error: "この学生の申請権限がありません" }, { status: 403 });
      }
    }

    const leave = await db.leaveRequest.create({
      data: { studentId, type, startDate, endDate, reason, status: "申請中" },
    });
    return NextResponse.json(leave, { status: 201 });
  } catch (e) {
    logError("POST /api/leave-requests", e);
    return NextResponse.json({ error: "申請に失敗しました" }, { status: 500 });
  }
});

export const PATCH = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const body = await request.json();
    if (body.status && !LEAVE_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "ステータスが不正です" }, { status: 400 });
    }
    const leave = await getTenantDb().leaveRequest.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.adminNote !== undefined && { adminNote: body.adminNote }),
        ...(body.status && body.status !== "申請中" && {
          reviewedAt: new Date(),
          reviewedBy: session?.userId ?? "管理者",
        }),
        ...(body.proofFilePath && { proofFilePath: body.proofFilePath }),
        ...(body.proofFileName && { proofFileName: body.proofFileName }),
      },
    });
    return NextResponse.json(leave);
  } catch (e) {
    logError("PATCH /api/leave-requests", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});
