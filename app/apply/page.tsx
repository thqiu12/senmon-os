"use client";

import React, { useState } from "react";
import Link from "next/link";

const STEPS = [
  { number: 1, label: "個人情報" },
  { number: 2, label: "志望校" },
  { number: 3, label: "書類" },
  { number: 4, label: "選考費" },
  { number: 5, label: "確認・提出" },
];

const calcExamFee = (schools: number) => schools * 20000;

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const NATIONALITIES = [
  "中国","韓国","ベトナム","フィリピン","インドネシア","ネパール",
  "ミャンマー","タイ","スリランカ","バングラデシュ","インド",
  "マレーシア","モンゴル","カンボジア","ラオス","中国台湾",
  "その他（アジア）","その他（欧米）","その他",
];

const DOC_CATEGORIES = [
  {
    label: "必須書類",
    required: true,
    color: "red",
    docs: [
      { type: "証明写真（3×3cm）", desc: "白背景・正面・3ヶ月以内撮影" },
      { type: "最終学校の成績証明書", desc: "原本または公証済みコピー" },
      { type: "最終学校の出席状況証明書", desc: "出席率が記載されたもの" },
    ],
  },
  {
    label: "日本語能力証明（いずれか1点）",
    required: true,
    color: "blue",
    docs: [
      { type: "JLPT成績証明書", desc: "日本語能力試験の合格証・成績証明書コピー" },
      { type: "EJU成績証明書", desc: "日本留学試験の成績証明書コピー" },
    ],
  },
  {
    label: "学歴に応じた書類",
    required: true,
    color: "purple",
    docs: [
      { type: "高校卒業証明書", desc: "高校卒業の方（卒業証書または証明書）" },
      { type: "高校成績証明書", desc: "高校卒業の方の成績証明書" },
      { type: "大学卒業証明書", desc: "大学院受験の方（大学の卒業証明書）" },
      { type: "大学成績証明書", desc: "大学院受験の方の成績証明書" },
      { type: "在学証明書", desc: "日本の大学に在学中の方" },
    ],
  },
  {
    label: "任意提出書類",
    required: false,
    color: "gray",
    docs: [
      { type: "英語能力証明書", desc: "TOEFL・IELTS・TOEIC等（任意）" },
      { type: "その他書類", desc: "上記以外の参考書類" },
    ],
  },
];

const SCHOOLS: {
  id: string;
  name: string;
  hojin: string;
  color: string;
  accent: string;
  icon: string;
  departments: { name: string; duration: string; courses: string[] }[];
}[] = [
  {
    id: "chuo-seminar",
    name: "中央ゼミナール",
    hojin: "学校法人 羽場学園",
    color: "blue",
    accent: "#3b82f6",
    icon: "📚",
    departments: [
      { name: "大学・大学院受験科", duration: "1年制", courses: ["文系コース","理系コース","医歯薬コース","芸術系コース","総合コース"] },
      { name: "美術系受験科", duration: "1年制", courses: ["東京藝術大学コース","多摩美・武蔵美コース","デザインコース","映像・メディアコース"] },
    ],
  },
  {
    id: "tdb",
    name: "東京デジタルビジネス専門学校（TDB）",
    hojin: "学校法人 羽場学園",
    color: "indigo",
    accent: "#6366f1",
    icon: "💻",
    departments: [
      { name: "デジタルビジネス科", duration: "2年制", courses: ["デジタルビジネスコース"] },
      { name: "中国語デジタルビジネス科", duration: "2年制", courses: ["中国語デジタルビジネスコース"] },
    ],
  },
  {
    id: "kanagawa-judo",
    name: "神奈川柔整鍼灸専門学校",
    hojin: "学校法人 平井学園",
    color: "emerald",
    accent: "#10b981",
    icon: "⚕️",
    departments: [
      { name: "柔道整復師科", duration: "3年制", courses: ["昼間部","夜間部"] },
      { name: "鍼灸師科", duration: "3年制", courses: ["昼間部","夜間部"] },
      { name: "柔道整復師・鍼灸師ダブルライセンス科", duration: "3年制", courses: ["昼間部"] },
      { name: "大学進学科", duration: "1年制", courses: ["大学進学コース"] },
    ],
  },
];

interface FormData {
  lastName: string; firstName: string; lastNameKana: string; firstNameKana: string;
  birthDate: string; gender: string; nationality: string; phone: string; email: string;
  postalCode: string; prefecture: string; city: string; address: string; addressDetail: string;
  residenceStatus: string; residenceExpiry: string; japaneseLevel: string; jlptCertified: boolean;
  schoolId: string; schoolName: string; department: string; course: string;
  enrollmentYear: string; enrollmentMonth: string; applicationReason: string;
  lastSchoolName: string; lastSchoolCountry: string; lastSchoolGraduate: string; workExperience: string;
  examMode: string; referrerName: string; referrerType: string;
}

interface UploadedDoc {
  id: string; docType: string; fileName: string; originalName: string; filePath: string; fileSize: number;
}

const initialForm: FormData = {
  lastName: "", firstName: "", lastNameKana: "", firstNameKana: "",
  birthDate: "", gender: "", nationality: "", phone: "", email: "",
  postalCode: "", prefecture: "", city: "", address: "", addressDetail: "",
  residenceStatus: "", residenceExpiry: "", japaneseLevel: "", jlptCertified: false,
  schoolId: "", schoolName: "", department: "", course: "",
  enrollmentYear: "", enrollmentMonth: "4", applicationReason: "",
  lastSchoolName: "", lastSchoolCountry: "", lastSchoolGraduate: "", workExperience: "",
  examMode: "一般", referrerName: "", referrerType: "",
};

// ========== UI Primitives ==========

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><span>⚠</span>{msg}</p>;
}

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      <FieldError msg={error} />
    </div>
  );
}

function Input({ error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        ${error ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
    />
  );
}

function Select({ error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        ${error ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
    >
      {children}
    </select>
  );
}

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="text-lg">{icon}</span>
      <h2 className="text-base font-bold text-gray-800">{children}</h2>
    </div>
  );
}

function Divider() {
  return <hr className="border-gray-100 my-6" />;
}

// ========== DateSelect ==========
function DateSelect({ value, onChange, minYear, maxYear, hasError }: {
  value: string; onChange: (val: string) => void; minYear?: number; maxYear?: number; hasError?: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const min = `${minYear ?? currentYear - 73}-01-01`;
  const max = `${maxYear ?? currentYear - 14}-12-31`;
  return (
    <input
      type="date"
      className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        ${hasError ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value)}
    />
  );
}

// ========== Step Indicator ==========
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-between mb-8 px-2">
      {STEPS.map((step, index) => (
        <React.Fragment key={step.number}>
          <div className="flex flex-col items-center gap-1.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all
              ${step.number < currentStep ? "bg-green-500 text-white" :
                step.number === currentStep ? "bg-blue-600 text-white shadow-lg shadow-blue-200" :
                "bg-gray-100 text-gray-400"}`}>
              {step.number < currentStep ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>
              ) : step.number}
            </div>
            <span className={`text-xs font-medium hidden sm:block whitespace-nowrap
              ${step.number === currentStep ? "text-blue-600" :
                step.number < currentStep ? "text-green-600" : "text-gray-400"}`}>
              {step.label}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 rounded transition-all ${step.number < currentStep ? "bg-green-400" : "bg-gray-100"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ========== Step 1 ==========
function Step1({ form, onChange, errors }: {
  form: FormData; onChange: (f: keyof FormData, v: string | boolean) => void; errors: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <SectionTitle icon="👤">氏名</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="姓（漢字・ローマ字）" required error={errors.lastName}>
          <Input placeholder="山田" value={form.lastName} error={!!errors.lastName} onChange={e => onChange("lastName", e.target.value)} />
        </Field>
        <Field label="名（漢字・ローマ字）" required error={errors.firstName}>
          <Input placeholder="太郎" value={form.firstName} error={!!errors.firstName} onChange={e => onChange("firstName", e.target.value)} />
        </Field>
        <Field label="姓（カナ）" required error={errors.lastNameKana}>
          <Input placeholder="ヤマダ" value={form.lastNameKana} error={!!errors.lastNameKana} onChange={e => onChange("lastNameKana", e.target.value)} />
        </Field>
        <Field label="名（カナ）" required error={errors.firstNameKana}>
          <Input placeholder="タロウ" value={form.firstNameKana} error={!!errors.firstNameKana} onChange={e => onChange("firstNameKana", e.target.value)} />
        </Field>
      </div>

      <Divider />
      <SectionTitle icon="📋">基本情報</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-2">
          <Field label="生年月日" required error={errors.birthDate}>
            <DateSelect value={form.birthDate} onChange={v => onChange("birthDate", v)}
              minYear={new Date().getFullYear() - 73} maxYear={new Date().getFullYear() - 14} hasError={!!errors.birthDate} />
          </Field>
        </div>
        <Field label="性別" required error={errors.gender}>
          <Select value={form.gender} error={!!errors.gender} onChange={e => onChange("gender", e.target.value)}>
            <option value="">選択</option>
            <option value="男性">男性</option>
            <option value="女性">女性</option>
          </Select>
        </Field>
        <Field label="国籍" required error={errors.nationality}>
          <Select value={form.nationality} error={!!errors.nationality} onChange={e => onChange("nationality", e.target.value)}>
            <option value="">選択</option>
            {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
      </div>

      <Divider />
      <SectionTitle icon="📞">連絡先</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="電話番号" required hint="ハイフンなし" error={errors.phone}>
          <Input type="tel" placeholder="09012345678" value={form.phone} error={!!errors.phone} onChange={e => onChange("phone", e.target.value)} />
        </Field>
        <Field label="メールアドレス" required hint="審査結果の通知に使用" error={errors.email}>
          <Input type="email" placeholder="example@email.com" value={form.email} error={!!errors.email} onChange={e => onChange("email", e.target.value)} />
        </Field>
      </div>

      <Divider />
      <SectionTitle icon="🏠">住所</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="郵便番号" required hint="ハイフンなし7桁" error={errors.postalCode}>
          <Input placeholder="1000001" maxLength={7} value={form.postalCode} error={!!errors.postalCode}
            onChange={e => onChange("postalCode", e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="都道府県" required error={errors.prefecture}>
          <Select value={form.prefecture} error={!!errors.prefecture} onChange={e => onChange("prefecture", e.target.value)}>
            <option value="">選択</option>
            {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="市区町村" required error={errors.city}>
          <Input placeholder="新宿区" value={form.city} error={!!errors.city} onChange={e => onChange("city", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="番地" required error={errors.address}>
          <Input placeholder="西新宿1-1-1" value={form.address} error={!!errors.address} onChange={e => onChange("address", e.target.value)} />
        </Field>
        <Field label="建物名・部屋番号（任意）">
          <Input placeholder="○○マンション 101号室" value={form.addressDetail} onChange={e => onChange("addressDetail", e.target.value)} />
        </Field>
      </div>

      <Divider />
      <SectionTitle icon="🗾">在日情報・日本語能力</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="在留資格（日本在住の方）">
          <Select value={form.residenceStatus} onChange={e => onChange("residenceStatus", e.target.value)}>
            <option value="">選択してください（任意）</option>
            {["留学","技術・人文知識・国際業務","特定技能","技能実習","永住者","定住者","日本人の配偶者等","家族滞在","その他"].map(v =>
              <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label="在留期限（日本在住の方）">
          <DateSelect value={form.residenceExpiry} onChange={v => onChange("residenceExpiry", v)}
            minYear={new Date().getFullYear()} maxYear={new Date().getFullYear() + 10} />
        </Field>
        <Field label="日本語レベル" required error={errors.japaneseLevel}>
          <Select value={form.japaneseLevel} error={!!errors.japaneseLevel} onChange={e => onChange("japaneseLevel", e.target.value)}>
            <option value="">選択してください</option>
            <option value="N1">N1（最上級）</option>
            <option value="N2">N2</option>
            <option value="N3">N3</option>
            <option value="N4">N4</option>
            <option value="N5">N5（初級）</option>
            <option value="なし">資格なし</option>
          </Select>
        </Field>
        <Field label="JLPT合格証明書">
          <label className="flex items-center gap-3 h-[42px] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-blue-600"
              checked={form.jlptCertified} onChange={e => onChange("jlptCertified", e.target.checked)} />
            <span className="text-sm text-gray-700">JLPT合格証明書を持っている</span>
          </label>
        </Field>
      </div>
    </div>
  );
}

// ========== Step 2 ==========
function Step2({ form, onChange, errors }: {
  form: FormData; onChange: (f: keyof FormData, v: string | boolean) => void; errors: Record<string, string>;
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];
  const selectedSchool = SCHOOLS.find(s => s.id === form.schoolId);
  const selectedDept = selectedSchool?.departments.find(d => d.name === form.department);

  const handleSchoolChange = (id: string) => {
    const school = SCHOOLS.find(s => s.id === id);
    onChange("schoolId", id);
    onChange("schoolName", school ? `${school.hojin} ${school.name}` : "");
    onChange("department", "");
    onChange("course", "");
  };

  const durationColor: Record<string, string> = {
    "1年制": "bg-blue-100 text-blue-700",
    "2年制": "bg-purple-100 text-purple-700",
    "3年制": "bg-orange-100 text-orange-700",
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon="🏫">志望校の選択</SectionTitle>
      {errors.schoolId && <FieldError msg={errors.schoolId} />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SCHOOLS.map(school => {
          const selected = form.schoolId === school.id;
          return (
            <button key={school.id} type="button" onClick={() => handleSchoolChange(school.id)}
              className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md
                ${selected ? "border-blue-500 bg-blue-50 shadow-md" : "border-gray-200 bg-white hover:border-blue-200"}`}>
              <div className="text-2xl mb-2">{school.icon}</div>
              <p className="text-xs text-gray-400 mb-0.5">{school.hojin}</p>
              <p className={`font-bold text-sm leading-snug ${selected ? "text-blue-700" : "text-gray-800"}`}>{school.name}</p>
              <p className="text-xs text-gray-400 mt-1.5">{school.departments.length}学科</p>
              {selected && <div className="mt-2 text-xs font-semibold text-blue-600 flex items-center gap-1"><span>✓</span> 選択中</div>}
            </button>
          );
        })}
      </div>

      {selectedSchool && (
        <>
          <Divider />
          <SectionTitle icon="📖">学科・コース</SectionTitle>
          <div className="space-y-3">
            <Label required>志望学科</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedSchool.departments.map(dept => {
                const sel = form.department === dept.name;
                return (
                  <label key={dept.name} className={`cursor-pointer rounded-xl border-2 p-4 flex items-start gap-3 transition-all
                    ${sel ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30"}`}>
                    <input type="radio" name="department" value={dept.name} className="hidden"
                      checked={sel} onChange={() => { onChange("department", dept.name); onChange("course", ""); }} />
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                      ${sel ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                      {sel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${sel ? "text-blue-700" : "text-gray-800"}`}>{dept.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${durationColor[dept.duration] ?? "bg-gray-100 text-gray-600"}`}>{dept.duration}</span>
                      </div>
                      {dept.courses.length > 1 && <p className="text-xs text-gray-400 mt-0.5">{dept.courses.join(" / ")}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
            <FieldError msg={errors.department} />
          </div>
          {selectedDept && (
            <Field label="志望コース" required={selectedDept.courses.length > 1} error={errors.course}>
              <Select value={form.course} error={!!errors.course} onChange={e => onChange("course", e.target.value)} disabled={!selectedDept}>
                <option value="">選択してください</option>
                {selectedDept.courses.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          )}
        </>
      )}

      <Divider />
      <SectionTitle icon="📅">入学希望時期</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="入学希望年" required error={errors.enrollmentYear}>
          <Select value={form.enrollmentYear} error={!!errors.enrollmentYear} onChange={e => onChange("enrollmentYear", e.target.value)}>
            <option value="">選択してください</option>
            {years.map(y => <option key={y} value={String(y)}>{y}年</option>)}
          </Select>
        </Field>
        <Field label="入学希望月">
          <div className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-600">
            4月（毎年4月入学）
          </div>
        </Field>
      </div>

      <Divider />
      <SectionTitle icon="✍️">志望動機</SectionTitle>
      <Field label="志望動機" required hint="300字以上で具体的にご記入ください" error={errors.applicationReason}>
        <textarea
          className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[160px] resize-y
            ${errors.applicationReason ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
          placeholder="志望する理由、将来の目標、この学科で学びたいことなどをご記入ください。"
          value={form.applicationReason} onChange={e => onChange("applicationReason", e.target.value)} />
        <div className="flex justify-end mt-1">
          <span className={`text-xs ${form.applicationReason.length >= 300 ? "text-green-600 font-semibold" : "text-gray-400"}`}>
            {form.applicationReason.length} / 300文字
          </span>
        </div>
      </Field>

      <Divider />
      <SectionTitle icon="🎓">最終学歴</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="学校名" required error={errors.lastSchoolName}>
          <Input placeholder="○○大学" value={form.lastSchoolName} error={!!errors.lastSchoolName} onChange={e => onChange("lastSchoolName", e.target.value)} />
        </Field>
        <Field label="国" required error={errors.lastSchoolCountry}>
          <Input placeholder="中国" value={form.lastSchoolCountry} error={!!errors.lastSchoolCountry} onChange={e => onChange("lastSchoolCountry", e.target.value)} />
        </Field>
        <Field label="卒業状況" required error={errors.lastSchoolGraduate}>
          <Select value={form.lastSchoolGraduate} error={!!errors.lastSchoolGraduate} onChange={e => onChange("lastSchoolGraduate", e.target.value)}>
            <option value="">選択してください</option>
            {["卒業","卒業見込み","中退","在学中"].map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="職務経歴（任意）" hint="直近の職務経歴をご記入ください">
        <textarea className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y hover:border-gray-300"
          placeholder="会社名、職種、期間などをご記入ください" value={form.workExperience} onChange={e => onChange("workExperience", e.target.value)} />
      </Field>

      <Divider />
      <SectionTitle icon="🏷️">選考区分・推薦</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: "一般", label: "一般選考", desc: "通常の入学試験", icon: "📝" },
          { value: "指定推薦", label: "指定推薦", desc: "学校・機関からの推薦", icon: "🤝" },
          { value: "特待生", label: "特待生選考", desc: "成績優秀者対象", icon: "⭐" },
        ].map(mode => {
          const sel = form.examMode === mode.value;
          return (
            <label key={mode.value} className={`cursor-pointer rounded-xl border-2 p-4 text-center transition-all
              ${sel ? "border-blue-500 bg-blue-50 shadow-md" : "border-gray-200 bg-white hover:border-blue-200"}`}>
              <input type="radio" name="examMode" value={mode.value} className="hidden"
                checked={sel} onChange={() => onChange("examMode", mode.value)} />
              <div className="text-2xl mb-1">{mode.icon}</div>
              <p className={`font-bold text-sm mb-0.5 ${sel ? "text-blue-700" : "text-gray-700"}`}>{mode.label}</p>
              <p className="text-xs text-gray-400">{mode.desc}</p>
            </label>
          );
        })}
      </div>
      {(form.examMode === "指定推薦" || form.examMode === "特待生") && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="推薦機関・推薦者名">
            <Input placeholder="例：上海日本留学センター" value={form.referrerName} onChange={e => onChange("referrerName", e.target.value)} />
          </Field>
          <Field label="推薦機関の種別">
            <Select value={form.referrerType} onChange={e => onChange("referrerType", e.target.value)}>
              <option value="">選択してください（任意）</option>
              {["エージェント","学校","個人","その他"].map(v => <option key={v} value={v}>{v === "エージェント" ? "留学エージェント" : v === "学校" ? "学校・教育機関" : v === "個人" ? "個人（恩師・知人など）" : v}</option>)}
            </Select>
          </Field>
        </div>
      )}
      {form.examMode === "一般" && (
        <Field label="紹介・推薦機関（任意）" hint="エージェントや紹介者がいる場合はご記入ください">
          <Input placeholder="例：知日留学センター（なければ空欄）" value={form.referrerName} onChange={e => onChange("referrerName", e.target.value)} />
        </Field>
      )}
    </div>
  );
}

// ========== Step 3 ==========
function Step3({ applicationId, uploadedDocs, onUpload, onDelete }: {
  applicationId: string | null; uploadedDocs: UploadedDoc[];
  onUpload: (doc: UploadedDoc) => void; onDelete: (id: string) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try { const r = await fetch(`/api/upload?id=${id}`, { method: "DELETE" }); if (r.ok) onDelete(id); } catch { /* ignore */ }
  };

  const formatSize = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1024 / 1024).toFixed(1)}MB`;

  if (!applicationId) return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-sm">申請情報が保存されていません。前のステップに戻ってください。</p>
    </div>
  );

  const catStyle: Record<string, { bg: string; badge: string }> = {
    red: { bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700" },
    blue: { bg: "bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-700" },
    purple: { bg: "bg-purple-50 border-purple-200", badge: "bg-purple-100 text-purple-700" },
    gray: { bg: "bg-gray-50 border-gray-200", badge: "bg-gray-100 text-gray-600" },
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">📎 書類アップロードのご案内</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700 text-xs">
          <li>対応形式：JPEG、PNG、PDF（各ファイル最大10MB）</li>
          <li>書類は鮮明に撮影・スキャンしてください</li>
        </ul>
      </div>
      {uploadError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{uploadError}</div>}

      {DOC_CATEGORIES.map(cat => {
        const s = catStyle[cat.color];
        return (
          <div key={cat.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{cat.required ? "必須" : "任意"}</span>
              <h3 className="font-semibold text-gray-800 text-sm">{cat.label}</h3>
            </div>
            <div className="space-y-2">
              {cat.docs.map(doc => {
                const uploaded = uploadedDocs.filter(u => u.docType === doc.type);
                const isUp = uploading === doc.type;
                return (
                  <div key={doc.type} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-800">{doc.type}</p>
                        {uploaded.length > 0 && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">✓ {uploaded.length}件</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{doc.desc}</p>
                      {uploaded.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {uploaded.map(u => (
                            <div key={u.id} className="flex items-center gap-2 text-xs text-gray-500">
                              <span className="text-green-500">📄</span>
                              <span className="truncate">{u.originalName}</span>
                              <span className="shrink-0 text-gray-400">{formatSize(u.fileSize)}</span>
                              <button onClick={() => handleDelete(u.id)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <label className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors border
                      ${isUp ? "bg-gray-100 text-gray-400 border-gray-200 cursor-wait" : "bg-white border-blue-200 text-blue-700 hover:bg-blue-50"}`}>
                      <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={isUp}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file || !applicationId) return;
                          setUploading(doc.type); setUploadError(null);
                          const fd = new FormData();
                          fd.append("file", file); fd.append("applicationId", applicationId); fd.append("docType", doc.type);
                          fetch("/api/upload", { method: "POST", body: fd })
                            .then(r => r.json()).then(data => { if (data.document) onUpload(data.document); else setUploadError(data.error || "エラー"); })
                            .catch(() => setUploadError("ネットワークエラー")).finally(() => { setUploading(null); e.target.value = ""; });
                        }} />
                      {isUp ? "送信中..." : "+ 追加"}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-sm text-gray-500 text-right">アップロード済み：<span className="font-bold text-blue-700">{uploadedDocs.length}件</span></p>
    </div>
  );
}

// ========== Step 4 ==========
function Step4Payment({ applicationId, schoolCount, feeStatus, onFeeStatusChange }: {
  applicationId: string | null; schoolCount: number; feeStatus: string; onFeeStatusChange: (s: string) => void;
}) {
  const fee = calcExamFee(schoolCount);
  const [uploading, setUploading] = useState(false);
  const [uploadedReceipt, setUploadedReceipt] = useState<{ name: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !applicationId) return;
    setUploading(true); setUploadError(null);
    const fd = new FormData();
    fd.append("file", file); fd.append("applicationId", applicationId); fd.append("docType", "選考費振込証明書");
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "エラー");
      setUploadedReceipt({ name: file.name });
      await fetch(`/api/applications/${applicationId}/fee`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examFeeStatus: "確認中", examFeeAmount: fee, examFeeReceiptUrl: data.document?.fileUrl }),
      });
      onFeeStatusChange("確認中");
    } catch (err) { setUploadError(err instanceof Error ? err.message : "エラー"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <div className="space-y-5">
      {/* 金額 */}
      <div className="rounded-2xl p-6 text-white" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2c5a82 100%)" }}>
        <p className="text-blue-200 text-sm mb-1">選考費（{schoolCount}校 × 20,000円）</p>
        <p className="text-4xl font-bold tracking-tight">¥{fee.toLocaleString()}<span className="text-lg font-normal text-blue-300 ml-2">税込</span></p>
      </div>

      {/* 振込先 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">🏦 振込先情報</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
          {[["銀行名","三菱UFJ銀行 新宿支店"],["口座種別","普通"],["口座番号","1234567"],["口座名義","（ザ）ハバガクエン"],["振込期限","出願後7日以内"]].map(([k,v]) => (
            <div key={k} className="contents">
              <span className="text-gray-500">{k}</span>
              <span className="font-semibold text-gray-900">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          振込名義は必ず<strong>出願者本人のお名前（カタカナ）</strong>でお振込みください。
        </div>
      </div>

      {/* 振込証明書 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-bold text-gray-800 mb-1">📎 振込証明書のアップロード</h3>
        <p className="text-xs text-gray-400 mb-4">銀行振込の場合は、振込明細書・ATMレシートの写真をアップロードしてください。</p>
        {uploadedReceipt ? (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <span className="text-green-600 text-xl">✅</span>
            <div>
              <p className="text-sm font-semibold text-green-800">アップロード完了</p>
              <p className="text-xs text-green-600">{uploadedReceipt.name}</p>
            </div>
          </div>
        ) : (
          <label className={`flex items-center justify-center gap-3 border-2 border-dashed rounded-xl py-8 px-4 cursor-pointer transition-colors
            ${uploading ? "border-gray-200 bg-gray-50 cursor-wait" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"}`}>
            <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading || !applicationId} onChange={handleReceiptUpload} />
            <div className="text-center">
              <div className="text-3xl mb-2">{uploading ? "⏳" : "📤"}</div>
              <p className="text-sm text-gray-600 font-medium">{uploading ? "アップロード中..." : "クリックして振込明細をアップロード"}</p>
              <p className="text-xs text-gray-400 mt-1">JPEG・PNG・PDF（最大10MB）</p>
            </div>
          </label>
        )}
        {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
      </div>

      {/* ステータス */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-5 py-4">
        <span className="text-sm font-medium text-gray-700">現在の支払い状態</span>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${
          feeStatus === "確認済み" ? "bg-green-100 text-green-700" :
          feeStatus === "確認中" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{feeStatus}</span>
      </div>
    </div>
  );
}

// ========== Step 5 確認 ==========
function Step5({ form, uploadedDocs }: { form: FormData; uploadedDocs: UploadedDoc[] }) {
  const Row = ({ label, value }: { label: string; value: string | boolean | undefined | null }) => (
    <div className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 font-medium flex-1">{value === true ? "あり" : value === false ? "なし" : value || "—"}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-2">
        <span>⚠️</span>
        <p>以下の内容をご確認の上、「提出する」ボタンを押してください。提出後の内容変更はできません。</p>
      </div>
      <Section title="個人情報">
        <Row label="氏名" value={`${form.lastName} ${form.firstName}`} />
        <Row label="カナ" value={`${form.lastNameKana} ${form.firstNameKana}`} />
        <Row label="生年月日" value={form.birthDate} />
        <Row label="性別" value={form.gender} />
        <Row label="国籍" value={form.nationality} />
      </Section>
      <Section title="連絡先・住所">
        <Row label="電話番号" value={form.phone} />
        <Row label="メール" value={form.email} />
        <Row label="住所" value={`〒${form.postalCode} ${form.prefecture}${form.city}${form.address}${form.addressDetail ? " " + form.addressDetail : ""}`} />
      </Section>
      <Section title="在日情報・日本語">
        <Row label="在留資格" value={form.residenceStatus} />
        <Row label="在留期限" value={form.residenceExpiry} />
        <Row label="日本語レベル" value={form.japaneseLevel} />
        <Row label="JLPT証明書" value={form.jlptCertified} />
      </Section>
      <Section title="志望校情報">
        <Row label="志望校" value={form.schoolName} />
        <Row label="学科" value={form.department} />
        <Row label="コース" value={form.course} />
        <Row label="入学希望" value={`${form.enrollmentYear}年${form.enrollmentMonth}月`} />
        <Row label="志望動機" value={form.applicationReason} />
      </Section>
      <Section title="最終学歴・選考">
        <Row label="学校名" value={form.lastSchoolName} />
        <Row label="国" value={form.lastSchoolCountry} />
        <Row label="卒業状況" value={form.lastSchoolGraduate} />
        <Row label="選考区分" value={form.examMode} />
        {form.referrerName && <Row label="推薦機関" value={form.referrerName} />}
      </Section>
      <Section title={`提出書類（${uploadedDocs.length}件）`}>
        {uploadedDocs.length === 0 ? <p className="text-sm text-gray-400">書類なし</p> : (
          <div className="space-y-2">
            {uploadedDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 text-sm">
                <span className="text-green-500">✅</span>
                <span className="font-medium text-gray-700">{doc.docType}</span>
                <span className="text-gray-400 text-xs">— {doc.originalName}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ========== Main ==========
export default function ApplyPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [applicationNo, setApplicationNo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [examFeeStatus, setExamFeeStatus] = useState("未払い");
  const schoolCount = 1;

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.lastName) e.lastName = "姓を入力してください";
    if (!form.firstName) e.firstName = "名を入力してください";
    if (!form.lastNameKana) e.lastNameKana = "姓（カナ）を入力してください";
    if (!form.firstNameKana) e.firstNameKana = "名（カナ）を入力してください";
    if (!form.birthDate) e.birthDate = "生年月日を入力してください";
    if (!form.gender) e.gender = "性別を選択してください";
    if (!form.nationality) e.nationality = "国籍を選択してください";
    if (!form.phone) e.phone = "電話番号を入力してください";
    if (!form.email) e.email = "メールアドレスを入力してください";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "有効なメールアドレスを入力してください";
    if (!form.postalCode) e.postalCode = "郵便番号を入力してください";
    else if (form.postalCode.length !== 7) e.postalCode = "郵便番号は7桁で入力してください";
    if (!form.prefecture) e.prefecture = "都道府県を選択してください";
    if (!form.city) e.city = "市区町村を入力してください";
    if (!form.address) e.address = "番地を入力してください";
    if (!form.japaneseLevel) e.japaneseLevel = "日本語レベルを選択してください";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.schoolId) e.schoolId = "志望校を選択してください";
    if (!form.department) e.department = "志望学科を選択してください";
    const dept = SCHOOLS.find(s => s.id === form.schoolId)?.departments.find(d => d.name === form.department);
    if (dept && dept.courses.length > 0 && !form.course) e.course = "コースを選択してください";
    if (!form.enrollmentYear) e.enrollmentYear = "入学希望年を選択してください";
    if (!form.applicationReason) e.applicationReason = "志望動機を入力してください";
    else if (form.applicationReason.length < 300) e.applicationReason = `300文字以上入力してください（現在${form.applicationReason.length}文字）`;
    if (!form.lastSchoolName) e.lastSchoolName = "学校名を入力してください";
    if (!form.lastSchoolCountry) e.lastSchoolCountry = "国を入力してください";
    if (!form.lastSchoolGraduate) e.lastSchoolGraduate = "卒業状況を選択してください";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveStep1And2 = async (): Promise<boolean> => {
    try {
      const r = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) { setSubmitError(data.error || "保存に失敗しました"); return false; }
      setApplicationId(data.id); setApplicationNo(data.applicationNo); return true;
    } catch { setSubmitError("ネットワークエラー"); return false; }
  };

  const handleNext = async () => {
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (currentStep === 1) { if (!validateStep1()) return; setCurrentStep(2); }
    else if (currentStep === 2) {
      if (!validateStep2()) return;
      setSubmitting(true);
      const ok = await saveStep1And2();
      setSubmitting(false);
      if (!ok) return;
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (applicationId) {
        await fetch(`/api/applications/${applicationId}/fee`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examFeeAmount: calcExamFee(schoolCount) }),
        });
      }
      setCurrentStep(4);
    } else if (currentStep === 4) { setCurrentStep(5); }
  };

  const handleBack = () => { setErrors({}); window.scrollTo({ top: 0, behavior: "smooth" }); setCurrentStep(p => Math.max(1, p - 1)); };

  // 完了画面
  if (submitted && applicationNo) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 py-4 px-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">専</div>
            <span className="font-bold text-gray-800">入学出願システム</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">✅</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">出願が完了しました</h2>
            <p className="text-gray-500 text-sm mb-8">書類を受付いたしました。審査結果はメールにてお知らせします。</p>
            <div className="rounded-2xl p-6 mb-8 text-white" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2c5a82 100%)" }}>
              <p className="text-blue-200 text-sm mb-2">申請番号</p>
              <p className="text-3xl font-bold tracking-wider">{applicationNo}</p>
              <p className="text-blue-300 text-xs mt-2">この番号は審査状況の確認に必要です</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/apply/status" className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition">出願状況を確認する</Link>
              <Link href="/" className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition">トップへ戻る</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">専</div>
            <div>
              <p className="font-bold text-gray-800 text-sm leading-none">入学出願システム</p>
              <p className="text-xs text-gray-400 mt-0.5">ステップ {currentStep} / {STEPS.length}</p>
            </div>
          </div>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition">← トップへ</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <h1 className="text-lg font-bold text-gray-800 mb-6">{STEPS[currentStep - 1].label}</h1>
          {currentStep === 1 && <Step1 form={form} onChange={handleChange} errors={errors} />}
          {currentStep === 2 && <Step2 form={form} onChange={handleChange} errors={errors} />}
          {currentStep === 3 && <Step3 applicationId={applicationId} uploadedDocs={uploadedDocs}
            onUpload={doc => setUploadedDocs(p => [...p, doc])} onDelete={id => setUploadedDocs(p => p.filter(d => d.id !== id))} />}
          {currentStep === 4 && <Step4Payment applicationId={applicationId} schoolCount={schoolCount}
            feeStatus={examFeeStatus} onFeeStatusChange={setExamFeeStatus} />}
          {currentStep === 5 && <Step5 form={form} uploadedDocs={uploadedDocs} />}
        </div>

        {submitError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
            <span>⚠️</span>{submitError}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button onClick={handleBack} disabled={currentStep === 1 || submitting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
            ← 前へ
          </button>
          {currentStep < 5 ? (
            <button onClick={handleNext} disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 shadow-sm shadow-blue-200">
              {submitting ? (
                <><span className="animate-spin">⏳</span> 保存中...</>
              ) : currentStep === 4 ? "確認へ進む →" : "次へ進む →"}
            </button>
          ) : (
            <button onClick={() => setSubmitted(true)} disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 transition shadow-sm shadow-green-200">
              ✅ 提出する
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
