"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTimeJP } from "@/lib/utils";
import { useUI } from "@/components/ui/toast";

type Role = "super_admin" | "admin" | "interviewer";

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const ROLE_CONFIG: Record<Role, { label: string; color: string; desc: string }> = {
  super_admin: { label: "スーパー管理者", color: "bg-purple-100 text-purple-800 border-purple-200", desc: "全機能 + アカウント管理" },
  admin: { label: "管理者", color: "bg-blue-100 text-blue-800 border-blue-200", desc: "申請管理・合否・手続き・通知" },
  interviewer: { label: "面接官", color: "bg-green-100 text-green-800 border-green-200", desc: "閲覧 + フィードバック入力" },
};

export default function AccountsPage() {
  const router = useRouter();
  const { confirm } = useUI();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // フォーム
  const [fUsername, setFUsername] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fDisplayName, setFDisplayName] = useState("");
  const [fRole, setFRole] = useState<Role>("admin");

  useEffect(() => {
    fetch("/api/admin/accounts")
      .then(r => {
        if (r.status === 403) { router.push("/admin/dashboard"); return null; }
        return r.json();
      })
      .then(d => { if (d) setUsers(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router]);

  const openCreate = () => {
    setEditUser(null);
    setFUsername(""); setFPassword(""); setFDisplayName(""); setFRole("admin");
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setFUsername(u.username); setFPassword(""); setFDisplayName(u.displayName); setFRole(u.role);
    setFormError(null);
    setShowModal(true);
  };

  /** zod の flatten() 形式から人間可読なメッセージ配列に整形 */
  const formatZodIssues = (issues: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined): string[] => {
    if (!issues) return [];
    const fieldLabel: Record<string, string> = {
      username: "ユーザー名",
      password: "パスワード",
      displayName: "表示名",
      role: "権限",
    };
    const msgs: string[] = [];
    for (const [field, errs] of Object.entries(issues.fieldErrors || {})) {
      const label = fieldLabel[field] || field;
      for (const e of errs) {
        // よくある zod メッセージを和訳
        let m = e;
        if (/at least 8|min.*8/i.test(e)) m = "8文字以上で入力してください";
        else if (/at least 3|min.*3/i.test(e)) m = "3文字以上で入力してください";
        else if (/at most|max/i.test(e)) m = "文字数が長すぎます";
        else if (/Invalid|invalid_string|regex/i.test(e)) m = "使える文字は半角英数字と _ . - のみです";
        else if (/Required|required/i.test(e)) m = "必須項目です";
        msgs.push(`${label}: ${m}`);
      }
    }
    for (const e of issues.formErrors || []) msgs.push(e);
    return msgs;
  };

  const handleSave = async () => {
    // クライアント側の事前チェック（API より前に止めて UX 改善）
    const clientErrors: string[] = [];
    if (!fDisplayName.trim()) clientErrors.push("表示名: 必須項目です");
    if (!editUser) {
      if (!fUsername.trim()) clientErrors.push("ユーザー名: 必須項目です");
      else if (fUsername.length < 3) clientErrors.push("ユーザー名: 3文字以上で入力してください");
      else if (!/^[a-zA-Z0-9_.-]+$/.test(fUsername)) clientErrors.push("ユーザー名: 使える文字は半角英数字と _ . - のみです");
      if (!fPassword) clientErrors.push("パスワード: 必須項目です");
      else if (fPassword.length < 8) clientErrors.push("パスワード: 8文字以上で入力してください");
    } else if (fPassword && fPassword.length < 8) {
      clientErrors.push("パスワード: 8文字以上で入力してください");
    }
    if (clientErrors.length > 0) {
      setFormError(clientErrors.join("\n"));
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = { displayName: fDisplayName, role: fRole };
      if (!editUser) { payload.username = fUsername; payload.password = fPassword; }
      if (editUser && fPassword) payload.password = fPassword;

      const url = editUser ? `/api/admin/accounts?id=${editUser.id}` : "/api/admin/accounts";
      const method = editUser ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        // API が zod の issues を返してきたら、具体的に展開して表示
        const detailed = formatZodIssues(data.issues);
        if (detailed.length > 0) {
          setFormError(detailed.join("\n"));
        } else {
          setFormError(data.error || "保存に失敗しました");
        }
        return;
      }

      if (editUser) {
        setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...data } : u));
      } else {
        setUsers(prev => [...prev, data]);
      }
      setShowModal(false);
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (user: AdminUser) => {
    const res = await fetch(`/api/admin/accounts?id=${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u));
    }
  };

  const handleDelete = async (user: AdminUser) => {
    const ok = await confirm({
      title: "アカウントを削除",
      message: `「${user.displayName}」のアカウントを削除しますか？`,
      danger: true,
      okLabel: "削除",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/accounts?id=${user.id}`, { method: "DELETE" });
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== user.id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-800 text-white py-4 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-navy-300 hover:text-white text-sm">← ダッシュボード</Link>
            <span className="text-navy-600">/</span>
            <h1 className="font-bold">アカウント管理</h1>
          </div>
          <button onClick={openCreate} className="bg-white text-navy-800 text-sm font-bold px-4 py-2 rounded-lg hover:bg-navy-50 transition-colors">
            ＋ 新規アカウント
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        {/* 権限説明カード */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {Object.entries(ROLE_CONFIG).map(([role, { label, color, desc }]) => (
            <div key={role} className="card p-4">
              <span className={`inline-block text-xs px-2 py-1 rounded-full border font-semibold mb-2 ${color}`}>{label}</span>
              <p className="text-xs text-gray-500">{desc}</p>
              <p className="text-xl font-bold text-navy-800 mt-2">
                {users.filter(u => u.role === role && u.isActive).length}
                <span className="text-sm font-normal text-gray-400 ml-1">名</span>
              </p>
            </div>
          ))}
        </div>

        {/* アカウント一覧 */}
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-navy-800 text-white">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">アカウント</th>
                <th className="text-left px-5 py-3 font-semibold">権限</th>
                <th className="text-left px-5 py-3 font-semibold">最終ログイン</th>
                <th className="text-left px-5 py-3 font-semibold">状態</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">読み込み中...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">アカウントがありません</td></tr>
              ) : users.map(user => (
                <tr key={user.id} className={`hover:bg-gray-50 ${!user.isActive ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-navy-800 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {user.displayName.slice(0, 1)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{user.displayName}</p>
                        <p className="text-xs text-gray-400">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${ROLE_CONFIG[user.role]?.color || ""}`}>
                      {ROLE_CONFIG[user.role]?.label || user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">
                    {user.lastLoginAt ? formatDateTimeJP(user.lastLoginAt) : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {user.isActive ? "有効" : "無効"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(user)} className="text-xs text-gray-500 hover:text-navy-700 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                        編集
                      </button>
                      <button onClick={() => handleToggleActive(user)}
                        className={`text-xs border px-2.5 py-1.5 rounded-lg transition-colors ${user.isActive ? "text-orange-600 border-orange-200 hover:bg-orange-50" : "text-green-600 border-green-200 hover:bg-green-50"}`}>
                        {user.isActive ? "無効化" : "有効化"}
                      </button>
                      <button onClick={() => handleDelete(user)} className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-navy-800">
                {editUser ? "アカウントを編集" : "新規アカウント作成"}
              </h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 whitespace-pre-line">
                  <p className="font-semibold mb-1">入力エラー</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {formError.split("\n").map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!editUser && (
                <div>
                  <label className="form-label">ユーザー名 <span className="form-required">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="3文字以上、半角英数字と _ . -"
                    value={fUsername}
                    onChange={e => setFUsername(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400 mt-1">3〜50文字。使える文字: a-z A-Z 0-9 _ . -</p>
                </div>
              )}

              <div>
                <label className="form-label">表示名 <span className="form-required">*</span></label>
                <input type="text" className="form-input" placeholder="例：田中 太郎" value={fDisplayName} onChange={e => setFDisplayName(e.target.value)} />
              </div>

              <div>
                <label className="form-label">
                  {editUser ? "新しいパスワード（変更する場合のみ）" : <>パスワード <span className="form-required">*</span></>}
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder={editUser ? "変更しない場合は空欄" : "8文字以上"}
                  value={fPassword}
                  onChange={e => setFPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {fPassword
                    ? fPassword.length < 8
                      ? <span className="text-red-500">あと {8 - fPassword.length} 文字必要</span>
                      : <span className="text-emerald-600">✓ 8文字以上</span>
                    : "8文字以上で入力してください"}
                </p>
              </div>

              <div>
                <label className="form-label">権限 <span className="form-required">*</span></label>
                <div className="space-y-2">
                  {(Object.entries(ROLE_CONFIG) as [Role, typeof ROLE_CONFIG[Role]][]).map(([role, { label, color, desc }]) => (
                    <label key={role} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${fRole === role ? "border-navy-500 bg-navy-50" : "border-gray-200 hover:border-gray-300"}`}>
                      <input type="radio" name="role" value={role} checked={fRole === role} onChange={() => setFRole(role)} className="hidden" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${color}`}>{label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                      </div>
                      {fRole === role && (
                        <svg className="w-5 h-5 text-navy-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl hover:bg-gray-50 text-sm transition-colors">
                キャンセル
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary text-sm disabled:opacity-50">
                {saving ? "保存中..." : editUser ? "更新する" : "作成する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
