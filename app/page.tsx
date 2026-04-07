import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        泰文 Anki 单词卡辅助
      </h1>
      <p className="mt-3 leading-relaxed text-zinc-600 dark:text-zinc-400">
        在本地官网与公众号文章目录中检索例句（去空格匹配）。有音频的公众号编号会显示
        🎵，否则为 📺；若例句中含中文则标注中文对照。
      </p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
        路径与编号映射见项目根目录{" "}
        <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
          article-config.json
        </code>
        ，可按需修改。
      </p>
      <ul className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <li className="flex-1">
          <Link
            href="/search"
            className="block rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <span className="font-medium text-zinc-900 dark:text-zinc-50">单词搜索</span>
            <span className="mt-1 block text-sm text-zinc-500">单条词语，查看例句与来源</span>
          </Link>
        </li>
        <li className="flex-1">
          <Link
            href="/batch"
            className="block rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <span className="font-medium text-zinc-900 dark:text-zinc-50">批量搜索</span>
            <span className="mt-1 block text-sm text-zinc-500">多词状态汇总并导出 txt</span>
          </Link>
        </li>
      </ul>
      <p className="mt-12 text-xs text-zinc-400 dark:text-zinc-600">
        运行前请安装 Python 3，并执行{" "}
        <code className="rounded bg-zinc-200 px-1 font-mono dark:bg-zinc-800">npm run dev</code>{" "}
        启动 Next.js。
      </p>
    </main>
  );
}
