// @hyr/engine — Vitest 配置（混合环境策略）
// - 默认 jsdom：纯逻辑 / text-walker 测试（无真实浏览器依赖）
// - browser 模式：@vitest/browser + Playwright Chromium，用于渲染 / transform / gate 测试
// - browser 环境通过文件级 docblock `// @vitest-environment browser` 按需开启

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 默认环境：jsdom（纯逻辑 / text-walker）；browser 测试用文件级 docblock `// @vitest-environment browser` opt-in
    environment: 'jsdom',

    // 注入全局 test 函数（describe / it / expect），无需手动 import
    globals: true,

    // 浏览器模式：Playwright Chromium
    browser: {
      enabled: true,
      name: 'chromium', // headless Chromium（Playwright 管理）
      headless: true,
      provider: 'playwright', // Vitest 2.x browser config：provider 是字符串名
    },

    // 测试文件匹配规则（相对于本配置文件所在目录）
    include: ['src/**/*.test.ts'],

    // 排除 node_modules / foliate vendor 源码
    exclude: [
      'node_modules/**',
      'src/foliate/**/*.test.ts', // vendored 源码不带测试
    ],

    // 每个文件独立隔离（避免 jsdom / browser 环境互相干扰）
    isolate: true,

    // 单次运行退出（非 watch 模式）
    retry: 0,

    // zod 为新增运行时依赖，显式纳入 optimizeDeps 避免 Vite 首次优化触发 test reload（flaky）
    optimizeDeps: {
      include: ['zod'],
    },
  },
});
