"use client";
import React from "react";
import { Field, Input, Select, DateSelect, NATIONALITIES, PREFECTURES, type FormData, type FormFieldConfig } from "./primitives";
import { registryEntry } from "@/lib/applyFieldRegistry";
import { fieldLabel, fieldHint, fieldRequired } from "@/lib/applyFieldVisibility";
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
    default: return [];
  }
}

const DEFAULT_LABELS: Record<string, string> = {
  lastName: "姓（漢字・ローマ字）", firstName: "名（漢字・ローマ字）", lastNameKana: "姓（カナ）", firstNameKana: "名（カナ）",
  birthDate: "生年月日", gender: "性別", nationality: "国籍", phone: "電話番号", email: "メールアドレス",
  postalCode: "郵便番号", prefecture: "都道府県", city: "市区町村", address: "番地", addressDetail: "建物名・部屋番号（任意）",
  residenceStatus: "在留資格（日本在住の方）", residenceExpiry: "在留期限（日本在住の方）", japaneseLevel: "日本語レベル", jlptCertified: "JLPT合格証明書",
};
const DEFAULT_HINTS: Record<string, string> = { phone: "ハイフンなし", email: "審査結果の通知に使用", postalCode: "ハイフンなし7桁" };
const OPTIONAL_DEFAULT = new Set(["residenceStatus", "residenceExpiry", "addressDetail", "jlptCertified"]);

export function DynamicField({ fieldKey, form, onChange, errors, formConfig }: {
  fieldKey: string; form: FormData;
  onChange: (f: keyof FormData, v: string | boolean) => void;
  errors: Record<string, string>; formConfig: FormFieldConfig[] | null;
}) {
  const { t } = useT();
  const e = registryEntry(fieldKey);
  if (!e) return null;
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
          <DateSelect value={String(val ?? "")} onChange={(v: string) => onChange(fieldKey as keyof FormData, v)}
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
    default: return null;
  }
}
