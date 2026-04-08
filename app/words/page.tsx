"use client";

import { useEffect, useMemo, useState } from "react";

import type { WordRow, WordsCatalogStats } from "@/lib/runWordsCatalog";

const LS_EXCEL = "thai-anki-words-excel";
const LS_ANKI = "thai-anki-words-anki";

const DEFAULT_EXCEL = "/Users/zhongzihang/Downloads/泰语高频词0226.xlsx";
const DEFAULT_ANKI =
  "/Users/zhongzihang/Library/Application Support/Anki2/账户 1/collection.anki2";

type FilterKey = "all" | "pending" | "supplement" | "deletable" | "done";

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
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

function pickNext30(words: WordRow[]): WordRow[] {
  const sup = words
    .filter((w) => w.status === "supplement")
    .sort((a, b) => b.frequency - a.frequency);
  const pen = words
    .filter((w) => w.status === "pending")
    .sort((a, b) => b.frequency - a.frequency);
  const merged = [...sup, ...pen];
  return merged.slice(0, 30);
}

export default function WordsPage() {
  const [excelPath, setExcelPath] = useState(DEFAULT_EXCEL);
  const [ankiPath, setAnkiPath] = useState(DEFAULT_ANKI);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<WordsCatalogStats | null>(null);
  const [words, setWords] = useState<WordRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [next30, setNext30] = useState<WordRow[]>([]);
  const [next30Visible, setNext30Visible] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "all") return words;
    return words.filter((w) => w.status === filter);
  }, [words, filter]);

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

  async function fetchWords() {
    try {
      localStorage.setItem(LS_EXCEL, excelPath);
      localStorage.setItem(LS_ANKI, ankiPath);
    } catch {
      /* ignore */
    }
    setLoading(true);
    setError(null);
    setNext30Visible(false);
    setNext30([]);
    try {
      const res = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excelPath, ankiDbPath: ankiPath }),
      });
      const data = (await res.json()) as {
        stats?: WordsCatalogStats;
        words?: WordRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || `请求失败 (${res.status})`);
        setStats(null);
        setWords([]);
        return;
      }
      setStats(data.stats ?? null);
      setWords(data.words ?? []);
    } catch {
      setError("网络或服务器错误");
      setStats(null);
      setWords([]);
    } finally {
      setLoading(false);
    }
  }

  function handleNext30() {
    const picked = pickNext30(words);
    setNext30(picked);
    setNext30Visible(true);
  }

  async function copyNext30Thai() {
    const text = next30.map((w) => w.thai).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("复制失败，请检查浏览器权限");
    }
  }

  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "pending", label: "待录入" },
    { key: "supplement", label: "需补充" },
    { key: "deletable", label: "可删除" },
    { key: "done", label: "已完成" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">单词管理</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Excel 词表与 Anki 牌组对照。路径可修改，会保存在本机浏览器。
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Excel 文件路径
          </span>
          <input
            value={excelPath}
            onChange={(e) => setExcelPath(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            spellCheck={false}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Anki collection.anki2 路径
          </span>
          <input
            value={ankiPath}
            onChange={(e) => setAnkiPath(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={fetchWords}
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:enabled:hover:bg-zinc-200"
        >
          {loading ? "加载中…" : "加载数据"}
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
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleNext30}
              disabled={words.length === 0}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition enabled:hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
            >
              获取下30个待处理
            </button>
            {next30Visible && next30.length > 0 && (
              <button
                type="button"
                onClick={copyNext30Thai}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                一键复制词语（{next30.length}）
              </button>
            )}
          </div>

          {next30Visible && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500">
                优先「需补充例句」，再「待录入」；同组内按出现频次从高到低。共 {next30.length} 个。
              </p>
              <p className="mt-2 font-mono text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {next30.map((w) => w.thai).join("、")}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800/80">
            {filterTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
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
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <th className="px-3 py-2">泰文</th>
                  <th className="px-3 py-2">音标</th>
                  <th className="px-3 py-2">中文</th>
                  <th className="px-3 py-2">频次</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">需例句</th>
                  <th className="px-3 py-2">Anki例句数</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w, i) => (
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
                    <td className="px-3 py-2 tabular-nums text-zinc-600">{w.ankiExampleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-500">当前筛选共 {filtered.length} 行</p>
        </>
      )}
    </main>
  );
}
