"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  buildAnkiImportCsv,
  countCompletedDrafts,
  downloadTextFile,
  emptyDraft,
  type Next30DraftRow,
} from "@/lib/ankiCsvExport";
import { pickNext30 } from "@/lib/pickNext30";
import type { SingleSearchResult } from "@/lib/runArticleSearch";
import type { WordRow } from "@/lib/runWordsCatalog";

const LS_EXCEL = "thai-anki-words-excel";
const LS_ANKI = "thai-anki-words-anki";
const DEFAULT_EXCEL = "/Users/zhongzihang/Desktop/泰语高频词0226.xlsx";
const DEFAULT_ANKI =
  "/Users/zhongzihang/Library/Application Support/Anki2/账户 1/collection.anki2";

function fileUrlFromPath(abs: string): string {
  const n = abs.replace(/\\/g, "/");
  return n.startsWith("/") ? `file://${n}` : `file:///${n}`;
}

function youtubeSearchQuery(wordThai: string, sentence: string): string {
  const s = sentence.trim().replace(/\s+/g, " ");
  const clip = s.length > 160 ? s.slice(0, 160) + "…" : s;
  return `${wordThai.trim()} ${clip}`.trim();
}

function applySentenceToDraft(d: Next30DraftRow, sentence: string): Next30DraftRow {
  const s = sentence.trim();
  if (!s) return d;
  if (!d.ex1Thai.trim()) return { ...d, ex1Thai: s };
  if (!d.ex2Thai.trim()) return { ...d, ex2Thai: s };
  if (!d.ex3Thai.trim()) return { ...d, ex3Thai: s };
  return { ...d, ex1Thai: s };
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
  const [toast, setToast] = useState<string | null>(null);

  const selectedWord = queue30[selectedIndex] ?? null;
  const completedCount = useMemo(
    () => countCompletedDrafts(queue30, drafts),
    [queue30, drafts]
  );

  const loadWords = useCallback(async () => {
    try {
      localStorage.setItem(LS_EXCEL, excelPath);
      localStorage.setItem(LS_ANKI, ankiPath);
    } catch {
      /* ignore */
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excelPath, ankiDbPath: ankiPath }),
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
    } catch {
      setError("网络错误");
      setQueue30([]);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [excelPath, ankiPath]);

  useEffect(() => {
    try {
      const e = localStorage.getItem(LS_EXCEL);
      const a = localStorage.getItem(LS_ANKI);
      if (e) setExcelPath(e);
      if (a) setAnkiPath(a);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadWords();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 仅首屏加载；路径变更用按钮刷新

  useEffect(() => {
    const w = selectedWord;
    if (!w) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    setSearchResults([]);
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: w.thai }),
    })
      .then((r) => r.json())
      .then((data: { results?: SingleSearchResult[] }) => {
        if (!cancelled) setSearchResults(data.results ?? []);
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
  }, [selectedWord]);

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

  async function copyYoutubeQuery(sentence: string) {
    if (!selectedWord) return;
    const q = youtubeSearchQuery(selectedWord.thai, sentence);
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
            onClick={loadWords}
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
                {searchLoading ? (
                  <p className="mt-4 text-sm text-zinc-500">搜索中…</p>
                ) : searchResults.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">未找到例句</p>
                ) : (
                  <ul className="mt-3 space-y-4">
                    {searchResults.map((r) => (
                      <li
                        key={r.path}
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
                                  onClick={() => copyYoutubeQuery(sent)}
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
