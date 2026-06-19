import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const ip = getClientIp(request);
  // 共有IP(学校PCルーム)から多数が同時に最終送信するため上限を緩める。
  if (!checkRateLimit(`submit:${ip}`, 100, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }

  try {
    const application = await prisma.application.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, email: true },
    });
    if (!application) {
      return NextResponse.json({ error: "出願が見つかりません" }, { status: 404 });
    }

    const session = await getSession(request);
    if (!isAdmin(session)) {
      let email: string | null = null;
      try {
        const body = await request.json();
        email = typeof body?.email === "string" ? body.email : null;
      } catch {
        // body省略時はクエリパラメータも許容
        email = new URL(request.url).searchParams.get("email");
      }
      if (!email || email !== application.email) {
        return NextResponse.json({ error: "本人確認に失敗しました" }, { status: 403 });
      }
    }

    if (application.status !== "書類待ち") {
      return NextResponse.json(
        { error: `この出願はすでに「${application.status}」の状態です` },
        { status: 400 },
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
