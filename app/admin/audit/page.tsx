"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/components/ui/toast";
import { HelpTip } from "@/components/admin/HelpTip";
import { AUDIT_ACTION_LABELS, auditActionLabel, AUDIT_ACTIONS } from "@/lib/auditActions";

interface AuditLog {
  id: string;
  actorName: string;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string;
  meta: string | null;
  ip: string | null;
  createdAt: string;
}

const btnSmall =
  "text-xs font-semibold text-navy-700 bg-white border border-navy-200 hover:bg-navy-50 px-3 py-1.5 rounded-lg disabled:opacity-50";

export default function AuditLogPage() {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (action !== "all") params.set("action", action);
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", `${to}T23:59:59`);
    const res = await fetch(`/api/admin/audit-logs?${params}`);
    if (res.status === 401 || res.status === 403) { router.push("/admin"); return; }
    if (res.ok) {
      const d = await res.json();
      setRows(d.logs ?? []);
      setTotalPages(d.totalPages ?? 1);
      setTotal(d.total ?? 0);
    }
    setLoading(false);
  }, [page, action, search, from, to, router]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const restore = async (log: AuditLog) => {
    if (!log.targetId) return;
    const ok = await confirm({ title: "出願を復元", message: `「${log.targetLabel ?? log.targetId}」を復元しますか？通常の一覧に戻ります。`, okLabel: "復元" });
    if (!ok) return;
    setRestoringId(log.id);
    try {
      const res = await fetch(`/api/applications/${log.targetId}/restore`, { method: "POST" });
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

  const hasFilter = action !== "all" || search || from || to;

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title inline-flex items-center gap-2">操作ログ<HelpTip text={"管理画面で行われた操作の記録です。誰が・いつ・何を・どの対象に行ったかが残ります。削除の行からは「復元」できます。"} /></h1>
          <p className="wsdb-topbar-meta">管理操作の履歴（{total} 件 / 1ページ最大50件）</p>
        </div>
      </div>

      {/* フィルタ */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <select className="form-input w-44" value={action} onChange={e => { setAction(e.target.value); setPage(1); }}>
          <option value="all">すべての操作</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }} className="flex gap-2">
          <input className="form-input w-52" placeholder="操作者・対象・概要で検索" value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          <button type="submit" className={btnSmall}>検索</button>
        </form>
        <input type="date" className="form-input w-40" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} />
        <span className="text-gray-400 text-sm self-center">〜</span>
        <input type="date" className="form-input w-40" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} />
        {hasFilter && (
          <button onClick={() => { setAction("all"); setSearch(""); setSearchInput(""); setFrom(""); setTo(""); setPage(1); }} className="text-xs text-gray-500 hover:text-gray-800 underline self-center">クリア</button>
        )}
      </div>

      {loading ? (
        <div className="card text-center py-16 text-gray-400">読み込み中...</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-16 shadow-sm text-gray-400">操作ログはありません</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-navy-800 text-white">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-xs whitespace-nowrap">日時</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs whitespace-nowrap">操作者</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs whitespace-nowrap">操作</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">概要</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(r.createdAt)}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{r.actorName}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="text-xs font-semibold bg-navy-50 text-navy-700 border border-navy-100 px-2 py-0.5 rounded-full">{auditActionLabel(r.action)}</span></td>
                      <td className="px-4 py-3 text-xs text-gray-700"><span className="break-words [overflow-wrap:anywhere]">{r.summary}</span></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.action === AUDIT_ACTIONS.APPLICATION_DELETE && r.targetId && (
                          <button onClick={() => restore(r)} disabled={restoringId === r.id} className={btnSmall}>
                            {restoringId === r.id ? "復元中..." : "復元"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ページング（50件/ページ） */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button disabled={page <= 1} onClick={() => setPage(1)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">«</button>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">前へ</button>
              <span className="text-sm text-gray-600 px-2">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">次へ</button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">»</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
