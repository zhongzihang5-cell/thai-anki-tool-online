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
import { articleNumberFromArticle } from "@/lib/articleNumber";
import { extractArticleTitleFromBody } from "@/lib/extractArticleTitle";
import { highlightThaiWordsInText } from "@/lib/highlightThaiText";
import { pickNextBatch, thaiWordKey } from "@/lib/pickNext30";
import type { ByArticleArticle } from "@/lib/runArticleSearch";
import type { WordRow } from "@/lib/runWordsCatalog";
import {
  loadShelvedKeys,
  saveShelvedKeys,
} from "@/lib/shelvedThai";
import {
  buddhistDisplay,
  gregorianDisplay,
  youtubeLuangporQuery,
} from "@/lib/thaiArticleDates";

const WF_LS = "thai-anki-workflow-batch-v2";

function articleCoversThai(a: ByArticleArticle, thai: string): boolean {
  const k = thaiWordKey(thai);
  if (!k) return false;
  return a.words.some((hit) => thaiWordKey(hit.word) === k);
}

function isWordDraftComplete(w: WordRow, d: Next30DraftRow): boolean {
  const req = Math.min(3, Math.max(1, w.requiredExamples));
  const slots = [d.ex1Thai.trim(), d.ex2Thai.trim(), d.ex3Thai.trim()];
  for (let i = 0; i < req; i++) {
    if (!slots[i]) return false;
  }
  return true;
}

function PhoneticBtn({
  thaiText,
  onResult,
}: {
  thaiText: string;
  onResult: (ipa: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      disabled={loading || !thaiText.trim()}
      onClick={async () => {
        setLoading(true);
        try {
          const r = await fetch("/api/phonetic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: thaiText.trim() }),
          });
          const j = (await r.json()) as { phonetic?: string; error?: string };
          if (!r.ok) {
            alert(j.error || "生成失败");
            return;
          }
          if (j.phonetic) onResult(j.phonetic);
        } catch {
          alert("网络错误");
        } finally {
          setLoading(false);
        }
      }}
      className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] dark:border-zinc-600"
    >
      {loading ? "生成中…" : "生成音标"}
    </button>
  );
}

export default function WorkflowPage() {
  const [catalog, setCatalog] = useState<WordRow[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);

  const [batch, setBatch] = useState<WordRow[]>([]);
  const [drafts, setDrafts] = useState<Next30DraftRow[]>([]);
  const [sel, setSel] = useState(0);
  const [batchSize, setBatchSize] = useState(30);
  const [shelved, setShelved] = useState<Set<string>>(loadShelvedKeys);

  const [articles, setArticles] = useState<ByArticleArticle[] | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);

  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [bodyCache, setBodyCache] = useState<Record<string, string>>({});
  const [bodyLoading, setBodyLoading] = useState<string | null>(null);
  /** 不含当前选中词的文章，用户点击「展开」后显示完整卡片 */
  const [expandedOtherArticles, setExpandedOtherArticles] = useState<Set<string>>(
    () => new Set()
  );

  const fetchCatalog = useCallback(async () => {
    setCatLoading(true);
    setCatError(null);
    try {
      const r = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await r.json()) as { words?: WordRow[]; error?: string };
      if (!r.ok) {
        setCatError(j.error || `加载失败 ${r.status}`);
        setCatalog([]);
        return;
      }
      setCatalog(Array.isArray(j.words) ? j.words : []);
    } catch {
      setCatError("网络错误");
      setCatalog([]);
    } finally {
      setCatLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WF_LS);
      if (!raw) return;
      const p = JSON.parse(raw) as {
        batch?: WordRow[];
        drafts?: Next30DraftRow[];
        sel?: number;
      };
      if (Array.isArray(p.batch) && p.batch.length > 0) {
        setBatch(p.batch);
        setDrafts(
          Array.isArray(p.drafts) && p.drafts.length === p.batch.length
            ? p.drafts
            : p.batch.map(() => emptyDraft())
        );
        setSel(typeof p.sel === "number" ? p.sel : 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (batch.length === 0) return;
    try {
      localStorage.setItem(
        WF_LS,
        JSON.stringify({ batch, drafts, sel })
      );
    } catch {
      /* quota */
    }
  }, [batch, drafts, sel]);

  useEffect(() => {
    saveShelvedKeys(shelved);
  }, [shelved]);

  useEffect(() => {
    if (sel >= batch.length) {
      setSel(Math.max(0, batch.length - 1));
    }
  }, [batch.length, sel]);

  useEffect(() => {
    setExpandedOtherArticles(new Set());
  }, [sel]);

  const batchThaiKeys = useMemo(
    () => batch.map((w) => w.thai.trim()).filter(Boolean),
    [batch]
  );

  useEffect(() => {
    if (batch.length === 0) {
      setArticles(null);
      return;
    }
    const words = batch.map((w) => w.thai.trim()).filter(Boolean);
    let cancelled = false;
    setCoverLoading(true);
    fetch("/api/by-article", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    })
      .then((r) => r.json())
      .then((d: { articles?: ByArticleArticle[] }) => {
        if (!cancelled) setArticles(d.articles ?? []);
      })
      .catch(() => {
        if (!cancelled) setArticles([]);
      })
      .finally(() => {
        if (!cancelled) setCoverLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batch]);

  useEffect(() => {
    if (!expandedPath || bodyCache[expandedPath]) return;
    let cancelled = false;
    setBodyLoading(expandedPath);
    fetch("/api/article-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: expandedPath }),
    })
      .then((r) => r.json())
      .then((d: { text?: string; error?: string }) => {
        const t = d.text;
        if (cancelled || !t) return;
        setBodyCache((c) => ({ ...c, [expandedPath]: t }));
      })
      .finally(() => {
        if (!cancelled) setBodyLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedPath, bodyCache]);

  function startBatch() {
    const picked = pickNextBatch(catalog, batchSize, new Set(), shelved);
    if (picked.length === 0) {
      setCatError(
        shelved.size > 0
          ? "没有可取的待录入/需补充词（已全部搁置或已完成队列）。可在单词管理恢复搁置或调整批次大小。"
          : "词表中没有待录入或需补充的词。"
      );
      return;
    }
    setCatError(null);
    setBatch(picked);
    setDrafts(picked.map(() => emptyDraft()));
    setSel(0);
    setExpandedPath(null);
  }

  function shelveCurrent() {
    const idx = sel;
    const n = batch.length;
    if (idx < 0 || idx >= n) return;
    const w = batch[idx];
    const k = thaiWordKey(w.thai);
    const newLen = n - 1;
    setShelved((prev) => new Set([...prev, k]));
    setBatch((prev) => prev.filter((_, i) => i !== idx));
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setSel((s) => {
      if (newLen === 0) return 0;
      if (s < idx) return Math.min(s, newLen - 1);
      if (s === idx) return Math.min(idx, newLen - 1);
      return Math.min(s - 1, newLen - 1);
    });
  }

  function saveAndNext() {
    if (batch.length === 0) return;
    if (sel < batch.length - 1) setSel((s) => s + 1);
  }

  const current = batch[sel] ?? null;
  const selectedThai = current?.thai.trim() ?? "";
  const selectedThaiKey = selectedThai ? thaiWordKey(selectedThai) : "";

  const sortedArticles = useMemo(() => {
    if (!articles?.length) return [];
    if (!selectedThai) return articles;
    return [...articles].sort((a, b) => {
      const ha = articleCoversThai(a, selectedThai);
      const hb = articleCoversThai(b, selectedThai);
      if (ha === hb) return 0;
      return ha ? -1 : 1;
    });
  }, [articles, selectedThai]);

  const wordArticleNumsLabel = useMemo(() => {
    if (!articles?.length || batch.length === 0) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const w of batch) {
      const key = thaiWordKey(w.thai);
      const nums: string[] = [];
      for (const a of articles) {
        if (articleCoversThai(a, w.thai)) {
          nums.push(articleNumberFromArticle(a));
        }
      }
      nums.sort((x, y) => {
        const nx = parseInt(x, 10);
        const ny = parseInt(y, 10);
        if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny;
        return x.localeCompare(y);
      });
      map.set(key, nums.length ? nums.join(" ") : "—");
    }
    return map;
  }, [articles, batch]);

  const d = drafts[sel] ?? emptyDraft();
  const doneCount = countCompletedDrafts(batch, drafts);

  const inp =
    "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900";
  const lab = "mb-0.5 block text-[11px] font-medium text-zinc-500";

  function patchDraft(patch: Partial<Next30DraftRow>) {
    setDrafts((prev) =>
      prev.map((row, i) => (i === sel ? { ...row, ...patch } : row))
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">工作流</h1>
          <Link href="/words" className="text-xs text-teal-700 underline dark:text-teal-400">
            单词管理
          </Link>
          <Link href="/settings" className="text-xs text-teal-700 underline dark:text-teal-400">
            数据源
          </Link>
          <button
            type="button"
            onClick={() => void fetchCatalog()}
            disabled={catLoading}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          >
            {catLoading ? "刷新词表…" : "刷新 Anki 词表"}
          </button>
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <label className="flex items-center gap-1">
              本批数量
              <input
                type="number"
                min={1}
                max={200}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value) || 30)}
                className="w-16 rounded border border-zinc-300 px-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <button
              type="button"
              onClick={startBatch}
              disabled={catLoading || catalog.length === 0}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              获取下 N 个待处理
            </button>
          </div>
        </div>
        {catError && (
          <p className="mx-auto mt-2 max-w-[1920px] text-xs text-red-600 dark:text-red-400">{catError}</p>
        )}
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* 左 20% */}
        <aside className="flex w-full shrink-0 flex-col border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:w-[20%] lg:border-r">
          <div className="border-b border-zinc-100 px-2 py-2 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500">今日批次</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              已完成{" "}
              <strong className="text-teal-700 dark:text-teal-400">{doneCount}</strong>/
              {batch.length || "0"}
            </p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {batch.map((w, i) => {
              const dr = drafts[i] ?? emptyDraft();
              const done = isWordDraftComplete(w, dr);
              const artLabel =
                wordArticleNumsLabel.get(thaiWordKey(w.thai)) ?? "—";
              return (
                <li key={`${w.thai}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setSel(i)}
                    className={`w-full border-b border-zinc-100 px-2 py-2 text-left text-xs transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/80 ${
                      i === sel ? "bg-teal-50 dark:bg-teal-950/40" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">{w.thai}</span>
                      <span
                        className={`rounded px-1 text-[10px] ${
                          done
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                        }`}
                      >
                        {done ? "已完成" : "待处理"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] leading-snug tracking-wide text-zinc-500 dark:text-zinc-400">
                      {artLabel}
                    </p>
                  </button>
                </li>
              );
            })}
            {batch.length === 0 && (
              <li className="p-4 text-center text-xs text-zinc-500">请先拉取词表并点击「获取下 N 个待处理」</li>
            )}
          </ul>
        </aside>

        {/* 中 40% */}
        <section className="flex min-h-[40vh] w-full min-h-0 flex-col border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:w-[40%] lg:border-r">
          <div className="shrink-0 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">文章聚合</h2>
            {selectedThai ? (
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                绿色边框：含当前词「{selectedThai}」；其余已折叠，可点「展开」。
              </p>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {coverLoading ? (
              <p className="text-xs text-zinc-500">加载覆盖计划…</p>
            ) : !sortedArticles.length ? (
              <p className="text-xs text-zinc-500">暂无文章（先选择一批词）</p>
            ) : (
              <ul className="space-y-3 pr-1">
                {sortedArticles.map((a, idx) => {
                  const phrase = a.youtubeSearchDatePhrase?.trim();
                  const open = expandedPath === a.path;
                  const body = bodyCache[a.path];
                  const title =
                    body != null
                      ? extractArticleTitleFromBody(body, a.fileName)
                      : a.fileName;
                  const wordsInArticle = a.words.map((x) => x.word);
                  const hasSelected =
                    !!selectedThai && articleCoversThai(a, selectedThai);
                  const showOtherFull =
                    hasSelected || !selectedThai || expandedOtherArticles.has(a.path);
                  const artNo = articleNumberFromArticle(a);
                  const dimIrrelevant = !!selectedThai && !hasSelected;
                  return (
                    <li
                      key={`${a.path}-${idx}`}
                      className={`rounded-lg border p-3 transition dark:border-zinc-800 ${
                        hasSelected && selectedThai
                          ? "border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/60 dark:border-emerald-600 dark:bg-emerald-950/35 dark:ring-emerald-600/50"
                          : "border-zinc-200 dark:border-zinc-700"
                      } ${!showOtherFull ? "max-h-[5.25rem] overflow-hidden" : ""}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedPath(open ? null : a.path)}
                          className={`text-left text-sm font-medium underline ${
                            hasSelected && selectedThai
                              ? "text-emerald-900 dark:text-emerald-200"
                              : "text-teal-800 dark:text-teal-300"
                          } ${dimIrrelevant ? "opacity-45" : ""}`}
                        >
                          <span className="mr-1.5 font-mono text-[11px] font-normal text-zinc-500 no-underline dark:text-zinc-400">
                            {artNo}
                          </span>
                          {title}
                        </button>
                        {!hasSelected && selectedThai && !showOtherFull ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedOtherArticles((prev) => {
                                const next = new Set(prev);
                                next.add(a.path);
                                return next;
                              });
                            }}
                            className="shrink-0 rounded border border-zinc-400 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-800 shadow-sm dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100"
                          >
                            展开
                          </button>
                        ) : null}
                      </div>
                      {showOtherFull ? (
                        <div className={dimIrrelevant ? "opacity-45" : ""}>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                            {phrase ? (
                              <>
                                <span>佛历：{buddhistDisplay(phrase)}</span>
                                <span>{gregorianDisplay(phrase)}</span>
                              </>
                            ) : (
                              <span>日期：—</span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {wordsInArticle.map((tw) => {
                              const isSel =
                                !!selectedThaiKey &&
                                thaiWordKey(tw) === selectedThaiKey;
                              return (
                                <span
                                  key={tw}
                                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                                    isSel
                                      ? "bg-amber-200 font-medium text-amber-950 ring-1 ring-amber-400/80 dark:bg-amber-500/35 dark:text-amber-50 dark:ring-amber-400/50"
                                      : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                                  }`}
                                >
                                  {tw}
                                </span>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-lg">{a.audioIcon}</span>
                            <span className="text-xs text-zinc-500">
                              {a.hasAudio ? "已有音频" : "需找 YouTube"}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                const q = youtubeLuangporQuery(phrase);
                                try {
                                  await navigator.clipboard.writeText(q);
                                } catch {
                                  alert("复制失败");
                                }
                              }}
                              className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] dark:border-zinc-600"
                            >
                              复制 YouTube 搜索词
                            </button>
                          </div>
                          {open && (
                            <div className="mt-3 max-h-80 overflow-y-auto rounded border border-zinc-100 bg-zinc-50 p-2 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-950/50">
                              {bodyLoading === a.path && !body ? (
                                <p className="text-zinc-500">加载全文…</p>
                              ) : body ? (
                                <div className="whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-200">
                                  {highlightThaiWordsInText(body, batchThaiKeys)}
                                </div>
                              ) : (
                                <p className="text-zinc-500">无法加载正文</p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-[10px] text-zinc-500 opacity-50 dark:text-zinc-500">
                          此文不含当前选中词
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* 右 40% */}
        <div className="flex w-full flex-col bg-zinc-50 dark:bg-zinc-950 lg:w-[40%]">
          {!current ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-500">
              请选择左侧一个词
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="font-mono font-semibold">{current.thai}</span>
                  <span className="font-mono text-zinc-600">{current.ipa || "—"}</span>
                  <span className="text-zinc-700 dark:text-zinc-300">{current.chinese || "—"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={shelveCurrent}
                    className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-900 dark:border-amber-800 dark:text-amber-200"
                  >
                    搁置当前词
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {([1, 2, 3] as const).map((n) => {
                  const thaiK = `ex${n}Thai` as keyof Next30DraftRow;
                  const ipaK = `ex${n}Ipa` as keyof Next30DraftRow;
                  const zhK = `ex${n}Zh` as keyof Next30DraftRow;
                  const opt = n > 1 ? "（可选）" : "";
                  return (
                    <fieldset
                      key={n}
                      className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <legend className="px-1 text-xs font-semibold">例句 {n}{opt}</legend>
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
                      <div className="mt-2 flex items-center gap-2">
                        <label className="block flex-1">
                          <span className={lab}>音标（Paiboon）</span>
                          <input
                            className={inp}
                            value={String(d[ipaK])}
                            onChange={(e) =>
                              patchDraft({ [ipaK]: e.target.value } as Partial<Next30DraftRow>)
                            }
                          />
                        </label>
                        <PhoneticBtn
                          thaiText={String(d[thaiK])}
                          onResult={(ipa) => patchDraft({ [ipaK]: ipa } as Partial<Next30DraftRow>)}
                        />
                      </div>
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

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveAndNext}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white dark:bg-teal-600"
                >
                  保存并下一词
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">导出为 20 列 Anki CSV（与现有模板一致）；音频列中 / 会替换为 、</p>
          <button
            type="button"
            disabled={batch.length === 0}
            onClick={() => {
              const csv = buildAnkiImportCsv(batch, drafts);
              downloadTextFile(
                `anki-import-${new Date().toISOString().slice(0, 10)}.csv`,
                csv,
                "text/csv;charset=utf-8"
              );
            }}
            className="rounded-lg bg-violet-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-violet-600"
          >
            导出 CSV
          </button>
        </div>
      </footer>
    </div>
  );
}
