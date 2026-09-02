import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是原生 CJS 模块，必须外部化以避免 Next.js 打包失败
  // Next.js 15+ 使用顶层 serverExternalPackages 替代废弃的 experimental.serverComponentsExternalPackages
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
