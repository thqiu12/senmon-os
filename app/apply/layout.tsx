import { I18nProvider } from "@/lib/i18n";

// /apply と /apply/status を i18n プロバイダで包む（公開フローは非破壊・既定=日本語）。
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}
