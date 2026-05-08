import Link from "next/link";

export const metadata = {
  title: "入学出願システム｜羽場学園・平井学園",
  description: "学校法人羽場学園 中央ゼミナール・学校法人平井学園 神奈川柔整鍼灸専門学校 オンライン入学出願システム",
};

const SCHOOLS = [
  {
    id: "chuo-seminar",
    name: "中央ゼミナール",
    hojin: "学校法人 羽場学園",
    icon: "📚",
    color: { header: "bg-blue-600", btn: "bg-blue-600 hover:bg-blue-700", tag: "bg-blue-50 text-blue-700 border-blue-100", badge: "bg-blue-100 text-blue-700", ring: "ring-blue-200" },
    desc: "大学・大学院・美術系の受験指導に特化した専修学校。留学生向けの日本語指導から難関大学合格まで、個別カリキュラムで徹底サポートします。",
    departments: [
      { name: "大学・大学院受験科", duration: "1年制" },
      { name: "美術系受験科", duration: "1年制" },
    ],
  },
  {
    id: "tdb",
    name: "東京デジタルビジネス専門学校",
    nameShort: "TDB",
    hojin: "学校法人 羽場学園",
    icon: "💻",
    color: { header: "bg-violet-600", btn: "bg-violet-600 hover:bg-violet-700", tag: "bg-violet-50 text-violet-700 border-violet-100", badge: "bg-violet-100 text-violet-700", ring: "ring-violet-200" },
    desc: "デジタルビジネス・デジタルメディアの実践スキルを習得する専門学校。最新テクノロジーとビジネスを融合した教育で、デジタル社会を牽引する人材を育成します。",
    departments: [
      { name: "デジタルビジネス科", duration: "2年制" },
      { name: "中国語デジタルビジネス科", duration: "2年制" },
    ],
  },
  {
    id: "kanagawa-judo",
    name: "神奈川柔整鍼灸専門学校",
    hojin: "学校法人 平井学園",
    icon: "⚕️",
    color: { header: "bg-emerald-600", btn: "bg-emerald-600 hover:bg-emerald-700", tag: "bg-emerald-50 text-emerald-700 border-emerald-100", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-200" },
    desc: "柔道整復師・鍼灸師の国家資格取得を目指す専門学校。豊富な臨床実習と国家試験対策で、医療・スポーツ分野で活躍できる人材を育成します。",
    departments: [
      { name: "柔道整復師科", duration: "3年制" },
      { name: "鍼灸師科", duration: "3年制" },
      { name: "柔道整復師・鍼灸師ダブルライセンス科", duration: "3年制" },
      { name: "大学進学科", duration: "1年制" },
    ],
  },
];

const STEPS = [
  { n: 1, icon: "👤", label: "個人情報", sub: "氏名・連絡先・住所" },
  { n: 2, icon: "🏫", label: "志望校選択", sub: "学校・学科・コース" },
  { n: 3, icon: "📎", label: "書類提出", sub: "成績・語学証明 等" },
  { n: 4, icon: "💴", label: "選考費支払", sub: "¥20,000〜" },
  { n: 5, icon: "✅", label: "確認・提出", sub: "内容確認後に送信" },
];

const durationColor: Record<string, string> = {
  "1年制": "bg-blue-100 text-blue-700",
  "2年制": "bg-purple-100 text-purple-700",
  "3年制": "bg-orange-100 text-orange-700",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">専</div>
            <div>
              <p className="font-bold text-gray-800 text-sm leading-none">入学出願システム</p>
              <p className="text-xs text-gray-400 mt-0.5">Online Application System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/apply/status" className="text-sm text-gray-500 hover:text-gray-800 transition hidden sm:block">出願状況確認</Link>
            <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg transition">管理者</Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-14 text-center">
            <span className="inline-block text-xs font-semibold tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-5">ONLINE APPLICATION</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
              入学願書<br className="sm:hidden" /> オンライン出願
            </h1>
            <p className="text-gray-500 text-base max-w-xl mx-auto leading-relaxed">
              24時間いつでもオンラインで出願手続きができます。<br/>
              必要書類をデジタルでご提出ください。
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">

          {/* 学校カード */}
          <section>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">志望校を選んで出願する</h2>
            <div className="grid md:grid-cols-3 gap-5">
              {SCHOOLS.map(school => (
                <div key={school.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                  {/* カラーヘッダー */}
                  <div className={`${school.color.header} px-5 py-5`}>
                    <div className="text-3xl mb-2">{school.icon}</div>
                    <p className="text-white/70 text-xs mb-0.5">{school.hojin}</p>
                    <h3 className="text-white font-bold text-lg leading-snug">
                      {school.name}
                      {"nameShort" in school && <span className="text-white/60 text-sm ml-1">（{(school as typeof school & {nameShort: string}).nameShort}）</span>}
                    </h3>
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <p className="text-gray-500 text-sm leading-relaxed mb-5">{school.desc}</p>

                    {/* 学科リスト */}
                    <div className="mb-5 flex-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">学科</p>
                      <div className="flex flex-col gap-2">
                        {school.departments.map(d => (
                          <div key={d.name} className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2.5 py-1 rounded-full border ${school.color.tag}`}>{d.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${durationColor[d.duration] ?? "bg-gray-100 text-gray-600"}`}>{d.duration}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Link href={`/apply?school=${school.id}`}
                      className={`block w-full ${school.color.btn} text-white text-center text-sm font-semibold py-3 rounded-xl transition-colors`}>
                      出願する →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 出願の流れ */}
          <section>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">出願の流れ</h2>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-start gap-0 overflow-x-auto pb-2">
                {STEPS.map((step, i) => (
                  <div key={step.n} className="flex items-center flex-shrink-0">
                    <div className="flex flex-col items-center text-center w-24 sm:w-28">
                      <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-2xl mb-2">
                        {step.icon}
                      </div>
                      <span className="text-xs text-blue-600 font-bold mb-0.5">STEP {step.n}</span>
                      <span className="text-xs font-bold text-gray-800 leading-tight mb-0.5">{step.label}</span>
                      <span className="text-xs text-gray-400 leading-tight">{step.sub}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="text-gray-300 text-xl mx-1 flex-shrink-0 mt-[-16px]">›</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-5 border-t border-gray-100 grid sm:grid-cols-3 gap-3">
                {[
                  { icon: "🏷️", label: "選考区分", val: "一般 / 指定推薦 / 特待生" },
                  { icon: "📎", label: "必要書類", val: "証明写真・成績・出席・語学証明 等" },
                  { icon: "💴", label: "選考費", val: "振込 or オンライン決済で完了" },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-xl flex-shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-gray-500">{item.label}</p>
                      <p className="text-xs text-gray-700">{item.val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* サブリンク */}
          <section className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">📋</div>
              <div>
                <h3 className="font-bold text-gray-800 mb-1">出願状況の確認</h3>
                <p className="text-gray-500 text-sm mb-3">申請番号とメールアドレスで審査状況を確認できます。</p>
                <Link href="/apply/status" className="text-sm text-blue-600 font-semibold hover:underline">状況を確認する →</Link>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex items-start gap-4">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">📞</div>
              <div>
                <h3 className="font-bold text-gray-800 mb-1">お問い合わせ</h3>
                <p className="text-gray-500 text-sm">出願に関するご不明点は各校の入学相談室（平日 9:00〜17:00）までお問い合わせください。</p>
              </div>
            </div>
          </section>

        </div>
      </main>

      <footer className="bg-white border-t border-gray-100 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-gray-400 text-xs">
            © 2024 学校法人羽場学園 中央ゼミナール / 学校法人平井学園 神奈川柔整鍼灸専門学校
          </p>
        </div>
      </footer>
    </div>
  );
}
