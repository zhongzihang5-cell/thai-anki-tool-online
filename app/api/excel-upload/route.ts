import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { statExcelMeta, writeWordsConfigFile } from "@/lib/serverWordsConfig";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "需要 multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "需要非空 file 字段" }, { status: 400 });
  }
  const name = (file.name || "wordlist.xlsx").replace(/[^\w.\-()\u4e00-\u9fff]/g, "_");
  const safeName = name.toLowerCase().endsWith(".xlsx") ? name : `${name}.xlsx`;
  const dir = path.join(process.cwd(), "data");
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, safeName);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(target, buf);
  const abs = path.resolve(target);
  await writeWordsConfigFile({ excelPath: abs });
  const meta = await statExcelMeta(abs);
  return NextResponse.json({
    ok: true,
    excelPath: abs,
    excelFileName: meta.fileName,
    excelExists: meta.exists,
    excelMtimeMs: meta.mtimeMs,
  });
}
