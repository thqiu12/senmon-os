import { redirect } from "next/navigation";

// 支払い設定は「各種設定」(/admin/form-config) の支払い設定タブに統合済み。
export default function PaymentRedirect() {
  redirect("/admin/form-config?tab=payment");
}
