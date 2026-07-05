import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VERAH Command Center",
  description: "Operational command center for VERAH OS"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
