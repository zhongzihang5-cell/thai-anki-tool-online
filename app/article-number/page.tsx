"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { eligibleWorkflowRows } from "@/lib/pickArticleBatch";
import { thaiWordKey } from "@/lib/pickNext30";
import type {
  WordsInArticleNumberResponse,
  WordsInArticleNumberSourceScope,
} from "@/lib/runArticleSearch";
import type { WordRow } from "@/lib/runWordsCatalog";
import { loadShelvedKeys } from "@/lib/shelvedThai";

export default function ArticleNumberPage() {
  const [articleNo, setArticleNo] = useState("");
  const [sourceScope, setSourceScope] = useState<WordsInArticleNumberSourceScope>("all");
  const [catalog, setCatalog] = useState<WordRow[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);
  const [shelved] = useState<Set<string>>(() => loadShelvedKeys());
  const [searchLoading, setSearchLoading] = useState(false);
  const [result, setResult] = useState<WordsInArticleNumberResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  const eligible = useMemo(
    () => eligibleWorkflowRows(catalog, shelved),
    [catalog, shelved]
  );

  const rowByKey = useMemo(() => {
    const m = new Map<string, WordRow>();
    for (const w of catalog) {
      m.set(thaiWordKey(w.thai), w);
    }
    return m;
  }, [catalog]);

  async function runSearch() {
    const n = articleNo.trim();
    if (!n) {
      setSearchError("请输入文章编号");
      return;
    }
    if (eligible.length === 0) {
      setSearchError("没有待录入/需补充的词（或已全部搁置）。请刷新词表或恢复搁置。");
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    setResult(null);
    try {
      const words = eligible.map((w) => w.thai.trim()).filter(Boolean);
      const r = await fetch("/api/words-in-article-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleNumber: n, words, source: sourceScope }),
      });
      const data = (await r.json()) as WordsInArticleNumberResponse & { error?: string };
      if (!r.ok) {
        setSearchError(data.error || `请求失败 ${r.status}`);
        return;
      }
      setResult(data);
      if (data.error && (!data.articleFiles || data.articleFiles.length === 0)) {
        setSearchError(data.error);
      } else if (!data.error || data.articleFiles.length > 0) {
        setSearchError(null);
      }
    } catch {
      setSearchError("网络错误");
    } finally {
      setSearchLoading(false);
    }
  }

  async function copyHitThai() {
    if (!result?.hits?.length) return;
    const t = result.hits.map((h) => h.word).join("\n");
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      setSearchError("复制失败");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">按文章编号查词</h1>
      <p className="mt-1 text-sm text-zinc-500">
        先选<strong>官网 / 公众号 / 两者</strong>，再输入<strong>文件名开头的数字编号</strong>（如{" "}
        <code className="font-mono">3</code>、<code className="font-mono">003</code> 视为同一篇），在
        <strong>当前词表</strong>里只检查「待录入」「需补充」且<strong>未搁置</strong>的词，哪些出现在该文章中，便于准备录入。
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            来源
          </span>
          <select
            value={sourceScope}
            onChange={(e) =>
              setSourceScope(e.target.value as WordsInArticleNumberSourceScope)
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="all">官网 + 公众号</option>
            <option value="official">仅官网</option>
            <option value="wechat">仅公众号</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            文章编号
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={articleNo}
            onChange={(e) => setArticleNo(e.target.value)}
            placeholder="例如 003"
            className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={catLoading || searchLoading || eligible.length === 0}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:enabled:hover:bg-zinc-200"
        >
          {searchLoading ? "检索中…" : `检索 ${eligible.length} 个候选词`}
        </button>
        <button
          type="button"
          onClick={() => void fetchCatalog()}
          disabled={catLoading}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          {catLoading ? "刷新词表…" : "刷新词表"}
        </button>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        数据源见{" "}
        <Link href="/settings" className="text-teal-700 underline dark:text-teal-400">
          设置
        </Link>
        ；搁置词与{" "}
        <Link href="/workflow" className="text-teal-700 underline dark:text-teal-400">
          工作流
        </Link>{" "}
        一致。
      </p>

      {catError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {catError}
        </div>
      )}
      {searchError && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {searchError}
        </div>
      )}

      {result && result.articleFiles.length > 0 && (
        <section className="mt-8 space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">匹配到的文件</h2>
            {result.sourceScope ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {result.sourceScope === "official"
                  ? "范围：仅官网"
                  : result.sourceScope === "wechat"
                    ? "范围：仅公众号"
                    : "范围：官网 + 公众号"}
              </span>
            ) : null}
          </div>
          <ul className="space-y-2">
            {result.articleFiles.map((f) => (
              <li
                key={f.path}
                className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg">{f.audioIcon}</span>
                  <span className="font-mono text-xs text-zinc-500">{f.fileName}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">{f.sourceLabel}</span>
                  <span className="text-xs text-zinc-500">
                    {f.hasAudio ? "已有音频" : "需找 YouTube"}
                  </span>
                </div>
                {f.youtubeSearchDatePhrase ? (
                  <p className="mt-1 text-xs text-zinc-500">文末日期检索：{f.youtubeSearchDatePhrase}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && result.articleFiles.length > 0 && result.hits.length === 0 && (
        <p className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          已定位文章，但当前候选词（待录入/需补充、未搁置）中<strong>没有词</strong>出现在本篇正文中。
        </p>
      )}

      {result && result.hits.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              本篇可准备录入 <strong className="text-teal-700 dark:text-teal-400">{result.hits.length}</strong> 个词
            </h2>
            <button
              type="button"
              onClick={() => void copyHitThai()}
              className="rounded border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-600"
            >
              复制本篇命中词（泰文每行一个）
            </button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                  <th className="px-3 py-2">泰文</th>
                  <th className="px-3 py-2">音标</th>
                  <th className="px-3 py-2">中文</th>
                  <th className="px-3 py-2">频次</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">例句片段</th>
                </tr>
              </thead>
              <tbody>
                {result.hits.map((h) => {
                  const row = rowByKey.get(thaiWordKey(h.word));
                  return (
                    <tr
                      key={h.word}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 font-mono font-medium text-zinc-900 dark:text-zinc-50">
                        {h.word}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {row?.ipa || "—"}
                      </td>
                      <td className="max-w-[200px] px-3 py-2 text-zinc-700 dark:text-zinc-300">
                        {row?.chinese || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-600">{row?.frequency ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600">{row?.statusLabel ?? "—"}</td>
                      <td className="max-w-md px-3 py-2 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
                        {h.sentences[0]?.slice(0, 120)}
                        {(h.sentences[0]?.length ?? 0) > 120 ? "…" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && result.misses.length > 0 && (
        <p className="mt-4 text-xs text-zinc-500">
          候选词中有 {result.misses.length} 个在本篇正文中未匹配到（仍可能出现在其他文章）。
        </p>
      )}
    </main>
  );
}
