"use client";

import { useMemo, useState } from "react";

import { TAB_PERSIST, useStickyTabState } from "@/lib/useStickyTabState";

type BatchItem = {
  word: string;
  status: string;
  statusLabel: string;
  hitCount: number;
  sources: number;
};

function buildExportText(items: BatchItem[]): string {
  const header = "词语\t状态\t来源数\t命中句数";
  const lines = items.map(
    (i) => `${i.word}\t${i.statusLabel}\t${i.sources}\t${i.hitCount}`
  );
  return [header, ...lines].join("\n");
}

function downloadTxt(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type BatchPersist = { text: string; items: BatchItem[]; error: string | null };

const BATCH_INITIAL: BatchPersist = { text: "", items: [], error: null };

export default function BatchPage() {
  const [snap, setSnap] = useStickyTabState<BatchPersist>(TAB_PERSIST.batch, BATCH_INITIAL);
  const { text, items, error } = snap;
  const setText = (v: string) => setSnap((s) => ({ ...s, text: v }));
  const [loading, setLoading] = useState(false);

  const lines = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    [text]
  );

  async function runBatch() {
    if (lines.length === 0) return;
    setLoading(true);
    setSnap((s) => ({ ...s, error: null, items: [] }));
    try {
      const res = await fetch("/api/batch-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: lines }),
      });
      const data = (await res.json()) as { items?: BatchItem[]; error?: string };
      if (!res.ok) {
        setSnap((s) => ({ ...s, error: data.error || `请求失败 (${res.status})` }));
        return;
      }
      setSnap((s) => ({ ...s, items: data.items || [] }));
    } catch {
      setSnap((s) => ({ ...s, error: "网络或服务器错误" }));
    } finally {
      setLoading(false);
    }
  }

  function onExport() {
    if (items.length === 0) return;
    const name = `batch-${new Date().toISOString().slice(0, 10)}.txt`;
    downloadTxt(buildExportText(items), name);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">批量搜索</h1>
      <p className="mt-1 text-sm text-zinc-500">
        每行一个词语。状态：已有音频（任一命中来源带 🎵）、需找 YouTube（有命中但无音频）、未找到。
        <span className="text-zinc-400"> 切换顶部导航会保留列表与结果。</span>
      </p>

      <label className="mt-6 block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          词语列表
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
          placeholder={"ทุกข์\nสมาธิ"}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runBatch}
          disabled={loading || lines.length === 0}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:enabled:hover:bg-zinc-200"
        >
          {loading ? "搜索中…" : `搜索 ${lines.length} 个词`}
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={items.length === 0}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition enabled:hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
        >
          导出 txt
        </button>
        <span className="text-xs text-zinc-500">已识别 {lines.length} 行（忽略空行）</span>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                <th className="px-3 py-2 font-medium">词语</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">来源数</th>
                <th className="px-3 py-2 font-medium">命中句数</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => (
                <tr
                  key={`${idx}-${row.word}`}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 font-mono">{row.word}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.status === "has_audio"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : row.status === "youtube"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-zinc-500"
                      }
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.sources}</td>
                  <td className="px-3 py-2 tabular-nums">{row.hitCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
