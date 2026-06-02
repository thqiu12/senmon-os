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
    const body = await request.json().catch(() => ({} as { email?: string; consent?: boolean }));
    const email = body?.email;
    const consent = body?.consent === true;

    const application = await prisma.application.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, email: true, consentAt: true },
    });

    if (!application) {
      return NextResponse.json({ error: "出願が見つかりません" }, { status: 404 });
    }

    // 本人確認：管理者、またはメールアドレス一致の本人のみ提出可能
    const session = await getSession(request);
    const admin = isAdmin(session);
    if (!admin && (!email || application.email !== email)) {
      return NextResponse.json({ error: "アクセスが拒否されました" }, { status: 403 });
    }

    // 個人情報取扱いへの同意（申請者本人の提出時は必須）。サーバ側でも強制する。
    if (!admin && !consent && !application.consentAt) {
      return NextResponse.json(
        { error: "個人情報の取扱いへの同意が必要です" },
        { status: 400 }
      );
    }

    if (application.status !== "書類待ち") {
      return NextResponse.json(
        { error: `この出願はすでに「${application.status}」の状態です` },
        { status: 400 }
      );
    }

    const updated = await prisma.application.update({
      where: { id: params.id },
      data: {
        status: "受付中",
        // 同意日時を記録（未記録かつ同意ありの場合）
        ...(!application.consentAt && consent ? { consentAt: new Date() } : {}),
      },
      select: { id: true, applicationNo: true, status: true },
    });

    return NextResponse.json({ success: true, ...updated });
  } catch (error) {
    console.error("POST /api/applications/[id]/submit error:", error);
    return NextResponse.json({ error: "提出に失敗しました" }, { status: 500 });
  }
}
