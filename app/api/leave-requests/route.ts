import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, verifyStudentOwnership } from "@/lib/auth";

// GET
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const status = searchParams.get("status");
    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    const requests = await prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { student: { select: { id: true, studentNo: true, lastName: true, firstName: true } } },
    });
    return NextResponse.json(requests);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: 学生が欠席届を提出
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, applicationNo, email, type, startDate, endDate, reason } = body;
    if (!studentId || !type || !startDate || !endDate || !reason) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }
    // 学生の存在確認（学生自身 or 管理者）
    const session = await getSession(request);
    if (!isAdmin(session)) {
      // 学生本人確認
      if (!applicationNo || !email) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }
    const leave = await prisma.leaveRequest.create({
      data: { id: crypto.randomUUID(), studentId, type, startDate, endDate, reason, status: "申請中", updatedAt: new Date() },
    });
    return NextResponse.json(leave, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "申請に失敗しました" }, { status: 500 });
  }
}

// PATCH: 管理者が承認/却下
export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const body = await request.json();
    const leave = await prisma.leaveRequest.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.adminNote !== undefined && { adminNote: body.adminNote }),
        ...(body.status !== "申請中" && { reviewedAt: new Date(), reviewedBy: body.reviewedBy || "管理者" }),
        ...(body.proofFilePath && { proofFilePath: body.proofFilePath }),
        ...(body.proofFileName && { proofFileName: body.proofFileName }),
      },
    });
    return NextResponse.json(leave);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
