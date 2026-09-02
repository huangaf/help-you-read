/**
 * 跨书关联检索（占位）
 *
 * TODO(M3)：POST 相同/相似概念跨书汇总（芒格多元思维）
 * 详见 docs/详细设计.md 第 4.3 节
 */
import { NextResponse } from "next/server";

// 占位处理函数：统一返回 501，功能在对应里程碑实现
export async function POST() {
  return NextResponse.json({ error: "TODO: 尚未实现" }, { status: 501 });
}
