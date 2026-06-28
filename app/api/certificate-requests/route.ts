import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { CertificateRequestSchema } from "@/lib/schemas";
import { logError } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

const ADMIN_PATCH_STATUSES = new Set(["申請中", "作成中", "承認済", "発行済", "却下"]);

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const status = searchParams.get("status");
    const where: Prisma.CertificateRequestWhereInput = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    const reqs = await getTenantDb().certificateRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          select: {
            id: true,
            studentNo: true,
            lastName: true,
            firstName: true,
            school: { select: { name: true } },
          },
        },
      },
      take: 1000,
    });
    return NextResponse.json(reqs);
  } catch (e) {
    logError("GET /api/certificate-requests", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

// POST: 管理者が学生のために申請を作成（学生本人は student-portal 経由）
export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const parsed = CertificateRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const req = await getTenantDb().certificateRequest.create({
      data: { ...parsed.data, status: "申請中" },
    });
    return NextResponse.json(req, { status: 201 });
  } catch (e) {
    logError("POST /api/certificate-requests", e);
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
    if (body.status && !ADMIN_PATCH_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "ステータスが不正です" }, { status: 400 });
    }
    const req = await getTenantDb().certificateRequest.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.adminNote !== undefined && { adminNote: body.adminNote }),
        ...(body.pdfPath && { pdfPath: body.pdfPath }),
        ...(body.status === "発行済" && { issuedAt: new Date(), issuedBy: session?.userId ?? "管理者" }),
      },
    });
    return NextResponse.json(req);
  } catch (e) {
    logError("PATCH /api/certificate-requests", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});
