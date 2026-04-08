"use client";

import { useState } from "react";

import { TAB_PERSIST, useStickyTabState } from "@/lib/useStickyTabState";

type Result = {
  path: string;
  fileName: string;
  sourceLabel: string;
  kind: string;
  hasAudio: boolean;
  audioIcon: string;
  hasChinese: boolean;
  sentences: string[];
};

type SearchPersist = {
  query: string;
  results: Result[];
  searched: boolean;
  error: string | null;
};

const SEARCH_INITIAL: SearchPersist = {
  query: "",
  results: [],
  searched: false,
  error: null,
};

export default function SearchPage() {
  const [snap, setSnap, hydrated] = useStickyTabState<SearchPersist>(
    TAB_PERSIST.search,
    SEARCH_INITIAL
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = snap.query.trim();
    if (!q) return;
    setLoading(true);
    setSnap((s) => ({ ...s, error: null, results: [], searched: false }));
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json()) as { results?: Result[]; error?: string };
      if (!res.ok) {
        setSnap((s) => ({ ...s, error: data.error || `请求失败 (${res.status})` }));
        return;
      }
      setSnap((s) => ({ ...s, results: data.results || [], searched: true }));
    } catch {
      setSnap((s) => ({ ...s, error: "网络或服务器错误" }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">单词搜索</h1>
      <p className="mt-1 text-sm text-zinc-500">
        输入泰文词语；匹配时忽略空格。每个文件最多 3 条例句，有音频来源优先排序。
        <span className="text-zinc-400"> 切换顶部导航会保留上次搜索结果。</span>
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            泰文词语
          </span>
          <input
            value={snap.query}
            onChange={(e) => setSnap((s) => ({ ...s, query: e.target.value }))}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="例如：ทุกข์"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !snap.query.trim()}
          className="h-10 shrink-0 rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:enabled:hover:bg-zinc-200"
        >
          {loading ? "搜索中…" : "搜索"}
        </button>
      </form>

      {snap.error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {snap.error}
        </div>
      )}

      <ul className="mt-8 flex flex-col gap-6">
        {snap.results.map((r) => (
          <li
            key={r.path}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <span className="font-mono text-sm text-zinc-800 dark:text-zinc-200">
                {r.sourceLabel}
              </span>
              <span className="text-lg" title={r.hasAudio ? "已有音频" : "需找 YouTube 等"}>
                {r.audioIcon}
              </span>
              {r.hasChinese ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  中文对照
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400">
                  无中文
                </span>
              )}
            </div>
            <p className="mt-2 break-all font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {r.path}
            </p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {r.sentences.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>

      {hydrated && !loading && snap.searched && snap.results.length === 0 && !snap.error && (
        <p className="mt-8 text-center text-sm text-zinc-500">未找到包含该词的例句。</p>
      )}
    </main>
  );
}
