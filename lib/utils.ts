/**
 * 申請番号を生成する（旧形式 - フォールバック用）
 * 形式: APP-YYYYMMDD-XXXX
 */
export function generateApplicationNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `APP-${dateStr}-${random}`;
}

/**
 * バッチ連動申請番号を生成する
 * 形式: YY-R-NNN（例: 26-1-001）
 * YY = 年度2桁, R = 選考回数, NNN = 3桁連番
 */
export function buildApplicationNo(
  year: number,
  round: number,
  seq: number
): string {
  const yy = String(year).slice(-2);
  const nnn = String(seq).padStart(3, "0");
  return `${yy}-${round}-${nnn}`;
}

/**
 * 日付を日本語フォーマットで表示
 */
export function formatDateJP(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * 日時を日本語フォーマットで表示
 */
export function formatDateTimeJP(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ファイルサイズを人間が読みやすい形式に変換
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 状態に対応するスタイルクラスを返す
 */
export function getStatusStyle(status: string): string {
  const styles: Record<string, string> = {
    受付中: "bg-blue-100 text-blue-800",
    書類確認中: "bg-yellow-100 text-yellow-800",
    面接待ち: "bg-purple-100 text-purple-800",
    合格: "bg-green-100 text-green-800",
    不合格: "bg-red-100 text-red-800",
    補欠合格: "bg-orange-100 text-orange-800",
    保留: "bg-gray-100 text-gray-800",
    辞退: "bg-gray-200 text-gray-600",
  };
  return styles[status] || "bg-gray-100 text-gray-800";
}

/**
 * 日本語レベルのカラー
 */
export function getJapaneseLevelStyle(level: string): string {
  const styles: Record<string, string> = {
    N1: "bg-emerald-100 text-emerald-800",
    N2: "bg-teal-100 text-teal-800",
    N3: "bg-cyan-100 text-cyan-800",
    N4: "bg-sky-100 text-sky-800",
    N5: "bg-blue-100 text-blue-800",
    なし: "bg-gray-100 text-gray-600",
  };
  return styles[level] || "bg-gray-100 text-gray-600";
}

/**
 * CSVエスケープ
 */
export function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
