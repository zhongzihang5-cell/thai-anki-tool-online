import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import {
  readWordsConfigFile,
  statExcelMeta,
  writeWordsConfigFile,
} from "@/lib/serverWordsConfig";

export async function GET() {
  try {
    const cfg = await readWordsConfigFile();
    const excelMeta = await statExcelMeta(cfg.excelPath);
    let ankiMtime: number | null = null;
    try {
      const st = await fs.stat(cfg.ankiDbPath);
      if (st.isFile()) ankiMtime = st.mtimeMs;
    } catch {
      ankiMtime = null;
    }
    return NextResponse.json({
      excelPath: cfg.excelPath,
      sheetName: cfg.sheetName,
      ankiDbPath: cfg.ankiDbPath,
      excelFileName: excelMeta.fileName,
      excelExists: excelMeta.exists,
      excelMtimeMs: excelMeta.mtimeMs,
      ankiMtimeMs: ankiMtime,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "读取配置失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const next = await writeWordsConfigFile({
      excelPath: typeof body.excelPath === "string" ? body.excelPath : undefined,
      ankiDbPath: typeof body.ankiDbPath === "string" ? body.ankiDbPath : undefined,
      sheetName: typeof body.sheetName === "string" ? body.sheetName : undefined,
    });
    const excelMeta = await statExcelMeta(next.excelPath);
    return NextResponse.json({ ok: true, ...next, ...excelMeta });
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
