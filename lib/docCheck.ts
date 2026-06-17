// =============================================================================
// 書類自動チェック（0-token のルール層）
//   - 漏件チェック（必須書類が提出されているか）
//   - 在留期限の切れ/間近（フォーム項目 residenceExpiry の日付計算）
//   - ファイル形式チェック（mimeType）
//   - AI抽出値 × フォーム値の照合（言語非依存で確実な項目のみ自動フラグ）
//   いずれも外部送信なし。AI抽出(Haiku)の結果を受け取って照合するだけ。
// =============================================================================
import { prisma } from "@/lib/prisma";
import { FILE_FIELD_DEFAULTS } from "@/lib/formFieldDefaults";

export type CheckLevel = "ok" | "warn" | "error";
export interface DocCheckItem {
  key: string;
  label: string;
  level: CheckLevel;
  message: string;
}

export interface RequiredFileField {
  fieldKey: string;
  label: string;
  isRequired: boolean;
}

// AI抽出（Haiku vision）が返す構造。未取得フィールドは null。
export interface DocExtraction {
  documentType?: string | null;
  fullNameRoman?: string | null;
  fullNameKanji?: string | null;
  birthDate?: string | null; // YYYY-MM-DD
  nationality?: string | null;
  residenceStatus?: string | null; // 在留資格
  residenceExpiry?: string | null; // YYYY-MM-DD 在留期限
  documentExpiry?: string | null; // 書類自体（パスポート/カード）の有効期限
  schoolName?: string | null;
  graduationDate?: string | null;
  readable?: boolean;
  notes?: string | null;
}

/**
 * その申請に対する「ファイル欄」の有効な一覧を解決する。
 * 既定(FILE_FIELD_DEFAULTS) → 全校共通(schoolId=null) → 学校別 の順に上書き。
 * 学校別で isEnabled=false の欄は除外する。マッチは fieldKey、提出突合は label。
 */
export async function getFileFields(schoolKey: string | null): Promise<RequiredFileField[]> {
  const [globalCfg, schoolCfg] = await Promise.all([
    prisma.formFieldConfig.findMany({
      where: { schoolId: null, fieldType: "file", isEnabled: true },
    }),
    schoolKey
      ? prisma.formFieldConfig.findMany({
          where: { schoolId: schoolKey, fieldType: "file" },
        })
      : Promise.resolve([] as { fieldKey: string; label: string; isRequired: boolean; isEnabled: boolean }[]),
  ]);

  const map = new Map<string, RequiredFileField>();
  for (const f of FILE_FIELD_DEFAULTS) {
    map.set(f.fieldKey, { fieldKey: f.fieldKey, label: f.label, isRequired: f.isRequired });
  }
  for (const c of globalCfg) {
    map.set(c.fieldKey, { fieldKey: c.fieldKey, label: c.label, isRequired: c.isRequired });
  }
  for (const c of schoolCfg) {
    if (!c.isEnabled) {
      map.delete(c.fieldKey); // 学校別で無効化された欄は対象外
    } else {
      map.set(c.fieldKey, { fieldKey: c.fieldKey, label: c.label, isRequired: c.isRequired });
    }
  }
  return Array.from(map.values());
}

/** 漏件チェック: 必須ファイル欄に対応する提出(docType=label一致)があるか。 */
export function checkCompleteness(
  fields: RequiredFileField[],
  docs: { docType: string }[],
): DocCheckItem[] {
  const submitted = new Set(docs.map((d) => d.docType));
  const items: DocCheckItem[] = [];
  for (const f of fields) {
    if (!f.isRequired) continue;
    if (submitted.has(f.label)) {
      items.push({ key: `doc:${f.fieldKey}`, label: f.label, level: "ok", message: "提出済み" });
    } else {
      items.push({ key: `doc:${f.fieldKey}`, label: f.label, level: "error", message: "未提出" });
    }
  }
  return items;
}

function toISODate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD / YYYY/MM/DD / その他 Date が解釈できる形式
  const norm = s.replace(/\//g, "-");
  const d = new Date(norm);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** 在留期限の切れ/間近チェック（フォーム項目 residenceExpiry）。値が無ければ null。 */
export function checkResidenceExpiry(
  residenceExpiry: string | null | undefined,
  now: Date = new Date(),
  warnWithinDays = 90,
): DocCheckItem | null {
  const iso = toISODate(residenceExpiry);
  if (!iso) return null;
  const expiry = new Date(iso + "T23:59:59");
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00");
  const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86400000);
  const base = { key: "residence-expiry", label: "在留期限" };
  if (diffDays < 0) {
    return { ...base, level: "error", message: `在留期限が切れています（${iso}）` };
  }
  if (diffDays <= warnWithinDays) {
    return { ...base, level: "warn", message: `在留期限が近い（あと${diffDays}日 / ${iso}）` };
  }
  return { ...base, level: "ok", message: `有効（${iso}）` };
}

const PHOTO_LABELS = new Set(["証明写真", "顔写真"]);

/** ファイル形式チェック: 想定外 mimeType / 証明写真が画像でない等。 */
export function checkFormats(
  docs: { docType: string; mimeType: string }[],
): DocCheckItem[] {
  const items: DocCheckItem[] = [];
  for (const d of docs) {
    const isImage = d.mimeType.startsWith("image/");
    const isPdf = d.mimeType === "application/pdf";
    if (!isImage && !isPdf) {
      items.push({
        key: `fmt:${d.docType}:${d.mimeType}`,
        label: d.docType,
        level: "warn",
        message: `想定外の形式（${d.mimeType}）`,
      });
    } else if (PHOTO_LABELS.has(d.docType) && !isImage) {
      items.push({
        key: `fmt-photo:${d.docType}`,
        label: d.docType,
        level: "warn",
        message: "証明写真は画像形式を推奨（PDF等が提出されています）",
      });
    }
  }
  return items;
}

/**
 * AI抽出値 × フォーム値の照合。
 * 誤検知を避けるため、言語非依存で確実な項目のみ自動フラグ：
 *   生年月日 / 在留期限（日付正規化）/ 在留資格（日本語表記で一致比較）。
 * 氏名・国籍は表記揺れが大きいため自動判定せず、抽出値を画面に出して目視に委ねる。
 */
export function compareExtraction(
  ext: DocExtraction,
  app: { birthDate?: string | null; residenceExpiry?: string | null; residenceStatus?: string | null },
): DocCheckItem[] {
  const items: DocCheckItem[] = [];

  const cmpDate = (key: string, label: string, a: string | null | undefined, b: string | null | undefined) => {
    const ea = toISODate(a);
    const fb = toISODate(b);
    if (!ea || !fb) return;
    if (ea !== fb) {
      items.push({ key, label, level: "warn", message: `不一致（書類=${ea} / フォーム=${fb}）` });
    } else {
      items.push({ key, label, level: "ok", message: `一致（${ea}）` });
    }
  };

  cmpDate("cmp-birth", "生年月日", ext.birthDate, app.birthDate);
  cmpDate("cmp-residence-expiry", "在留期限", ext.residenceExpiry, app.residenceExpiry);

  const ers = (ext.residenceStatus || "").trim();
  const frs = (app.residenceStatus || "").trim();
  if (ers && frs) {
    if (ers.replace(/\s/g, "") !== frs.replace(/\s/g, "")) {
      items.push({ key: "cmp-residence-status", label: "在留資格", level: "warn", message: `不一致（書類=${ers} / フォーム=${frs}）` });
    } else {
      items.push({ key: "cmp-residence-status", label: "在留資格", level: "ok", message: `一致（${ers}）` });
    }
  }

  return items;
}
