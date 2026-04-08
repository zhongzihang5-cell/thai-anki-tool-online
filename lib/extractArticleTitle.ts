/** 从官网/公众号 txt 头部提取中文标题行 */

export function extractArticleTitleFromBody(raw: string, fileName: string): string {
  const lines = raw.split(/\r?\n/).slice(0, 20);
  for (const ln of lines) {
    const m = ln.match(/^\s*标题\s*[:：]\s*(.+)$/);
    if (m) return m[1].trim();
  }
  return fileName.replace(/\.[^.]+$/i, "") || fileName;
}
