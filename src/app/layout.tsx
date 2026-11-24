import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { appTitle, getAppEnv } from "@/config/app";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: appTitle(getAppEnv()),
  description: "Công việc, tài liệu và lịch Google của bạn trong một không gian.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
