"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useUI } from "@/components/ui/toast";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CompassMark } from "@/components/ui/CompassMark";
import { isNoWrittenExamSchool } from "@/lib/examConfig";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/lib/i18n/LanguageSwitcher";
import { type ApplicantType, isApplicantType } from "@/lib/applicantType";
import { fieldEnabled, fieldRequired, fieldLabel, fieldHint } from "@/lib/applyFieldVisibility";
import {
  Label, FieldError, Field, Input, Select, SectionTitle, Divider, DateSelect,
  NATIONALITIES, PREFECTURES, type FormData, type FormFieldConfig,
} from "./_components/primitives";
import { DynamicField } from "./_components/DynamicField";
import { buildFormSections } from "@/lib/applyFormSections";
import { PERSONAL_FALLBACK_SECTIONS } from "@/lib/applyFieldRegistry";

interface SchoolDepartment {
  name: string;
  duration: string;
  courses: string[];
}

interface SchoolData {
  id: string;
  schoolKey: string;
  name: string;
  hojin: string;
  icon: string;
  isActive: boolean;
  displayOrder: number;
  departments: SchoolDepartment[];
}

const STEPS = [
  { number: 1, label: "個人情報" },
  { number: 2, label: "志望校" },
  { number: 3, label: "書類" },
  { number: 4, label: "選考費" },
  { number: 5, label: "確認・提出" },
];

const calcExamFee = (schools: number) => schools * 20000;

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

// Hardcoded fallback schools (used if DB is empty or API fails)
const SCHOOLS_FALLBACK: SchoolData[] = [
  {
    id: "chuo-seminar",
    schoolKey: "chuo-seminar",
    name: "中央ゼミナール",
    hojin: "学校法人 羽場学園",
    icon: "📚",
    isActive: true,
    displayOrder: 0,
    departments: [
      { name: "大学・大学院受験科", duration: "1年制", courses: ["文系コース","理系コース","医歯薬コース","芸術系コース","総合コース"] },
      { name: "美術系受験科", duration: "1年制", courses: ["東京藝術大学コース","多摩美・武蔵美コース","デザインコース","映像・メディアコース"] },
    ],
  },
  {
    id: "tdb",
    schoolKey: "tdb",
    name: "東京デジタルビジネス専門学校（TDB）",
    hojin: "学校法人 羽場学園",
    icon: "💻",
    isActive: true,
    displayOrder: 1,
    departments: [
      { name: "デジタルビジネス科", duration: "2年制", courses: ["デジタルビジネスコース"] },
      { name: "中国語デジタルビジネス科", duration: "2年制", courses: ["中国語デジタルビジネスコース"] },
    ],
  },
  {
    id: "kanagawa-judo",
    schoolKey: "kanagawa-judo",
    name: "神奈川柔整鍼灸専門学校",
    hojin: "学校法人 平井学園",
    icon: "⚕️",
    isActive: true,
    displayOrder: 2,
    departments: [
      { name: "柔道整復師科", duration: "3年制", courses: ["昼間部","夜間部"] },
      { name: "鍼灸師科", duration: "3年制", courses: ["昼間部","夜間部"] },
      { name: "柔道整復師・鍼灸師ダブルライセンス科", duration: "3年制", courses: ["昼間部"] },
      { name: "大学進学科", duration: "1年制", courses: ["大学進学コース"] },
    ],
  },
];

interface UploadedDoc {
  id: string; docType: string; fileName: string; originalName: string; filePath: string; fileSize: number;
}

const initialForm: FormData = {
  lastName: "", firstName: "", lastNameKana: "", firstNameKana: "",
  birthDate: "", gender: "", nationality: "", phone: "", email: "",
  postalCode: "", prefecture: "", city: "", address: "", addressDetail: "",
  residenceStatus: "", residenceExpiry: "", japaneseLevel: "", jlptCertified: false,
  schoolId: "", schoolName: "", department: "", course: "",
  additionalSchools: [],
  enrollmentYear: "", enrollmentMonth: "4", applicationReason: "",
  lastSchoolName: "", lastSchoolCountry: "", lastSchoolGraduate: "", lastSchoolGraduatedOn: "", priorAttendanceRate: "", workExperience: "",
  examMode: "一般", referrerName: "", referrerType: "",
  applicantType: "",
};

// ========== Step Indicator ==========
function StepIndicator({ currentStep }: { currentStep: number }) {
  const { t } = useT();
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
              {t(step.label)}
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
function Step1({ form, onChange, errors, formConfig }: {
  form: FormData; onChange: (f: keyof FormData, v: string | boolean) => void; errors: Record<string, string>;
  formConfig: FormFieldConfig[] | null;
}) {
  // Phase1: 個人情報5セクションを動的描画。formConfig が読み込めていれば
  // buildFormSections の結果（有効項目のみ・displayOrder順）を、未読込時は
  // PERSONAL_FALLBACK_SECTIONS（標準項目を既定で全表示）を同一形に正規化して同じ描画コードで処理する。
  const PERSONAL_SECTION_NAMES = ["氏名", "基本情報", "連絡先", "住所", "在日情報"];
  const SECTION_ICON: Record<string, IconName> = {
    "氏名": "user", "基本情報": "id", "連絡先": "phone", "住所": "home", "在日情報": "globe",
  };
  // SectionTitle の表示文言（現行の見出しテキストを維持。在日情報のみ「・日本語能力」を補う）
  const SECTION_TITLE: Record<string, string> = {
    "氏名": "氏名", "基本情報": "基本情報", "連絡先": "連絡先", "住所": "住所", "在日情報": "在日情報・日本語能力",
  };
  // 現行のセクション別カラム数を可能な範囲で維持（基本情報=4 / 住所=3 / その他=2）。
  // 注: 単一グリッドで描画するため birthDate の col-span-2 と 住所の2行分割は失われる（軽微な許容変更）。
  const SECTION_COLS: Record<string, string> = {
    "氏名": "sm:grid-cols-2", "基本情報": "sm:grid-cols-4", "連絡先": "sm:grid-cols-2",
    "住所": "sm:grid-cols-3", "在日情報": "sm:grid-cols-2",
  };

  const allSections = (formConfig && formConfig.length > 0)
    ? buildFormSections(formConfig)
    : PERSONAL_FALLBACK_SECTIONS.map(s => ({
        section: s.section,
        fields: s.fields.map((fieldKey, i) => ({ fieldKey, displayOrder: i })),
      }));
  const sections = allSections.filter(s => PERSONAL_SECTION_NAMES.includes(s.section));

  return (
    <div className="space-y-6">
      {sections.map((sec, idx) => (
        <React.Fragment key={sec.section}>
          {idx > 0 && <Divider />}
          <SectionTitle icon={SECTION_ICON[sec.section] ?? "id"}>
            {SECTION_TITLE[sec.section] ?? sec.section}
          </SectionTitle>
          <div className={`grid grid-cols-1 ${SECTION_COLS[sec.section] ?? "sm:grid-cols-2"} gap-4`}>
            {sec.fields.map(f => (
              <DynamicField key={f.fieldKey} fieldKey={f.fieldKey} form={form} onChange={onChange} errors={errors} formConfig={formConfig} />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ========== Step 2 ==========
// 学科選択サブコンポーネント（メイン校・並願校共用）
function SchoolDeptPicker({ school, department, course, onChange, errors, deptKey, courseKey }: {
  school: SchoolData;
  department: string;
  course: string;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
  deptKey: string;
  courseKey: string;
}) {
  const { t } = useT();
  const selectedDept = school.departments.find(d => d.name === department);
  const durationColor: Record<string, string> = {
    "1年制": "bg-blue-100 text-blue-700",
    "2年制": "bg-purple-100 text-purple-700",
    "3年制": "bg-orange-100 text-orange-700",
  };
  return (
    <div className="space-y-3">
      <Label required>{t("志望学科")}</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {school.departments.map(dept => {
          const sel = department === dept.name;
          return (
            <label key={dept.name} className={`cursor-pointer rounded-xl border-2 p-4 flex items-start gap-3 transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1
              ${sel ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30"}`}>
              <input type="radio" name={deptKey} value={dept.name} className="sr-only"
                checked={sel} onChange={() => { onChange(deptKey, dept.name); onChange(courseKey, ""); }} />
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                ${sel ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                {sel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold text-sm ${sel ? "text-blue-700" : "text-gray-800"}`}>{dept.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${durationColor[dept.duration] ?? "bg-gray-100 text-gray-600"}`}>{dept.duration}</span>
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {errors[deptKey] && <FieldError msg={errors[deptKey]} />}
      {selectedDept && selectedDept.courses && selectedDept.courses.length > 0 && (
        <Field label="志望コース" required error={errors[courseKey]}>
          <Select value={course} error={!!errors[courseKey]} onChange={e => onChange(courseKey, e.target.value)}>
            <option value="">{t("選択してください")}</option>
            {selectedDept.courses.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}

function Step2({ form, onChange, onChangeAdditional, onAddAdditional, onRemoveAdditional, errors, formConfig, schools, preselectedSchool, enrollmentYears }: {
  form: FormData;
  onChange: (f: keyof FormData, v: string | boolean) => void;
  onChangeAdditional: (index: number, field: string, value: string) => void;
  onAddAdditional: (school: SchoolData) => void;
  onRemoveAdditional: (index: number) => void;
  errors: Record<string, string>;
  formConfig: FormFieldConfig[] | null;
  schools: SchoolData[];
  preselectedSchool?: boolean;
  enrollmentYears: string[];
}) {
  const { t } = useT();
  const isEnabled = (key: string) => fieldEnabled(formConfig, key);
  const isRequired = (key: string, defaultReq = true) => fieldRequired(formConfig, key, defaultReq);
  const labelFor = (key: string, fallback: string) => fieldLabel(formConfig, key, fallback);
  const hintFor = (key: string, fallback = "") => fieldHint(formConfig, key, fallback);
  // 入学希望年は /api/apply/settings から取得（管理画面で編集可能）。
  // 取得失敗 / 未取得時は現年〜+2 をフォールバックとして使う。
  const currentYear = new Date().getFullYear();
  const years = enrollmentYears.length > 0
    ? enrollmentYears
    : [String(currentYear), String(currentYear + 1), String(currentYear + 2)];
  const selectedSchool = schools.find(s => s.id === form.schoolId);
  // 学校別の筆記ポリシー（TDBは筆記なし＝一般選考も筆記免除）
  const noWrittenExam = isNoWrittenExamSchool({ schoolId: form.schoolId, schoolName: selectedSchool?.name });

  // 並願で選択済み学校ID一覧（メイン + 追加）
  const usedSchoolIds = [form.schoolId, ...form.additionalSchools.map(a => a.schoolId)].filter(Boolean);
  // 並願に追加できる学校（メイン校・既追加校を除く）
  const availableForAdditional = schools.filter(s => !usedSchoolIds.includes(s.id));

  return (
    <div className="space-y-6">
      {/* メイン志望校：固定表示 */}
      <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
        <div className="flex items-center gap-3">
          <Icon name={schoolIconName(selectedSchool?.icon)} className="w-7 h-7 text-blue-700 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-gray-500">{selectedSchool?.hojin ?? ""}</p>
            <p className="font-bold text-blue-700 text-base">{selectedSchool?.name ?? form.schoolName}</p>
          </div>
          <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">{t("第一志望")}</span>
        </div>
      </div>

      {/* メイン校の学科選択 */}
      {selectedSchool && (
        <SchoolDeptPicker
          school={selectedSchool}
          department={form.department}
          course={form.course}
          onChange={(field, value) => onChange(field as keyof FormData, value)}
          errors={errors}
          deptKey="department"
          courseKey="course"
        />
      )}

      {/* 並願校 */}
      {form.additionalSchools.map((add, idx) => {
        const addSchool = schools.find(s => s.id === add.schoolId);
        if (!addSchool) return null;
        return (
          <div key={idx} className="border-2 border-orange-200 rounded-xl p-4 space-y-4 bg-orange-50/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon name={schoolIconName(addSchool.icon)} className="w-7 h-7 text-gray-600 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">{addSchool.hojin}</p>
                  <p className="font-bold text-gray-800">{addSchool.name}</p>
                </div>
                <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">{t("並願")}</span>
              </div>
              <button type="button" onClick={() => onRemoveAdditional(idx)}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition">
                {t("削除")}
              </button>
            </div>
            <SchoolDeptPicker
              school={addSchool}
              department={add.department}
              course={add.course}
              onChange={(field, value) => {
                // field は "additional_N_department" or "additional_N_course" なので末尾を取る
                const actualField = field.endsWith("_course") ? "course" : "department";
                onChangeAdditional(idx, actualField, value);
              }}
              errors={errors}
              deptKey={`additional_${idx}_department`}
              courseKey={`additional_${idx}_course`}
            />
          </div>
        );
      })}

      {/* 並願追加ボタン */}
      {availableForAdditional.length > 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500 mb-3">{t("他の学校にも出願しますか？（並願）")}</p>
          <div className="flex flex-wrap gap-2">
            {availableForAdditional.map(s => (
              <button key={s.id} type="button" onClick={() => onAddAdditional(s)}
                className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition">
                <Icon name={schoolIconName(s.icon)} className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="font-medium text-gray-700">{s.name}</span>
                <span className="text-blue-500 font-bold">＋</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Divider />
      <SectionTitle icon="calendar">入学希望時期</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="入学希望年" required error={errors.enrollmentYear}>
          <Select value={form.enrollmentYear} error={!!errors.enrollmentYear} onChange={e => onChange("enrollmentYear", e.target.value)}>
            <option value="">{t("選択してください")}</option>
            {years.map(y => <option key={y} value={String(y)}>{y}{t("年")}</option>)}
          </Select>
        </Field>
        <Field label="入学希望月">
          <div className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-600">
            {t("4月（毎年4月入学）")}
          </div>
        </Field>
      </div>

      {isEnabled("applicationReason") && (
        <>
          <Divider />
          <SectionTitle icon="pencil">志望動機</SectionTitle>
          <Field label={labelFor("applicationReason", "志望動機")} required={isRequired("applicationReason")} hint={hintFor("applicationReason", "300字以上で具体的にご記入ください")} error={errors.applicationReason}>
            <textarea
              className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[160px] resize-y
                ${errors.applicationReason ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
              placeholder={t("志望する理由、将来の目標、この学科で学びたいことなどをご記入ください。")}
              value={form.applicationReason} onChange={e => onChange("applicationReason", e.target.value)} />
            <div className="flex justify-end mt-1">
              <span className={`text-xs ${form.applicationReason.length >= 300 ? "text-green-600 font-semibold" : "text-gray-400"}`}>
                {form.applicationReason.length} {t("/ 300文字")}
              </span>
            </div>
          </Field>
        </>
      )}

      {(isEnabled("lastSchoolName") || isEnabled("lastSchoolCountry") || isEnabled("lastSchoolGraduate") || isEnabled("priorAttendanceRate") || isEnabled("workExperience")) && (
        <>
          <Divider />
          <SectionTitle icon="graduation">最終学歴</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {isEnabled("lastSchoolName") && (
              <Field label={labelFor("lastSchoolName", "学校名")} required={isRequired("lastSchoolName")} error={errors.lastSchoolName}>
                <Input placeholder="○○大学" value={form.lastSchoolName} error={!!errors.lastSchoolName} onChange={e => onChange("lastSchoolName", e.target.value)} />
              </Field>
            )}
            {isEnabled("lastSchoolCountry") && (
              <Field label={labelFor("lastSchoolCountry", "国")} required={isRequired("lastSchoolCountry")} error={errors.lastSchoolCountry}>
                <Input placeholder="中国" value={form.lastSchoolCountry} error={!!errors.lastSchoolCountry} onChange={e => onChange("lastSchoolCountry", e.target.value)} />
              </Field>
            )}
            {isEnabled("lastSchoolGraduate") && (
              <Field label={labelFor("lastSchoolGraduate", "卒業状況")} required={isRequired("lastSchoolGraduate")} error={errors.lastSchoolGraduate}>
                <Select value={form.lastSchoolGraduate} error={!!errors.lastSchoolGraduate} onChange={e => onChange("lastSchoolGraduate", e.target.value)}>
                  <option value="">{t("選択してください")}</option>
                  {["卒業","卒業見込み","中退","在学中"].map(v => <option key={v} value={v}>{t(v)}</option>)}
                </Select>
              </Field>
            )}
            {isEnabled("lastSchoolGraduate") && (
              <Field label={labelFor("lastSchoolGraduatedOn", "卒業（見込）年月")} hint={hintFor("lastSchoolGraduatedOn", "例：2026-03")} error={errors.lastSchoolGraduatedOn}>
                <input type="month" lang="ja"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-300"
                  value={form.lastSchoolGraduatedOn} onChange={e => onChange("lastSchoolGraduatedOn", e.target.value)} />
              </Field>
            )}
          </div>

          {isEnabled("priorAttendanceRate") && (
            <Field label={labelFor("priorAttendanceRate", "出身校での出席率")} required={isRequired("priorAttendanceRate", false)}
              hint={hintFor("priorAttendanceRate", "例：95%、出席日数150日/総授業日数158日")} error={errors.priorAttendanceRate}>
              <Input placeholder="例：95%" value={form.priorAttendanceRate} error={!!errors.priorAttendanceRate}
                onChange={e => onChange("priorAttendanceRate", e.target.value)} />
            </Field>
          )}
          {isEnabled("workExperience") && (
            <Field label={labelFor("workExperience", "職務経歴（任意）")} hint={hintFor("workExperience", "直近の職務経歴をご記入ください")}>
              <textarea className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y hover:border-gray-300"
                placeholder={t("会社名、職種、期間などをご記入ください")} value={form.workExperience} onChange={e => onChange("workExperience", e.target.value)} />
            </Field>
          )}
        </>
      )}

      <Divider />
      <SectionTitle icon="tag">選考区分・推薦</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: "一般", label: "一般選考", desc: noWrittenExam ? "面接のみ（筆記免除）" : "筆記試験・面接あり", icon: "pencil" as IconName, exam: !noWrittenExam },
          { value: "指定推薦", label: "指定推薦", desc: "筆記試験免除・面接のみ", icon: "handshake" as IconName, exam: false },
          { value: "特待生", label: "特待生選考", desc: "筆記試験免除・面接のみ", icon: "star" as IconName, exam: false },
        ].map(mode => {
          const sel = form.examMode === mode.value;
          return (
            <label key={mode.value} className={`cursor-pointer rounded-xl border-2 p-4 text-center transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1
              ${sel ? "border-blue-500 bg-blue-50 shadow-md" : "border-gray-200 bg-white hover:border-blue-200"}`}>
              <input type="radio" name="examMode" value={mode.value} className="sr-only"
                checked={sel} onChange={() => onChange("examMode", mode.value)} />
              <span className={`mx-auto mb-1.5 w-10 h-10 rounded-full flex items-center justify-center ${sel ? "bg-accent text-white" : "bg-gray-100 text-gray-500"}`}>
                <Icon name={mode.icon} className="w-5 h-5" />
              </span>
              <p className={`font-bold text-sm mb-0.5 ${sel ? "text-blue-700" : "text-gray-700"}`}>{t(mode.label)}</p>
              <p className="text-xs text-gray-500">{t(mode.desc)}</p>
              <span className={`inline-flex items-center gap-1 mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full ${mode.exam ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                <Icon name={mode.exam ? "pencil" : "ticket"} className="w-3 h-3" />
                {mode.exam ? t("筆記あり") : t("筆記免除")}
              </span>
            </label>
          );
        })}
      </div>
      {form.examMode === "指定推薦" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="推薦機関・推薦者名">
            <Input placeholder="例：上海日本留学センター" value={form.referrerName} onChange={e => onChange("referrerName", e.target.value)} />
          </Field>
          <Field label="推薦機関の種別">
            <Select value={form.referrerType} onChange={e => onChange("referrerType", e.target.value)}>
              <option value="">{t("選択してください（任意）")}</option>
              {["エージェント","学校","個人","その他"].map(v => <option key={v} value={v}>{v === "エージェント" ? t("留学エージェント") : v === "学校" ? t("学校・教育機関") : v === "個人" ? t("個人（恩師・知人など）") : t(v)}</option>)}
            </Select>
          </Field>
        </div>
      )}
      {form.examMode === "特待生" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center"><Icon name="star" className="w-5 h-5" /></span>
            <div>
              <p className="font-bold text-yellow-800 text-sm mb-1">{t("特待生選考の要件")}</p>
              <p className="text-xs text-yellow-800 mb-2">
                {t("次のいずれかを満たす方が対象です。証明書類は次のステップでアップロードしてください（教務が内容を確認します）。")}
              </p>
              <ul className="text-xs text-yellow-800 list-disc list-inside space-y-0.5">
                <li>{t("日本語能力試験")} <strong>N1</strong> {t("合格証明書")}</li>
                <li>{t("出身校での出席率")} <strong>{t("90%以上")}</strong>{t("（95%以上を推奨）を証明する書類")}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
      {form.examMode === "一般" && (
        <>
          {noWrittenExam ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><Icon name="ticket" className="w-5 h-5" /></span>
                <div>
                  <p className="font-bold text-green-800 text-sm mb-1">{t("筆記試験はありません（面接のみ）")}</p>
                  <p className="text-xs text-green-700">{t("本校の一般選考は筆記試験を免除しています。書類審査通過後、面接を受けていただきます。日程は別途ご案内します。")}</p>
                </div>
              </div>
            </div>
          ) : (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-9 h-9 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center"><Icon name="pencil" className="w-5 h-5" /></span>
              <div>
                <p className="font-bold text-orange-800 text-sm mb-1">{t("一般選考は筆記試験があります")}</p>
                <p className="text-xs text-orange-700">{t("書類審査通過後、筆記試験（日本語・一般教養）と面接を受けていただきます。試験日程は別途ご案内します。")}</p>
              </div>
            </div>
          </div>
          )}
          <Field label="紹介・推薦機関（任意）" hint="エージェントや紹介者がいる場合はご記入ください">
            <Input placeholder="例：知日留学センター（なければ空欄）" value={form.referrerName} onChange={e => onChange("referrerName", e.target.value)} />
          </Field>
        </>
      )}
    </div>
  );
}

// ========== Step 3 ==========
// アップロード上限（UIの「最大10MB」表記と一致）。サーバー到達前にクライアントで弾く。
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const overSizeMsg = "ファイルサイズが大きすぎます（最大10MB）。圧縮するか別のファイルを選んでください。";

// 学校の icon 文字列（DB/fallback 由来の絵文字）を SVG アイコン名にマップ（絵文字を直接描画しない）
function schoolIconName(icon?: string | null): IconName {
  switch (icon) {
    case "📚": return "book";
    case "💻": return "monitor";
    case "⚕️": return "stethoscope";
    default: return "school";
  }
}

function Step3({ applicationId, applicationNo, email, uploadedDocs, onUpload, onDelete, formConfig }: {
  applicationId: string | null;
  applicationNo: string | null;
  email: string;
  uploadedDocs: UploadedDoc[];
  onUpload: (doc: UploadedDoc) => void; onDelete: (id: string) => void;
  formConfig: FormFieldConfig[] | null;
}) {
  const { t } = useT();
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      const params = new URLSearchParams({ id });
      if (applicationNo) params.set("applicationNo", applicationNo);
      if (email) params.set("email", email);
      const r = await fetch(`/api/upload?${params}`, { method: "DELETE" });
      if (r.ok) onDelete(id);
    } catch { /* ignore */ }
  };

  const formatSize = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1024 / 1024).toFixed(1)}MB`;

  // 「入学手続き書類」セクションの file 項目は出願フォームには出さない（入学手続き専用）
  const dynamicFileFields = formConfig
    ? formConfig.filter(c => c.fieldType === "file" && c.isEnabled && c.section !== "入学手続き書類")
    : [];

  const hasConfiguredFileFields = dynamicFileFields.length > 0;

  if (!applicationId) return (
    <div className="text-center py-12 text-gray-400">
      <Icon name="info" className="w-10 h-10 mx-auto mb-3" />
      <p className="text-sm">{t("申請情報が保存されていません。前のステップに戻ってください。")}</p>
    </div>
  );

  const renderFileRow = (key: string, label: string, description: string | null | undefined, isRequired: boolean) => {
    const uploaded = uploadedDocs.filter(u => u.docType === label);
    const isUp = uploading === label;
    return (
      <div key={key} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-800 inline-flex items-center gap-1.5"><Icon name="doc" className="w-4 h-4 text-gray-400" />{label}</p>
            {uploaded.length > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5"><Icon name="check" className="w-3 h-3" />{uploaded.length}{t("件")}</span>
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          )}
          {uploaded.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {uploaded.map(u => (
                <div key={u.id} className="flex items-center gap-2 text-xs text-gray-500">
                  <Icon name="doc" className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="truncate">{u.originalName}</span>
                  <span className="shrink-0 text-gray-400">{formatSize(u.fileSize)}</span>
                  <button onClick={() => handleDelete(u.id)} aria-label={t("削除")} className="text-red-400 hover:text-red-600 shrink-0"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" /></svg></button>
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
              if (!applicationNo || !email) { setUploadError(t("申請が確定していません。Step2 まで進めてから書類をアップロードしてください。")); return; }
              if (file.size > MAX_UPLOAD_BYTES) { setUploadError(`「${label}」：${t(overSizeMsg)}`); e.target.value = ""; return; }
              setUploading(label); setUploadError(null);
              const fd = new FormData();
              fd.append("file", file); fd.append("applicationId", applicationId); fd.append("docType", label);
              fd.append("applicationNo", applicationNo); fd.append("email", email);
              fetch("/api/upload", { method: "POST", body: fd })
                .then(r => r.json()).then(data => { if (data.document) onUpload(data.document); else setUploadError(`「${label}」${t("のアップロードに失敗しました：")}${data.error || t("エラー")}`); })
                .catch(() => setUploadError(`「${label}」：${t("ネットワークエラー")}`)).finally(() => { setUploading(null); e.target.value = ""; });
            }} />
          {isUp ? t("送信中...") : t("+ 追加")}
        </label>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1 flex items-center gap-1.5"><Icon name="doc" className="w-4 h-4" />{t("書類アップロードのご案内")}</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700 text-xs">
          <li>{t("対応形式：JPEG、PNG、PDF（各ファイル最大10MB）")}</li>
          <li>{t("書類は鮮明に撮影・スキャンしてください")}</li>
        </ul>
      </div>
      {uploadError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{uploadError}</div>}

      {hasConfiguredFileFields ? (
        <>
          {dynamicFileFields.filter(f => f.isRequired).length > 0 && (
            <div className="rounded-xl border p-4 bg-red-50 border-red-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{t("必須")}</span>
                <h3 className="font-semibold text-gray-800 text-sm">{t("必須書類")}</h3>
              </div>
              <div className="space-y-2">
                {dynamicFileFields.filter(f => f.isRequired).map(field =>
                  renderFileRow(field.fieldKey, field.label, field.description, true)
                )}
              </div>
            </div>
          )}

          {dynamicFileFields.filter(f => !f.isRequired).length > 0 && (
            <div className="rounded-xl border p-4 bg-gray-50 border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t("任意")}</span>
                <h3 className="font-semibold text-gray-800 text-sm">{t("任意提出書類")}</h3>
              </div>
              <div className="space-y-2">
                {dynamicFileFields.filter(f => !f.isRequired).map(field =>
                  renderFileRow(field.fieldKey, field.label, field.description, false)
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        (() => {
          const catStyle: Record<string, { bg: string; badge: string }> = {
            red: { bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700" },
            blue: { bg: "bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-700" },
            purple: { bg: "bg-purple-50 border-purple-200", badge: "bg-purple-100 text-purple-700" },
            gray: { bg: "bg-gray-50 border-gray-200", badge: "bg-gray-100 text-gray-600" },
          };
          return DOC_CATEGORIES.map(cat => {
            const s = catStyle[cat.color];
            return (
              <div key={cat.label} className={`rounded-xl border p-4 ${s.bg}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{cat.required ? t("必須") : t("任意")}</span>
                  <h3 className="font-semibold text-gray-800 text-sm">{t(cat.label)}</h3>
                </div>
                <div className="space-y-2">
                  {cat.docs.map(doc => {
                    const uploaded = uploadedDocs.filter(u => u.docType === doc.type);
                    const isUp = uploading === doc.type;
                    return (
                      <div key={doc.type} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-800">{t(doc.type)}</p>
                            {uploaded.length > 0 && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5"><Icon name="check" className="w-3 h-3" />{uploaded.length}{t("件")}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{t(doc.desc)}</p>
                          {uploaded.length > 0 && (
                            <div className="mt-1.5 space-y-1">
                              {uploaded.map(u => (
                                <div key={u.id} className="flex items-center gap-2 text-xs text-gray-500">
                                  <Icon name="doc" className="w-4 h-4 text-green-500 shrink-0" />
                                  <span className="truncate">{u.originalName}</span>
                                  <span className="shrink-0 text-gray-400">{formatSize(u.fileSize)}</span>
                                  <button onClick={() => handleDelete(u.id)} aria-label={t("削除")} className="text-red-400 hover:text-red-600 shrink-0"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" /></svg></button>
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
                              if (!applicationNo || !email) { setUploadError(t("申請が確定していません。Step2 まで進めてから書類をアップロードしてください。")); return; }
                              if (file.size > MAX_UPLOAD_BYTES) { setUploadError(`「${doc.type}」：${t(overSizeMsg)}`); e.target.value = ""; return; }
                              setUploading(doc.type); setUploadError(null);
                              const fd = new FormData();
                              fd.append("file", file); fd.append("applicationId", applicationId); fd.append("docType", doc.type);
                              fd.append("applicationNo", applicationNo); fd.append("email", email);
                              fetch("/api/upload", { method: "POST", body: fd })
                                .then(r => r.json()).then(data => { if (data.document) onUpload(data.document); else setUploadError(`「${doc.type}」${t("のアップロードに失敗しました：")}${data.error || t("エラー")}`); })
                                .catch(() => setUploadError(`「${doc.type}」：${t("ネットワークエラー")}`)).finally(() => { setUploading(null); e.target.value = ""; });
                            }} />
                          {isUp ? t("送信中...") : t("+ 追加")}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()
      )}
      <p className="text-sm text-gray-500 text-right">{t("アップロード済み：")}<span className="font-bold text-blue-700">{uploadedDocs.length}{t("件")}</span></p>
    </div>
  );
}

// ========== Step 4 ==========
interface PaymentConfig {
  bankName: string; accountType: string; accountNumber: string; accountHolder: string; deadline: string; bankInfoText?: string | null; examFeeQr?: string | null;
}

function Step4Payment({ applicationId, applicationNo, email, schoolCount, feeStatus, onFeeStatusChange, schoolKey }: {
  applicationId: string | null; applicationNo: string | null; email: string; schoolCount: number; feeStatus: string; onFeeStatusChange: (s: string) => void; schoolKey?: string;
}) {
  const { t } = useT();
  const fee = calcExamFee(schoolCount);
  const [uploading, setUploading] = useState(false);
  const [uploadedReceipt, setUploadedReceipt] = useState<{ name: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const q = schoolKey ? `?schoolKey=${encodeURIComponent(schoolKey)}` : "";
    fetch(`/api/config/payment${q}`).then(r => (r.ok ? r.json() : null)).then(d => d && setPaymentConfig(d)).catch(() => {});
  }, [schoolKey]);

  // 振込先のワンクリックコピー（口座番号の手入力ミス防止）
  const copyField = (key: string, val: string) => {
    navigator.clipboard?.writeText(val).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    }).catch(() => { /* clipboard 非対応環境は黙って無視 */ });
  };

  // アップロード本体（ファイル選択・ドラッグ&ドロップ共通）
  const doReceiptUpload = async (file: File) => {
    if (!applicationId) return;
    if (!applicationNo || !email) { setUploadError(t("申請が確定していません。")); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setUploadError(t(overSizeMsg)); return; }
    setUploading(true); setUploadError(null);
    const fd = new FormData();
    fd.append("file", file); fd.append("applicationId", applicationId); fd.append("docType", "選考費振込証明書");
    fd.append("applicationNo", applicationNo); fd.append("email", email);
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "エラー");
      setUploadedReceipt({ name: file.name });
      await fetch(`/api/applications/${applicationId}/fee`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examFeeStatus: "確認中",
          examFeeAmount: fee,
          examFeeReceiptUrl: data.document?.filePath ?? data.document?.fileUrl ?? null,
          applicationNo, email,
        }),
      });
      onFeeStatusChange("確認中");
    } catch (err) { setUploadError(err instanceof Error ? err.message : t("エラー")); }
    finally { setUploading(false); }
  };
  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) doReceiptUpload(file);
    e.target.value = "";
  };
  const handleReceiptDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doReceiptUpload(file);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-6 text-white" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2c5a82 100%)" }}>
        <p className="text-blue-200 text-sm mb-1">{t("選考費（")}{schoolCount}{t("校 × 20,000円）")}</p>
        <p className="text-4xl font-bold tracking-tight">¥{fee.toLocaleString()}<span className="text-lg font-normal text-blue-300 ml-2">{t("税込")}</span></p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4 10h16M5 10V7l7-4 7 4v3M6 10v8m4-8v8m4-8v8m4-8v8" /></svg>
          {t("振込先情報")}
        </h3>
        {paymentConfig ? (
          paymentConfig.bankInfoText ? (
            // 選考管理で設定された受験料振込先（フリーテキスト）
            <button type="button" onClick={() => copyField("振込先", paymentConfig.bankInfoText as string)}
              title={t("クリックでコピー")}
              className="w-full text-left bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
              <p className="text-sm text-gray-900 whitespace-pre-line font-mono leading-relaxed">{paymentConfig.bankInfoText}</p>
              <span className={`mt-2 inline-flex items-center gap-0.5 text-[11px] font-bold ${copiedKey === "振込先" ? "text-green-600" : "text-blue-500"}`}>
                {copiedKey === "振込先" && <Icon name="check" className="w-3 h-3" />}
                {copiedKey === "振込先" ? t("コピー済み") : t("タップでコピー")}
              </span>
            </button>
          ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            {[
              ["銀行名", paymentConfig.bankName],
              ["口座種別", paymentConfig.accountType],
              ["口座番号", paymentConfig.accountNumber],
              ["口座名義", paymentConfig.accountHolder],
              ["振込期限", paymentConfig.deadline],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <span className="text-gray-500">{t(k)}</span>
                {v ? (
                  <button type="button" onClick={() => copyField(k, String(v))}
                    title={t("クリックでコピー")}
                    className="font-semibold text-gray-900 text-left flex items-center gap-1.5 min-w-0 hover:text-blue-700 transition-colors">
                    <span className="truncate">{v}</span>
                    <span className={`text-[10px] shrink-0 font-bold inline-flex items-center gap-0.5 ${copiedKey === k ? "text-green-600" : "text-blue-500"}`}>
                      {copiedKey === k && <Icon name="check" className="w-3 h-3" />}
                      {copiedKey === k ? t("コピー済み") : t("コピー")}
                    </span>
                  </button>
                ) : (
                  <span className="font-semibold text-gray-900">—</span>
                )}
              </div>
            ))}
          </div>
          )
        ) : (
          <p className="text-sm text-gray-400">{t("読み込み中...")}</p>
        )}
        {paymentConfig?.examFeeQr && (
          <div className="mt-4 flex flex-col items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs font-bold text-gray-600">{t("QRコードで支払う")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={paymentConfig.examFeeQr} alt={t("受験料お支払いQRコード")} className="w-44 h-44 object-contain bg-white rounded-lg border border-gray-200 p-1" />
            <p className="text-[11px] text-gray-400">{t("決済アプリでスキャンしてお支払いください")}</p>
          </div>
        )}
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          {t("振込名義は必ず")}<strong>{t("出願者本人のお名前（カタカナ）")}</strong>{t("でお振込みください。")}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.5 12.5l-7 7a4 4 0 01-5.66-5.66l8.49-8.49a2.5 2.5 0 113.54 3.54L9.4 17.4" /></svg>
          {t("振込証明書のアップロード")}
        </h3>
        <p className="text-xs text-gray-400 mb-3">{t("銀行振込の場合は、振込明細書・ATMレシートの写真をアップロードしてください。")}</p>
        {/* 手順ガイド */}
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
          {["銀行で振込", "明細をアップロード", "確認をお待ちください"].map((label, i) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              {i > 0 && (
                <svg className="w-3 h-3 text-gray-300 mr-1" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              )}
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[9px] shrink-0">{i + 1}</span>
              {t(label)}
            </span>
          ))}
        </div>
        {uploadedReceipt ? (
          <div>
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-green-800">{t("アップロード完了")}</p>
                <p className="text-xs text-green-600 truncate">{uploadedReceipt.name}</p>
              </div>
            </div>
            {feeStatus !== "確認済" && (
              <button type="button"
                onClick={() => { setUploadedReceipt(null); setUploadError(null); }}
                className="mt-2 text-xs text-blue-600 hover:underline">
                {t("別のファイルに差し替える")}
              </button>
            )}
          </div>
        ) : (
          <label
            onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleReceiptDrop}
            className={`flex items-center justify-center gap-3 border-2 border-dashed rounded-xl py-8 px-4 cursor-pointer transition-colors
            ${uploading ? "border-gray-200 bg-gray-50 cursor-wait" : dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"}`}>
            <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading || !applicationId} onChange={handleReceiptUpload} />
            <div className="text-center">
              <div className="mb-2 flex justify-center text-gray-400">
                {uploading ? (
                  <svg className="animate-spin w-7 h-7" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                )}
              </div>
              <p className="text-sm text-gray-600 font-medium">{uploading ? t("アップロード中...") : dragOver ? t("ここにドロップ") : t("クリック、またはドラッグ&ドロップでアップロード")}</p>
              <p className="text-xs text-gray-400 mt-1">{t("JPEG・PNG・PDF（最大10MB）")}</p>
            </div>
          </label>
        )}
        {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
      </div>

      <div className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-5 py-4">
        <span className="text-sm font-medium text-gray-700">{t("現在の支払い状態")}</span>
        <span className={`text-sm font-bold px-3 py-1 rounded-full ${
          feeStatus === "確認済み" ? "bg-green-100 text-green-700" :
          feeStatus === "確認中" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{t(feeStatus)}</span>
      </div>
    </div>
  );
}

// ========== Step 5 確認 ==========
function Step5({ form, uploadedDocs }: { form: FormData; uploadedDocs: UploadedDoc[] }) {
  const { t } = useT();
  const Row = ({ label, value }: { label: string; value: string | boolean | undefined | null }) => (
    <div className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-28 shrink-0 pt-0.5">{t(label)}</span>
      <span className="text-sm text-gray-800 font-medium flex-1">{value === true ? t("あり") : value === false ? t("なし") : value || "—"}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-3">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t(title)}</h3>
      {children}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-2">
        <Icon name="info" className="w-4 h-4 shrink-0" />
        <p>{t("以下の内容をご確認の上、「提出する」ボタンを押してください。提出後の内容変更はできません。")}</p>
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
        <Row label="志望校（第一志望）" value={form.schoolName} />
        <Row label="学科" value={form.department} />
        {form.course && <Row label="コース" value={form.course} />}
        {form.additionalSchools.map((add, idx) => (
          <div key={idx}>
            <Row label={`${t("並願校")}${idx + 1}`} value={add.schoolName} />
            <Row label={`${t("並願校")}${idx + 1} ${t("学科")}`} value={add.department} />
            {add.course && <Row label={`${t("並願校")}${idx + 1} ${t("コース")}`} value={add.course} />}
          </div>
        ))}
        <Row label="入学希望" value={`${form.enrollmentYear}${t("年")}${form.enrollmentMonth}${t("月")}`} />
        <Row label="志望動機" value={form.applicationReason} />
      </Section>
      <Section title="最終学歴・選考">
        <Row label="学校名" value={form.lastSchoolName} />
        <Row label="国" value={form.lastSchoolCountry} />
        <Row label="卒業状況" value={form.lastSchoolGraduate} />
        {form.lastSchoolGraduatedOn && <Row label="卒業（見込）年月" value={form.lastSchoolGraduatedOn} />}
        <Row label="選考区分" value={form.examMode} />
        {form.examMode === "指定推薦" && form.referrerName && <Row label="推薦機関" value={form.referrerName} />}
      </Section>
      <Section title={`${t("提出書類（")}${uploadedDocs.length}${t("件）")}`}>
        {uploadedDocs.length === 0 ? <p className="text-sm text-gray-400">{t("書類なし")}</p> : (
          <div className="space-y-2">
            {uploadedDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 text-sm">
                <Icon name="check" className="w-4 h-4 text-green-500 shrink-0" />
                <span className="font-medium text-gray-700">{t(doc.docType)}</span>
                <span className="text-gray-400 text-xs">— {doc.originalName}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ========== 出願番号発行確認画面 (between Step 2 and Step 3) ==========
function ApplicationNoConfirm({
  applicationNo,
  email,
  onContinue,
  onSaveAndExit,
}: {
  applicationNo: string;
  email: string;
  onContinue: () => void;
  onSaveAndExit: () => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600"><Icon name="check" className="w-8 h-8" strokeWidth={2.2} /></div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">{t("出願番号が発行されました")}</h2>
        <p className="text-sm text-gray-500">{t("ステップ1・2の情報を受け付けました")}</p>
      </div>

      {/* 出願番号 */}
      <div className="rounded-2xl p-6 text-white text-center" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2c5a82 100%)" }}>
        <p className="text-blue-200 text-sm mb-2">{t("出願番号")}</p>
        <p className="text-4xl font-bold tracking-widest">{applicationNo}</p>
        <p className="text-blue-300 text-xs mt-3">{t("この番号は必ず控えてください")}</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1 flex items-center gap-1.5"><Icon name="lightbulb" className="w-4 h-4" />{t("この番号でできること")}</p>
        <p className="text-xs text-blue-700">
          {t("この番号でいつでもログインして書類アップロード・選考料のお支払いができます。後から続ける場合は")}{" "}
          <Link
            href={`/apply/status?applicationNo=${encodeURIComponent(applicationNo)}&email=${encodeURIComponent(email)}`}
            className="font-bold text-blue-700 underline hover:text-blue-900"
          >
            {t("出願状況確認ページ")}
          </Link>
          {" "}{t("（または")}{" "}
          <Link
            href={`/apply/status?applicationNo=${encodeURIComponent(applicationNo)}&email=${encodeURIComponent(email)}`}
            className="font-mono underline hover:text-blue-900"
          >
            /apply/status
          </Link>
          {t("）にアクセスしてください。出願番号とメールアドレスは自動入力されます。")}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onContinue}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2"
        >
          {t("続けて書類をアップロードする →")}
        </button>
        <button
          onClick={onSaveAndExit}
          className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition"
        >
          {t("後で続きをする")}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        {t("登録メールアドレス:")} <span className="font-medium text-gray-600">{email}</span>
      </p>
    </div>
  );
}

// ========== 後で続きをする 完了画面 ==========
function SaveAndExitScreen({ applicationNo, email }: { applicationNo: string; email: string }) {
  const { t } = useT();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 py-4 px-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white"><CompassMark className="w-5 h-5" /></div>
          <div>
            <p className="font-bold text-gray-800 leading-none">Compass</p>
            <p className="text-xs text-gray-400 mt-0.5">{t("入学出願システム")}</p>
          </div>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600"><Icon name="clipboard" className="w-8 h-8" /></div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">{t("出願を一時保存しました")}</h2>
            <p className="text-gray-500 text-sm">{t("後から書類アップロードを再開できます")}</p>
          </div>

          <div className="rounded-2xl p-6 mb-6 text-white" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2c5a82 100%)" }}>
            <p className="text-blue-200 text-sm mb-2">{t("出願番号")}</p>
            <p className="text-3xl font-bold tracking-widest">{applicationNo}</p>
            <p className="text-blue-300 text-xs mt-2">{t("この番号を必ず控えてください")}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-3">
            <h3 className="font-bold text-gray-800 text-sm">{t("続きの手続き方法")}</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold mt-0.5">1</span>
                <p>
                  <Link
                    href={`/apply/status?applicationNo=${encodeURIComponent(applicationNo)}&email=${encodeURIComponent(email)}`}
                    className="font-bold text-blue-700 underline hover:text-blue-900"
                  >
                    {t("出願状況確認ページ")}
                  </Link>
                  {" "}{t("（")}<span className="font-mono text-xs">/apply/status</span>{t("）にアクセスします")}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold mt-0.5">2</span>
                <p>{t("出願番号")} <strong>{applicationNo}</strong> {t("とメールアドレス")} <strong>{email}</strong> {t("で検索します")}<br />
                  <span className="text-xs text-gray-400">{t("（上のリンクから入ると自動入力されます）")}</span>
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold mt-0.5">3</span>
                <p>{t("書類アップロードと選考料のお支払いを完了してください")}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href={`/apply/status?applicationNo=${encodeURIComponent(applicationNo)}&email=${encodeURIComponent(email)}`}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition inline-flex items-center justify-center gap-1.5"
            >
              <Icon name="clipboard" className="w-4 h-4" />{t("出願を再開する")}
            </Link>
            <Link
              href="/"
              className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition text-center"
            >
              {t("トップへ戻る")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const DRAFT_KEY = "application_draft";

// ========== Main ==========
function ApplyPageInner() {
  const { toast } = useUI();
  const { t } = useT();
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
  const [formConfig, setFormConfig] = useState<FormFieldConfig[] | null>(null);
  const [schools, setSchools] = useState<SchoolData[]>(SCHOOLS_FALLBACK);
  // 入学希望年候補（/api/apply/settings から取得、管理画面で編集可能）
  const [enrollmentYears, setEnrollmentYears] = useState<string[]>([]);
  // showAppNoConfirm: after Step 2 save, before Step 3
  const [showAppNoConfirm, setShowAppNoConfirm] = useState(false);
  // saveAndExit: user chose to save and exit after seeing appNo
  const [saveAndExit, setSaveAndExit] = useState(false);
  // resumeLoading: fetching existing application data for resume flow
  const [resumeLoading, setResumeLoading] = useState(false);
  const [isResumed, setIsResumed] = useState(false); // resume フローかどうか
  const [preselectedSchool, setPreselectedSchool] = useState(false); // トップから学校指定で来た場合
  const schoolCount = 1 + form.additionalSchools.length;
  const [activeCohorts, setActiveCohorts] = useState<{ id: string; name: string; round: number; schoolKey: string | null; deadline: string | null; examDate: string | null }[] | null>(null);
  const [schoolClosed, setSchoolClosed] = useState(false); // 受付期間外フラグ

  // ===== 下書き保存 =====
  const [draftBanner, setDraftBanner] = useState<"ask" | "hidden" | null>(null); // null = not checked yet
  const draftTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraftToStorage = useCallback((formData: FormData) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: formData, savedAt: Date.now() }));
    } catch { /* ignore */ }
  }, []);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }, []);

  // ページロード時にdraftチェック（resumeフローでなく出願前のみ）
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const isResumeFlow = sp.get("resume") === "1";
    if (isResumeFlow) { setDraftBanner("hidden"); return; }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.form) setDraftBanner("ask");
        else setDraftBanner("hidden");
      } else {
        setDraftBanner("hidden");
      }
    } catch { setDraftBanner("hidden"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 30秒ごと自動保存（Step1-2のみ、出願番号発行前）
  useEffect(() => {
    if (applicationId || isResumed || submitted) return; // 出願済みは保存しない
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraftToStorage(form);
    }, 30000);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [form, applicationId, isResumed, submitted, saveDraftToStorage]);

  // フォーカスアウト時に保存
  const handleFormBlur = useCallback(() => {
    if (!applicationId && !isResumed && !submitted) {
      saveDraftToStorage(form);
    }
  }, [form, applicationId, isResumed, submitted, saveDraftToStorage]);

  // 受付中バッチを取得
  useEffect(() => {
    fetch("/api/apply/cohorts")
      .then(r => r.json())
      .then(d => {
        const cohorts = Array.isArray(d) ? d : [];
        setActiveCohorts(cohorts);
        // 学校が既に選択されていれば受付チェック（resumeフローは除外）
        if (cohorts.length > 0) {
          const schoolParam = new URLSearchParams(window.location.search).get("school");
          const resumeParam = new URLSearchParams(window.location.search).get("resume");
          if (schoolParam && !resumeParam) {
            const ok = cohorts.some((c: { schoolKey: string | null }) => !c.schoolKey || c.schoolKey === schoolParam);
            if (!ok) setSchoolClosed(true);
          }
        }
      })
      .catch(() => setActiveCohorts([]));
  }, []);

  // Fetch schools from DB on mount (with fallback to hardcoded)
  useEffect(() => {
    fetch("/api/apply/schools")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const list = (Array.isArray(data) && data.length > 0) ? data : SCHOOLS_FALLBACK;
        if (Array.isArray(data) && data.length > 0) setSchools(data);

        // ?school=xxx パラメータ処理：fetch完了後に直接適用
        const schoolParam = new URLSearchParams(window.location.search).get("school");
        if (schoolParam) {
          const found = list.find((s: SchoolData) => s.id === schoolParam || s.schoolKey === schoolParam);
          if (found) {
            setForm(prev => ({
              ...prev,
              schoolId: found.id,
              schoolName: found.name,
            }));
            setPreselectedSchool(true);
            fetchFormConfig(found.id, form.applicantType);
            // 受付チェック（activeCohorts がロード済みなら即チェック）
            setActiveCohorts(prev => {
              const cohorts = prev ?? [];
              const ok = cohorts.some(c => !c.schoolKey || c.schoolKey === found.id);
              if (!ok && cohorts.length > 0) setSchoolClosed(true);
              return prev;
            });
          }
        }
      })
      .catch(() => {
        // Keep fallback — school param処理はFALLBACKで試みる
        const schoolParam = new URLSearchParams(window.location.search).get("school");
        if (schoolParam) {
          const found = SCHOOLS_FALLBACK.find(s => s.id === schoolParam || s.schoolKey === schoolParam);
          if (found) {
            setForm(prev => ({ ...prev, schoolId: found.id, schoolName: found.name }));
            setPreselectedSchool(true);
          }
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // フォームフィールド設定を取得（schoolId / 出願者タイプ に応じて切り替え）
  const fetchFormConfig = (schoolId?: string, type?: ApplicantType | "") => {
    const params = new URLSearchParams();
    if (schoolId) params.set("schoolId", schoolId);
    if (type && isApplicantType(type)) params.set("type", type);
    const qs = params.toString();
    const url = qs ? `/api/apply/form-config?${qs}` : "/api/apply/form-config";
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setFormConfig(data);
        }
      })
      .catch(() => {});
  };

  // 入学希望年候補を /api/apply/settings から取得
  useEffect(() => {
    fetch("/api/apply/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d && Array.isArray(d.enrollmentYears) && d.enrollmentYears.length > 0) {
          setEnrollmentYears(d.enrollmentYears);
        }
      })
      .catch(() => {});
  }, []);

  // resume フロー: URL に ?resume=1&applicationNo=XXX&email=YYY がある場合
  // 既存の出願データを取得して Step3 から再開
  const handleResume = useCallback(async (appNo: string, emailAddr: string) => {
    setResumeLoading(true);
    try {
      const params = new URLSearchParams({ applicationNo: appNo, email: emailAddr });
      const res = await fetch(`/api/applications/status?${params}`);
      if (!res.ok) throw new Error("取得失敗");
      const data = await res.json();
      if (data.id) {
        setApplicationId(data.id);
        setApplicationNo(data.applicationNo);
        setUploadedDocs(data.documents || []);
        setExamFeeStatus(data.examFeeStatus || "未払い");
        setIsResumed(true);
        // form データを復元（Step5確認画面で表示できるように）
        setForm(prev => ({
          ...prev,
          lastName: data.lastName || prev.lastName,
          firstName: data.firstName || prev.firstName,
          lastNameKana: data.lastNameKana || prev.lastNameKana,
          firstNameKana: data.firstNameKana || prev.firstNameKana,
          birthDate: data.birthDate || prev.birthDate,
          gender: data.gender || prev.gender,
          nationality: data.nationality || prev.nationality,
          phone: data.phone || prev.phone,
          email: data.email || prev.email,
          postalCode: data.postalCode || prev.postalCode,
          prefecture: data.prefecture || prev.prefecture,
          city: data.city || prev.city,
          address: data.address || prev.address,
          addressDetail: data.addressDetail || prev.addressDetail,
          residenceStatus: data.residenceStatus || prev.residenceStatus,
          residenceExpiry: data.residenceExpiry || prev.residenceExpiry,
          japaneseLevel: data.japaneseLevel || prev.japaneseLevel,
          jlptCertified: data.jlptCertified ?? prev.jlptCertified,
          schoolId: data.schoolId || prev.schoolId,
          schoolName: data.schoolName || prev.schoolName,
          department: data.department || prev.department,
          course: data.course || prev.course,
          enrollmentYear: data.enrollmentYear || prev.enrollmentYear,
          enrollmentMonth: data.enrollmentMonth || prev.enrollmentMonth,
          applicationReason: data.applicationReason || prev.applicationReason,
          lastSchoolName: data.lastSchoolName || prev.lastSchoolName,
          lastSchoolCountry: data.lastSchoolCountry || prev.lastSchoolCountry,
          lastSchoolGraduate: data.lastSchoolGraduate || prev.lastSchoolGraduate,
          lastSchoolGraduatedOn: data.lastSchoolGraduatedOn || prev.lastSchoolGraduatedOn,
          workExperience: data.workExperience || prev.workExperience,
          examMode: data.examMode || prev.examMode,
          referrerName: data.referrerName || prev.referrerName,
          referrerType: data.referrerType || prev.referrerType,
          // 第2志望以降の学校情報を復元
          additionalSchools: Array.isArray(data.applicationSchools)
            ? (data.applicationSchools as Array<{
                priority: number;
                schoolName: string;
                department: string;
                course: string | null;
              }>)
                .filter((s) => s.priority > 1)
                .sort((a, b) => a.priority - b.priority)
                .map((s) => ({
                  schoolId: "",
                  schoolName: s.schoolName,
                  department: s.department,
                  course: s.course || "",
                }))
            : prev.additionalSchools,
        }));
        // 書類待ち → Step3、選考費未払い以外 → Step4
        if (data.examFeeStatus && data.examFeeStatus !== "未払い") {
          setCurrentStep(4);
        } else {
          setCurrentStep(3);
        }
      }
    } catch {
      // 失敗したら通常フローで続ける
    } finally {
      setResumeLoading(false);
    }
  }, []);

  useEffect(() => {
    // window.location.search を直接読む（useSearchParams は Static Generation では空になる）
    const sp = new URLSearchParams(window.location.search);
    const resume = sp.get("resume");
    const appNo = sp.get("applicationNo");
    const emailAddr = sp.get("email");
    if (resume === "1" && appNo && emailAddr) {
      handleResume(appNo, emailAddr);
    }


  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      // ドラフトを即時保存（出願前のみ）
      if (!applicationId && !isResumed && !submitted) {
        saveDraftToStorage(updated);
      }
      return updated;
    });
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    if (field === "schoolId" && typeof value === "string") {
      fetchFormConfig(value || undefined, form.applicantType);
    }
  };

  // 出願者タイプ選択（ゲート画面）。選択後、タイプ反映済みの全体設定を取得して
  // Step1 の留学生専用フィールド表示/非表示を切り替える。
  const handleSelectApplicantType = (type: ApplicantType) => {
    setForm(prev => {
      const updated = { ...prev, applicantType: type };
      if (!applicationId && !isResumed && !submitted) saveDraftToStorage(updated);
      return updated;
    });
    // 既に学校が選択されていればその学校設定を、なければ全体設定を取得（いずれもタイプ付き）
    fetchFormConfig(form.schoolId || undefined, type);
  };

  // 並願校ハンドラ
  const handleChangeAdditional = (index: number, field: string, value: string) => {
    setForm(prev => {
      const updated = [...prev.additionalSchools];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, additionalSchools: updated };
    });
    setErrors(prev => { const n = { ...prev }; delete n[`additional_${index}_${field}`]; return n; });
  };

  const handleAddAdditional = (school: SchoolData) => {
    setForm(prev => ({
      ...prev,
      additionalSchools: [
        ...prev.additionalSchools,
        { schoolId: school.id, schoolName: school.name, department: "", course: "" },
      ],
    }));
  };

  const handleRemoveAdditional = (index: number) => {
    setForm(prev => {
      const updated = prev.additionalSchools.filter((_, i) => i !== index);
      return { ...prev, additionalSchools: updated };
    });
  };

  const isFieldRequired = (key: string, defaultReq = true): boolean => fieldRequired(formConfig, key, defaultReq);
  const isFieldEnabled = (key: string): boolean => fieldEnabled(formConfig, key);

  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};
    if (isFieldRequired("lastName") && !form.lastName) e.lastName = "姓を入力してください";
    if (isFieldRequired("firstName") && !form.firstName) e.firstName = "名を入力してください";
    if (isFieldRequired("lastNameKana") && !form.lastNameKana) e.lastNameKana = "姓（カナ）を入力してください";
    if (isFieldRequired("firstNameKana") && !form.firstNameKana) e.firstNameKana = "名（カナ）を入力してください";
    if (isFieldRequired("birthDate") && !form.birthDate) e.birthDate = "生年月日を入力してください";
    if (isFieldRequired("gender") && !form.gender) e.gender = "性別を選択してください";
    if (isFieldRequired("nationality") && !form.nationality) e.nationality = "国籍を選択してください";
    if (isFieldRequired("phone") && !form.phone) e.phone = "電話番号を入力してください";
    if (isFieldEnabled("email")) {
      if (isFieldRequired("email") && !form.email) e.email = "メールアドレスを入力してください";
      else if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "有効なメールアドレスを入力してください";
    }
    if (isFieldRequired("postalCode")) {
      if (!form.postalCode) e.postalCode = "郵便番号を入力してください";
      else if (form.postalCode.length !== 7) e.postalCode = "郵便番号は7桁で入力してください";
    }
    if (isFieldRequired("prefecture") && !form.prefecture) e.prefecture = "都道府県を選択してください";
    if (isFieldRequired("city") && !form.city) e.city = "市区町村を入力してください";
    if (isFieldRequired("address") && !form.address) e.address = "番地を入力してください";
    if (isFieldRequired("japaneseLevel") && !form.japaneseLevel) e.japaneseLevel = "日本語レベルを選択してください";
    if (isFieldRequired("residenceStatus", false) && !form.residenceStatus) e.residenceStatus = "在留資格を選択してください";
    if (isFieldRequired("residenceExpiry", false) && !form.residenceExpiry) e.residenceExpiry = "在留期限を入力してください";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.schoolId) e.schoolId = "志望校を選択してください";
    if (!form.department) e.department = "志望学科を選択してください";
    const dept = schools.find(s => s.id === form.schoolId)?.departments.find(d => d.name === form.department);
    // コースが設定されている学科のみコース必須チェック
    if (dept && dept.courses && dept.courses.length > 0 && !form.course) e.course = "コースを選択してください";
    // 並願校のバリデーション
    form.additionalSchools.forEach((add, idx) => {
      if (!add.department) e[`additional_${idx}_department`] = "志望学科を選択してください";
      const addDept = schools.find(s => s.id === add.schoolId)?.departments.find(d => d.name === add.department);
      if (addDept && addDept.courses && addDept.courses.length > 0 && !add.course) e[`additional_${idx}_course`] = "コースを選択してください";
    });
    if (!form.enrollmentYear) e.enrollmentYear = "入学希望年を選択してください";
    if (isFieldRequired("applicationReason")) {
      if (!form.applicationReason) e.applicationReason = "志望動機を入力してください";
      else if (form.applicationReason.length < 300) e.applicationReason = `${t("300文字以上入力してください（現在")}${form.applicationReason.length}${t("文字）")}`;
    }
    if (isFieldRequired("lastSchoolName") && !form.lastSchoolName) e.lastSchoolName = "学校名を入力してください";
    if (isFieldRequired("lastSchoolCountry") && !form.lastSchoolCountry) e.lastSchoolCountry = "国を入力してください";
    if (isFieldRequired("lastSchoolGraduate") && !form.lastSchoolGraduate) e.lastSchoolGraduate = "卒業状況を選択してください";
    if (isFieldRequired("priorAttendanceRate", false) && !form.priorAttendanceRate) e.priorAttendanceRate = "出席率を入力してください";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveStep1And2 = async (): Promise<boolean> => {
    try {
      const r = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: "書類待ち" }),
      });
      const data = await r.json();
      if (!r.ok) { setSubmitError(data.error || "保存に失敗しました"); return false; }
      setApplicationId(data.id); setApplicationNo(data.applicationNo); return true;
    } catch { setSubmitError("ネットワークエラー"); return false; }
  };

  /**
   * 現在のステップが「次へ進める状態か」を判定（read-only、setErrors しない）。
   * 「次へ進む」ボタンの disabled に使う。validateStepN() と同じ条件のサブセット。
   */
  const isCurrentStepValid = (): boolean => {
    if (currentStep === 1) {
      if (isFieldRequired("lastName") && !form.lastName) return false;
      if (isFieldRequired("firstName") && !form.firstName) return false;
      if (isFieldRequired("lastNameKana") && !form.lastNameKana) return false;
      if (isFieldRequired("firstNameKana") && !form.firstNameKana) return false;
      if (isFieldRequired("birthDate") && !form.birthDate) return false;
      if (isFieldRequired("gender") && !form.gender) return false;
      if (isFieldRequired("nationality") && !form.nationality) return false;
      if (isFieldRequired("phone") && !form.phone) return false;
      if (isFieldEnabled("email")) {
        if (isFieldRequired("email") && !form.email) return false;
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return false;
      }
      if (isFieldRequired("postalCode") && (!form.postalCode || form.postalCode.length !== 7)) return false;
      if (isFieldRequired("prefecture") && !form.prefecture) return false;
      if (isFieldRequired("city") && !form.city) return false;
      if (isFieldRequired("address") && !form.address) return false;
      if (isFieldRequired("japaneseLevel") && !form.japaneseLevel) return false;
      return true;
    }
    if (currentStep === 2) {
      if (!form.schoolId || !form.department) return false;
      const dept = schools.find(s => s.id === form.schoolId)?.departments.find(d => d.name === form.department);
      if (dept && dept.courses && dept.courses.length > 0 && !form.course) return false;
      if (!form.enrollmentYear) return false;
      if (isFieldRequired("applicationReason") && (!form.applicationReason || form.applicationReason.length < 300)) return false;
      if (isFieldRequired("lastSchoolName") && !form.lastSchoolName) return false;
      if (isFieldRequired("lastSchoolCountry") && !form.lastSchoolCountry) return false;
      if (isFieldRequired("lastSchoolGraduate") && !form.lastSchoolGraduate) return false;
      for (const add of form.additionalSchools) {
        if (!add.department) return false;
        const addDept = schools.find(s => s.id === add.schoolId)?.departments.find(d => d.name === add.department);
        if (addDept && addDept.courses && addDept.courses.length > 0 && !add.course) return false;
      }
      return true;
    }
    if (currentStep === 3) {
      if (!formConfig) return true;
      const requiredFileFields = formConfig.filter(c => c.fieldType === "file" && c.isEnabled && c.isRequired && c.section !== "入学手続き書類");
      return requiredFileFields.every(f => uploadedDocs.some(d => d.docType === f.label));
    }
    if (currentStep === 4) {
      return examFeeStatus !== "未払い";
    }
    return true;
  };

  // 検証失敗時：最初のエラー項目までスクロールしてフォーカス（無ければトップ）
  const scrollToFirstError = () => {
    requestAnimationFrame(() => {
      const alert = document.querySelector('[role="alert"]') as HTMLElement | null;
      if (alert) {
        alert.scrollIntoView({ behavior: "smooth", block: "center" });
        const field = alert.closest("div")?.querySelector("input, select, textarea") as HTMLElement | null;
        try { field?.focus({ preventScroll: true }); } catch { /* ignore */ }
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const handleNext = async () => {
    setSubmitError(null);
    if (currentStep === 1) {
      if (!validateStep1()) { scrollToFirstError(); return; }
      setCurrentStep(2); scrollTop();
    }
    else if (currentStep === 2) {
      if (!validateStep2()) { scrollToFirstError(); return; }
      setSubmitting(true);
      const ok = await saveStep1And2();
      setSubmitting(false);
      if (!ok) { scrollTop(); return; }
      // Show 出願番号発行 confirmation screen instead of going directly to Step 3
      setShowAppNoConfirm(true); scrollTop();
    } else if (currentStep === 3) {
      // 必須書類のアップロードチェック
      if (formConfig) {
        const requiredFileFields = formConfig.filter(c => c.fieldType === "file" && c.isEnabled && c.isRequired && c.section !== "入学手続き書類");
        const missingDocs = requiredFileFields.filter(f => !uploadedDocs.some(d => d.docType === f.label));
        if (missingDocs.length > 0) {
          setErrors({ step3: `${t("以下の必須書類をアップロードしてください：")}${missingDocs.map(f => f.label).join("、")}` });
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
      if (applicationId) {
        await fetch(`/api/applications/${applicationId}/fee`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examFeeAmount: calcExamFee(schoolCount),
            applicationNo, email: form.email,
          }),
        });
      }
      setCurrentStep(4); scrollTop();
    } else if (currentStep === 4) {
      // 選考費が未払いのまま確認画面に進ませない
      if (examFeeStatus === "未払い") {
        setErrors({ step4: "選考料の振込証明書をアップロードしてから次へ進んでください。" });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setCurrentStep(5); scrollTop();
    }
  };

  const handleSubmit = async () => {
    if (!applicationId) { setSubmitError("出願IDが見つかりません"); return; }
    if (!form.email) { setSubmitError("メールアドレスが見つかりません。最初からやり直してください。"); return; }
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "提出に失敗しました");
      }
      clearDraft(); // 提出成功時にdraftを削除
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "提出に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (showAppNoConfirm) {
      // Go back from confirmation screen to Step 2
      setShowAppNoConfirm(false);
    } else if (currentStep >= 3 && applicationId) {
      // Step3以降かつ出願番号発行済みの場合はStep3より前に戻れない
      // Step3→Step3のまま（何もしない）、Step4→Step3、Step5→Step4
      setCurrentStep(p => Math.max(3, p - 1));
    } else {
      setCurrentStep(p => Math.max(1, p - 1));
    }
  };

  // 「後で続きをする」pressed
  if (saveAndExit && applicationNo) {
    return <SaveAndExitScreen applicationNo={applicationNo} email={form.email} />;
  }

  // 完了画面
  // 受付期間外（resumeフローは除外）
  const isResume = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("resume") === "1";
  if (schoolClosed && !isResume) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 py-4 px-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white"><CompassMark className="w-5 h-5" /></div>
            <div>
            <p className="font-bold text-gray-800 leading-none">Compass</p>
            <p className="text-xs text-gray-400 mt-0.5">{t("入学出願システム")}</p>
          </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">⏸</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">{t("現在、出願受付期間外です")}</h2>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              {t("申し訳ございませんが、現在この学校の出願受付期間ではございません。")}<br/>
              {t("次回の選考情報は各校の入学相談室にお問い合わせください。")}
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800 text-left">
              <p className="font-bold mb-1 flex items-center gap-1.5"><Icon name="phone" className="w-4 h-4" />{t("お問い合わせ")}</p>
              <p>{t("各校の入学相談室（平日 9:00〜17:00）")}</p>
            </div>
            <a href="/" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors">
              {t("トップページへ戻る")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (submitted && applicationNo) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 py-4 px-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white"><CompassMark className="w-5 h-5" /></div>
            <div>
            <p className="font-bold text-gray-800 leading-none">Compass</p>
            <p className="text-xs text-gray-400 mt-0.5">{t("入学出願システム")}</p>
          </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600"><Icon name="check" className="w-10 h-10" strokeWidth={2.2} /></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{t("出願が完了しました")}</h2>
            <p className="text-gray-500 text-sm mb-8">{t("書類を受付いたしました。審査結果はメールにてお知らせします。")}</p>
            <div className="rounded-2xl p-6 mb-8 text-white" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2c5a82 100%)" }}>
              <p className="text-blue-200 text-sm mb-2">{t("申請番号")}</p>
              <p className="text-3xl font-bold tracking-wider">{applicationNo}</p>
              <p className="text-blue-300 text-xs mt-2">{t("この番号は審査状況の確認に必要です")}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/apply/status" className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition">{t("出願状況を確認する")}</Link>
              <Link href="/" className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition">{t("トップへ戻る")}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== 出願者タイプ選択ゲート =====
  // 新規出願で、まだタイプ未選択のときだけ表示。
  // resume フロー（isResumed / applicationId 設定済み）や読込中は表示しない。
  const showTypeGate =
    !form.applicantType && !isResumed && !applicationId && !resumeLoading && !showAppNoConfirm;
  if (showTypeGate) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white"><CompassMark className="w-5 h-5" /></div>
              <div>
                <p className="font-bold text-gray-800 text-sm leading-none">Compass</p>
                <p className="text-xs text-gray-400 mt-0.5">{t("入学出願システム")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition">{t("← トップへ")}</Link>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-10">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{t("出願者の区分を選択してください")}</h1>
            <p className="text-sm text-gray-500">{t("いずれかを選ぶと出願フォームが始まります")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { value: "foreign" as ApplicantType, label: "留学生", desc: "在留資格をお持ちの方・これから来日される方", icon: "globe" as IconName },
              { value: "japanese" as ApplicantType, label: "日本人学生", desc: "日本国籍をお持ちの方", icon: "user" as IconName },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                data-testid={`applicant-type-${opt.value}`}
                onClick={() => handleSelectApplicantType(opt.value)}
                className="cursor-pointer rounded-2xl border-2 border-gray-200 bg-white p-8 text-center transition-all hover:border-blue-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                <span className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center bg-blue-50 text-blue-600">
                  <Icon name={opt.icon} className="w-8 h-8" />
                </span>
                <p className="font-bold text-lg text-gray-800 mb-1">{t(opt.label)}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{t(opt.desc)}</p>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" onBlur={handleFormBlur}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white"><CompassMark className="w-5 h-5" /></div>
            <div>
              <p className="font-bold text-gray-800 text-sm leading-none">Compass</p>
              <p className="text-xs text-gray-400 mt-0.5">{t("入学出願システム")} · {t("ステップ")} {showAppNoConfirm ? "2+" : currentStep} / {STEPS.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition">{t("← トップへ")}</Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* ===== 下書きバナー ===== */}
        {draftBanner === "ask" && !applicationId && !isResumed && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <Icon name="pencil" className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 mb-1">{t("下書きが保存されています。続きから入力しますか？")}</p>
              <div className="flex gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const raw = localStorage.getItem(DRAFT_KEY);
                      if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed?.form) {
                          setForm({ ...initialForm, ...parsed.form });
                        }
                      }
                    } catch { /* ignore */ }
                    setDraftBanner("hidden");
                  }}
                  className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
                >
                  {t("続きから入力")}
                </button>
                <button
                  type="button"
                  onClick={() => { clearDraft(); setDraftBanner("hidden"); }}
                  className="px-4 py-2 text-sm font-semibold bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition"
                >
                  {t("新規入力")}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Step Indicator */}
        <StepIndicator currentStep={showAppNoConfirm ? 3 : currentStep} />

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          {resumeLoading ? (
            <div className="text-center py-16">
              <svg className="animate-spin w-8 h-8 text-blue-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-500 text-sm">{t("出願情報を読み込んでいます...")}</p>
            </div>
          ) : showAppNoConfirm ? (
            // 出願番号発行確認画面
            <ApplicationNoConfirm
              applicationNo={applicationNo!}
              email={form.email}
              onContinue={() => { setShowAppNoConfirm(false); setCurrentStep(3); }}
              onSaveAndExit={() => setSaveAndExit(true)}
            />
          ) : (
            <>
              <h1 className="text-lg font-bold text-gray-800 mb-6">{t(STEPS[currentStep - 1].label)}</h1>
              {currentStep === 1 && <Step1 form={form} onChange={handleChange} errors={errors} formConfig={formConfig} />}
              {currentStep === 2 && <Step2 form={form} onChange={handleChange} onChangeAdditional={handleChangeAdditional} onAddAdditional={handleAddAdditional} onRemoveAdditional={handleRemoveAdditional} errors={errors} formConfig={formConfig} schools={schools} preselectedSchool={preselectedSchool} enrollmentYears={enrollmentYears} />}
              {currentStep === 3 && <>
                {errors.step3 && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                    <Icon name="info" className="w-4 h-4 shrink-0" /><span>{errors.step3}</span>
                  </div>
                )}
                <Step3 applicationId={applicationId} applicationNo={applicationNo} email={form.email}
                  uploadedDocs={uploadedDocs}
                  onUpload={doc => { setUploadedDocs(p => [...p, doc]); setErrors(p => { const n={...p}; delete n.step3; return n; }); }}
                  onDelete={id => setUploadedDocs(p => p.filter(d => d.id !== id))}
                  formConfig={formConfig} />
              </>}
              {currentStep === 4 && <Step4Payment applicationId={applicationId} applicationNo={applicationNo} email={form.email} schoolCount={schoolCount}
                schoolKey={form.schoolId} feeStatus={examFeeStatus} onFeeStatusChange={setExamFeeStatus} />}
              {currentStep === 5 && <Step5 form={form} uploadedDocs={uploadedDocs} />}
            </>
          )}
        </div>

        {submitError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
            <Icon name="info" className="w-4 h-4 shrink-0" />{t(submitError)}
          </div>
        )}

        {/* Navigation — hide on AppNoConfirm screen (it has its own buttons) */}
        {!showAppNoConfirm && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              {/* resumeフロー時はStep1/2に戻れないので前へボタン非表示 */}
              {/* 通常フローでStep3以降かつ出願番号発行済みも同様 */}
              {(isResumed || (currentStep >= 3 && !!applicationId)) ? (
                <div />
              ) : (
                <button onClick={handleBack} disabled={currentStep === 1 || submitting}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
                  {t("← 前へ")}
                </button>
              )}
              {currentStep < 5 ? (() => {
                const valid = isCurrentStepValid();
                return (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      data-testid="apply-next"
                      onClick={handleNext}
                      disabled={submitting || !valid}
                      title={!valid ? "必須項目を入力してから進んでください" : ""}
                      className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition shadow-sm
                        ${submitting || !valid
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                          : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                        }`}
                    >
                      {submitting ? (
                        <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> {t("保存中...")}</>
                      ) : currentStep === 4 ? t("確認へ進む →") : t("次へ進む →")}
                    </button>
                    {!valid && !submitting && (
                      <span className="text-[11px] text-amber-700 font-medium">
                        {t("必須項目を入力してから進んでください")}
                      </span>
                    )}
                  </div>
                );
              })() : (
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 transition shadow-sm shadow-green-200">
                  {submitting ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> {t("提出中...")}</> : <><Icon name="check" className="w-4 h-4" /> {t("提出する")}</>}
                </button>
              )}
            </div>
            {/* 下書き保存ボタン（出願番号発行前のStep1-2のみ表示） */}
            {!applicationId && !isResumed && (currentStep === 1 || currentStep === 2) && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => { saveDraftToStorage(form); toast(t("下書きを保存しました"), "success"); }}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-4 py-2 rounded-lg bg-white transition flex items-center gap-1.5"
                >
                  <Icon name="save" className="w-4 h-4" />{t("下書きを保存")}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <ApplyPageInner />
    </Suspense>
  );
}
