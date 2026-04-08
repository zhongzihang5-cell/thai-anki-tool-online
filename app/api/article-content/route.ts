import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import { assertAllowedArticlePath } from "@/lib/articleContentAllowlist";

export async function POST(req: Request) {
  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const p = typeof body.path === "string" ? body.path.trim() : "";
  if (!p) {
    return NextResponse.json({ error: "缺少 path" }, { status: 400 });
  }
  try {
    await assertAllowedArticlePath(p);
    const text = await fs.readFile(p, "utf8");
    return NextResponse.json({ path: p, text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "读取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
