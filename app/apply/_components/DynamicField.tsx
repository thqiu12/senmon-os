"use client";
import React from "react";
import { Field, Input, Select, DateSelect, NATIONALITIES, PREFECTURES, type FormData, type FormFieldConfig } from "./primitives";
import { registryEntry } from "@/lib/applyFieldRegistry";
import { fieldLabel, fieldHint, fieldRequired } from "@/lib/applyFieldVisibility";
import { genericWidget, parseOptions } from "@/lib/applyCustomFields";
import { useT } from "@/lib/i18n";

function optionsFor(key: string, t: (s: string) => string): { value: string; label: string }[] {
  switch (key) {
    case "gender": return [{ value: "男性", label: t("男性") }, { value: "女性", label: t("女性") }];
    case "nationality": return NATIONALITIES.map((n) => ({ value: n, label: t(n) }));
    case "prefecture": return PREFECTURES.map((p) => ({ value: p, label: t(p) }));
    case "residenceStatus": return ["留学","技術・人文知識・国際業務","特定技能","技能実習","永住者","定住者","日本人の配偶者等","家族滞在","その他"].map((v) => ({ value: v, label: t(v) }));
    case "japaneseLevel": return [
      { value: "N1", label: t("N1（最上級）") }, { value: "N2", label: "N2" }, { value: "N3", label: "N3" },
      { value: "N4", label: "N4" }, { value: "N5", label: t("N5（初級）") }, { value: "なし", label: t("資格なし") },
    ];
    case "lastSchoolGraduate": return ["卒業","卒業見込み","中退","在学中"].map((v) => ({ value: v, label: t(v) }));
    default: return [];
  }
}

const DEFAULT_LABELS: Record<string, string> = {
  lastName: "姓（漢字・ローマ字）", firstName: "名（漢字・ローマ字）", lastNameKana: "姓（カナ）", firstNameKana: "名（カナ）",
  birthDate: "生年月日", gender: "性別", nationality: "国籍", phone: "電話番号", email: "メールアドレス",
  postalCode: "郵便番号", prefecture: "都道府県", city: "市区町村", address: "番地", addressDetail: "建物名・部屋番号（任意）",
  residenceStatus: "在留資格（日本在住の方）", residenceExpiry: "在留期限（日本在住の方）", japaneseLevel: "日本語レベル", jlptCertified: "JLPT合格証明書",
  applicationReason: "志望動機", lastSchoolName: "学校名", lastSchoolCountry: "国",
  lastSchoolGraduate: "卒業状況", lastSchoolGraduatedOn: "卒業（見込）年月",
  priorAttendanceRate: "出身校での出席率", workExperience: "職務経歴（任意）",
};
const DEFAULT_HINTS: Record<string, string> = {
  phone: "ハイフンなし", email: "審査結果の通知に使用", postalCode: "ハイフンなし7桁",
  applicationReason: "300字以上で具体的にご記入ください",
  lastSchoolGraduatedOn: "例：2026-03",
  priorAttendanceRate: "例：95%、出席日数150日/総授業日数158日",
  workExperience: "直近の職務経歴をご記入ください",
};
const OPTIONAL_DEFAULT = new Set(["residenceStatus", "residenceExpiry", "addressDetail", "jlptCertified", "priorAttendanceRate", "lastSchoolGraduatedOn", "workExperience"]);

export function DynamicField({ fieldKey, form, onChange, onChangeExtra, errors, formConfig }: {
  fieldKey: string; form: FormData;
  onChange: (f: keyof FormData, v: string | boolean) => void;
  onChangeExtra?: (key: string, v: string | boolean) => void;
  errors: Record<string, string>; formConfig: FormFieldConfig[] | null;
}) {
  const { t } = useT();
  const e = registryEntry(fieldKey);
  if (!e) {
    const cfg = (formConfig ?? []).find((c) => c.fieldKey === fieldKey);
    if (!cfg) return null;
    const w = genericWidget(cfg.fieldType);
    const cval = form.extraData?.[fieldKey];
    const set = (v: string | boolean) => onChangeExtra?.(fieldKey, v);
    const clabel = fieldLabel(formConfig, fieldKey, cfg.label || fieldKey);
    const chint = fieldHint(formConfig, fieldKey, "");
    const creq = fieldRequired(formConfig, fieldKey, false);
    const cerr = errors[fieldKey];
    if (w === "select") {
      const opts = parseOptions(cfg.options);
      return (<Field label={clabel} required={creq} hint={chint} error={cerr}>
        <Select data-testid={`apply-${fieldKey}`} value={String(cval ?? "")} error={!!cerr} onChange={(ev) => set(ev.target.value)}>
          <option value="">{t("選択してください")}</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select></Field>);
    }
    if (w === "textarea") {
      return (<Field label={clabel} required={creq} hint={chint} error={cerr}>
        <textarea data-testid={`apply-${fieldKey}`} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y hover:border-gray-300"
          value={String(cval ?? "")} onChange={(ev) => set(ev.target.value)} /></Field>);
    }
    if (w === "month") {
      return (<Field label={clabel} required={creq} hint={chint} error={cerr}>
        <DateSelect testId={`apply-${fieldKey}`} value={String(cval ?? "")} onChange={(v: string) => set(v)} minYear={new Date().getFullYear() - 80} maxYear={new Date().getFullYear() + 10} hasError={!!cerr} /></Field>);
    }
    if (w === "checkbox") {
      return (<Field label={clabel} hint={chint}>
        <label className="flex items-center gap-3 h-[42px] cursor-pointer">
          <input type="checkbox" data-testid={`apply-${fieldKey}`} className="w-4 h-4 rounded border-gray-300 accent-blue-600" checked={!!cval} onChange={(ev) => set(ev.target.checked)} />
          <span className="text-sm text-gray-700">{clabel}</span></label></Field>);
    }
    return (<Field label={clabel} required={creq} hint={chint} error={cerr}>
      <Input data-testid={`apply-${fieldKey}`} value={String(cval ?? "")} error={!!cerr} onChange={(ev) => set(ev.target.value)} /></Field>);
  }
  const label = fieldLabel(formConfig, fieldKey, DEFAULT_LABELS[fieldKey] ?? fieldKey);
  const hint = fieldHint(formConfig, fieldKey, DEFAULT_HINTS[fieldKey] ?? "");
  const req = fieldRequired(formConfig, fieldKey, !OPTIONAL_DEFAULT.has(fieldKey));
  const val = form[fieldKey as keyof FormData];
  const err = errors[fieldKey];

  switch (e.widget) {
    case "text": case "tel": case "email":
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <Input data-testid={`apply-${fieldKey}`} type={e.widget === "text" ? "text" : e.widget}
            placeholder={e.placeholder} value={String(val ?? "")} error={!!err}
            onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.value)} />
        </Field>
      );
    case "postal":
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <Input data-testid={`apply-${fieldKey}`} placeholder={e.placeholder} maxLength={7} value={String(val ?? "")} error={!!err}
            onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.value.replace(/\D/g, ""))} />
        </Field>
      );
    case "select": {
      const opts = optionsFor(e.optionsKey!, t);
      const emptyLabel = !req && (fieldKey === "residenceStatus") ? t("選択してください（任意）") : (["gender","nationality","prefecture"].includes(fieldKey) ? t("選択") : t("選択してください"));
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <Select data-testid={`apply-${fieldKey}`} value={String(val ?? "")} error={!!err}
            onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.value)}>
            <option value="">{emptyLabel}</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      );
    }
    case "date-range": {
      const now = new Date().getFullYear();
      const minOff = (e.meta?.minOffset as number) ?? -73;
      const maxOff = (e.meta?.maxOffset as number) ?? -14;
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <DateSelect testId={`apply-${fieldKey}`} value={String(val ?? "")} onChange={(v: string) => onChange(fieldKey as keyof FormData, v)}
            minYear={now + minOff} maxYear={now + maxOff} hasError={!!err} />
        </Field>
      );
    }
    case "month":
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <DateSelect testId={`apply-${fieldKey}`} value={String(val ?? "")} onChange={(v: string) => onChange(fieldKey as keyof FormData, v)}
            minYear={new Date().getFullYear()} maxYear={new Date().getFullYear() + 10} />
        </Field>
      );
    case "checkbox":
      return (
        <Field label={label} hint={hint}>
          <label className="flex items-center gap-3 h-[42px] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-blue-600"
              checked={!!val} onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.checked)} />
            <span className="text-sm text-gray-700">{t("JLPT合格証明書を持っている")}</span>
          </label>
        </Field>
      );
    case "textarea": {
      const showCounter = !!e.meta?.counter;
      return (
        <Field label={label} required={req} hint={hint} error={err}>
          <textarea
            data-testid={`apply-${fieldKey}`}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y hover:border-gray-300"
            placeholder={e.placeholder ? t(e.placeholder) : undefined}
            value={String(val ?? "")}
            onChange={(ev) => onChange(fieldKey as keyof FormData, ev.target.value)} />
          {showCounter && (
            <p className="text-xs text-gray-400 mt-1">{String(val ?? "").length} {t("/ 300文字")}</p>
          )}
        </Field>
      );
    }
    default: return null;
  }
}
