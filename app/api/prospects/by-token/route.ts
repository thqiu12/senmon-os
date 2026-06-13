import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/security";

/**
 * GET /api/prospects/by-token?token=xxx
 *
 * エージェント専用フォーム ( /prospects/new?token=xxx ) で
 * 「自分が登録した希望者一覧」を表示するための公開エンドポイント。
 * トークンに紐づくエージェントの希望者だけを返す。
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`prospect-token:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "トークンが不正です" }, { status: 400 });
  }

  try {
    const agent = await prisma.agent.findUnique({
      where: { formToken: token },
      select: { id: true, name: true, isActive: true },
    });
    if (!agent || !agent.isActive) {
      return NextResponse.json({ error: "エージェントが見つかりません" }, { status: 404 });
    }

    const prospects = await prisma.prospect.findMany({
      where: { agentId: agent.id },
      orderBy: [{ referredAt: "desc" }],
      select: {
        id: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        email: true,
        intendedSchool: true,
        intendedDepartment: true,
        enrollmentYear: true,
        status: true,
        matchedApplicationId: true,
        referredAt: true,
      },
    });
    return NextResponse.json({ agent: { name: agent.name }, prospects });
  } catch (e) {
    logError("GET /api/prospects/by-token", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
