"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUI } from "@/components/ui/toast";

interface AgentDetail {
  id: string;
  name: string;
  country: string;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  formToken: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { applications: number };
}

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
  status: string;
  matchedApplicationId: string | null;
  matchedAt: string | null;
  matchedBy: string | null;
  referredAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  "候補": "bg-blue-100 text-blue-700",
  "出願済": "bg-green-100 text-green-700",
  "辞退": "bg-gray-100 text-gray-600",
  "重複（他渠道優先）": "bg-amber-100 text-amber-700",
  "無効": "bg-red-100 text-red-700",
};

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    const [aRes, pRes] = await Promise.all([
      fetch(`/api/agents`),
      fetch(`/api/prospects?agentId=${encodeURIComponent(params.id)}&orderBy=name`),
    ]);
    if (aRes.status === 401) {
      router.push("/admin");
      return;
    }
    const agents = await aRes.json();
    const list = Array.isArray(agents) ? agents : (agents.agents || []);
    const found = list.find((a: AgentDetail) => a.id === params.id);
    setAgent(found || null);
    if (pRes.ok) setProspects(await pRes.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

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
      message: `${p.lastName} ${p.firstName} を削除します。元に戻せません。`,
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

  const generateToken = async () => {
    if (agent?.formToken) {
      const ok = await confirm({
        title: "新しい URL を発行しますか？",
        message: "現在のフォーム URL は無効になります。",
        danger: true,
        okLabel: "発行する",
      });
      if (!ok) return;
    }
    const res = await fetch(`/api/agents/${params.id}/form-token`, { method: "POST" });
    if (res.ok) fetchAll();
  };

  const revokeToken = async () => {
    const ok = await confirm({
      title: "フォーム URL を無効化しますか？",
      message: "渠道専用 URL が無効化されます。再度発行すれば復旧できます。",
      danger: true,
      okLabel: "無効化",
    });
    if (!ok) return;
    await fetch(`/api/agents/${params.id}/form-token`, { method: "DELETE" });
    fetchAll();
  };

  const copyUrl = async () => {
    if (!agent?.formToken) return;
    const url = `${window.location.origin}/prospects/new?token=${agent.formToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(`コピーしました: ${url}`, "success");
    } catch {
      window.prompt("URL をコピーしてください", url);
    }
  };

  const filtered = filterStatus
    ? prospects.filter((p) => p.status === filterStatus)
    : prospects;

  if (loading) {
    return <div className="p-10 text-center text-gray-500">読み込み中...</div>;
  }
  if (!agent) {
    return (
      <div className="p-10 text-center">
        <p className="text-gray-500 mb-4">エージェントが見つかりません</p>
        <Link href="/admin/agents" className="text-blue-600 hover:underline">一覧へ戻る</Link>
      </div>
    );
  }

  const countByStatus = (s: string) => prospects.filter((p) => p.status === s).length;

  return (
    <>
      <div className="wsdb-topbar">
        <div className="flex items-center gap-3">
          <Link href="/admin/agents" className="text-muted hover:text-ink text-sm">一覧</Link>
          <div>
            <h1 className="wsdb-topbar-title">{agent.name}</h1>
            <p className="wsdb-topbar-meta">渠道詳細・URL 発行・希望者一覧</p>
          </div>
          {!agent.isActive && <span className="wsdb-badge wsdb-badge-danger">無効</span>}
        </div>
      </div>

      <div className="space-y-5">
        {/* 渠道情報サマリー */}
        <div className="card grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">基本情報</p>
            <p className="font-semibold text-gray-800">{agent.name}</p>
            <p className="text-xs text-gray-600">{agent.country}</p>
            {agent.contactName && <p className="text-xs text-gray-600">担当: {agent.contactName}</p>}
            {agent.contactEmail && <p className="text-xs text-gray-600 break-all">{agent.contactEmail}</p>}
            {agent.notes && <p className="text-xs text-gray-400 mt-1">{agent.notes}</p>}
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">実績</p>
            <div className="flex gap-4">
              <div>
                <p className="text-2xl font-bold text-navy-700">{prospects.length}</p>
                <p className="text-xs text-gray-500">希望者登録</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{countByStatus("出願済")}</p>
                <p className="text-xs text-gray-500">出願完了</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">{agent._count.applications}</p>
                <p className="text-xs text-gray-500">紐付け申請</p>
              </div>
            </div>
            {prospects.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                成約率: <strong className="text-gray-600">{Math.round((countByStatus("出願済") / prospects.length) * 100)}%</strong>
              </p>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">渠道専用 URL</p>
            {agent.formToken ? (
              <>
                <p className="text-xs text-gray-700 break-all bg-gray-50 px-2 py-1 rounded mb-2">
                  /prospects/new?token={agent.formToken.slice(0, 12)}…
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={copyUrl} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full hover:bg-green-100">
                    URL コピー
                  </button>
                  <button onClick={generateToken} className="text-xs text-blue-600 hover:underline">再発行</button>
                  <button onClick={revokeToken} className="text-xs text-red-500 hover:underline">無効化</button>
                </div>
              </>
            ) : (
              <button onClick={generateToken} className="text-xs bg-gray-100 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-blue-50 hover:text-blue-700">
                URL を発行
              </button>
            )}
          </div>
        </div>

        {/* ステータス別フィルタ（タブ風） */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 px-1">
          {[
            { key: "", label: `すべて (${prospects.length})` },
            ...Object.keys(STATUS_COLORS).map((s) => ({ key: s, label: `${s} (${countByStatus(s)})` })),
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition ${
                filterStatus === tab.key
                  ? "border-navy-700 text-navy-800 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 希望者一覧 */}
        <div className="card overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">
              {prospects.length === 0
                ? "まだ希望者が登録されていません。URL を渠道に配布してください。"
                : "該当する希望者はいません"}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">氏名 (A→Z)</th>
                  <th className="text-left px-3 py-2">メール / 電話</th>
                  <th className="text-left px-3 py-2">志望校</th>
                  <th className="text-left px-3 py-2">ステータス</th>
                  <th className="text-left px-3 py-2">マッチ</th>
                  <th className="text-left px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <p className="font-semibold">{p.lastName} {p.firstName}</p>
                      {p.lastNameKana && <p className="text-xs text-gray-500">{p.lastNameKana} {p.firstNameKana}</p>}
                      {p.birthDate && <p className="text-xs text-gray-400">{p.birthDate}</p>}
                      {p.nationality && <p className="text-xs text-gray-400">{p.nationality}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {p.email && <p className="break-all">{p.email}</p>}
                      {p.phone && <p className="text-gray-500">{p.phone}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {p.intendedSchool && <p>{p.intendedSchool}</p>}
                      {p.intendedDepartment && <p className="text-gray-500">{p.intendedDepartment}</p>}
                      {p.enrollmentYear && <p className="text-gray-400">{p.enrollmentYear}年4月</p>}
                      {p.agentNotes && <p className="text-gray-400 italic mt-1">{p.agentNotes}</p>}
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
                        <Link
                          href={`/admin/applications/${p.matchedApplicationId}`}
                          className="text-green-600 hover:underline"
                        >
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
      </div>
    </>
  );
}
