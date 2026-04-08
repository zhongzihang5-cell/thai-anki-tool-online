"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { TAB_PERSIST } from "@/lib/useStickyTabState";

import {
  buildAnkiImportCsv,
  countCompletedDrafts,
  downloadTextFile,
  emptyDraft,
  type Next30DraftRow,
} from "@/lib/ankiCsvExport";
import { pickNext30 } from "@/lib/pickNext30";
import type {
  ByArticleArticle,
  ByArticleWordHit,
  SingleSearchResult,
} from "@/lib/runArticleSearch";
import type { WordRow } from "@/lib/runWordsCatalog";

const LS_EXCEL = "thai-anki-words-excel";
const LS_ANKI = "thai-anki-words-anki";
const DEFAULT_EXCEL = "/Users/zhongzihang/Desktop/泰语高频词0226.xlsx";
const DEFAULT_ANKI =
  "/Users/zhongzihang/Library/Application Support/Anki2/账户 1/collection.anki2";

const WS_KEY = TAB_PERSIST.workspace;

function fileUrlFromPath(abs: string): string {
  const n = abs.replace(/\\/g, "/");
  return n.startsWith("/") ? `file://${n}` : `file:///${n}`;
}

/** 与 scripts/search_articles.py 中 normalize 一致：去掉所有空白 */
function thaiNormKey(s: string): string {
  return s.replace(/\s/g, "");
}

function youtubeSearchQuery(
  wordThai: string,
  sentence: string,
  source: Pick<SingleSearchResult, "kind" | "youtubeSearchDatePhrase">
): string {
  const s = sentence.trim().replace(/\s+/g, " ");
  const clip = s.length > 160 ? s.slice(0, 160) + "…" : s;
  const w = wordThai.trim();
  const date = source.youtubeSearchDatePhrase?.trim();
  if (source.kind === "official" && date) {
    return `${w} ${date} ${clip}`.trim();
  }
  return `${w} ${clip}`.trim();
}

function applySentenceToDraft(d: Next30DraftRow, sentence: string): Next30DraftRow {
  const s = sentence.trim();
  if (!s) return d;
  if (!d.ex1Thai.trim()) return { ...d, ex1Thai: s };
  if (!d.ex2Thai.trim()) return { ...d, ex2Thai: s };
  if (!d.ex3Thai.trim()) return { ...d, ex3Thai: s };
  return { ...d, ex1Thai: s };
}

function articleWordHitToResult(
  article: ByArticleArticle,
  hit: ByArticleWordHit
): SingleSearchResult {
  return {
    path: article.path,
    fileName: article.fileName,
    sourceLabel: article.sourceLabel,
    kind: article.kind === "wechat" ? "wechat" : "official",
    hasAudio: article.hasAudio,
    audioIcon: article.audioIcon,
    hasChinese: hit.hasChinese,
    sentences: hit.sentences,
    ...(article.youtubeSearchDatePhrase
      ? { youtubeSearchDatePhrase: article.youtubeSearchDatePhrase }
      : {}),
  };
}

export default function WorkspacePage() {
  const [excelPath, setExcelPath] = useState(DEFAULT_EXCEL);
  const [ankiPath, setAnkiPath] = useState(DEFAULT_ANKI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue30, setQueue30] = useState<WordRow[]>([]);
  const [drafts, setDrafts] = useState<Next30DraftRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SingleSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [coverPlan, setCoverPlan] = useState<ByArticleArticle[] | null>(null);
  const [coverWordsKey, setCoverWordsKey] = useState("");
  const [coverLoading, setCoverLoading] = useState(false);
  const [searchCache, setSearchCache] = useState<Record<string, SingleSearchResult[]>>({});
  const [wsBootstrapped, setWsBootstrapped] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedWord = queue30[selectedIndex] ?? null;
  const completedCount = useMemo(
    () => countCompletedDrafts(queue30, drafts),
    [queue30, drafts]
  );

  /** 当前词在「本批30词贪心覆盖计划」中的来源，顺序与 /api/by-article 一致（含音频优先已由后端排序） */
  const greedyOrderedForWord = useMemo(() => {
    if (!selectedWord || !coverPlan?.length) return [];
    const key = thaiNormKey(selectedWord.thai);
    const out: SingleSearchResult[] = [];
    for (const art of coverPlan) {
      const hit = art.words.find((h) => thaiNormKey(h.word) === key);
      if (hit) out.push(articleWordHitToResult(art, hit));
    }
    return out;
  }, [selectedWord, coverPlan]);

  const displaySearchResults = useMemo(() => {
    const seen = new Set(greedyOrderedForWord.map((r) => r.path));
    const rest = searchResults.filter((r) => !seen.has(r.path));
    return [...greedyOrderedForWord, ...rest];
  }, [greedyOrderedForWord, searchResults]);

  const loadWords = useCallback(
    async (pathOverride?: { excelPath: string; ankiPath: string }) => {
      const ex = pathOverride?.excelPath ?? excelPath;
      const an = pathOverride?.ankiPath ?? ankiPath;
      try {
        localStorage.setItem(LS_EXCEL, ex);
        localStorage.setItem(LS_ANKI, an);
      } catch {
        /* ignore */
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excelPath: ex, ankiDbPath: an }),
        });
        const data = (await res.json()) as { words?: WordRow[]; error?: string };
        if (!res.ok) {
          setError(data.error || `加载失败 (${res.status})`);
          setQueue30([]);
          setDrafts([]);
          return;
        }
        const list = data.words ?? [];
        const picked = pickNext30(list);
        setQueue30(picked);
        setDrafts(picked.map(() => emptyDraft()));
        setSelectedIndex(0);
        setCoverPlan(null);
        setCoverWordsKey("");
        setSearchCache({});
      } catch {
        setError("网络错误");
        setQueue30([]);
        setDrafts([]);
      } finally {
        setLoading(false);
      }
    },
    [excelPath, ankiPath]
  );

  const loadWordsRef = useRef(loadWords);
  loadWordsRef.current = loadWords;

  /** 路径、工作台缓存或首次拉取词表（仅挂载一次） */
  useEffect(() => {
    let ex = DEFAULT_EXCEL;
    let an = DEFAULT_ANKI;
    try {
      const e = localStorage.getItem(LS_EXCEL);
      const a = localStorage.getItem(LS_ANKI);
      if (e) {
        ex = e;
        setExcelPath(e);
      }
      if (a) {
        an = a;
        setAnkiPath(a);
      }
    } catch {
      /* ignore */
    }

    let restored = false;
    try {
      const raw = localStorage.getItem(WS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as {
          queue30?: WordRow[];
          drafts?: Next30DraftRow[];
          selectedIndex?: number;
          coverPlan?: ByArticleArticle[] | null;
          coverWordsKey?: string;
          searchCache?: Record<string, SingleSearchResult[]>;
        };
        if (Array.isArray(p.queue30) && p.queue30.length > 0) {
          setQueue30(p.queue30);
          setDrafts(
            Array.isArray(p.drafts) && p.drafts.length === p.queue30.length
              ? p.drafts
              : p.queue30.map(() => emptyDraft())
          );
          const si = typeof p.selectedIndex === "number" ? p.selectedIndex : 0;
          setSelectedIndex(Math.min(Math.max(0, si), p.queue30.length - 1));
          if (Array.isArray(p.coverPlan)) setCoverPlan(p.coverPlan);
          else setCoverPlan(null);
          setCoverWordsKey(typeof p.coverWordsKey === "string" ? p.coverWordsKey : "");
          if (p.searchCache && typeof p.searchCache === "object") setSearchCache(p.searchCache);
          setLoading(false);
          restored = true;
        }
      }
    } catch {
      /* ignore */
    }

    setWsBootstrapped(true);
    if (!restored) {
      void loadWordsRef.current({ excelPath: ex, ankiPath: an });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时：恢复工作台或首次加载
  }, []);

  useEffect(() => {
    if (!wsBootstrapped) return;
    try {
      localStorage.setItem(
        WS_KEY,
        JSON.stringify({
          queue30,
          drafts,
          selectedIndex,
          coverPlan,
          coverWordsKey,
          searchCache,
        })
      );
    } catch {
      /* quota */
    }
  }, [wsBootstrapped, queue30, drafts, selectedIndex, coverPlan, coverWordsKey, searchCache]);

  const queueWordsKey = useMemo(
    () => queue30.map((row) => row.thai.trim()).filter(Boolean).join("\0"),
    [queue30]
  );

  /** 与本批 30 词相同的贪心最小覆盖；有缓存且 batch 未变则不再请求 */
  useEffect(() => {
    if (!wsBootstrapped) return;
    if (queue30.length === 0) {
      setCoverPlan(null);
      setCoverWordsKey("");
      setCoverLoading(false);
      return;
    }
    if (!queueWordsKey) {
      setCoverPlan(null);
      setCoverLoading(false);
      return;
    }
    if (coverPlan !== null && coverWordsKey === queueWordsKey) {
      setCoverLoading(false);
      return;
    }
    const words = queue30.map((row) => row.thai.trim()).filter(Boolean);
    let cancelled = false;
    setCoverLoading(true);
    fetch("/api/by-article", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    })
      .then((r) => r.json())
      .then((data: { articles?: ByArticleArticle[]; error?: string }) => {
        if (cancelled) return;
        setCoverPlan(data.articles ?? []);
        setCoverWordsKey(queueWordsKey);
      })
      .catch(() => {
        if (!cancelled) {
          setCoverPlan([]);
          setCoverWordsKey(queueWordsKey);
        }
      })
      .finally(() => {
        if (!cancelled) setCoverLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queue30, queueWordsKey, wsBootstrapped, coverPlan, coverWordsKey]);

  const searchCacheRef = useRef(searchCache);
  searchCacheRef.current = searchCache;

  useEffect(() => {
    if (!wsBootstrapped) return;
    const w = selectedWord;
    if (!w) {
      setSearchResults([]);
      return;
    }
    const thai = w.thai;
    const cache = searchCacheRef.current;
    if (Object.prototype.hasOwnProperty.call(cache, thai)) {
      setSearchResults(cache[thai]!);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    setSearchResults([]);
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: thai }),
    })
      .then((r) => r.json())
      .then((data: { results?: SingleSearchResult[] }) => {
        if (cancelled) return;
        const results = data.results ?? [];
        setSearchResults(results);
        setSearchCache((c) => ({ ...c, [thai]: results }));
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWord, wsBootstrapped]);

  function patchDraft(patch: Partial<Next30DraftRow>) {
    setDrafts((prev) =>
      prev.map((row, i) => (i === selectedIndex ? { ...row, ...patch } : row))
    );
  }

  function fillDraftWithSentence(sentence: string) {
    setDrafts((prev) =>
      prev.map((row, i) =>
        i === selectedIndex ? applySentenceToDraft(row, sentence) : row
      )
    );
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setToast("已复制文件路径");
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast("复制失败");
      setTimeout(() => setToast(null), 2000);
    }
  }

  async function copyYoutubeQuery(sentence: string, source: SingleSearchResult) {
    if (!selectedWord) return;
    const q = youtubeSearchQuery(selectedWord.thai, sentence, source);
    try {
      await navigator.clipboard.writeText(q);
      setToast("已复制 YouTube 搜索词");
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast("复制失败");
      setTimeout(() => setToast(null), 2000);
    }
  }

  function openOriginal(path: string) {
    const url = fileUrlFromPath(path);
    window.open(url, "_blank", "noopener,noreferrer");
    void copyPath(path);
  }

  function handleGenerateCsv() {
    if (queue30.length === 0) return;
    const csv = buildAnkiImportCsv(queue30, drafts);
    const name = `anki-import-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(name, csv, "text/csv;charset=utf-8");
  }

  const d = drafts[selectedIndex] ?? emptyDraft();
  const inp =
    "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900";
  const lab = "mb-0.5 block text-[11px] font-medium text-zinc-500";

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">工作台</h1>
          <span className="text-xs text-zinc-500">
            路径与{" "}
            <Link href="/words" className="text-teal-700 underline dark:text-teal-400">
              单词管理
            </Link>{" "}
            共用本地存储
          </span>
          <button
            type="button"
            onClick={() => void loadWords()}
            disabled={loading}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "加载中…" : "重新加载词表"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        {/* 左栏 40% */}
        <aside className="flex w-full shrink-0 flex-col border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:w-[40%] lg:border-r">
          <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500">待处理 {queue30.length} 个词</p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {queue30.map((w, i) => (
              <li key={`${w.thai}-${i}`}>
                <button
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  className={`w-full border-b border-zinc-100 px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/80 ${
                    i === selectedIndex ? "bg-teal-50 dark:bg-teal-950/40" : ""
                  }`}
                >
                  <div className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {w.thai}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-zinc-500">{w.ipa || "—"}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {w.chinese || "—"}
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-400">需 {w.requiredLabel} 个例句</div>
                </button>
              </li>
            ))}
            {!loading && queue30.length === 0 && (
              <li className="p-4 text-center text-sm text-zinc-500">暂无待处理词，请检查词表或去单词管理加载。</li>
            )}
          </ul>
        </aside>

        {/* 右栏 60% */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!selectedWord ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-500">
              请从左侧选择一个词
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  例句搜索结果 · {selectedWord.thai}
                </h2>
                <p className="mt-1 text-[11px] text-zinc-400">
                  已按本批 30 词的贪心最小覆盖计划优先展示（与「按文章聚合」同源）；其余命中排在后面。切换顶部导航会保留队列、草稿与搜索缓存。
                </p>
                {displaySearchResults.length === 0 && (searchLoading || coverLoading) ? (
                  <p className="mt-4 text-sm text-zinc-500">
                    {searchLoading && coverLoading
                      ? "搜索与覆盖计划中…"
                      : searchLoading
                        ? "搜索中…"
                        : "加载覆盖计划中…"}
                  </p>
                ) : displaySearchResults.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">未找到例句</p>
                ) : (
                  <ul className="mt-3 space-y-4">
                    {displaySearchResults.map((r, i) => (
                      <li
                        key={`${r.path}-${i}`}
                        className={`rounded-lg border p-3 ${
                          r.hasAudio
                            ? "border-emerald-300/80 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                            : "border-amber-300/80 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {r.sourceLabel}
                          </span>
                          <span className="text-xs text-zinc-500">{r.audioIcon}</span>
                          {r.hasChinese && (
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] dark:bg-zinc-700">
                              中文
                            </span>
                          )}
                        </div>
                        <ol className="mt-2 list-decimal space-y-2 pl-4 text-sm text-zinc-800 dark:text-zinc-200">
                          {r.sentences.map((sent, si) => (
                            <li key={si} className="pl-1">
                              <span>{sent}</span>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => fillDraftWithSentence(sent)}
                                  className="rounded bg-teal-700 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-teal-800"
                                >
                                  使用此例句
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyYoutubeQuery(sent, r)}
                                  className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] dark:border-zinc-600"
                                >
                                  复制YouTube搜索词
                                </button>
                              </div>
                            </li>
                          ))}
                        </ol>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openOriginal(r.path)}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                          >
                            打开原文
                          </button>
                          <button
                            type="button"
                            onClick={() => copyPath(r.path)}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                          >
                            复制路径
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="max-h-[min(45vh,480px)] shrink-0 overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-900/80">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">录入区</h2>
                <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="font-mono font-semibold">{selectedWord.thai}</span>
                    <span className="font-mono text-zinc-600">{selectedWord.ipa || "—"}</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{selectedWord.chinese || "—"}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-400">词表字段不可编辑</p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {[1, 2, 3].map((n) => {
                    const thaiK = `ex${n}Thai` as keyof Next30DraftRow;
                    const ipaK = `ex${n}Ipa` as keyof Next30DraftRow;
                    const zhK = `ex${n}Zh` as keyof Next30DraftRow;
                    const opt = n > 1 ? "（可选）" : "";
                    return (
                      <fieldset
                        key={n}
                        className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <legend className="px-1 text-xs font-semibold">例句{n}{opt}</legend>
                        <label className="mt-2 block">
                          <span className={lab}>泰文例句</span>
                          <textarea
                            rows={2}
                            className={inp}
                            value={String(d[thaiK])}
                            onChange={(e) =>
                              patchDraft({ [thaiK]: e.target.value } as Partial<Next30DraftRow>)
                            }
                          />
                        </label>
                        <label className="mt-2 block">
                          <span className={lab}>音标</span>
                          <input
                            className={inp}
                            value={String(d[ipaK])}
                            onChange={(e) =>
                              patchDraft({ [ipaK]: e.target.value } as Partial<Next30DraftRow>)
                            }
                          />
                        </label>
                        <label className="mt-2 block">
                          <span className={lab}>中文翻译</span>
                          <input
                            className={inp}
                            value={String(d[zhK])}
                            onChange={(e) =>
                              patchDraft({ [zhK]: e.target.value } as Partial<Next30DraftRow>)
                            }
                          />
                        </label>
                      </fieldset>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            已完成{" "}
            <strong className="tabular-nums text-teal-700 dark:text-teal-400">{completedCount}</strong> /{" "}
            <strong className="tabular-nums">{queue30.length}</strong> 个词
            <span className="ml-2 text-xs text-zinc-400">
              （按词表「需例句数」判断泰文例句是否填够）
            </span>
          </p>
          <button
            type="button"
            onClick={handleGenerateCsv}
            disabled={queue30.length === 0}
            className="rounded-lg bg-violet-700 px-5 py-2 text-sm font-medium text-white transition enabled:hover:bg-violet-800 disabled:opacity-50 dark:bg-violet-600 dark:enabled:hover:bg-violet-500"
          >
            生成CSV
          </button>
        </div>
      </footer>
    </div>
  );
}
