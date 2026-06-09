"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export default function ProspectNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">読み込み中...</div>}>
      <ProspectNewInner />
    </Suspense>
  );
}

interface AgentInfo {
  id: string;
  name: string;
}

interface MyProspect {
  id: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  email: string | null;
  intendedSchool: string | null;
  intendedDepartment: string | null;
  enrollmentYear: string | null;
  status: string;
  matchedApplicationId: string | null;
  referredAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  "候補": "bg-blue-100 text-blue-700",
  "出願済": "bg-green-100 text-green-700",
  "辞退": "bg-gray-100 text-gray-600",
  "重複（他渠道優先）": "bg-amber-100 text-amber-700",
  "無効": "bg-red-100 text-red-700",
};

function ProspectNewInner() {
  const [token, setToken] = useState<string>("");
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [myProspects, setMyProspects] = useState<MyProspect[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // フォーム状態
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastNameKana, setLastNameKana] = useState("");
  const [firstNameKana, setFirstNameKana] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [nationality, setNationality] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [intendedSchool, setIntendedSchool] = useState("");
  const [intendedDepartment, setIntendedDepartment] = useState("");
  const [enrollmentYear, setEnrollmentYear] = useState("");
  const [expectedApplyDate, setExpectedApplyDate] = useState("");
  const [agentNotes, setAgentNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // トークンから渠道情報を取得
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("token") || "";
    setToken(t);
    if (!t) {
      setAuthError("渠道専用 URL が必要です。配布された URL からアクセスしてください。");
      setAuthLoading(false);
      return;
    }
    fetch(`/api/prospects/agent-by-token?token=${encodeURIComponent(t)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.id) {
          setAuthError("URL が無効です。最新の渠道専用 URL を運営にお問い合わせください。");
        } else {
          setAgent(d);
        }
      })
      .catch(() => setAuthError("ネットワークエラー"))
      .finally(() => setAuthLoading(false));
  }, []);

  const fetchHistory = async (t: string) => {
    if (!t) return;
    try {
      const res = await fetch(`/api/prospects/by-token?token=${encodeURIComponent(t)}`);
      if (res.ok) {
        const data = await res.json();
        setMyProspects(data.prospects || []);
      }
    } catch {
      // 履歴取得失敗は致命的でない
    }
  };

  useEffect(() => {
    if (agent && token) fetchHistory(token);
  }, [agent, token]);

  const reset = () => {
    setLastName(""); setFirstName(""); setLastNameKana(""); setFirstNameKana("");
    setBirthDate(""); setGender(""); setNationality("");
    setEmail(""); setPhone(""); setIntendedSchool(""); setIntendedDepartment("");
    setEnrollmentYear(""); setExpectedApplyDate(""); setAgentNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    if (!lastName.trim() || !firstName.trim()) {
      setError("姓・名は必須です");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          formToken: token,
          lastName: lastName.trim(),
          firstName: firstName.trim(),
          lastNameKana: lastNameKana.trim() || undefined,
          firstNameKana: firstNameKana.trim() || undefined,
          birthDate: birthDate || undefined,
          gender: gender || undefined,
          nationality: nationality.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          intendedSchool: intendedSchool.trim() || undefined,
          intendedDepartment: intendedDepartment.trim() || undefined,
          enrollmentYear: enrollmentYear || undefined,
          enrollmentMonth: "4",
          expectedApplyDate: expectedApplyDate || undefined,
          agentNotes: agentNotes.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "登録に失敗しました");
      } else {
        setSuccess(true);
        reset();
        fetchHistory(token);
        setTimeout(() => setSuccess(false), 4000);
      }
    } catch {
      setError("ネットワークエラー");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;
  }
  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-md bg-white rounded-2xl shadow p-8 text-center">
          <p className="text-3xl mb-4">🚫</p>
          <h1 className="text-lg font-bold text-gray-800 mb-2">アクセスできません</h1>
          <p className="text-sm text-gray-600 mb-4">{authError}</p>
          <Link href="/" className="text-sm text-blue-600 hover:underline">トップへ戻る</Link>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-800 text-white shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-lg flex items-center gap-2"><Icon name="clipboard" className="w-5 h-5" /> 希望者リスト 登録</h1>
            <p className="text-sm text-navy-200">渠道: <strong>{agent?.name}</strong></p>
          </div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-sm bg-navy-700 hover:bg-navy-600 px-3 py-2 rounded-lg whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <Icon name={showHistory ? "pencil" : "book"} className="w-4 h-4" />
            {showHistory ? "登録フォームへ" : `登録履歴 (${myProspects.length})`}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {showHistory ? (
          <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">これまでに登録した希望者</h2>
              <span className="text-xs text-gray-500">{myProspects.length} 件</span>
            </div>
            {myProspects.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">まだ登録された希望者はいません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2">氏名</th>
                      <th className="text-left px-4 py-2">メール</th>
                      <th className="text-left px-4 py-2">志望校 / 入学年</th>
                      <th className="text-left px-4 py-2">状態</th>
                      <th className="text-left px-4 py-2">登録日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myProspects.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          <p className="font-semibold">{p.lastName} {p.firstName}</p>
                          {p.lastNameKana && <p className="text-xs text-gray-400">{p.lastNameKana} {p.firstNameKana}</p>}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 break-all">{p.email || "—"}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {p.intendedSchool || "—"}
                          {p.intendedDepartment && <p className="text-gray-400">{p.intendedDepartment}</p>}
                          {p.enrollmentYear && <p className="text-gray-400">{p.enrollmentYear}年4月</p>}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] || "bg-gray-100"}`}>
                            {p.status}
                          </span>
                          {p.matchedApplicationId && (
                            <p className="text-[10px] text-green-600 mt-0.5">✓ 出願完了</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(p.referredAt).toLocaleDateString("ja-JP")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-6 py-3 bg-gray-50 text-xs text-gray-500 border-t border-gray-100">
              💡「出願完了」は学生が実際に出願し、自動マッチングされたことを示します。
            </div>
          </div>
        ) : (
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-5">
            出願前の学生情報を事前申告します。後から学生が出願したときに、メールアドレス or 氏名+生年月日で
            自動マッチングされ、{agent?.name} が紹介者として記録されます。
          </p>

          {success && (
            <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              ✅ 登録しました。続けて別の学生を登録できます。
            </div>
          )}
          {error && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Section title="氏名（必須）">
              <Row>
                <FieldText label="姓" required value={lastName} onChange={setLastName} placeholder="山田" />
                <FieldText label="名" required value={firstName} onChange={setFirstName} placeholder="太郎" />
              </Row>
              <Row>
                <FieldText label="姓（カナ）" value={lastNameKana} onChange={setLastNameKana} placeholder="ヤマダ" />
                <FieldText label="名（カナ）" value={firstNameKana} onChange={setFirstNameKana} placeholder="タロウ" />
              </Row>
            </Section>

            <Section title="基本情報（任意・マッチング精度向上）">
              <Row>
                <FieldDate label="生年月日" value={birthDate} onChange={setBirthDate} />
                <FieldSelect label="性別" value={gender} onChange={setGender} options={["", "男性", "女性", "その他"]} />
              </Row>
              <Row>
                <FieldText label="国籍" value={nationality} onChange={setNationality} placeholder="中国" />
                <FieldText label="メールアドレス" type="email" value={email} onChange={setEmail} placeholder="student@example.com" />
              </Row>
              <Row>
                <FieldText label="電話番号" type="tel" value={phone} onChange={setPhone} placeholder="090-1234-5678" />
                <div />
              </Row>
            </Section>

            <Section title="出願予定">
              <Row>
                <FieldText label="志望校" value={intendedSchool} onChange={setIntendedSchool} placeholder="中央ゼミナール" />
                <FieldText label="志望学科" value={intendedDepartment} onChange={setIntendedDepartment} placeholder="大学受験科" />
              </Row>
              <Row>
                <FieldSelect label="入学希望年" value={enrollmentYear} onChange={setEnrollmentYear} options={["", ...years.map(String)]} />
                <FieldDate label="出願予定日" value={expectedApplyDate} onChange={setExpectedApplyDate} />
              </Row>
            </Section>

            <Section title="メモ">
              <label className="block">
                <span className="text-xs text-gray-600 mb-1 block">渠道メモ（学生の特徴・補足）</span>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-y min-h-[80px]"
                  value={agentNotes}
                  onChange={(e) => setAgentNotes(e.target.value)}
                  placeholder="例：日本語 N2 レベル / 11月に来日予定 / 大学進学希望"
                  maxLength={1000}
                />
              </label>
            </Section>

            <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={submitting}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >クリア</button>
              <button
                type="submit"
                disabled={submitting || !lastName || !firstName}
                className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-lg"
              >
                {submitting ? "登録中..." : "登録する"}
              </button>
            </div>
          </form>
        </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          このフォームは渠道専用です。複数学生を連続で登録できます。<br />
          登録後、運営側で自動マッチングが行われます。
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function FieldText({ label, required, value, onChange, placeholder, type = "text" }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        type={type}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function FieldDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 mb-1 block">{label}</span>
      <input
        type="date"
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 mb-1 block">{label}</span>
      <select
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o || "選択してください"}</option>
        ))}
      </select>
    </label>
  );
}
