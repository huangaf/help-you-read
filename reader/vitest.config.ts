import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // 默认 node 环境；需要 jsdom 的文件用文件级注释：
    //   @vitest-environment jsdom
    environment: 'node',
    // 全局注入 expect/globals，让 setupFiles 和测试文件都能直接用 expect
    globals: true,
    // 全局加载 jest-dom 扩展断言（toBeVisible、toHaveTextContent 等）
    setupFiles: ['./src/tests/setup.ts'],
  },
})
