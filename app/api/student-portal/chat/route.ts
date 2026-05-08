import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST: メッセージ送信
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, message } = body;
    if (!studentId || !message?.trim()) {
      return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    }
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return NextResponse.json({ error: "学生が見つかりません" }, { status: 404 });

    const msg = await prisma.chatMessage.create({
      data: {
        studentId,
        senderType: "student",
        senderName: `${student.lastName} ${student.firstName}`,
        message: message.trim(),
        isRead: false,
      },
    });
    return NextResponse.json(msg, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
