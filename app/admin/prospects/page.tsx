"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUI } from "@/components/ui/toast";

interface Prospect {
  id: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  birthDate: string | null;
  gender: string | null;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  intendedSchool: string | null;
  intendedDepartment: string | null;
  enrollmentYear: string | null;
  expectedApplyDate: string | null;
  agentNotes: string | null;
  agentId: string;
  agent: { id: string; name: string; country: string };
  status: string;
  matchedApplicationId: string | null;
  matchedAt: string | null;
  matchedBy: string | null;
  adminMemo: string | null;
  createdAt: string;
  referredAt: string;
}

interface DuplicateGroup {
  key: string;
  reason: "email" | "name-birth" | "name";
  prospects: Array<{
    id: string;
    lastName: string;
    firstName: string;
    email: string | null;
    birthDate: string | null;
    agentName: string;
    referredAt: string;
    status: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  "候補": "bg-blue-100 text-blue-700",
  "出願済": "bg-green-100 text-green-700",
  "辞退": "bg-gray-100 text-gray-600",
  "重複（他渠道優先）": "bg-amber-100 text-amber-700",
  "無効": "bg-red-100 text-red-700",
};

export default function AdminProspectsPage() {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "duplicates">("all");

  const fetchAll = async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("q", search.trim());
    if (filterStatus) sp.set("status", filterStatus);
    if (filterAgent) sp.set("agentId", filterAgent);
    sp.set("orderBy", "name");
    const [pRes, dRes] = await Promise.all([
      fetch(`/api/prospects?${sp}`),
      fetch("/api/prospects/duplicates"),
    ]);
    if (pRes.status === 403) {
      router.push("/admin/dashboard");
      return;
    }
    if (pRes.ok) setProspects(await pRes.json());
    if (dRes.ok) {
      const d = await dRes.json();
      setDuplicates(d.groups || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentOptions = Array.from(
    new Map(prospects.map((p) => [p.agentId, p.agent.name])).entries(),
  );

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast(`ステータスを「${status}」に更新しました`, "success");
      fetchAll();
    } else {
      toast("更新に失敗しました", "error");
    }
  };

  const deleteProspect = async (p: Prospect) => {
    const ok = await confirm({
      title: "希望者を削除しますか？",
      message: `${p.lastName} ${p.firstName} (渠道: ${p.agent.name}) を削除します。元に戻せません。`,
      okLabel: "削除する",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/prospects/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("削除しました", "success");
      fetchAll();
    } else {
      toast("削除に失敗しました", "error");
    }
  };

  return (
    <>
      <div className="wsdb-topbar">
        <div>
          <h1 className="wsdb-topbar-title">希望者リスト</h1>
          <p className="wsdb-topbar-meta">渠道経由の出願候補者管理 + 重複検出</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="wsdb-badge wsdb-badge-info">候補 {prospects.filter((p) => p.status === "候補").length}</span>
          <span className="wsdb-badge wsdb-badge-ok">出願済 {prospects.filter((p) => p.status === "出願済").length}</span>
          {duplicates.length > 0 && <span className="wsdb-badge wsdb-badge-warn">重複 {duplicates.length}</span>}
        </div>
      </div>

      <div className="space-y-5">
        {/* タブ */}
        <div className="flex border-b border-gray-200 gap-1">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeTab === "all" ? "border-navy-700 text-navy-800 bg-white" : "border-transparent text-gray-500"
            }`}
          >
            全希望者 ({prospects.length})
          </button>
          <button
            onClick={() => setActiveTab("duplicates")}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeTab === "duplicates" ? "border-amber-500 text-amber-800 bg-white" : "border-transparent text-gray-500"
            }`}
          >
            重複検出 ({duplicates.length})
          </button>
        </div>

        {/* 全希望者タブ */}
        {activeTab === "all" && (
          <>
            <div className="card flex flex-wrap items-end gap-3">
              <div>
                <label className="form-label">検索（氏名・メール）</label>
                <input
                  className="form-input min-w-[200px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchAll()}
                  placeholder="山田 / @example.com"
                />
              </div>
              <div>
                <label className="form-label">ステータス</label>
                <select className="form-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">すべて</option>
                  {Object.keys(STATUS_COLORS).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">渠道</label>
                <select className="form-input" value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
                  <option value="">すべて</option>
                  {agentOptions.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
              <button onClick={fetchAll} className="btn-primary text-sm px-4">適用</button>
            </div>

            <div className="card overflow-x-auto">
              {loading ? (
                <p className="text-center py-6 text-gray-500">読み込み中...</p>
              ) : prospects.length === 0 ? (
                <p className="text-center py-6 text-gray-400">該当する希望者はいません</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2">氏名 (A→Z)</th>
                      <th className="text-left px-3 py-2">渠道</th>
                      <th className="text-left px-3 py-2">メール / 電話</th>
                      <th className="text-left px-3 py-2">志望校</th>
                      <th className="text-left px-3 py-2">ステータス</th>
                      <th className="text-left px-3 py-2">マッチ</th>
                      <th className="text-left px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <p className="font-semibold">{p.lastName} {p.firstName}</p>
                          {p.lastNameKana && <p className="text-xs text-gray-500">{p.lastNameKana} {p.firstNameKana}</p>}
                          {p.birthDate && <p className="text-xs text-gray-400">{p.birthDate}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-700">{p.agent.name}</p>
                          {p.agent.country && <p className="text-xs text-gray-400">{p.agent.country}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {p.email && <p className="break-all">{p.email}</p>}
                          {p.phone && <p className="text-gray-500">{p.phone}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {p.intendedSchool && <p>{p.intendedSchool}</p>}
                          {p.intendedDepartment && <p className="text-gray-500">{p.intendedDepartment}</p>}
                          {p.enrollmentYear && <p className="text-gray-400">{p.enrollmentYear}年4月</p>}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={p.status}
                            onChange={(e) => updateStatus(p.id, e.target.value)}
                            className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[p.status] || ""}`}
                          >
                            {Object.keys(STATUS_COLORS).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {p.matchedApplicationId ? (
                            <Link href={`/admin/applications/${p.matchedApplicationId}`}
                              className="text-green-600 hover:underline">
                              紐付け済
                            </Link>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                          {p.matchedBy && <p className="text-gray-400">{p.matchedBy}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => deleteProspect(p)}
                            className="text-xs text-gray-500 hover:text-red-600"
                          >削除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* 重複検出タブ */}
        {activeTab === "duplicates" && (
          <div className="card">
            <p className="text-xs text-gray-600 mb-4">
              複数の渠道から同じ学生が登録されている可能性があります。名前のアルファベット順で表示。
            </p>
            {duplicates.length === 0 ? (
              <p className="text-center py-6 text-gray-400">重複は検出されませんでした</p>
            ) : (
              <div className="space-y-4">
                {duplicates.map((g, idx) => {
                  const reasonLabel = g.reason === "email" ? "メール一致"
                    : g.reason === "name-birth" ? "氏名+生年月日 一致"
                    : "氏名のみ一致";
                  const reasonBg = g.reason === "email" ? "bg-red-50 border-red-200"
                    : g.reason === "name-birth" ? "bg-amber-50 border-amber-200"
                    : "bg-yellow-50 border-yellow-200";
                  return (
                    <div key={idx} className={`rounded-xl border-2 ${reasonBg} p-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-bold text-gray-900">{g.prospects[0].lastName} {g.prospects[0].firstName}</p>
                          <p className="text-xs text-gray-600">
                            {reasonLabel} — {g.prospects.length} 件
                          </p>
                        </div>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="text-gray-500">
                          <tr>
                            <th className="text-left py-1">渠道</th>
                            <th className="text-left py-1">登録日</th>
                            <th className="text-left py-1">メール</th>
                            <th className="text-left py-1">誕生日</th>
                            <th className="text-left py-1">状態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.prospects.map((p) => (
                            <tr key={p.id} className="border-t border-white/60">
                              <td className="py-1 font-medium text-gray-800">{p.agentName}</td>
                              <td className="py-1 text-gray-600">{new Date(p.referredAt).toLocaleDateString("ja-JP")}</td>
                              <td className="py-1 text-gray-600 break-all">{p.email || "—"}</td>
                              <td className="py-1 text-gray-600">{p.birthDate || "—"}</td>
                              <td className="py-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] || ""}`}>
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-gray-500 mt-2 italic">
                        推奨：先に登録された渠道を「候補」のまま残し、後発を「重複（他渠道優先）」に変更してください。
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
