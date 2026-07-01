import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/tenant/with-tenant";
import { getTenantDb } from "@/lib/tenant/scoped";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { APPLY_RATE_LIMITS } from "@/lib/rateLimits";
import { OCReservationCreateSchema } from "@/lib/schemas";
import { canReserve } from "@/lib/ocCapacity";
import { sendOCConfirmation } from "@/lib/email";
import { ENV } from "@/lib/env";
import { uploadClickConversion } from "@/lib/googleAds";

export const dynamic = "force-dynamic";

// 予約番号: OC-YYMMDD-xxxx（xxxx は base36 ランダム4文字）。
function generateReservationNo(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `OC-${yy}${mm}${dd}-${rand}`;
}

// 公開API: OC 予約作成。出願POST同様にレート上限＋zod検証。
export const POST = withTenant(async (request: NextRequest) => {
  const ip = getClientIp(request);
  // 出願と同様、共有IP(学校NAT等)からの一斉予約を許容できる緩めの上限。
  if (!checkRateLimit(`oc-reserve:${ip}`, APPLY_RATE_LIMITS.create.max, APPLY_RATE_LIMITS.create.windowMs)) {
    return NextResponse.json({ error: "予約の送信が多すぎます。しばらく後に再試行してください" }, { status: 429 });
  }
  try {
    const parsed = OCReservationCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "入力エラー", issues: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const db = getTenantDb();

    // 定員チェックの根拠としてその場で予約一覧を取得。
    // 低トラフィック前提のため、findUnique の include 件数を作成直前のカウント源とする
    // （厳密なロック/トランザクションは行わない。少人数の同時予約での過剰予約リスクは許容）。
    const event = await db.oCEvent.findUnique({
      where: { id: body.ocEventId },
      include: { reservations: { select: { attendees: true, status: true } } },
    });

    if (!event || event.status !== "公開" || event.startAt <= new Date()) {
      return NextResponse.json({ error: "対象のイベントが見つかりません" }, { status: 400 });
    }

    if (!canReserve(event.capacity, event.reservations, body.attendees)) {
      return NextResponse.json({ error: "満席です" }, { status: 409 });
    }

    const reservationNo = generateReservationNo();
    const reservation = await db.oCReservation.create({
      data: {
        ocEventId: event.id,
        reservationNo,
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        attendees: body.attendees,
        extraData: body.extraData ?? {},
        source: body.source || null,
        utmCampaign: body.utmCampaign || null,
        utmMedium: body.utmMedium || null,
        gclid: body.gclid || null,
        referrer: body.referrer || null,
      },
    });

    // 確認メール（失敗しても 201 を返す。RESEND 未設定なら no-op）。
    try {
      const base = ENV.PUBLIC_BASE_URL || "";
      const cancelUrl = `${base}/oc/status?reservationNo=${encodeURIComponent(reservationNo)}&email=${encodeURIComponent(body.email)}`;
      await sendOCConfirmation({
        to: body.email,
        name: body.name,
        reservationNo,
        eventTitle: event.title,
        startAt: event.startAt,
        location: event.location,
        isOnline: event.isOnline,
        onlineUrl: event.onlineUrl,
        cancelUrl,
      });
    } catch (mailErr) {
      console.error("OC確認メール送信エラー (予約自体は成功):", mailErr);
    }

    // Google Ads: gclid 付き OC予約をオフラインコンバージョン送信（fire-and-forget）
    if (reservation.gclid) {
      void uploadClickConversion({
        gclid: reservation.gclid,
        conversionActionId: ENV.GOOGLE_ADS_CONV_OC,
        at: reservation.createdAt,
      }).then((r) => {
        if (!r.ok && r.error) console.warn("Google Ads OC予約CV送信 失敗:", r.error);
      });
    }

    return NextResponse.json({ reservationNo }, { status: 201 });
  } catch (error) {
    console.error("POST /api/oc/reservations error:", error);
    return NextResponse.json({ error: "予約の送信に失敗しました。もう一度お試しください。" }, { status: 500 });
  }
});
