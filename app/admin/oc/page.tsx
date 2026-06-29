"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/components/ui/toast";

const OC_STATUSES = ["下書き", "公開", "締切"];
const RES_STATUSES = ["予約", "出席", "欠席", "キャンセル"];

interface School {
  schoolKey: string;
  name: string;
}

interface OCEvent {
  id: string;
  schoolKey: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  capacity: number;
  location: string | null;
  isOnline: boolean;
  onlineUrl: string | null;
  status: string;
  createdAt: string;
  reservedCount: number;
  remaining: number;
}

interface Reservation {
  id: string;
  reservationNo: string;
  name: string;
  email: string;
  phone: string | null;
  attendees: number;
  status: string;
  extraData: unknown;
  source: string | null;
  createdAt: string;
}

function eventStatusStyle(status: string): string {
  switch (status) {
    case "公開": return "border-blue-200 bg-blue-50 text-blue-700";
    case "締切": return "border-gray-200 bg-gray-50 text-gray-600";
    default: return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function resStatusStyle(status: string): string {
  switch (status) {
    case "出席": return "bg-green-100 text-green-700";
    case "欠席": return "bg-red-100 text-red-700";
    case "キャンセル": return "bg-gray-100 text-gray-500";
    default: return "bg-blue-100 text-blue-700";
  }
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toLocalInput(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export default function OCPage() {
  const router = useRouter();
  const { toast, confirm } = useUI();

  const [events, setEvents] = useState<OCEvent[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal (create/edit)
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState<OCEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // form fields
  const [fSchoolKey, setFSchoolKey] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fStartAt, setFStartAt] = useState("");
  const [fEndAt, setFEndAt] = useState("");
  const [fCapacity, setFCapacity] = useState(30);
  const [fIsOnline, setFIsOnline] = useState(false);
  const [fLocation, setFLocation] = useState("");
  const [fOnlineUrl, setFOnlineUrl] = useState("");
  const [fStatus, setFStatus] = useState("下書き");

  // Reservations panel
  const [selectedEvent, setSelectedEvent] = useState<OCEvent | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [resLoading, setResLoading] = useState(false);

  const schoolName = (key: string) => schools.find((s) => s.schoolKey === key)?.name || key;

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/oc/events");
      if (res.status === 401 || res.status === 403) { router.push("/admin"); return; }
      if (!res.ok) throw new Error("取得に失敗しました");
      setEvents(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    fetch("/api/admin/schools")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) setSchools(d.map((s: { schoolKey: string; name: string }) => ({ schoolKey: s.schoolKey, name: s.name })));
      })
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setEditEvent(null);
    setFSchoolKey(schools[0]?.schoolKey || "");
    setFTitle("");
    setFDescription("");
    setFStartAt("");
    setFEndAt("");
    setFCapacity(30);
    setFIsOnline(false);
    setFLocation("");
    setFOnlineUrl("");
    setFStatus("下書き");
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (ev: OCEvent) => {
    setEditEvent(ev);
    setFSchoolKey(ev.schoolKey);
    setFTitle(ev.title);
    setFDescription(ev.description || "");
    setFStartAt(toLocalInput(ev.startAt));
    setFEndAt(toLocalInput(ev.endAt));
    setFCapacity(ev.capacity);
    setFIsOnline(ev.isOnline);
    setFLocation(ev.location || "");
    setFOnlineUrl(ev.onlineUrl || "");
    setFStatus(ev.status);
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!fSchoolKey) { setFormError("学校は必須です"); return; }
    if (!fTitle.trim()) { setFormError("タイトルは必須です"); return; }
    if (!fStartAt) { setFormError("開催日時は必須です"); return; }
    if (!fCapacity || fCapacity < 1) { setFormError("定員は1以上で指定してください"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        schoolKey: fSchoolKey,
        title: fTitle.trim(),
        description: fDescription || null,
        startAt: new Date(fStartAt).toISOString(),
        endAt: fEndAt ? new Date(fEndAt).toISOString() : null,
        capacity: fCapacity,
        isOnline: fIsOnline,
        location: fIsOnline ? null : (fLocation || null),
        onlineUrl: fIsOnline ? (fOnlineUrl || null) : null,
        status: fStatus,
      };
      const url = editEvent ? `/api/admin/oc/events/${editEvent.id}` : "/api/admin/oc/events";
      const method = editEvent ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "保存に失敗しました");
      }
      setShowModal(false);
      await fetchEvents();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: OCEvent) => {
    const ok = await confirm({
      title: "イベントを削除",
      message: `「${ev.title}」を削除しますか？関連する予約もすべて削除されます。`,
      danger: true,
      okLabel: "削除",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/oc/events/${ev.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "削除に失敗しました");
      if (selectedEvent?.id === ev.id) { setSelectedEvent(null); setReservations([]); }
      await fetchEvents();
    } catch (e) {
      toast(e instanceof Error ? e.message : "削除に失敗しました", "error");
    }
  };

  const fetchReservations = async (ev: OCEvent) => {
    setSelectedEvent(ev);
    setResLoading(true);
    try {
      const res = await fetch(`/api/admin/oc/reservations?eventId=${ev.id}`);
      if (!res.ok) throw new Error("取得に失敗しました");
      setReservations(await res.json());
    } catch (e) {
      toast(e instanceof Error ? e.message : "予約取得に失敗しました", "error");
      setReservations([]);
    } finally {
      setResLoading(false);
    }
  };

  const updateResStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/admin/oc/reservations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "更新に失敗しました");
      }
      setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      // 残席が変わる可能性があるためイベント一覧も更新
      fetchEvents();
    } catch (e) {
      toast(e instanceof Error ? e.message : "更新に失敗しました", "error");
    }
  };

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title">オープンキャンパス</h1>
          <p className="wsdb-topbar-meta">説明会・体験イベントの管理と予約一覧</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* ===== Event管理 ===== */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">イベント一覧</h2>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新規イベント作成
            </button>
          </div>

          {error ? (
            <div className="card text-center py-8 text-red-600">
              <p>{error}</p>
              <button onClick={fetchEvents} className="btn-primary mt-4">再読み込み</button>
            </div>
          ) : loading ? (
            <div className="card text-center py-16 text-gray-500">読み込み中...</div>
          ) : events.length === 0 ? (
            <div className="card text-center py-16 text-gray-400">
              <p className="text-lg mb-2">イベントがありません</p>
              <p className="text-sm">「新規イベント作成」から最初のオープンキャンパスを作成してください</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-3 font-semibold">タイトル</th>
                    <th className="px-4 py-3 font-semibold">学校</th>
                    <th className="px-4 py-3 font-semibold">日時</th>
                    <th className="px-4 py-3 font-semibold text-right">定員</th>
                    <th className="px-4 py-3 font-semibold text-right">予約数</th>
                    <th className="px-4 py-3 font-semibold text-right">残席</th>
                    <th className="px-4 py-3 font-semibold">公開状態</th>
                    <th className="px-4 py-3 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className={`border-b border-gray-50 hover:bg-gray-50 ${selectedEvent?.id === ev.id ? "bg-navy-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{ev.title}</div>
                        <div className="text-xs text-gray-400">{ev.isOnline ? "オンライン" : (ev.location || "—")}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{schoolName(ev.schoolKey)}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDateTime(ev.startAt)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{ev.capacity}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy-700">{ev.reservedCount}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${ev.remaining === 0 ? "text-red-600" : "text-gray-700"}`}>{ev.remaining}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs border rounded-full px-2.5 py-0.5 font-semibold ${eventStatusStyle(ev.status)}`}>{ev.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => fetchReservations(ev)} className="text-xs text-navy-600 hover:text-navy-900 font-semibold border border-navy-200 rounded-lg px-2.5 py-1 hover:bg-navy-50">予約</button>
                          <button onClick={() => openEdit(ev)} className="text-xs text-gray-600 hover:text-gray-900 font-semibold border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">編集</button>
                          <button onClick={() => handleDelete(ev)} className="text-xs text-red-500 hover:text-red-700 font-semibold border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50">削除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ===== 予約一覧 ===== */}
        {selectedEvent && (
          <section>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">予約一覧</h2>
                <p className="text-sm text-gray-500">{selectedEvent.title}（{schoolName(selectedEvent.schoolKey)} / {fmtDateTime(selectedEvent.startAt)}）</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/admin/oc/reservations?eventId=${selectedEvent.id}&format=csv`}
                  className="btn-secondary text-sm"
                >
                  CSVダウンロード
                </a>
                <button onClick={() => { setSelectedEvent(null); setReservations([]); }} className="text-sm text-gray-500 hover:text-gray-800 px-2">閉じる</button>
              </div>
            </div>

            {resLoading ? (
              <div className="card text-center py-12 text-gray-500">読み込み中...</div>
            ) : reservations.length === 0 ? (
              <div className="card text-center py-12 text-gray-400">予約がありません</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-3 font-semibold">予約番号</th>
                      <th className="px-4 py-3 font-semibold">氏名</th>
                      <th className="px-4 py-3 font-semibold">連絡先</th>
                      <th className="px-4 py-3 font-semibold text-right">人数</th>
                      <th className="px-4 py-3 font-semibold">追加項目</th>
                      <th className="px-4 py-3 font-semibold">source</th>
                      <th className="px-4 py-3 font-semibold">ステータス</th>
                      <th className="px-4 py-3 font-semibold text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.reservationNo}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{r.name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          <div>{r.email}</div>
                          {r.phone && <div className="text-xs text-gray-400">{r.phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.attendees}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
                          {r.extraData ? (
                            <code className="block whitespace-pre-wrap break-words">{JSON.stringify(r.extraData)}</code>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.source || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs rounded-full px-2.5 py-0.5 font-semibold ${resStatusStyle(r.status)}`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => updateResStatus(r.id, "出席")}
                              disabled={r.status === "出席"}
                              className="text-xs font-semibold border border-green-200 text-green-700 rounded-lg px-2 py-1 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >出席</button>
                            <button
                              onClick={() => updateResStatus(r.id, "欠席")}
                              disabled={r.status === "欠席"}
                              className="text-xs font-semibold border border-amber-200 text-amber-700 rounded-lg px-2 py-1 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >欠席</button>
                            <button
                              onClick={() => updateResStatus(r.id, "キャンセル")}
                              disabled={r.status === "キャンセル"}
                              className="text-xs font-semibold border border-red-200 text-red-600 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >キャンセル</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ===== Create/Edit Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">{editEvent ? "イベントを編集" : "新規イベント作成"}</h3>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{formError}</div>
              )}
              <div>
                <label className="form-label">学校 <span className="form-required">*</span></label>
                <select className="form-input" value={fSchoolKey} onChange={(e) => setFSchoolKey(e.target.value)}>
                  <option value="">選択してください</option>
                  {schools.map((s) => <option key={s.schoolKey} value={s.schoolKey}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">タイトル <span className="form-required">*</span></label>
                <input type="text" className="form-input" placeholder="例: 春のオープンキャンパス" value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
              </div>
              <div>
                <label className="form-label">説明</label>
                <textarea className="form-input" rows={2} placeholder="イベントの説明（任意）" value={fDescription} onChange={(e) => setFDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">開催日時 <span className="form-required">*</span></label>
                  <input type="datetime-local" className="form-input text-sm" value={fStartAt} onChange={(e) => setFStartAt(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">終了日時</label>
                  <input type="datetime-local" className="form-input text-sm" value={fEndAt} onChange={(e) => setFEndAt(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">定員 <span className="form-required">*</span></label>
                  <input type="number" min={1} className="form-input" value={fCapacity} onChange={(e) => setFCapacity(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="form-label">公開状態</label>
                  <select className="form-input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                    {OC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-navy-600 focus:ring-navy-600" checked={fIsOnline} onChange={(e) => setFIsOnline(e.target.checked)} />
                <span className="text-sm text-gray-700">オンライン開催</span>
              </label>
              {fIsOnline ? (
                <div>
                  <label className="form-label">オンラインURL</label>
                  <input type="text" className="form-input" placeholder="https://..." value={fOnlineUrl} onChange={(e) => setFOnlineUrl(e.target.value)} />
                </div>
              ) : (
                <div>
                  <label className="form-label">会場</label>
                  <input type="text" className="form-input" placeholder="例: 本校3F 大講義室" value={fLocation} onChange={(e) => setFLocation(e.target.value)} />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>キャンセル</button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>{editEvent ? "更新" : "作成"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
