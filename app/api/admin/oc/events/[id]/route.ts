import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";

// OC イベントの更新 / 削除。認可: form.edit。
// 削除時は FK cascade（OCReservation.onDelete: Cascade）で予約も連動削除される。

const OC_STATUSES = ["下書き", "公開", "締切"] as const;

const EventUpdateSchema = z.object({
  schoolKey: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  startAt: z.string().min(1).optional(),
  endAt: z.string().nullish(),
  capacity: z.coerce.number().int().min(1).optional(),
  location: z.string().nullish(),
  isOnline: z.boolean().optional(),
  onlineUrl: z.string().nullish(),
  status: z.enum(OC_STATUSES).optional(),
});

export const PUT = withTenant(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "オープンキャンパスを編集する権限がありません" }, { status: 403 });
  }

  try {
    const { id } = params;
    const parsed = EventUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const db = getTenantDb();
    const existing = await db.oCEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
    }

    const updated = await db.oCEvent.update({
      where: { id },
      data: {
        ...(d.schoolKey !== undefined ? { schoolKey: d.schoolKey } : {}),
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.startAt !== undefined ? { startAt: new Date(d.startAt) } : {}),
        ...(d.endAt !== undefined ? { endAt: d.endAt ? new Date(d.endAt) : null } : {}),
        ...(d.capacity !== undefined ? { capacity: d.capacity } : {}),
        ...(d.location !== undefined ? { location: d.location || null } : {}),
        ...(d.isOnline !== undefined ? { isOnline: d.isOnline } : {}),
        ...(d.onlineUrl !== undefined ? { onlineUrl: d.onlineUrl || null } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
});

export const DELETE = withTenant(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "オープンキャンパスを編集する権限がありません" }, { status: 403 });
  }

  try {
    const { id } = params;
    const db = getTenantDb();
    const existing = await db.oCEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
    }
    await db.oCEvent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
});
