import { describe, it, expect } from "vitest";
import {
  DEFAULT_CSV_COLUMN_KEYS,
  BUILTIN_MAP,
  resolveRow,
  sanitizeColumns,
  customCsvColumns,
  defaultColumns,
  type CsvApp,
} from "@/lib/csvColumns";

describe("csvColumns", () => {
  it("DEFAULT_CSV_COLUMN_KEYS は現行 export の HEADERS と同数(39)で全て BUILTIN_MAP に存在する", () => {
    // 注: 現行 route.ts の HEADERS 配列は実測 39 件(applicationNo…agentName)。出力互換のため同数に一致させる。
    expect(DEFAULT_CSV_COLUMN_KEYS).toHaveLength(39);
    for (const k of DEFAULT_CSV_COLUMN_KEYS) {
      expect(BUILTIN_MAP.has(k)).toBe(true);
    }
  });

  it("defaultColumns のラベルは現行 export の HEADERS と完全一致(出力ドリフト防止)", () => {
    // route.ts の HEADERS を逐語コピー。組み込みラベル or 既定順序が現行 export から乖離したら失敗する。
    const HEADERS = [
      "申請番号", "状態", "申請日時", "姓", "名", "姓（カナ）", "名（カナ）", "生年月日", "性別", "国籍",
      "電話番号", "メールアドレス", "郵便番号", "都道府県", "市区町村", "住所", "住所詳細", "在留資格",
      "在留期限", "日本語レベル", "JLPT取得", "志望校", "志望学科", "志望コース", "入学希望年", "入学希望月",
      "志望動機", "最終学歴（学校名）", "最終学歴（国）", "卒業状況", "職務経歴", "提出書類", "面接総合スコア",
      "面接推薦", "入学手続きステータス", "学費振込", "学校承認", "許可書発行", "エージェント名",
    ];
    expect(defaultColumns().map((c) => c.label)).toEqual(HEADERS);
  });

  it("resolveRow は組み込み resolver とカスタム extra を正しく返す", () => {
    const app = {
      applicationNo: "26-1-001",
      jlptCertified: true,
      documents: [],
      interviewFeedbacks: [],
      enrollmentProcedure: null,
      agent: null,
    } as unknown as CsvApp;

    const columns = [
      { key: "applicationNo", label: "申請番号" },
      { key: "jlptCertified", label: "JLPT取得" },
      { key: "priorAttendanceRate", label: "日本語学校での出席率" },
      { key: "custom_hobby", label: "趣味" },
    ];
    const row = resolveRow(app, columns, { custom_hobby: "読書" });
    expect(row).toEqual(["26-1-001", "あり", "", "読書"]);

    const app2 = { ...app, jlptCertified: false } as unknown as CsvApp;
    expect(resolveRow(app2, [{ key: "jlptCertified", label: "JLPT取得" }], null)).toEqual([
      "なし",
    ]);
  });

  it("sanitizeColumns は未知キーを落とし、無効入力は既定列(39)にフォールバックする", () => {
    // 未知の組み込みでもカスタムでもないキーは除外
    const kept = sanitizeColumns(
      [
        { key: "applicationNo", label: "" },
        { key: "__nope__", label: "x" },
        { key: "custom_hobby", label: "趣味" },
      ],
      new Set(["custom_hobby"]),
    );
    expect(kept.map((c) => c.key)).toEqual(["applicationNo", "custom_hobby"]);
    // ラベル空 → 組み込みの既定ラベル
    expect(kept[0].label).toBe("申請番号");
    expect(kept[1].label).toBe("趣味");

    // 非配列・空 → defaultColumns()
    expect(sanitizeColumns(null, new Set())).toHaveLength(39);
    expect(sanitizeColumns([{ key: "__nope__" }], new Set())).toHaveLength(39);
    expect(sanitizeColumns([], new Set())).toEqual(defaultColumns());
  });

  it("customCsvColumns は isCustomField のみ・重複排除する", () => {
    const cols = customCsvColumns([
      { fieldKey: "custom_hobby", label: "趣味", fieldType: "text" },
      { fieldKey: "custom_hobby", label: "趣味2", fieldType: "text" }, // 重複
      { fieldKey: "nationality", label: "国籍", fieldType: "select" }, // レジストリ登録=除外
      { fieldKey: "doc_x", label: "書類", fieldType: "file" }, // file=除外
      { fieldKey: "custom_note", label: "", fieldType: "textarea" },
    ]);
    expect(cols).toEqual([
      { key: "custom_hobby", label: "趣味" },
      { key: "custom_note", label: "custom_note" }, // label 空→fieldKey
    ]);
  });
});
