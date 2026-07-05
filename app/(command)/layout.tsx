import { AppShell } from "@/components/app-shell";

export default function CommandLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
