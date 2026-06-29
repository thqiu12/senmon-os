"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { CompassMark } from "@/components/ui/CompassMark";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/lib/i18n/LanguageSwitcher";
import { Field, Input, Select } from "@/app/apply/_components/primitives";
import { OC_CORE_KEYS } from "@/lib/ocForm";

// ========== Types ==========
interface OCEvent {
  id: string;
  schoolKey: string | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
  isOnline: boolean;
  onlineUrl: string | null;
  capacity: number | null;
  remaining: number | null;
}

interface OCFormField {
  fieldKey: string;
  label: string;
  isRequired: boolean;
  fieldType: string;
  section: string;
  displayOrder: number | null;
  description?: string | null;
  options?: string | null;
  labelEn?: string | null;
  descriptionEn?: string | null;
}

interface UtmState {
  source: string;
  utmCampaign: string;
  utmMedium: string;
  gclid: string;
  referrer: string;
}

// ========== Helpers ==========
// JST で日時を整形（端末TZに依存させない）。
function fmtEventDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "long", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function parseSelectOptions(options?: string | null): { value: string; label: string }[] {
  if (!options) return [];
  return String(options)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((v) => ({ value: v, label: v }));
}

// ========== Header ==========
function OCHeader() {
  const { t } = useT();
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white"><CompassMark className="w-5 h-5" /></div>
          <div>
            <p className="font-bold text-gray-800 text-sm leading-none">Compass</p>
            <p className="text-xs text-gray-400 mt-0.5">{t("オープンキャンパス予約")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition">{t("← トップへ")}</Link>
        </div>
      </div>
    </header>
  );
}

// ========== Event List ==========
function EventList({ events, loading, onSelect }: {
  events: OCEvent[]; loading: boolean; onSelect: (e: OCEvent) => void;
}) {
  const { t } = useT();
  if (loading) {
    return (
      <div className="text-center py-16">
        <svg className="animate-spin w-8 h-8 text-blue-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-gray-500 text-sm">{t("読み込み中...")}</p>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Icon name="calendar" className="w-12 h-12 mx-auto mb-3" />
        <p className="text-sm">{t("現在、予約受付中のオープンキャンパスはありません。")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {events.map((e) => {
        const full = e.remaining != null && e.remaining <= 0;
        const low = e.remaining != null && e.remaining > 0 && e.remaining <= 5;
        return (
          <div key={e.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-base font-bold text-gray-800 flex-1">{e.title}</h2>
              {full ? (
                <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{t("満席")}</span>
              ) : e.remaining != null ? (
                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${low ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                  {t("残席")} {e.remaining}
                </span>
              ) : null}
            </div>
            <div className="space-y-1.5 text-sm text-gray-600 mb-4">
              <p className="flex items-center gap-2">
                <Icon name="calendar" className="w-4 h-4 text-gray-400 shrink-0" />
                <span>{fmtEventDate(e.startAt)}{e.endAt ? `〜${fmtTime(e.endAt)}` : ""}</span>
              </p>
              <p className="flex items-center gap-2">
                <Icon name={e.isOnline ? "monitor" : "home"} className="w-4 h-4 text-gray-400 shrink-0" />
                <span>{e.isOnline ? t("オンライン開催") : (e.location || t("会場未定"))}</span>
              </p>
            </div>
            {e.description && (
              <p className="text-sm text-gray-500 whitespace-pre-wrap mb-4">{e.description}</p>
            )}
            <button
              type="button"
              disabled={full}
              onClick={() => onSelect(e)}
              className={`w-full py-2.5 rounded-xl font-semibold text-sm transition shadow-sm
                ${full ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none" : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"}`}
            >
              {full ? t("満席") : t("このイベントを予約する →")}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ========== Extra field renderer (generic) ==========
// OC は出願フォームのような registry 連動が無いため、追加項目は extraData へ書く
// 専用の汎用レンダラで描画する（fieldType ごとに text/textarea/select/checkbox）。
function ExtraField({ field, value, onChange, error }: {
  field: OCFormField; value: string | boolean | undefined;
  onChange: (v: string | boolean) => void; error?: string;
}) {
  const { t } = useT();
  const label = field.label || field.fieldKey;
  const ftype = field.fieldType;
  if (ftype === "textarea") {
    return (
      <Field label={label} required={field.isRequired} hint={field.description || undefined} error={error}>
        <textarea
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y hover:border-gray-300"
          value={String(value ?? "")} onChange={(ev) => onChange(ev.target.value)} />
      </Field>
    );
  }
  if (ftype === "select") {
    const opts = parseSelectOptions(field.options);
    return (
      <Field label={label} required={field.isRequired} hint={field.description || undefined} error={error}>
        <Select value={String(value ?? "")} error={!!error} onChange={(ev) => onChange(ev.target.value)}>
          <option value="">{t("選択してください")}</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
    );
  }
  if (ftype === "checkbox") {
    return (
      <Field label={label} hint={field.description || undefined}>
        <label className="flex items-center gap-3 h-[42px] cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-blue-600"
            checked={value === true} onChange={(ev) => onChange(ev.target.checked)} />
          <span className="text-sm text-gray-700">{label}</span>
        </label>
      </Field>
    );
  }
  return (
    <Field label={label} required={field.isRequired} hint={field.description || undefined} error={error}>
      <Input type={ftype === "email" ? "email" : ftype === "tel" ? "tel" : "text"}
        value={String(value ?? "")} error={!!error} onChange={(ev) => onChange(ev.target.value)} />
    </Field>
  );
}

// ========== Reservation Form ==========
function ReservationForm({ event, utm, onDone, onBack }: {
  event: OCEvent; utm: UtmState; onDone: (reservationNo: string, email: string) => void; onBack: () => void;
}) {
  const { t } = useT();
  const [fields, setFields] = useState<OCFormField[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [attendees, setAttendees] = useState("1");
  const [extraData, setExtraData] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const q = event.schoolKey ? `?school=${encodeURIComponent(event.schoolKey)}` : "";
    fetch(`/api/oc/form-config${q}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setFields(Array.isArray(data) ? data : []))
      .catch(() => setFields([]));
  }, [event.schoolKey]);

  const coreFields = (fields ?? []).filter((f) => OC_CORE_KEYS.has(f.fieldKey));
  const extraFields = (fields ?? []).filter((f) => !OC_CORE_KEYS.has(f.fieldKey));
  const coreCfg = (key: string) => coreFields.find((f) => f.fieldKey === key);

  const setExtra = (key: string, v: string | boolean) => {
    setExtraData((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const nameReq = coreCfg("name")?.isRequired ?? true;
    const emailReq = coreCfg("email")?.isRequired ?? true;
    const phoneReq = coreCfg("phone")?.isRequired ?? false;
    const attReq = coreCfg("attendees")?.isRequired ?? true;
    if (nameReq && !name.trim()) e.name = "お名前を入力してください";
    if (emailReq && !email.trim()) e.email = "メールアドレスを入力してください";
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "有効なメールアドレスを入力してください";
    if (phoneReq && !phone.trim()) e.phone = "電話番号を入力してください";
    const att = parseInt(attendees, 10);
    if (attReq && (!attendees || isNaN(att) || att < 1)) e.attendees = "参加人数を入力してください";
    for (const f of extraFields) {
      if (!f.isRequired) continue;
      const v = extraData[f.fieldKey];
      if (f.fieldType === "checkbox") { if (v !== true) e[f.fieldKey] = `${f.label}を確認してください`; }
      else if (v === undefined || String(v).trim() === "") e[f.fieldKey] = `${f.label}を入力してください`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validate()) {
      requestAnimationFrame(() => {
        const al = document.querySelector('[role="alert"]') as HTMLElement | null;
        al?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/oc/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocEventId: event.id,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          attendees: parseInt(attendees, 10) || 1,
          extraData,
          source: utm.source || null,
          utmCampaign: utm.utmCampaign || null,
          utmMedium: utm.utmMedium || null,
          gclid: utm.gclid || null,
          referrer: utm.referrer || null,
        }),
      });
      if (res.status === 409) { setSubmitError("満席です"); setSubmitting(false); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError(data.error || "予約の送信に失敗しました"); setSubmitting(false); return; }
      onDone(data.reservationNo, email.trim());
    } catch {
      setSubmitError("ネットワークエラー");
      setSubmitting(false);
    }
  };

  const full = event.remaining != null && event.remaining <= 0;

  return (
    <div className="space-y-5">
      {/* 選択中イベント概要 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="font-bold text-blue-800 text-base mb-1">{event.title}</p>
        <p className="text-sm text-blue-700 flex items-center gap-2">
          <Icon name="calendar" className="w-4 h-4 shrink-0" />{fmtEventDate(event.startAt)}
        </p>
        <p className="text-sm text-blue-700 flex items-center gap-2 mt-1">
          <Icon name={event.isOnline ? "monitor" : "home"} className="w-4 h-4 shrink-0" />
          {event.isOnline ? t("オンライン開催") : (event.location || t("会場未定"))}
        </p>
      </div>

      {fields === null ? (
        <div className="text-center py-8">
          <svg className="animate-spin w-6 h-6 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={coreCfg("name")?.label || "お名前"} required={coreCfg("name")?.isRequired ?? true} error={errors.name}>
              <Input value={name} error={!!errors.name}
                onChange={(ev) => { setName(ev.target.value); setErrors((p) => { const n = { ...p }; delete n.name; return n; }); }} />
            </Field>
            <Field label={coreCfg("email")?.label || "メールアドレス"} required={coreCfg("email")?.isRequired ?? true} error={errors.email}>
              <Input type="email" value={email} error={!!errors.email}
                onChange={(ev) => { setEmail(ev.target.value); setErrors((p) => { const n = { ...p }; delete n.email; return n; }); }} />
            </Field>
            <Field label={coreCfg("phone")?.label || "電話番号"} required={coreCfg("phone")?.isRequired ?? false} error={errors.phone}>
              <Input type="tel" value={phone} error={!!errors.phone}
                onChange={(ev) => { setPhone(ev.target.value); setErrors((p) => { const n = { ...p }; delete n.phone; return n; }); }} />
            </Field>
            <Field label={coreCfg("attendees")?.label || "参加人数"} required={coreCfg("attendees")?.isRequired ?? true} error={errors.attendees}>
              <Input type="number" min={1} max={20} value={attendees} error={!!errors.attendees}
                onChange={(ev) => { setAttendees(ev.target.value); setErrors((p) => { const n = { ...p }; delete n.attendees; return n; }); }} />
            </Field>
          </div>

          {extraFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {extraFields.map((f) => (
                <ExtraField key={f.fieldKey} field={f} value={extraData[f.fieldKey]}
                  onChange={(v) => setExtra(f.fieldKey, v)} error={errors[f.fieldKey]} />
              ))}
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <Icon name="info" className="w-4 h-4 shrink-0" />{t(submitError)}
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <button type="button" onClick={onBack} disabled={submitting}
              className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-30">
              {t("← 一覧へ")}
            </button>
            <button type="button" onClick={handleSubmit} disabled={submitting || full}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition shadow-sm
                ${submitting || full ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none" : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"}`}>
              {submitting ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> {t("送信中...")}</>
              ) : <><Icon name="check" className="w-4 h-4" /> {t("予約を確定する")}</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ========== Completion ==========
function Completion({ reservationNo, email, event }: { reservationNo: string; email: string; event: OCEvent }) {
  const { t } = useT();
  return (
    <div className="text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
        <Icon name="check" className="w-10 h-10" strokeWidth={2.2} />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">{t("予約が完了しました")}</h2>
      <p className="text-gray-500 text-sm mb-6">{t("ご予約ありがとうございます。確認メールをお送りしました（届かない場合は迷惑メールフォルダもご確認ください）。")}</p>

      <div className="rounded-2xl p-6 mb-6 text-white" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2c5a82 100%)" }}>
        <p className="text-blue-200 text-sm mb-2">{t("予約番号")}</p>
        <p className="text-3xl font-bold tracking-widest">{reservationNo}</p>
        <p className="text-blue-300 text-xs mt-2">{t("この番号は予約の確認・キャンセルに必要です")}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 text-left space-y-2">
        <p className="font-bold text-gray-800 text-sm">{event.title}</p>
        <p className="text-sm text-gray-600 flex items-center gap-2"><Icon name="calendar" className="w-4 h-4 text-gray-400 shrink-0" />{fmtEventDate(event.startAt)}</p>
        <p className="text-sm text-gray-600 flex items-center gap-2"><Icon name={event.isOnline ? "monitor" : "home"} className="w-4 h-4 text-gray-400 shrink-0" />{event.isOnline ? t("オンライン開催") : (event.location || t("会場未定"))}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href={`/oc/status?reservationNo=${encodeURIComponent(reservationNo)}&email=${encodeURIComponent(email)}`}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition">
          {t("予約内容を確認・キャンセル")}
        </Link>
        <Link href="/oc" className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition">
          {t("他のイベントを見る")}
        </Link>
      </div>
    </div>
  );
}

// ========== Main ==========
function OCPageInner() {
  const { t } = useT();
  const [events, setEvents] = useState<OCEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OCEvent | null>(null);
  const [completed, setCompleted] = useState<{ reservationNo: string; email: string } | null>(null);
  const [utm, setUtm] = useState<UtmState>({ source: "", utmCampaign: "", utmMedium: "", gclid: "", referrer: "" });

  // UTM / referrer 捕捉
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setUtm({
      source: sp.get("utm_source") || "",
      utmCampaign: sp.get("utm_campaign") || "",
      utmMedium: sp.get("utm_medium") || "",
      gclid: sp.get("gclid") || "",
      referrer: typeof document !== "undefined" ? document.referrer || "" : "",
    });
  }, []);

  const loadEvents = useCallback(() => {
    const school = new URLSearchParams(window.location.search).get("school");
    const q = school ? `?school=${encodeURIComponent(school)}` : "";
    setLoading(true);
    fetch(`/api/oc/events${q}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // 完了画面（予約済みイベント情報も保持）
  if (completed && selected) {
    return (
      <div className="min-h-screen bg-gray-50">
        <OCHeader />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <Completion reservationNo={completed.reservationNo} email={completed.email} event={selected} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <OCHeader />
      <main className="max-w-2xl mx-auto px-4 py-6">
        {selected ? (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-bold text-gray-800">{t("予約フォーム")}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{t("以下の項目をご入力ください。")}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <ReservationForm
                event={selected}
                utm={utm}
                onBack={() => setSelected(null)}
                onDone={(reservationNo, email) => setCompleted({ reservationNo, email })}
              />
            </div>
          </>
        ) : (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-bold text-gray-800">{t("オープンキャンパス")}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{t("ご希望のイベントを選んで予約してください。")}</p>
            </div>
            <EventList events={events} loading={loading} onSelect={(e) => setSelected(e)} />
            <div className="mt-6 text-center">
              <Link href="/oc/status" className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5">
                <Icon name="clipboard" className="w-4 h-4" />{t("予約の確認・キャンセルはこちら")}
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function OCPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <OCPageInner />
    </Suspense>
  );
}
