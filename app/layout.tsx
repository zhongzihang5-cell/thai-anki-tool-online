import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "泰文 Anki 例句工具",
  description: "在本地法义文章中搜索泰文例句，辅助 Anki 制卡",
};

function Nav() {
  const primary =
    "rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
  const secondary =
    "rounded-md px-2 py-2 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200";
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
        <Link
          href="/workflow"
          className="shrink-0 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          泰文 Anki 工具
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-0.5 sm:gap-1">
          <Link href="/workflow" className={primary}>
            工作流
          </Link>
          <Link href="/words" className={primary}>
            单词管理
          </Link>
          <Link href="/settings" className={primary}>
            数据源
          </Link>
          <span className="mx-1 hidden h-4 w-px bg-zinc-200 sm:inline dark:bg-zinc-700" aria-hidden />
          <Link href="/search" className={secondary}>
            单词搜索
          </Link>
          <Link href="/batch" className={secondary}>
            批量
          </Link>
          <Link href="/by-article" className={secondary}>
            按文章
          </Link>
          <Link href="/workspace" className={secondary}>
            工作台
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hans"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Nav />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
