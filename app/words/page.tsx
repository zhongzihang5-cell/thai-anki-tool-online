"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildAnkiImportCsv,
  downloadTextFile,
  emptyDraft,
  type Next30DraftRow,
} from "@/lib/ankiCsvExport";
import {
  eligibleWorkflowRows,
  filterExcluded,
  resolveWorkflowArticleBatch,
} from "@/lib/pickArticleBatch";
import { thaiWordKey } from "@/lib/pickNext30";
import type { ByArticleArticle } from "@/lib/runArticleSearch";
import type { WordRow, WordsCatalogStats } from "@/lib/runWordsCatalog";
import {
  isShelvedKey,
  loadShelvedKeys,
  saveShelvedKeys,
} from "@/lib/shelvedThai";
import { TAB_PERSIST, useStickyTabState } from "@/lib/useStickyTabState";

type FilterKey =
  | "all"
  | "pending"
  | "supplement"
  | "deletable"
  | "done"
  | "judged"
  | "shelved";

type WordsPersist = {
  filter: FilterKey;
  words: WordRow[];
  stats: WordsCatalogStats | null;
  next30: WordRow[];
  next30Drafts: Next30DraftRow[];
  next30Visible: boolean;
  error: string | null;
  /** 已结束上一批、不参与下次选篇的词（thaiWordKey） */
  articleConsumedKeys: string[];
  focusArticle: ByArticleArticle | null;
  frequencyFallback: boolean;
  batchArticleTotalInArticle: number;
};

const WORDS_INITIAL: WordsPersist = {
  filter: "all",
  words: [],
  stats: null,
  next30: [],
  next30Drafts: [],
  next30Visible: false,
  error: null,
  articleConsumedKeys: [],
  focusArticle: null,
  frequencyFallback: false,
  batchArticleTotalInArticle: 0,
};

function statusBadgeClass(s: WordRow["status"]): string {
  switch (s) {
    case "pending":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
    case "supplement":
      return "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200";
    case "deletable":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200";
    case "done":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
    case "judged":
      return "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

export default function WordsPage() {
  const [snap, setSnap] = useStickyTabState<WordsPersist>(TAB_PERSIST.words, WORDS_INITIAL);
  const {
    filter,
    stats,
    next30Visible,
    error,
    focusArticle,
    frequencyFallback,
    batchArticleTotalInArticle,
  } = snap;
  const words = Array.isArray(snap.words) ? snap.words : [];
  const next30 = Array.isArray(snap.next30) ? snap.next30 : [];
  const next30Drafts =
    Array.isArray(snap.next30Drafts) && snap.next30Drafts.length === next30.length
      ? snap.next30Drafts
      : next30.map(() => emptyDraft());
  const [loading, setLoading] = useState(false);
  const [articlePickLoading, setArticlePickLoading] = useState(false);
  const [shelved, setShelved] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState(30);

  useEffect(() => {
    setShelved(loadShelvedKeys());
  }, []);

  useEffect(() => {
    saveShelvedKeys(shelved);
  }, [shelved]);

  const filtered = useMemo(() => {
    if (filter === "shelved") {
      return words.filter((w) => isShelvedKey(shelved, w.thai));
    }
    if (filter === "all") return words;
    return words.filter((w) => w.status === filter);
  }, [words, filter, shelved]);

  const fetchWords = useCallback(async () => {
    setLoading(true);
    setSnap((s) => ({
      ...s,
      error: null,
      next30Visible: false,
      next30: [],
      next30Drafts: [],
      articleConsumedKeys: [],
      focusArticle: null,
      frequencyFallback: false,
      batchArticleTotalInArticle: 0,
    }));
    try {
      const res = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        stats?: WordsCatalogStats;
        words?: WordRow[];
        error?: string;
      };
      if (!res.ok) {
        setSnap((s) => ({
          ...s,
          error: data.error || `请求失败 (${res.status})`,
          stats: null,
          words: [],
        }));
        return;
      }
      const st = data.stats;
      setSnap((prev) => ({
        ...prev,
        stats: st
          ? {
              ...st,
              judged: st.judged ?? 0,
            }
          : null,
        words: data.words ?? [],
      }));
    } catch {
      setSnap((s) => ({
        ...s,
        error: "网络或服务器错误",
        stats: null,
        words: [],
      }));
    } finally {
      setLoading(false);
    }
  }, [setSnap]);

  useEffect(() => {
    void fetchWords();
  }, [fetchWords]);

  function toggleShelve(thai: string) {
    const k = thaiWordKey(thai);
    setShelved((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const pickArticleBatch = useCallback(
    async (consumed: ReadonlySet<string>) => {
      setArticlePickLoading(true);
      try {
        if (words.length === 0) {
          setSnap((s) => ({
            ...s,
            error: "词表为空，请确认数据源设置（设置页）后刷新。",
          }));
          return;
        }
        const eligible = filterExcluded(
          eligibleWorkflowRows(words, shelved),
          consumed
        );
        const thaiList = eligible.map((w) => w.thai.trim()).filter(Boolean);
        let articles: ByArticleArticle[] = [];
        if (thaiList.length > 0) {
          const r = await fetch("/api/by-article", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ words: thaiList }),
          });
          const d = (await r.json()) as {
            articles?: ByArticleArticle[];
            error?: string;
          };
          if (!r.ok) {
            setSnap((s) => ({
              ...s,
              error: d.error || `选篇失败 (${r.status})`,
            }));
            return;
          }
          articles = d.articles ?? [];
        }
        const resolved = resolveWorkflowArticleBatch({
          catalog: words,
          articles,
          shelvedKeys: shelved,
          consumedKeys: consumed,
          cap: batchSize,
        });
        if (!resolved.ok) {
          setSnap((s) => ({ ...s, error: resolved.error }));
          return;
        }
        setSnap((s) => ({
          ...s,
          next30: resolved.batch,
          next30Drafts: resolved.batch.map(() => emptyDraft()),
          next30Visible: true,
          focusArticle: resolved.focusArticle,
          frequencyFallback: resolved.focusArticle === null,
          batchArticleTotalInArticle: resolved.totalInArticle,
          error: null,
        }));
      } catch {
        setSnap((s) => ({ ...s, error: "网络或服务器错误" }));
      } finally {
        setArticlePickLoading(false);
      }
    },
    [words, shelved, batchSize, setSnap]
  );

  function handleStartArticleBatch() {
    setSnap((s) => ({ ...s, articleConsumedKeys: [], error: null }));
    void pickArticleBatch(new Set());
  }

  function handleNextArticleBatch() {
    if (next30.length === 0) return;
    const nextConsumed = new Set(snap.articleConsumedKeys);
    for (const w of next30) nextConsumed.add(thaiWordKey(w.thai));
    setSnap((s) => ({
      ...s,
      articleConsumedKeys: [...nextConsumed],
      error: null,
    }));
    void pickArticleBatch(nextConsumed);
  }

  function patchDraft(index: number, patch: Partial<Next30DraftRow>) {
    setSnap((s) => {
      const n30 = Array.isArray(s.next30) ? s.next30 : [];
      let drafts = Array.isArray(s.next30Drafts) ? [...s.next30Drafts] : [];
      while (drafts.length < n30.length) drafts.push(emptyDraft());
      drafts = drafts.slice(0, n30.length);
      return {
        ...s,
        next30Drafts: drafts.map((row, i) =>
          i === index ? { ...row, ...patch } : row
        ),
      };
    });
  }

  function handleGenerateCsv() {
    if (next30.length === 0) return;
    const csv = buildAnkiImportCsv(next30, next30Drafts);
    const name = `anki-import-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(name, csv, "text/csv;charset=utf-8");
  }

  async function copyNext30Thai() {
    const text = next30.map((w) => w.thai).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setSnap((s) => ({ ...s, error: "复制失败，请检查浏览器权限" }));
    }
  }

  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "pending", label: "待录入" },
    { key: "supplement", label: "需补充" },
    { key: "deletable", label: "可删除" },
    { key: "done", label: "已完成" },
    { key: "judged", label: "已判断" },
    { key: "shelved", label: `搁置 (${shelved.size})` },
  ];

  const inp =
    "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900";
  const lab = "mb-0.5 block text-[11px] font-medium text-zinc-500";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">单词管理</h1>
      <p className="mt-1 text-sm text-zinc-500">
        打开本页会自动从{" "}
        <Link href="/settings" className="text-teal-700 underline dark:text-teal-400">
          数据源设置
        </Link>{" "}
        中的路径读取最新 Anki 与 Excel。搁置的词不会进入按文章组批的统计；在「搁置」筛选中可查看并恢复。本页与「工作流」使用同一套按文章选批逻辑。
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void fetchWords()}
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:enabled:hover:bg-zinc-200"
        >
          {loading ? "刷新中…" : "立即刷新"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 border-b border-zinc-200 pb-4 text-sm text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
            <span>
              待录入 <strong className="tabular-nums text-amber-700 dark:text-amber-400">{stats.pending}</strong>
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span>
              需补充{" "}
              <strong className="tabular-nums text-orange-700 dark:text-orange-400">{stats.supplement}</strong>
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span>
              可删除 <strong className="tabular-nums text-rose-700 dark:text-rose-400">{stats.deletable}</strong>
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span>
              已完成{" "}
              <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">{stats.done}</strong>
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span>
              已判断{" "}
              <strong className="tabular-nums text-slate-600 dark:text-slate-400">{stats.judged ?? 0}</strong>
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              单篇上限
              <input
                type="number"
                min={1}
                max={200}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value) || 30)}
                title="同一篇文章里最多取几个词；本篇待处理词超过此数时保留频次最高的 N 个"
                className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <button
              type="button"
              onClick={handleStartArticleBatch}
              disabled={loading || words.length === 0 || articlePickLoading}
              title="在待录入/需补充中选「当前覆盖待处理词最多」的一篇；只本篇、不跨篇。超过上限按频次截断。"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition enabled:hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
            >
              {articlePickLoading ? "组批中…" : "按文章获取本批"}
            </button>
            <button
              type="button"
              onClick={handleNextArticleBatch}
              disabled={loading || next30.length === 0 || articlePickLoading}
              title="本篇处理完后，按同样规则选下一篇（已展示过的词不再参与选篇）"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition enabled:hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
            >
              下一批
            </button>
            {next30Visible && next30.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={copyNext30Thai}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  一键复制词语（{next30.length}）
                </button>
                <button
                  type="button"
                  onClick={handleGenerateCsv}
                  className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-800 dark:bg-violet-600 dark:hover:bg-violet-500"
                >
                  生成导入CSV
                </button>
                <Link
                  href="/workflow"
                  className="rounded-lg border border-teal-600 px-4 py-2 text-sm font-medium text-teal-800 dark:border-teal-500 dark:text-teal-300"
                >
                  去工作流录入
                </Link>
              </>
            )}
          </div>

          {next30Visible && next30.length > 0 && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {focusArticle
                    ? `今日文章：${focusArticle.fileName}（共 ${next30.length} 个词${
                        batchArticleTotalInArticle > next30.length
                          ? `；本篇 ${batchArticleTotalInArticle} 个待处理，已取频次最高 ${next30.length} 个`
                          : ""
                      }）`
                    : frequencyFallback
                      ? `未绑定单篇文章（共 ${next30.length} 个词，按全库频次）`
                      : `今日文章：—（共 ${next30.length} 个词）`}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  规则：在全部待录入/需补充（不含搁置）里统计每篇文章覆盖数，选最多的一篇；本批只含该篇中的词。超过单篇上限时保留频次最高的
                  N 个。点「下一批」会跳过本批已展示的词，再选下一篇。也可在{" "}
                  <Link href="/workflow" className="text-teal-700 underline dark:text-teal-400">
                    工作流
                  </Link>{" "}
                  边看全文边录入。
                </p>
                <p className="mt-3 font-mono text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {next30.map((w) => w.thai).join("、")}
                </p>
              </div>

              {next30.map((w, idx) => {
                const d = next30Drafts[idx] ?? emptyDraft();
                return (
                  <div
                    key={`${w.thai}-${idx}`}
                    className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex flex-wrap items-baseline gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
                      <span className="text-xs font-medium text-zinc-400">#{idx + 1}</span>
                      <span className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-50">
                        {w.thai}
                      </span>
                      <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">{w.ipa || "—"}</span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{w.chinese || "—"}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-400">泰文 / 音标 / 中文来自词表（不可编辑）</p>

                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      {[1, 2, 3].map((n) => {
                        const thaiK = `ex${n}Thai` as keyof Next30DraftRow;
                        const ipaK = `ex${n}Ipa` as keyof Next30DraftRow;
                        const zhK = `ex${n}Zh` as keyof Next30DraftRow;
                        const opt = n > 1 ? "（可选）" : "";
                        return (
                          <fieldset
                            key={n}
                            className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800"
                          >
                            <legend className="px-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                              例句{n}
                              {opt}
                            </legend>
                            <label className="mt-2 block">
                              <span className={lab}>泰文例句{opt}</span>
                              <input
                                className={inp}
                                value={String(d[thaiK])}
                                onChange={(e) =>
                                  patchDraft(idx, { [thaiK]: e.target.value } as Partial<Next30DraftRow>)
                                }
                              />
                            </label>
                            <label className="mt-2 block">
                              <span className={lab}>音标{opt}</span>
                              <input
                                className={inp}
                                value={String(d[ipaK])}
                                onChange={(e) =>
                                  patchDraft(idx, { [ipaK]: e.target.value } as Partial<Next30DraftRow>)
                                }
                              />
                            </label>
                            <label className="mt-2 block">
                              <span className={lab}>中文翻译{opt}</span>
                              <input
                                className={inp}
                                value={String(d[zhK])}
                                onChange={(e) =>
                                  patchDraft(idx, { [zhK]: e.target.value } as Partial<Next30DraftRow>)
                                }
                              />
                            </label>
                          </fieldset>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800/80">
            {filterTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSnap((s) => ({ ...s, filter: t.key }))}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  filter === t.key
                    ? "bg-white text-zinc-900 shadow dark:bg-zinc-900 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <th className="px-3 py-2">泰文</th>
                  <th className="px-3 py-2">音标</th>
                  <th className="px-3 py-2">中文</th>
                  <th className="px-3 py-2">频次</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">需例句</th>
                  <th className="px-3 py-2">Anki例句数</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w, i) => {
                  const shelvedHere = isShelvedKey(shelved, w.thai);
                  return (
                    <tr
                      key={`${w.thai}-${i}`}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 font-mono font-medium text-zinc-900 dark:text-zinc-50">
                        {w.thai}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {w.ipa || "—"}
                      </td>
                      <td className="max-w-[200px] px-3 py-2 text-zinc-700 dark:text-zinc-300">{w.chinese || "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">{w.frequency}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(w.status)}`}
                        >
                          {w.status === "done" ? "已完成" : w.statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-600">{w.requiredLabel}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-600">
                        {w.ankiNoteCount ?? w.ankiExampleCount ?? 0}
                      </td>
                      <td className="px-3 py-2">
                        {filter === "shelved" ? (
                          <button
                            type="button"
                            onClick={() => toggleShelve(w.thai)}
                            className="text-xs font-medium text-teal-700 underline dark:text-teal-400"
                          >
                            恢复
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleShelve(w.thai)}
                            className="text-xs font-medium text-amber-800 underline dark:text-amber-300"
                          >
                            {shelvedHere ? "已搁置 · 点恢复" : "搁置"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-500">当前筛选共 {filtered.length} 行</p>
        </>
      )}
    </main>
  );
}
