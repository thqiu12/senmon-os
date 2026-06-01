import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

// POST /api/applications/:id/submit
// 学生が出願を最終提出（書類待ち → 受付中）するためのエンドポイント
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({} as { email?: string }));
    const email = body?.email;

    const application = await prisma.application.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, email: true },
    });

    if (!application) {
      return NextResponse.json({ error: "出願が見つかりません" }, { status: 404 });
    }

    // 本人確認：管理者、またはメールアドレス一致の本人のみ提出可能
    const session = await getSession(request);
    if (!isAdmin(session) && (!email || application.email !== email)) {
      return NextResponse.json({ error: "アクセスが拒否されました" }, { status: 403 });
    }

    if (application.status !== "書類待ち") {
      return NextResponse.json(
        { error: `この出願はすでに「${application.status}」の状態です` },
        { status: 400 }
      );
    }

    const updated = await prisma.application.update({
      where: { id: params.id },
      data: { status: "受付中" },
      select: { id: true, applicationNo: true, status: true },
    });

    return NextResponse.json({ success: true, ...updated });
  } catch (error) {
    console.error("POST /api/applications/[id]/submit error:", error);
    return NextResponse.json({ error: "提出に失敗しました" }, { status: 500 });
  }
}
