/**
 * 三遍阅读模式（占位）
 *
 * TODO(M3)：POST body 含 pass: 1/2/3（纵览/细节/笔记）
 * 详见 docs/详细设计.md 第 4.3 节
 */
import { NextResponse } from "next/server";

// 占位处理函数：统一返回 501，功能在对应里程碑实现
export async function POST() {
  return NextResponse.json({ error: "TODO: 尚未实现" }, { status: 501 });
}
