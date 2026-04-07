"use client";

import { useMemo, useState } from "react";

import type { ByArticleArticle } from "@/lib/runArticleSearch";

function extractArticleNumber(a: ByArticleArticle): string {
  const base = a.fileName.replace(/\.[^.]+$/i, "");
  const m = base.match(/^(\d+)/);
  if (m) return m[1];
  const any = base.match(/(\d{2,4})/);
  if (any) return any[1];
  return base.length > 14 ? `${base.slice(0, 12)}…` : base || "—";
}

function sourceShort(a: ByArticleArticle): string {
  if (a.kind === "official") return "官网";
  if (a.kind === "wechat") return "公众号";
  if (a.sourceLabel.startsWith("官网")) return "官网";
  if (a.sourceLabel.startsWith("公众号")) return "公众号";
  return a.kind;
}

export default function ByArticlePage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [articles, setArticles] = useState<ByArticleArticle[]>([]);
  const [inputWordCount, setInputWordCount] = useState(0);
  const [totalArticles, setTotalArticles] = useState(0);
  const [withAudioCount, setWithAudioCount] = useState(0);
  const [youtubeCount, setYoutubeCount] = useState(0);
  const [uncoveredWords, setUncoveredWords] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  /** Native details open state is browser-owned; React 19 can mismatch on hydrate — use controlled panels. */
  const [openDetails, setOpenDetails] = useState<Record<number, boolean>>({});

  const coveredWordCount = useMemo(
    () => Math.max(0, inputWordCount - uncoveredWords.length),
    [inputWordCount, uncoveredWords.length]
  );

  const lines = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    [text]
  );

  function scrollToDetail(index: number) {
    setOpenDetails((d) => ({ ...d, [index]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`by-article-detail-${index}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function runSearch() {
    if (lines.length === 0) return;
    setLoading(true);
    setError(null);
    setArticles([]);
    setInputWordCount(0);
    setTotalArticles(0);
    setWithAudioCount(0);
    setYoutubeCount(0);
    setUncoveredWords([]);
    setSearched(false);
    setOpenDetails({});
    try {
      const res = await fetch("/api/by-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: lines }),
      });
      const data = (await res.json()) as {
        articles?: ByArticleArticle[];
        inputWordCount?: number;
        totalArticles?: number;
        withAudioCount?: number;
        youtubeCount?: number;
        uncoveredWords?: string[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || `请求失败 (${res.status})`);
        return;
      }
      setArticles(data.articles || []);
      setInputWordCount(data.inputWordCount ?? 0);
      setTotalArticles(data.totalArticles ?? 0);
      setWithAudioCount(data.withAudioCount ?? 0);
      setYoutubeCount(data.youtubeCount ?? 0);
      setUncoveredWords(data.uncoveredWords || []);
      setSearched(true);
    } catch {
      setError("网络或服务器错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">按文章聚合</h1>
      <p className="mt-1 text-sm text-zinc-500">
        每行一个泰文词。用<strong>贪心最小覆盖</strong>：反复选择当前能覆盖最多「尚未覆盖」词语的文章；覆盖数相同时优先选已有音频
        🎵。下列顺序即为建议处理顺序。
      </p>

      <label className="mt-6 block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          词语列表
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
          placeholder={"ทุกข์\nสมาธิ"}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runSearch}
          disabled={loading || lines.length === 0}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:enabled:hover:bg-zinc-200"
        >
          {loading ? "搜索中…" : `搜索 ${lines.length} 行`}
        </button>
        <span className="text-xs text-zinc-500">
          {searched ? `去重后共 ${inputWordCount} 个不同词语` : `当前 ${lines.length} 行（去重后数量在搜索后显示）`}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {searched && !error && articles.length > 0 && (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 pb-3 text-sm text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
            <span>
              共<strong className="mx-0.5 tabular-nums">{totalArticles}</strong>篇文章
            </span>
            <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
              |
            </span>
            <span>
              🎵已有音频<strong className="mx-0.5 tabular-nums text-emerald-700 dark:text-emerald-400">
                {withAudioCount}
              </strong>
              篇
            </span>
            <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
              |
            </span>
            <span>
              📺需找YouTube<strong className="mx-0.5 tabular-nums text-amber-700 dark:text-amber-400">
                {youtubeCount}
              </strong>
              篇
            </span>
            <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
              |
            </span>
            <span>
              覆盖<strong className="mx-0.5 tabular-nums">{coveredWordCount}</strong>/
              <strong className="tabular-nums">{inputWordCount}</strong>个词
            </span>
          </div>

          {uncoveredWords.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <span className="font-medium">无法被任何文章覆盖的词语（{uncoveredWords.length}）：</span>
              <span className="mt-1 block font-mono">{uncoveredWords.join("、")}</span>
            </div>
          )}

          <section className="mt-8" aria-labelledby="overview-heading">
            <h2 id="overview-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              文章总览
            </h2>
            <p className="mt-1 text-xs text-zinc-500">点击卡片跳转到下方例句并自动展开。</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {articles.map((a, idx) => {
                const num = extractArticleNumber(a);
                const src = sourceShort(a);
                const borderClass = a.hasAudio
                  ? "border-2 border-emerald-500/80 shadow-[0_0_0_1px_rgba(16,185,129,0.15)] dark:border-emerald-500/70"
                  : "border-2 border-amber-500/80 shadow-[0_0_0_1px_rgba(245,158,11,0.12)] dark:border-amber-500/70";
                return (
                  <button
                    key={`card-${idx}-${a.path}`}
                    type="button"
                    aria-label={`第 ${idx + 1} 步，编号 ${num}，${src}，${a.wordCount} 个词，跳转例句`}
                    onClick={() => scrollToDetail(idx)}
                    className={`rounded-xl bg-white p-3 text-left transition hover:brightness-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:bg-zinc-900 dark:hover:brightness-110 ${borderClass}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                        {idx + 1}
                      </span>
                      <span className="text-lg leading-none" title={a.hasAudio ? "已有音频" : "需找 YouTube"}>
                        {a.audioIcon}
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      #{num}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">{src}</p>
                    <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">
                      {a.fileName}
                    </p>
                    <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
                      覆盖 <strong className="tabular-nums">{a.wordCount}</strong> 个词
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-12" aria-labelledby="detail-heading">
            <h2 id="detail-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              例句详情
            </h2>
            <p className="mt-1 text-xs text-zinc-500">默认折叠，点击标题展开。</p>
            <div className="mt-4 flex flex-col gap-3">
              {articles.map((a, idx) => {
                const isOpen = Boolean(openDetails[idx]);
                return (
                  <div
                    key={`detail-${idx}-${a.path}`}
                    id={`by-article-detail-${idx}`}
                    className="scroll-mt-20 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpenDetails((d) => ({
                          ...d,
                          [idx]: !d[idx],
                        }))
                      }
                      className="flex w-full cursor-pointer flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                    >
                      <span
                        className={`inline-block text-zinc-400 transition ${isOpen ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        ▸
                      </span>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        {idx + 1}
                      </span>
                      <span className="text-base">{a.audioIcon}</span>
                      <span className="font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        #{extractArticleNumber(a)}
                      </span>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{a.sourceLabel}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {a.wordCount} 词
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-zinc-100 px-4 pb-4 pt-2 dark:border-zinc-800">
                        {a.newlyCoveredWords && a.newlyCoveredWords.length > 0 && (
                          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                            本步新覆盖：
                            <span className="font-mono text-zinc-700 dark:text-zinc-300">
                              {a.newlyCoveredWords.join("、")}
                            </span>
                          </p>
                        )}
                        <p className="mb-4 break-all font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          {a.path}
                        </p>
                        <div className="space-y-5">
                          {a.words.map((hit) => (
                            <div key={hit.word}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-teal-800 dark:text-teal-300">
                                  {hit.word}
                                </span>
                                {hit.hasChinese ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                                    中文对照
                                  </span>
                                ) : null}
                              </div>
                              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                                {hit.sentences.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ol>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {searched && !error && articles.length === 0 && inputWordCount > 0 && (
        <div className="mt-8 space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <span>
              共<strong className="mx-0.5 tabular-nums">0</strong>篇文章
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span>🎵已有音频0篇</span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span>📺需找YouTube0篇</span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span>
              覆盖<strong className="mx-0.5 tabular-nums">0</strong>/
              <strong className="tabular-nums">{inputWordCount}</strong>个词
            </span>
          </div>
          {uncoveredWords.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <span className="font-medium">无法被任何文章覆盖的词语（{uncoveredWords.length}）：</span>
              <span className="mt-1 block font-mono">{uncoveredWords.join("、")}</span>
            </div>
          )}
          <p className="text-center text-sm text-zinc-500">未在任何文章中命中这些词。</p>
        </div>
      )}
    </main>
  );
}
