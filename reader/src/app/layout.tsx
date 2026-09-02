import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 辅助阅读器",
  description:
    "AI 辅助阅读：书架、三栏阅读器、RIA 便签、闪卡复习、读书档案",
};

/**
 * 根布局
 *
 * 说明：
 * - 模板默认的 next/font/google（Geist）需要访问 Google Fonts，
 *   当前网络环境不可达，故改用系统字体栈（见 globals.css）。
 * - TODO(M1)：侧边栏导航（书架 / 每日复习 / 行动看板 / 读书档案）
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
