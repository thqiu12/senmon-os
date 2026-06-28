"use client";
// 出願フォームの共有プリミティブ。
// page.tsx は Next.js のページ制約により任意の値を export できないため、
// DynamicField と page.tsx の両方から再利用する UI/型/定数をここに集約する。
import React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useT } from "@/lib/i18n";
import { type ApplicantType } from "@/lib/applicantType";

export interface FormFieldConfig {
  fieldKey: string;
  label: string;
  fieldType?: string;
  isEnabled: boolean;
  isRequired: boolean;
  displayOrder: number;
  section: string;
  description?: string | null;
  options?: string | null;
  labelEn?: string | null;
  descriptionEn?: string | null;
}

export interface FormData {
  lastName: string; firstName: string; lastNameKana: string; firstNameKana: string;
  birthDate: string; gender: string; nationality: string; phone: string; email: string;
  postalCode: string; prefecture: string; city: string; address: string; addressDetail: string;
  residenceStatus: string; residenceExpiry: string; japaneseLevel: string; jlptCertified: boolean;
  schoolId: string; schoolName: string; department: string; course: string;
  // 並願（追加志望校）
  additionalSchools: { schoolId: string; schoolName: string; department: string; course: string; }[];
  enrollmentYear: string; enrollmentMonth: string; applicationReason: string;
  lastSchoolName: string; lastSchoolCountry: string; lastSchoolGraduate: string; lastSchoolGraduatedOn: string; priorAttendanceRate: string; workExperience: string;
  examMode: string; referrerName: string; referrerType: string;
  applicantType: ApplicantType | "";
  extraData: Record<string, string | boolean>;
}

export const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

export const NATIONALITIES = [
  "中国","韓国","ベトナム","フィリピン","インドネシア","ネパール",
  "ミャンマー","タイ","スリランカ","バングラデシュ","インド",
  "マレーシア","モンゴル","カンボジア","ラオス","中国台湾",
  "その他（アジア）","その他（欧米）","その他",
];

// ========== UI Primitives ==========

export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
      {children}
      {required && <span className="text-red-600 ml-1">*</span>}
    </label>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  const { t } = useT();
  if (!msg) return null;
  return (
    <p className="text-red-600 text-xs mt-1 flex items-center gap-1" role="alert">
      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {t(msg)}
    </p>
  );
}

export function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div>
      <Label required={required}>{t(label)}</Label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500 mt-1">{t(hint)}</p>}
      <FieldError msg={error} />
    </div>
  );
}

export function Input({ error, placeholder, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  const { t } = useT();
  return (
    <input
      {...props}
      placeholder={placeholder ? t(placeholder) : undefined}
      className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        ${error ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
    />
  );
}

export function Select({ error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
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

export function SectionTitle({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
        <Icon name={icon} className="w-[18px] h-[18px]" />
      </span>
      <h2 className="text-base font-bold text-gray-800">{typeof children === "string" ? t(children) : children}</h2>
    </div>
  );
}

export function Divider() {
  return <hr className="border-gray-100 my-6" />;
}

// ========== DateSelect ==========
export function DateSelect({ value, onChange, minYear, maxYear, hasError, testId }: {
  value: string; onChange: (val: string) => void; minYear?: number; maxYear?: number; hasError?: boolean; testId?: string;
}) {
  const currentYear = new Date().getFullYear();
  const min = `${minYear ?? currentYear - 73}-01-01`;
  const max = `${maxYear ?? currentYear - 14}-12-31`;
  return (
    <input
      type="date"
      data-testid={testId}
      className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        ${hasError ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value)}
    />
  );
}
