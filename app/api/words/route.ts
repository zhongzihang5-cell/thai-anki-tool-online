import { NextResponse } from "next/server";
import { runWordsCatalog } from "@/lib/runWordsCatalog";
import { readWordsConfigFile } from "@/lib/serverWordsConfig";

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  let fileDefaults: Awaited<ReturnType<typeof readWordsConfigFile>> | null = null;
  try {
    fileDefaults = await readWordsConfigFile();
  } catch {
    fileDefaults = null;
  }
  const payload = {
    excelPath:
      typeof b.excelPath === "string"
        ? b.excelPath
        : (fileDefaults?.excelPath ?? undefined),
    ankiDbPath:
      typeof b.ankiDbPath === "string"
        ? b.ankiDbPath
        : (fileDefaults?.ankiDbPath ?? undefined),
    sheetName:
      typeof b.sheetName === "string"
        ? b.sheetName
        : (fileDefaults?.sheetName ?? undefined),
  };
  try {
    const data = await runWordsCatalog(payload);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Words catalog failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
