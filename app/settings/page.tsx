"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type DataSources = {
  excelPath: string;
  sheetName: string;
  ankiDbPath: string;
  excelFileName: string;
  excelExists: boolean;
  excelMtimeMs: number | null;
  ankiMtimeMs: number | null;
  error?: string;
};

function fmtTime(ms: number | null): string {
  if (ms == null) return "—";
  try {
    return new Date(ms).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return "—";
  }
}

export default function SettingsPage() {
  const [data, setData] = useState<DataSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ankiInput, setAnkiInput] = useState("");
  const [sheetInput, setSheetInput] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/data-sources");
      const j = (await r.json()) as DataSources & { error?: string };
      if (!r.ok) {
        setErr(j.error || `请求失败 ${r.status}`);
        setData(null);
        return;
      }
      setData(j);
      setAnkiInput(j.ankiDbPath);
      setSheetInput(j.sheetName);
    } catch {
      setErr("网络错误");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePaths() {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ankiDbPath: ankiInput.trim(),
          sheetName: sheetInput.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "保存失败");
        return;
      }
      await load();
    } catch {
      setErr("保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/api/excel-upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "上传失败");
        return;
      }
      await load();
    } catch {
      setErr("上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">数据源管理</h1>
        <Link
          href="/workflow"
          className="text-sm text-teal-700 underline dark:text-teal-400"
        >
          返回工作流
        </Link>
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        Excel 可上传替换；Anki 库路径写入{" "}
        <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">words-config.json</code>
        。打开本页会请求一次数据源元信息；Anki 状态依赖「立即刷新」与词表页/工作流内的加载。
      </p>

      {err && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      )}

      {loading && !data ? (
        <p className="mt-8 text-sm text-zinc-500">加载中…</p>
      ) : data ? (
        <div className="mt-8 space-y-8">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Excel 词表</h2>
            <p className="mt-1 break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">
              {data.excelPath}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              当前文件：<span className="font-medium text-zinc-800 dark:text-zinc-200">{data.excelFileName}</span>
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              最后更新：{data.excelExists ? fmtTime(data.excelMtimeMs) : "文件不存在"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                {uploading ? "上传中…" : "上传新 Excel 替换"}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={onExcelFile}
                  disabled={uploading}
                />
              </label>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
              >
                立即刷新
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Anki 数据库</h2>
            <p className="mt-1 text-sm text-zinc-500">
              固定为配置文件中的路径；每次打开本页已自动拉取元信息（修改时间）。保存后工作流/单词页加载时使用新路径。
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">collection.anki2 绝对路径</span>
              <input
                value={ankiInput}
                onChange={(e) => setAnkiInput(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
                spellCheck={false}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">工作表名称</span>
              <input
                value={sheetInput}
                onChange={(e) => setSheetInput(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
                spellCheck={false}
              />
            </label>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              库文件修改时间：{fmtTime(data.ankiMtimeMs)}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void savePaths()}
                disabled={saving}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-teal-600"
              >
                {saving ? "保存中…" : "保存路径"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
              >
                立即刷新
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
