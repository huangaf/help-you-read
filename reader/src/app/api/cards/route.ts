/**
 * 闪卡接口（占位）
 *
 * TODO(M2)：POST 生成闪卡（高亮/便签 → Q&A）+ 复习调度
 * 详见 docs/详细设计.md 第 4.4 节
 */
import { NextResponse } from "next/server";

// 占位处理函数：统一返回 501，功能在对应里程碑实现
export async function POST() {
  return NextResponse.json({ error: "TODO: 尚未实现" }, { status: 501 });
}
