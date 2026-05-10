"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUI } from "@/components/ui/toast";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

interface Agent {
  id: string;
  name: string;
  country: string;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { applications: number };
}

const COUNTRIES = [
  "中国", "韓国", "ベトナム", "フィリピン", "インドネシア", "ネパール",
  "ミャンマー", "タイ", "スリランカ", "バングラデシュ", "インド",
  "マレーシア", "モンゴル", "台湾", "日本", "その他",
];

const FLAG: Record<string, string> = {
  中国: "🇨🇳", 韓国: "🇰🇷", ベトナム: "🇻🇳", フィリピン: "🇵🇭",
  インドネシア: "🇮🇩", ネパール: "🇳🇵", ミャンマー: "🇲🇲", タイ: "🇹🇭",
  スリランカ: "🇱🇰", バングラデシュ: "🇧🇩", インド: "🇮🇳",
  マレーシア: "🇲🇾", モンゴル: "🇲🇳", 台湾: "🇹🇼", 日本: "🇯🇵", その他: "🌏",
};

export default function AgentsPage() {
  const router = useRouter();
  const { confirm } = useUI();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);

  // フォーム
  const [name, setName] = useState("");
  const [country, setCountry] = useState("中国");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notes, setNotes] = useState("");

  const fetchAgents = async () => {
    const res = await fetch("/api/agents");
    if (res.status === 401) { router.push("/admin"); return; }
    const data = await res.json();
    setAgents(Array.isArray(data) ? data : (data.agents || []));
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setName(""); setCountry("中国"); setContactName(""); setContactEmail(""); setNotes("");
    setShowForm(true);
  };

  const openEdit = (a: Agent) => {
    setEditTarget(a);
    setName(a.name); setCountry(a.country || "中国");
    setContactName(a.contactName || ""); setContactEmail(a.contactEmail || "");
    setNotes(a.notes || "");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const url = editTarget ? `/api/agents/${editTarget.id}` : "/api/agents";
      const method = editTarget ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, country, contactName, contactEmail, notes }),
      });
      if (res.ok) {
        setShowForm(false);
        await fetchAgents();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (agent: Agent) => {
    await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !agent.isActive }),
    });
    await fetchAgents();
  };

  const handleDelete = async (agent: Agent) => {
    const ok = await confirm({
      title: "エージェントを削除",
      message: `「${agent.name}」を削除しますか？\n紐づく申請のエージェント情報はクリアされます。`,
      danger: true,
      okLabel: "削除",
    });
    if (!ok) return;
    await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    await fetchAgents();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-screen-xl mx-auto">
          <SkeletonList rows={5} cols={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-800 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-navy-300 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="font-bold text-lg">エージェント管理</h1>
              <p className="text-navy-300 text-xs">紹介元・中介機関の管理</p>
            </div>
          </div>
          <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新規追加
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* 統計 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-2xl font-bold text-navy-800">{agents.length}</p>
            <p className="text-xs text-gray-500 mt-1">登録エージェント数</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-green-700">{agents.filter(a => a.isActive).length}</p>
            <p className="text-xs text-gray-500 mt-1">アクティブ</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-navy-800">
              {agents.reduce((s, a) => s + a._count.applications, 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">紹介申請数（合計）</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-gray-500">
              {new Set(agents.map(a => a.country).filter(Boolean)).size}
            </p>
            <p className="text-xs text-gray-500 mt-1">対応国数</p>
          </div>
        </div>

        {/* エージェント一覧 */}
        <div className="card">
          <h2 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-4">
            エージェント一覧
          </h2>
          {agents.length === 0 ? (
            <EmptyState
              icon="🤝"
              title="エージェントがまだ登録されていません"
              description="紹介エージェントを追加すると、申請に紐付けて管理できます。"
              action={
                <button onClick={openCreate} className="btn-primary text-sm">
                  最初のエージェントを追加
                </button>
              }
            />
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    agent.isActive
                      ? "border-gray-200 bg-white hover:border-navy-300"
                      : "border-dashed border-gray-200 bg-gray-50 opacity-60"
                  }`}
                >
                  {/* 国旗 */}
                  <div className="text-2xl w-10 text-center shrink-0">
                    {FLAG[agent.country] || "🌏"}
                  </div>

                  {/* メイン情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-navy-800">{agent.name}</span>
                      {agent.country && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {agent.country}
                        </span>
                      )}
                      {!agent.isActive && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                          無効
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                      {agent.contactName && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {agent.contactName}
                        </span>
                      )}
                      {agent.contactEmail && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {agent.contactEmail}
                        </span>
                      )}
                      {agent.notes && (
                        <span className="text-gray-400 truncate max-w-xs">📝 {agent.notes}</span>
                      )}
                    </div>
                  </div>

                  {/* 申請数バッジ */}
                  <div className="text-center shrink-0">
                    <p className="text-xl font-bold text-navy-700">{agent._count.applications}</p>
                    <p className="text-xs text-gray-400">申請数</p>
                  </div>

                  {/* アクション */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(agent)}
                      className="p-2 text-gray-500 hover:text-navy-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title="編集"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleToggleActive(agent)}
                      className={`p-2 rounded-lg transition-colors ${
                        agent.isActive
                          ? "text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                          : "text-green-600 hover:bg-green-50"
                      }`}
                      title={agent.isActive ? "無効にする" : "有効にする"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {agent.isActive ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        )}
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(agent)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="削除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* モーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="bg-navy-800 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold">{editTarget ? "エージェント編集" : "エージェント新規追加"}</h2>
              <button onClick={() => setShowForm(false)} className="text-navy-300 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label">エージェント名 <span className="form-required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="例：東方留学サービス"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">国・地域</label>
                <select className="form-input" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{FLAG[c] || "🌏"} {c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">担当者名</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="例：王 麗華"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">担当者メール</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="agent@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">メモ</label>
                <textarea
                  className="form-input min-h-[80px] resize-y"
                  placeholder="合格率傾向、送り込み実績、注意事項など"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="flex-1 btn-primary text-sm"
                >
                  {saving ? "保存中..." : editTarget ? "更新する" : "追加する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
