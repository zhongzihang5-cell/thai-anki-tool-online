import { spawn } from "node:child_process";
import path from "node:path";

const SCRIPT = path.join(process.cwd(), "scripts", "words_catalog.py");

export type WordRow = {
  thai: string;
  ipa: string;
  chinese: string;
  frequency: number;
  needEntry: boolean;
  need2: boolean;
  need3: boolean;
  deletable: boolean;
  remarkJudged?: boolean;
  requiredExamples: number;
  requiredLabel: string;
  inAnki: boolean;
  /** Anki：泰文例句在 index 5、10、15…（步长 5）；该位非空且非纯 [sound:] 则计 1 条 */
  ankiNoteCount: number;
  /** 与 ankiNoteCount 相同 */
  ankiExampleCount?: number;
  status: "pending" | "supplement" | "deletable" | "done" | "idle" | "judged";
  statusLabel: string;
};

export type WordsCatalogStats = {
  pending: number;
  supplement: number;
  deletable: number;
  done: number;
  judged: number;
};

export type WordsCatalogResponse = {
  stats: WordsCatalogStats;
  words: WordRow[];
};

export type WordsCatalogPayload = {
  excelPath?: string;
  ankiDbPath?: string;
  sheetName?: string;
};

function defaultConfigPath(): string {
  return path.join(process.cwd(), "words-config.json");
}

export function runWordsCatalog(
  payload: WordsCatalogPayload,
  configPath: string = defaultConfigPath()
): Promise<WordsCatalogResponse> {
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
        resolve(JSON.parse(outText) as WordsCatalogResponse);
      } catch {
        reject(new Error("Invalid JSON from words catalog script"));
      }
    });
    py.stdin.write(JSON.stringify(payload), "utf8");
    py.stdin.end();
  });
}
