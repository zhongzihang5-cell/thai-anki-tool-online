import { spawn } from "node:child_process";
import path from "node:path";

const SCRIPT = path.join(process.cwd(), "scripts", "search_articles.py");

export type SingleSearchResult = {
  path: string;
  fileName: string;
  sourceLabel: string;
  kind: "official" | "wechat";
  hasAudio: boolean;
  audioIcon: string;
  hasChinese: boolean;
  sentences: string[];
};

export type SingleSearchResponse = {
  query: string;
  results: SingleSearchResult[];
};

export type BatchItem = {
  word: string;
  status: "has_audio" | "youtube" | "not_found";
  statusLabel: string;
  hitCount: number;
  sources: number;
};

export type BatchSearchResponse = {
  items: BatchItem[];
};

export type ByArticleWordHit = {
  word: string;
  sentences: string[];
  hasChinese: boolean;
};

export type ByArticleArticle = {
  path: string;
  fileName: string;
  sourceLabel: string;
  kind: string;
  hasAudio: boolean;
  audioIcon: string;
  wordCount: number;
  words: ByArticleWordHit[];
  /** Words first covered at this greedy step (processing order) */
  newlyCoveredWords?: string[];
};

export type ByArticleResponse = {
  /** Greedy minimum-cover plan, in processing order */
  articles: ByArticleArticle[];
  inputWordCount: number;
  totalArticles: number;
  withAudioCount: number;
  youtubeCount: number;
  uncoveredWords: string[];
};

export type SearchPayload =
  | { mode: "single"; query: string }
  | { mode: "batch"; words: string[] }
  | { mode: "by_article"; words: string[] };

function defaultConfigPath(): string {
  return path.join(process.cwd(), "article-config.json");
}

export function runArticleSearch(
  payload: SearchPayload,
  configPath: string = defaultConfigPath()
): Promise<SingleSearchResponse | BatchSearchResponse | ByArticleResponse> {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [SCRIPT, configPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    py.stdout.on("data", (c: Buffer) => chunks.push(c));
    py.stderr.on("data", (c: Buffer) => errChunks.push(c));
    py.on("error", (err) => reject(err));
    py.on("close", (code) => {
      const errText = Buffer.concat(errChunks).toString("utf8");
      const outText = Buffer.concat(chunks).toString("utf8");
      if (code !== 0) {
        try {
          const j = JSON.parse(errText) as { error?: string };
          reject(new Error(j.error || errText || `python exited ${code}`));
        } catch {
          reject(new Error(errText || outText || `python exited ${code}`));
        }
        return;
      }
      try {
        resolve(
          JSON.parse(outText) as SingleSearchResponse | BatchSearchResponse | ByArticleResponse
        );
      } catch {
        reject(new Error("Invalid JSON from search script"));
      }
    });
    py.stdin.write(JSON.stringify(payload), "utf8");
    py.stdin.end();
  });
}
