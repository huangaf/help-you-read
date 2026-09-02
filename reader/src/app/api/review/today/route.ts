/**
 * 今日复习队列（占位）
 *
 * TODO(M2)：GET 返回今日到期闪卡队列（FSRS 调度）
 * 详见 docs/详细设计.md 第 4.4 节
 */
import { NextResponse } from "next/server";

// 占位处理函数：统一返回 501，功能在对应里程碑实现
export async function GET() {
  return NextResponse.json({ error: "TODO: 尚未实现" }, { status: 501 });
}
