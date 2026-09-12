// Vite 配置 — React + Core API 插件
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { coreApiPlugin } from './vite-plugin-core.js';

// AI 配置（oMLX endpoint）
const aiConfig = {
    llmBaseUrl: 'http://100.126.215.3:8090/v1',
    llmApiKey: 'REDACTED_API_KEY',
    llmModel: 'Qwen3.6-35B-A3B-OptiQ-4bit',
    embeddingBaseUrl: 'http://100.126.215.3:8090/v1',
    embeddingApiKey: 'REDACTED_API_KEY',
    embeddingModel: 'Qwen3-Embedding-0.6B-8bit',
};

// 数据目录（SQLite 双库存放路径）
const dataDir = `${process.env.HOME}/.help-you-read/data`;

// Tauri 期望固定端口（与 tauri.conf.json devUrl 对齐）
export default defineConfig({
    plugins: [
        react(),
        coreApiPlugin({ dataDir, aiConfig }),
    ],
    server: {
        port: 1420,
        strictPort: true,
    },
    build: {
        target: 'esnext',
    },
});
