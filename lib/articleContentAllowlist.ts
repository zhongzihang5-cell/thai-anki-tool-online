import fs from "node:fs/promises";
import path from "node:path";

async function loadArticleConfig(): Promise<{
  dhammaArticlesDir: string;
  wechatArticlesDir: string;
}> {
  const cfgPath = path.join(process.cwd(), "article-config.json");
  const raw = await fs.readFile(cfgPath, "utf8");
  const j = JSON.parse(raw) as {
    dhammaArticlesDir?: string;
    wechatArticlesDir?: string;
  };
  if (!j.dhammaArticlesDir || !j.wechatArticlesDir) {
    throw new Error("article-config.json 缺少目录配置");
  }
  return {
    dhammaArticlesDir: path.resolve(j.dhammaArticlesDir),
    wechatArticlesDir: path.resolve(j.wechatArticlesDir),
  };
}

function isUnderRoot(file: string, root: string): boolean {
  const f = path.resolve(file);
  const r = path.resolve(root);
  if (f === r) return false;
  const rel = path.relative(r, f);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** 仅允许读取官网/公众号文章目录下的文本文件 */
export async function assertAllowedArticlePath(absPath: string): Promise<void> {
  const cfg = await loadArticleConfig();
  const p = path.resolve(absPath);
  const ok =
    isUnderRoot(p, cfg.dhammaArticlesDir) || isUnderRoot(p, cfg.wechatArticlesDir);
  if (!ok) {
    throw new Error("路径不在允许的文章目录内");
  }
  const ext = path.extname(p).toLowerCase();
  if (![".txt", ".md", ".markdown"].includes(ext)) {
    throw new Error("仅支持 .txt / .md 文章文件");
  }
}
