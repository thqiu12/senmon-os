"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/components/ui/toast";
import { HelpTip } from "@/components/admin/HelpTip";

interface DeletedApp {
  id: string;
  applicationNo: string;
  lastName: string;
  firstName: string;
  schoolName: string;
  department: string;
  status: string;
  createdAt: string;
  deletedAt: string;
  deletedBy: string | null;
  deleteReason: string | null;
}

export default function TrashPage() {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [rows, setRows] = useState<DeletedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/deleted-applications");
    if (res.status === 401 || res.status === 403) { router.push("/admin"); return; }
    if (res.ok) setRows(await res.json());
    setLoading(false);
  };
  useEffect(() => { fetchRows(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const restore = async (app: DeletedApp) => {
    const ok = await confirm({ title: "出願を復元", message: `「${app.lastName} ${app.firstName}」を復元しますか？通常の一覧に戻ります。`, okLabel: "復元" });
    if (!ok) return;
    setRestoringId(app.id);
    try {
      const res = await fetch(`/api/applications/${app.id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "復元に失敗しました");
      toast("復元しました", "success");
      await fetchRows();
    } catch (e) {
      toast(e instanceof Error ? e.message : "復元に失敗しました", "error");
    } finally {
      setRestoringId(null);
    }
  };

  const fmt = (s: string) => new Date(s).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title inline-flex items-center gap-2">削除済み出願<HelpTip text={"削除（ゴミ箱に移動）した出願の一覧です。誤って削除した場合は「復元」で元に戻せます。誰が・いつ・なぜ削除したかの記録が残ります。"} /></h1>
          <p className="wsdb-topbar-meta">ゴミ箱・操作ログ（復元可）</p>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-16 text-gray-400">読み込み中...</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-16 shadow-sm text-gray-400">削除済みの出願はありません</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-800 text-white">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-xs whitespace-nowrap">申請番号</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs whitespace-nowrap">氏名</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs whitespace-nowrap">志望校</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs whitespace-nowrap">削除者</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs whitespace-nowrap">削除日時</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs">理由</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{r.applicationNo}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className="font-semibold text-gray-900">{r.lastName} {r.firstName}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-700"><p className="whitespace-nowrap">{r.schoolName}</p><p className="text-gray-400">{r.department}</p></td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{r.deletedBy || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(r.deletedAt)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[220px]"><span className="break-words [overflow-wrap:anywhere]">{r.deleteReason || "—"}</span></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => restore(r)} disabled={restoringId === r.id} className="text-xs font-semibold text-navy-700 bg-white border border-navy-200 hover:bg-navy-50 px-3 py-1.5 rounded-lg disabled:opacity-50">
                        {restoringId === r.id ? "復元中..." : "復元"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
