// 操作ログ（監査ログ）のキー定数とラベル。
// prisma 非依存＝サーバー(API/ルート)からもクライアント(画面)からも import 可能。

export const AUDIT_ACTIONS = {
  APPLICATION_UPDATE: "application.update",
  APPLICATION_STATUS: "application.status",
  APPLICATION_DELETE: "application.delete",
  APPLICATION_RESTORE: "application.restore",
  ENROLLMENT_PUBLISH: "enrollment.publish",
  ENROLLMENT_TUITION: "enrollment.tuition_confirm",
  ENROLLMENT_UPDATE: "enrollment.update",
  ENROLLMENT_CONFIRM: "enrollment.confirm",
  ENROLLMENT_COMPLETE: "enrollment.complete",
  NOTIFICATION_SEND: "notification.send",
  COHORT_CREATE: "cohort.create",
  COHORT_UPDATE: "cohort.update",
  COHORT_DELETE: "cohort.delete",
  ACCOUNT_CREATE: "account.create",
  ACCOUNT_UPDATE: "account.update",
  ACCOUNT_DELETE: "account.delete",
  AUTH_LOGIN: "auth.login",
} as const;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "application.update": "出願を編集",
  "application.status": "ステータス変更",
  "application.delete": "出願を削除",
  "application.restore": "出願を復元",
  "enrollment.publish": "入学手続きを公開",
  "enrollment.tuition_confirm": "学費入金を確認",
  "enrollment.update": "入学手続きを更新",
  "enrollment.confirm": "校方確認・許可書発行",
  "enrollment.complete": "入学手続き完了",
  "notification.send": "通知を送信",
  "cohort.create": "選考を作成",
  "cohort.update": "選考を編集",
  "cohort.delete": "選考を削除",
  "account.create": "アカウント作成",
  "account.update": "アカウント更新",
  "account.delete": "アカウント削除",
  "auth.login": "ログイン",
};

/** 操作キー → 日本語ラベル（未知のキーはそのまま返す）。フィルタ・表示で共有。 */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
