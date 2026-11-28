import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { appTitle, getAppEnv } from "@/config/app";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"] });

const APP_TITLE = appTitle(getAppEnv());

// `title.template` chỉ áp cho các segment *con*, nên phải khai ở root layout này; đặt trong
// page.tsx là vô tác dụng (page là segment cuối, không có con). `title.default` là bắt buộc khi
// có `template`, và là tiêu đề của các trang không tự khai `title`.
export const metadata: Metadata = {
  title: { default: APP_TITLE, template: `%s · ${APP_TITLE}` },
  description: "Công việc, tài liệu và lịch Google của bạn trong một không gian.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
