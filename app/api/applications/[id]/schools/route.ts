import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin as checkAdmin } from "@/lib/auth";

// POST: 志望校追加
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const body = await request.json();
    const { priority, schoolName, department, course, enrollmentYear, enrollmentMonth, result, memo } = body;

    if (!schoolName || !department || !enrollmentYear || !enrollmentMonth) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    // 同じpriorityが存在する場合は上書き
    const school = await prisma.applicationSchool.upsert({
      where: { applicationId_priority: { applicationId: params.id, priority: priority || 1 } },
      update: { schoolName, department, course: course || null, enrollmentYear, enrollmentMonth, result: result || null, memo: memo || null },
      create: { id: require("crypto").randomUUID(), applicationId: params.id, priority: priority || 1, schoolName, department, course: course || null, enrollmentYear, enrollmentMonth, result: result || null, memo: memo || null, updatedAt: new Date() },
    });

    return NextResponse.json(school, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "追加に失敗しました" }, { status: 500 });
  }
}

// PATCH: 志望校更新（result変更・試験日程設定など）
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const body = await request.json();
    const { schoolId } = body;
    if (!schoolId) return NextResponse.json({ error: "schoolIdが必要です" }, { status: 400 });

    // 許可するフィールドだけ抽出（任意のカラムを書き換えられないように）
    const ALLOWED = new Set([
      "schoolName", "department", "course", "enrollmentYear", "enrollmentMonth",
      "result", "memo",
      // 面接試験
      "interviewDate", "interviewTime", "interviewPlace", "interviewNotes",
      // 筆記試験
      "writtenExamDate", "writtenExamTime", "writtenExamPlace", "writtenExamNotes",
      "writtenExamExempted",
    ]);
    const BOOL_FIELDS = new Set(["writtenExamExempted"]);
    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (k === "schoolId") continue;
      if (!ALLOWED.has(k)) continue;
      if (BOOL_FIELDS.has(k)) {
        updateData[k] = !!v;
      } else {
        updateData[k] = v === "" ? null : v;
      }
    }

    // 所有チェック: 該当 schoolId が本当に params.id 申請のものか確認
    const existing = await prisma.applicationSchool.findUnique({
      where: { id: schoolId },
      select: { applicationId: true },
    });
    if (!existing || existing.applicationId !== params.id) {
      return NextResponse.json({ error: "対象の志望校が見つかりません" }, { status: 404 });
    }

    const school = await prisma.applicationSchool.update({
      where: { id: schoolId },
      data: updateData,
    });

    // 日時の重複検知 — 同じ申請内の他の試験スロットと日付＋時刻が衝突するか確認。
    // 警告のみ（保存はする）。admin が意図的に重複を許可するケースもあるため。
    const conflicts: { schoolId: string; priority: number; schoolName: string; examType: "筆記試験" | "面接試験"; date: string; time: string }[] = [];
    const isScheduleChange = Object.keys(updateData).some((k) =>
      k.startsWith("interview") || k.startsWith("writtenExam"),
    );
    if (isScheduleChange) {
      const app = await prisma.application.findUnique({
        where: { id: params.id },
        include: { applicationSchools: true },
      });
      if (app) {
        type Slot = { schoolId: string; priority: number; schoolName: string; examType: "筆記試験" | "面接試験"; date: string; time: string };
        const slots: Slot[] = [];

        // Application-level の interview（第1志望が per-school 未設定の場合のフォールバック）
        const p1 = app.applicationSchools.find((s) => s.priority === 1);
        if (p1 && !p1.interviewDate && app.interviewDate && app.interviewTime) {
          slots.push({
            schoolId: p1.id,
            priority: 1,
            schoolName: p1.schoolName,
            examType: "面接試験",
            date: app.interviewDate,
            time: app.interviewTime,
          });
        }

        for (const s of app.applicationSchools) {
          if (s.interviewDate && s.interviewTime) {
            slots.push({
              schoolId: s.id,
              priority: s.priority,
              schoolName: s.schoolName,
              examType: "面接試験",
              date: s.interviewDate,
              time: s.interviewTime,
            });
          }
          if (s.writtenExamDate && s.writtenExamTime && !s.writtenExamExempted) {
            slots.push({
              schoolId: s.id,
              priority: s.priority,
              schoolName: s.schoolName,
              examType: "筆記試験",
              date: s.writtenExamDate,
              time: s.writtenExamTime,
            });
          }
        }

        // (date,time) でグループ化、重複しているものを抽出
        // Note: Map<>.entries() の for-of は target<ES2015 で不可なので Array.from で iterate
        const groups: Record<string, Slot[]> = {};
        for (const slot of slots) {
          const key = `${slot.date}|${slot.time}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(slot);
        }
        for (const group of Object.values(groups)) {
          if (group.length > 1) {
            // 全エントリを衝突として返す（admin UI が冒頭何件と表示）
            conflicts.push(...group);
          }
        }
      }
    }

    return NextResponse.json({
      ...school,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    });
  } catch (e) {
    console.error("PATCH /api/applications/[id]/schools error:", e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

// DELETE: 志望校削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession(request);
  if (!checkAdmin(session)) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    if (!schoolId) return NextResponse.json({ error: "schoolIdが必要です" }, { status: 400 });

    await prisma.applicationSchool.delete({ where: { id: schoolId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
