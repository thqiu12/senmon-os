import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isAdmin } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { hasCapability } from "@/lib/permissions";
import { remainingSeats } from "@/lib/ocCapacity";

// オープンキャンパス（OC）イベント一覧 + 作成。
// 認可: 管理者（isAdmin）+ form.edit ケイパビリティ。

const OC_STATUSES = ["下書き", "公開", "締切"] as const;

const EventCreateSchema = z.object({
  schoolKey: z.string().min(1, "学校は必須です"),
  title: z.string().min(1, "タイトルは必須です"),
  description: z.string().nullish(),
  startAt: z.string().min(1, "開催日時は必須です"),
  endAt: z.string().nullish(),
  capacity: z.coerce.number().int().min(1, "定員は1以上で指定してください"),
  location: z.string().nullish(),
  isOnline: z.boolean().optional().default(false),
  onlineUrl: z.string().nullish(),
  status: z.enum(OC_STATUSES).optional().default("下書き"),
});

export const GET = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "オープンキャンパスを編集する権限がありません" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const school = searchParams.get("school");

    const events = await getTenantDb().oCEvent.findMany({
      where: school ? { schoolKey: school } : undefined,
      orderBy: { startAt: "desc" },
      include: { reservations: { select: { attendees: true, status: true } } },
    });

    const result = events.map((e) => {
      const used = e.reservations
        .filter((r) => r.status === "予約" || r.status === "出席")
        .reduce((s, r) => s + (r.attendees || 0), 0);
      return {
        id: e.id,
        schoolKey: e.schoolKey,
        title: e.title,
        description: e.description,
        startAt: e.startAt,
        endAt: e.endAt,
        capacity: e.capacity,
        location: e.location,
        isOnline: e.isOnline,
        onlineUrl: e.onlineUrl,
        status: e.status,
        createdAt: e.createdAt,
        reservedCount: used,
        remaining: remainingSeats(e.capacity, e.reservations),
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
});

export const POST = withTenant(async (request: NextRequest) => {
  const session = await getSession(request);
  if (!(await hasCapability(session, "form.edit"))) {
    return NextResponse.json({ error: "オープンキャンパスを編集する権限がありません" }, { status: 403 });
  }

  try {
    const parsed = EventCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "入力エラー", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const created = await getTenantDb().oCEvent.create({
      data: {
        schoolKey: d.schoolKey,
        title: d.title,
        description: d.description || null,
        startAt: new Date(d.startAt),
        endAt: d.endAt ? new Date(d.endAt) : null,
        capacity: d.capacity,
        location: d.location || null,
        isOnline: d.isOnline ?? false,
        onlineUrl: d.onlineUrl || null,
        status: d.status ?? "下書き",
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
});
