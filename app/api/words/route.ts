import { NextResponse } from "next/server";
import { runWordsCatalog } from "@/lib/runWordsCatalog";

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const payload = {
    excelPath: typeof b.excelPath === "string" ? b.excelPath : undefined,
    ankiDbPath: typeof b.ankiDbPath === "string" ? b.ankiDbPath : undefined,
    sheetName: typeof b.sheetName === "string" ? b.sheetName : undefined,
  };
  try {
    const data = await runWordsCatalog(payload);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Words catalog failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
