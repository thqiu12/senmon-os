"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { CompassMark } from "@/components/ui/CompassMark";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/lib/i18n/LanguageSwitcher";
import { Field, Input } from "@/app/apply/_components/primitives";

interface StatusResult {
  reservation: {
    reservationNo: string;
    name: string;
    email: string;
    phone: string | null;
    attendees: number;
    status: string;
    extraData: Record<string, string | boolean> | null;
    canceledAt: string | null;
    createdAt: string;
  };
  event: {
    id: string;
    schoolKey: string | null;
    title: string;
    description: string | null;
    startAt: string;
    endAt: string | null;
    location: string | null;
    isOnline: boolean;
    onlineUrl: string | null;
  };
}

function fmtEventDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "long", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function OCStatusInner() {
  const { t } = useT();
  const [reservationNo, setReservationNo] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<StatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [canceled, setCanceled] = useState(false);

  const lookup = useCallback(async (no: string, mail: string) => {
    if (!no.trim() || !mail.trim()) { setError("予約番号とメールアドレスを入力してください"); return; }
    setLoading(true); setError(null); setResult(null); setCanceled(false);
    try {
      const params = new URLSearchParams({ reservationNo: no.trim(), email: mail.trim() });
      const res = await fetch(`/api/oc/status?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "予約が見つかりません"); return; }
      setResult(data as StatusResult);
      if ((data as StatusResult).reservation.status === "キャンセル") setCanceled(true);
    } catch {
      setError("ネットワークエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  // クエリから自動入力＋自動照会
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const no = sp.get("reservationNo") || "";
    const mail = sp.get("email") || "";
    if (no) setReservationNo(no);
    if (mail) setEmail(mail);
    if (no && mail) lookup(no, mail);
  }, [lookup]);

  const handleCancel = async () => {
    if (!result) return;
    setCanceling(true); setError(null);
    try {
      const res = await fetch("/api/oc/reservations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationNo: result.reservation.reservationNo, email: result.reservation.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "キャンセルに失敗しました"); return; }
      setCanceled(true);
      setResult((prev) => prev ? { ...prev, reservation: { ...prev.reservation, status: "キャンセル" } } : prev);
    } catch {
      setError("ネットワークエラー");
    } finally {
      setCanceling(false);
    }
  };

  const r = result?.reservation;
  const ev = result?.event;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white"><CompassMark className="w-5 h-5" /></div>
            <div>
              <p className="font-bold text-gray-800 text-sm leading-none">Compass</p>
              <p className="text-xs text-gray-400 mt-0.5">{t("オープンキャンパス予約")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/oc" className="text-xs text-gray-400 hover:text-gray-600 transition">{t("← 一覧へ")}</Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-800">{t("予約の確認・キャンセル")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("予約番号とメールアドレスを入力してください。")}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="予約番号">
              <Input value={reservationNo} placeholder="OC-YYMMDD-XXXX"
                onChange={(e) => setReservationNo(e.target.value)} />
            </Field>
            <Field label="メールアドレス">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <Icon name="info" className="w-4 h-4 shrink-0" />{t(error)}
            </div>
          )}
          <button type="button" onClick={() => lookup(reservationNo, email)} disabled={loading}
            className={`mt-4 w-full py-2.5 rounded-xl font-semibold text-sm transition shadow-sm
              ${loading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"}`}>
            {loading ? t("照会中...") : t("予約を照会する")}
          </button>
        </div>

        {result && r && ev && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-800">{t("予約内容")}</h2>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${canceled || r.status === "キャンセル" ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-700"}`}>
                {canceled || r.status === "キャンセル" ? t("キャンセル済み") : t("予約確定")}
              </span>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-4">
              <p className="text-xs text-gray-400 mb-1">{t("予約番号")}</p>
              <p className="font-mono font-bold text-gray-800 text-lg tracking-wide">{r.reservationNo}</p>
            </div>

            <div className="space-y-2.5 text-sm">
              <Row label="イベント" value={ev.title} />
              <Row label="日時" value={`${fmtEventDate(ev.startAt)}${ev.endAt ? `〜${fmtTime(ev.endAt)}` : ""}`} />
              <Row label="会場" value={ev.isOnline ? t("オンライン開催") : (ev.location || t("会場未定"))} />
              {ev.isOnline && ev.onlineUrl && !(canceled || r.status === "キャンセル") && (
                <Row label="URL" value={ev.onlineUrl} />
              )}
              <Row label="お名前" value={r.name} />
              <Row label="メール" value={r.email} />
              {r.phone && <Row label="電話番号" value={r.phone} />}
              <Row label="参加人数" value={`${r.attendees}${t("名")}`} />
            </div>

            {canceled || r.status === "キャンセル" ? (
              <div className="mt-5 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 flex items-center gap-2">
                <Icon name="info" className="w-4 h-4 shrink-0" />{t("この予約はキャンセル済みです。")}
              </div>
            ) : (
              <button type="button" onClick={handleCancel} disabled={canceling}
                className={`mt-5 w-full py-2.5 rounded-xl font-semibold text-sm transition border
                  ${canceling ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-white border-red-200 text-red-600 hover:bg-red-50"}`}>
                {canceling ? t("キャンセル中...") : t("この予約をキャンセルする")}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { t } = useT();
  return (
    <div className="flex gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">{t(label)}</span>
      <span className="text-sm text-gray-800 font-medium flex-1 break-all">{value || "—"}</span>
    </div>
  );
}

export default function OCStatusPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <OCStatusInner />
    </Suspense>
  );
}
