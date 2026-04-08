import fs from "node:fs/promises";
import path from "node:path";

export type WordsConfigFile = {
  excelPath: string;
  sheetName: string;
  ankiDbPath: string;
};

const CONFIG_PATH = path.join(process.cwd(), "words-config.json");

export async function readWordsConfigFile(): Promise<WordsConfigFile> {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const j = JSON.parse(raw) as Partial<WordsConfigFile>;
  if (!j.excelPath || !j.ankiDbPath) {
    throw new Error("words-config.json 缺少 excelPath 或 ankiDbPath");
  }
  return {
    excelPath: j.excelPath,
    sheetName: j.sheetName || "150篇集合",
    ankiDbPath: j.ankiDbPath,
  };
}

export async function writeWordsConfigFile(partial: Partial<WordsConfigFile>): Promise<WordsConfigFile> {
  const cur = await readWordsConfigFile().catch(() => ({
    excelPath: "",
    sheetName: "150篇集合",
    ankiDbPath: "",
  }));
  const next: WordsConfigFile = {
    excelPath: partial.excelPath ?? cur.excelPath,
    sheetName: partial.sheetName ?? cur.sheetName,
    ankiDbPath: partial.ankiDbPath ?? cur.ankiDbPath,
  };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function statExcelMeta(excelPath: string): Promise<{
  exists: boolean;
  fileName: string;
  mtimeMs: number | null;
}> {
  const fileName = path.basename(excelPath);
  try {
    const st = await fs.stat(excelPath);
    return { exists: st.isFile(), fileName, mtimeMs: st.mtimeMs };
  } catch {
    return { exists: false, fileName, mtimeMs: null };
  }
}
