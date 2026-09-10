import { defineConfig } from 'vitest/config';

// core 包测试：纯 Node.js 环境（SQLite 操作，无 DOM 需求）
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**'],
    },
    // node:sqlite 是 Node.js 内置模块，Vite 无法打包 → 标记为 external
    server: {
        deps: {
            external: ['node:sqlite'],
        },
    },
});
