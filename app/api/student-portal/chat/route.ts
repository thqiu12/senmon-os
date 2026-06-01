import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyStudentOwnership } from "@/lib/auth";

// POST: メッセージ送信
// studentId をクライアントから信用せず、(studentNo|applicationNo) + email で本人確認して解決する。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentNo, applicationNo, email, message } = body;
    if (!email || !message?.trim()) {
      return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    }

    let student = null;
    if (studentNo) {
      student = await prisma.student.findFirst({ where: { studentNo, email } });
    } else if (applicationNo) {
      const ownership = await verifyStudentOwnership(applicationNo, email);
      if (ownership.valid) {
        student = await prisma.student.findUnique({ where: { applicationId: ownership.applicationId } });
      }
    }
    if (!student) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const msg = await prisma.chatMessage.create({
      data: {
        id: crypto.randomUUID(),
        studentId: student.id,
        senderType: "student",
        senderName: `${student.lastName} ${student.firstName}`,
        message: message.trim().slice(0, 2000),
        isRead: false,
      },
    });
    return NextResponse.json(msg, { status: 201 });
  } catch (e) {
    console.error("POST /api/student-portal/chat error:", e);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}
