// =============================================================================
// 電子印（角印）レンダラー
//   日本の公文書慣例に沿った「角印」を HTML+インラインCSS で描画する共有部品。
//   - 朱色（朱肉色）+ 二重枠（外太・内細）
//   - 篆書風の縦書きグリッド（右列→左列、各列は上→下で読む）
//   - わずかな回転と不透明度で「捺印」した質感
//   各 PDF テンプレート（受験票 / 合格通知書 / 入学許可書）から呼ぶ。
//
//   返り値は自己完結した <div>（インラインスタイルのみ）なので、
//   テンプレ側の CSS クラスと衝突しない。位置決めは extraStyle で渡す。
// =============================================================================

import { existsSync, readFileSync } from "fs";
import path from "path";

const VERMILION = "#bb1f2a"; // 朱肉に近い朱色

const SEAL_DIR = path.join(process.cwd(), "public", "seals");

/**
 * 学校名 → 印影画像のファイルキー。public/seals/<key>.(png|webp|jpg) を探す。
 */
export function schoolSealKey(schoolName: string): string {
  if (/神奈川|柔整|鍼灸/.test(schoolName)) return "kanagawa";
  if (/中央/.test(schoolName)) return "chuo";
  if (/デジタル|TDB|東京/.test(schoolName)) return "tdb";
  return "default";
}

/**
 * public/seals/<key>.(png|webp|jpg) を読み、捺印用の data URI を返す。
 * 無ければ null（呼び出し側は CSS 角印にフォールバック）。
 */
export function readSealDataUri(key: string): string | null {
  for (const ext of ["png", "webp", "jpg", "jpeg"] as const) {
    const p = path.join(SEAL_DIR, `${key}.${ext}`);
    if (existsSync(p)) {
      try {
        const buf = readFileSync(p);
        const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        return `data:${mime};base64,${buf.toString("base64")}`;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * 実際の印影画像を「捺印」した見た目で返す。
 * 白背景の印影は mix-blend-mode:multiply で自然に透過（白→透明、朱色は残る）。
 */
export function stampImage(
  dataUri: string,
  opts: { size?: number; rotate?: number; opacity?: number } = {},
): string {
  const { size = 78, rotate = -4, opacity = 0.95 } = opts;
  return (
    `<img src="${dataUri}" alt="" aria-hidden="true" ` +
    `style="width:${size}px;height:${size}px;object-fit:contain;` +
    `transform:rotate(${rotate}deg);opacity:${opacity};mix-blend-mode:multiply;" />`
  );
}

/**
 * 学校名に対応する印影を返す。画像があれば実印影、無ければ CSS 角印（fallbackText）。
 */
export function schoolSealHtml(
  schoolName: string,
  fallbackText: string,
  opts: { size?: number; rotate?: number; rows?: number } = {},
): string {
  const uri = readSealDataUri(schoolSealKey(schoolName));
  if (uri) return stampImage(uri, { size: opts.size, rotate: opts.rotate });
  return squareSeal({ text: fallbackText, size: opts.size, rotate: opts.rotate, rows: opts.rows });
}

/**
 * 印字を縦書きグリッド（右列→左列、列内は上→下）に並べる。
 * 例: 「校長之印」rows=2 → 右列[校,長] 左列[之,印] で「校長之印」と読める。
 */
function toColumns(text: string, rows: number): string[][] {
  const chars = Array.from(text);
  const cols = Math.ceil(chars.length / rows);
  const columns: string[][] = Array.from({ length: cols }, () => []);
  let i = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows && i < chars.length; r++) {
      columns[c].push(chars[i++]);
    }
  }
  return columns; // columns[0] = 最初に読む列（最も右）
}

export interface SquareSealOptions {
  /** 印面の文字（例: "校長之印" / "羽場学園之印"） */
  text: string;
  /** 一辺の px。職印 ≈ 58、公印 ≈ 92 が目安。 */
  size?: number;
  /** 縦グリッドの行数（4文字=2, 6文字=3 が自然）。 */
  rows?: number;
  /** 傾き（度）。捺印のリアルさ。既定 -5。 */
  rotate?: number;
  /** 不透明度。既定 0.92。 */
  opacity?: number;
  /** 外側ラッパーに足す追加スタイル（位置決め等）。 */
  extraStyle?: string;
}

/**
 * 角印 1 個分の自己完結 HTML を返す。
 */
export function squareSeal(opts: SquareSealOptions): string {
  const {
    text,
    size = 64,
    rows = text.length <= 4 ? 2 : 3,
    rotate = -5,
    opacity = 0.92,
    extraStyle = "",
  } = opts;

  const columns = toColumns(text, rows);
  // 左→右の flex で、最初に読む列(columns[0])を右端に置くため逆順で描画。
  const displayCols = [...columns].reverse();

  const inner = Math.round(size * 0.86);
  const fontSize = Math.max(9, Math.round((inner / Math.max(rows, columns.length)) * 0.74));
  const gap = Math.max(1, Math.round(size * 0.03));

  const colsHtml = displayCols
    .map(
      (col) =>
        `<div style="display:flex;flex-direction:column;align-items:center;justify-content:space-around;gap:${gap}px;flex:1;">` +
        col
          .map(
            (ch) =>
              `<span style="display:block;font-size:${fontSize}px;line-height:1;font-weight:700;">${ch}</span>`,
          )
          .join("") +
        `</div>`,
    )
    .join("");

  return (
    `<div style="width:${size}px;height:${size}px;transform:rotate(${rotate}deg);opacity:${opacity};${extraStyle}">` +
    // 外枠（太）
    `<div style="width:100%;height:100%;border:${Math.max(
      2,
      Math.round(size * 0.045),
    )}px solid ${VERMILION};padding:${Math.round(size * 0.05)}px;box-sizing:border-box;">` +
    // 内枠（細）
    `<div style="width:100%;height:100%;border:1.5px solid ${VERMILION};box-sizing:border-box;` +
    `display:flex;flex-direction:row;align-items:stretch;justify-content:space-around;` +
    `padding:${Math.round(size * 0.04)}px;color:${VERMILION};` +
    `font-family:'Noto Serif JP','Yu Mincho','YuMincho','Hiragino Mincho ProN','MS Mincho',serif;">` +
    colsHtml +
    `</div></div></div>`
  );
}

/**
 * 法人正式名から角印用の短縮名を作る。
 *   "学校法人　羽場学園" → "羽場学園之印"
 *   "学校法人 平井学園"   → "平井学園之印"
 */
export function institutionSealText(legalName: string): string {
  const short = legalName
    .replace(/学校法人/g, "")
    .replace(/[\s　]/g, "")
    .trim();
  return `${short || legalName}之印`;
}
