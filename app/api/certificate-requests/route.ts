import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

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
    const reqs = await prisma.certificateRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { student: { select: { id: true, studentNo: true, lastName: true, firstName: true, school: { select: { name: true } } } } },
    });
    return NextResponse.json(reqs);
  } catch (e) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

// POST: 学生が証明書申請
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, type, purpose, copies } = body;
    if (!studentId || !type) return NextResponse.json({ error: "studentIdとtypeは必須です" }, { status: 400 });
    const req = await prisma.certificateRequest.create({
      data: { studentId, type, purpose: purpose || null, copies: copies || 1, status: "申請中" },
    });
    return NextResponse.json(req, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "申請に失敗しました" }, { status: 500 });
  }
}

// PATCH: 管理者が承認・発行
export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const body = await request.json();
    const req = await prisma.certificateRequest.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.adminNote !== undefined && { adminNote: body.adminNote }),
        ...(body.pdfPath && { pdfPath: body.pdfPath }),
        ...(body.status === "発行済" && { issuedAt: new Date(), issuedBy: body.issuedBy || "管理者" }),
      },
    });
    return NextResponse.json(req);
  } catch (e) {
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
