import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Institutional FX Bot",
  description: "Multi-Factor Analysis Trading Bot (MT5 via MetaApi)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
