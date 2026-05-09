import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyStudentOwnership } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { ChatPostSchema } from "@/lib/schemas";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`chat:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "リクエストが多すぎます" }, { status: 429 });
  }

  try {
    const parsed = ChatPostSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { applicationNo, studentNo, email, message } = parsed.data;

    let student: { id: string; lastName: string; firstName: string } | null = null;

    if (studentNo) {
      student = await prisma.student.findFirst({
        where: { studentNo, email },
        select: { id: true, lastName: true, firstName: true },
      });
    } else if (applicationNo) {
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (!ownership.valid) {
        return NextResponse.json({ error: "本人確認に失敗しました" }, { status: 401 });
      }
      student = await prisma.student.findUnique({
        where: { applicationId: ownership.applicationId },
        select: { id: true, lastName: true, firstName: true },
      });
    }

    if (!student) {
      return NextResponse.json({ error: "在籍情報が見つかりません" }, { status: 404 });
    }

    const msg = await prisma.chatMessage.create({
      data: {
        id: crypto.randomUUID(),
        studentId: student.id,
        senderType: "student",
        senderName: `${student.lastName} ${student.firstName}`,
        message: message.trim(),
        isRead: false,
      },
    });
    return NextResponse.json(msg, { status: 201 });
  } catch (e) {
    console.error("POST /api/student-portal/chat error:", e);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
