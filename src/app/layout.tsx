import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoL Backtest — Esports Draft Analysis",
  description:
    "Manually backtest LoL esports game outcomes based on player champion stats and team composition",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
