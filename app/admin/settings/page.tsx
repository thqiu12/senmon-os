"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUI } from "@/components/ui/toast";

interface SettingsState {
  enrollmentYears: string[];
  enrollmentMonth: string;
  meta?: { key: string; updatedAt: string; updatedBy: string | null }[];
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const { toast } = useUI();
  const [data, setData] = useState<SettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 編集用の入力テキスト（カンマ区切り）
  const [yearsInput, setYearsInput] = useState("");
  const [monthInput, setMonthInput] = useState("4");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => {
        if (r.status === 403) { router.push("/admin/dashboard"); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setData(d);
        setYearsInput(Array.isArray(d.enrollmentYears) ? d.enrollmentYears.join(", ") : "");
        setMonthInput(typeof d.enrollmentMonth === "string" ? d.enrollmentMonth : "4");
        setLoading(false);
      })
      .catch(() => {
        setError("設定の取得に失敗しました");
        setLoading(false);
      });
  }, [router]);

  const parseYears = (raw: string): string[] => {
    return raw
      .split(/[\s,、，]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const handleSave = async () => {
    const years = parseYears(yearsInput);
    if (years.length === 0) {
      setError("入学希望年を 1 つ以上入力してください");
      return;
    }
    if (years.some((y) => !/^\d{4}$/.test(y))) {
      setError("入学希望年は西暦 4 桁で入力してください（例: 2026）");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentYears: years,
          enrollmentMonth: monthInput,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "保存に失敗しました");
        if (j.issues?.fieldErrors) {
          const msgs = Object.entries(j.issues.fieldErrors as Record<string, string[]>)
            .map(([k, arr]) => `${k}: ${arr.join(", ")}`)
            .join(" / ");
          setError(msgs || "保存に失敗しました");
        }
      } else {
        toast("設定を保存しました", "success");
        // サーバ側でソート・重複排除済みの値を再取得して反映
        setYearsInput(Array.isArray(j.enrollmentYears) ? j.enrollmentYears.join(", ") : "");
        setMonthInput(j.enrollmentMonth || "4");
      }
    } catch {
      setError("ネットワークエラー");
    } finally {
      setSaving(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const previewYears = parseYears(yearsInput).filter((y) => /^\d{4}$/.test(y));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-800 text-white shadow-lg">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-navy-200 hover:text-white text-sm">← ダッシュボード</Link>
            <h1 className="font-bold">システム設定</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="card">読み込み中...</div>
        ) : (
          <>
            <section className="card">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-navy-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h2 className="text-lg font-bold text-navy-800">入学希望時期</h2>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-5">
                <div>
                  <label className="form-label">入学希望年（選択肢） <span className="form-required">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={yearsInput}
                    onChange={(e) => setYearsInput(e.target.value)}
                    placeholder="例: 2026, 2027, 2028"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    西暦 4 桁をカンマ・スペース・読点で区切って入力してください。出願フォームの「入学希望年」ドロップダウンに表示されます。
                  </p>

                  {/* プレビュー */}
                  {previewYears.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-bold text-blue-700 mb-2">プレビュー（出願フォームでの表示）</p>
                      <div className="bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm">
                        <select className="w-full bg-transparent outline-none text-sm">
                          <option>選択してください</option>
                          {[...previewYears].sort().map((y) => (
                            <option key={y}>{y}年</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[11px] text-blue-600 mt-1">
                        現在は {previewYears.length} 件の選択肢が登録されます（重複は自動で除去・昇順ソートされます）
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setYearsInput([currentYear, currentYear + 1, currentYear + 2].join(", "))}
                      className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg"
                    >
                      ↻ 当年 + 今後 2 年（{currentYear}〜{currentYear + 2}）
                    </button>
                    <button
                      type="button"
                      onClick={() => setYearsInput([currentYear + 1, currentYear + 2, currentYear + 3].join(", "))}
                      className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg"
                    >
                      ↻ 来年から 3 年（{currentYear + 1}〜{currentYear + 3}）
                    </button>
                  </div>
                </div>

                <div>
                  <label className="form-label">入学希望月</label>
                  <select
                    className="form-input"
                    value={monthInput}
                    onChange={(e) => setMonthInput(e.target.value)}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>{m}月</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    現在の出願フォームは表示のみ。実運用では 4 月入学固定で動作しています。
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    {data?.meta?.find((m) => m.key === "enrollmentYears")?.updatedAt
                      ? `最終更新: ${new Date(data.meta.find((m) => m.key === "enrollmentYears")!.updatedAt).toLocaleString("ja-JP")} (${data.meta.find((m) => m.key === "enrollmentYears")!.updatedBy || "不明"})`
                      : "未保存"}
                  </p>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary text-sm px-6"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            </section>

            <section className="card bg-gray-50">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-2">補足</h3>
              <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                <li>このページの設定は変更後すぐに出願フォームに反映されます（ブラウザの再読み込みが必要）。</li>
                <li>過去年度を残しておくと、過年度の問い合わせや再申請対応がしやすくなります。</li>
                <li>定員管理（/admin/cohorts）の入学年度とは独立した設定です。両方を揃えるとフォーム選択肢と定員割当が整合します。</li>
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
