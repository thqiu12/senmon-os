import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

// POST: 出願→在籍転換（管理者が一括操作）
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const body = await request.json();
    // applicationIds: 転換対象の出願ID一覧
    // schoolId: 転換先の学校
    // classId: クラス（任意）
    const { applicationIds, schoolId, classId } = body;
    if (!applicationIds?.length || !schoolId) {
      return NextResponse.json({ error: "applicationIdsとschoolIdが必要です" }, { status: 400 });
    }

    // 学校の存在確認
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return NextResponse.json({ error: "学校が見つかりません" }, { status: 404 });

    const results = [];
    const errors = [];

    for (const appId of applicationIds) {
      try {
        const app = await prisma.application.findUnique({
          where: { id: appId },
          include: { enrollmentProcedure: true },
        });
        if (!app) { errors.push({ id: appId, error: "申請が見つかりません" }); continue; }
        if (!["合格", "補欠合格"].includes(app.status)) {
          errors.push({ id: appId, error: "合格者のみ転換できます" }); continue;
        }
        if (!app.enrollmentProcedure?.completedAt) {
          errors.push({ id: appId, error: "入学手続きが完了していません" }); continue;
        }

        // 既存チェック
        const existing = await prisma.student.findUnique({ where: { applicationId: appId } });
        if (existing) { errors.push({ id: appId, error: "既に在籍登録済み" }); continue; }

        // 学籍番号生成（学校コード + 年度 + 連番）
        const year = new Date().getFullYear().toString().slice(-2);
        const count = await prisma.student.count({ where: { schoolId } });
        const studentNo = `${school.shortName.toUpperCase()}${year}-${String(count + 1).padStart(4, "0")}`;

        const student = await prisma.student.create({
          data: {
            schoolId,
            classId: classId || null,
            applicationId: appId,
            studentNo,
            lastName: app.lastName,
            firstName: app.firstName,
            lastNameKana: app.lastNameKana,
            firstNameKana: app.firstNameKana,
            email: app.email,
            phone: app.phone,
            nationality: app.nationality,
            birthDate: app.birthDate,
            enrolledAt: new Date(),
            status: "在籍",
          },
        });
        results.push(student);
      } catch (e) {
        errors.push({ id: appId, error: String(e) });
      }
    }

    return NextResponse.json({
      success: true,
      enrolled: results.length,
      errors,
      students: results,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "転換に失敗しました" }, { status: 500 });
  }
}
