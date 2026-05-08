import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, verifyStudentOwnership } from "@/lib/auth";

// GET: 署名取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get("applicationId");
    const applicationNo = searchParams.get("applicationNo");
    const email = searchParams.get("email");

    if (applicationId) {
      // 管理者のみ applicationId で取得可能
      const session = await getSession(request);
      if (!isAdmin(session)) {
        return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      }
      const signature = await prisma.enrollmentSignature.findUnique({ where: { applicationId } });
      return NextResponse.json({ signature: signature || null });
    }

    if (applicationNo && email) {
      // 学生本人確認（大文字小文字区別なし）
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) {
        return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
      }
      const signature = await prisma.enrollmentSignature.findUnique({ where: { applicationId: ownership.applicationId } });
      return NextResponse.json({ signature: signature || null });
    }

    return NextResponse.json({ error: "パラメータが不足しています" }, { status: 400 });
  } catch (error) {
    console.error("GET /api/enrollment/signature error:", error);
    return NextResponse.json({ error: "署名の取得に失敗しました" }, { status: 500 });
  }
}

// POST: 署名保存（学生が自分の申請に対して）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { applicationNo, email, signatureData, signerName } = body;

    if (!applicationNo || !email) {
      return NextResponse.json({ error: "applicationNoとemailが必要です" }, { status: 400 });
    }
    if (!signatureData) {
      return NextResponse.json({ error: "署名データが必要です" }, { status: 400 });
    }
    if (!signerName?.trim()) {
      return NextResponse.json({ error: "署名者名が必要です" }, { status: 400 });
    }

    // 本人確認
    const ownership = await verifyStudentOwnership(applicationNo, email);
    if (!ownership.valid) {
      return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
    }

    // 入学手続きが存在するか確認
    const proc = await prisma.enrollmentProcedure.findUnique({ where: { applicationId: ownership.applicationId } });
    if (!proc) {
      return NextResponse.json({ error: "入学手続きが開始されていません" }, { status: 400 });
    }

    const signature = await prisma.enrollmentSignature.upsert({
      where: { applicationId: ownership.applicationId! },
      create: { applicationId: ownership.applicationId!, signatureData, signerName: signerName.trim(), signedAt: new Date() },
      update: { signatureData, signerName: signerName.trim(), signedAt: new Date() },
    });

    return NextResponse.json({ success: true, signature });
  } catch (error) {
    console.error("POST /api/enrollment/signature error:", error);
    return NextResponse.json({ error: "署名の保存に失敗しました" }, { status: 500 });
  }
}
