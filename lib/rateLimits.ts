// 出願フロー（公開）のレート上限。
// 学校のPCルーム＝全員が同一グローバルIP(NAT)から一斉に出願するため、共有IPでの
// 一斉出願を許容できる値にしている。1人あたりの乱用は別レイヤーで防ぐ：
//   - 出願作成: 同一メール5分以内は 409（route 内のDBチェック）
//   - アップロード: 1ファイルのサイズ上限（MAX_FILE_SIZE_MB）
//
// ⚠ ここを下げると共有IPからの一斉出願がブロックされる（過去に create=5/時 で発生）。
//   tests/unit/apply-flow.test.ts で下限を固定しているので、安易に下げると CI で落ちる。
export const APPLY_RATE_LIMITS = {
  create: { max: 100, windowMs: 10 * 60 * 1000 }, // 出願作成: 100件 / 10分 / IP
  submit: { max: 100, windowMs: 60_000 }, // 最終送信: 100件 / 分 / IP
  upload: { max: 300, windowMs: 60_000 }, // アップロード: 300件 / 分 / IP
} as const;
