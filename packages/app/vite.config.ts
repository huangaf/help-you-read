// Vite 配置 — React + Core API 插件
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { coreApiPlugin } from './vite-plugin-core.js';

// monorepo 根目录（.env 存放处）
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Tauri 期望固定端口（与 tauri.conf.json devUrl 对齐）
export default defineConfig(({ mode }) => {
    // 从根目录 .env 读取 AI 配置；无 VITE_ 前缀 → 不注入客户端（密钥仅服务端可见）
    const env = loadEnv(mode, rootDir, '');

    const aiConfig = {
        llmBaseUrl: env.LLM_BASE_URL ?? '',
        llmApiKey: env.LLM_API_KEY ?? '',
        llmModel: env.LLM_MODEL ?? '',
        embeddingBaseUrl: env.EMBEDDING_BASE_URL ?? '',
        embeddingApiKey: env.EMBEDDING_API_KEY ?? '',
        embeddingModel: env.EMBEDDING_MODEL ?? '',
    };

    const missing = Object.entries(aiConfig).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
        throw new Error(`缺少 AI 配置环境变量: ${missing.join(', ')}（请在项目根目录 .env 配置，参考 .env.example）`);
    }

    // 数据目录（SQLite 双库存放路径）
    const dataDir = `${process.env.HOME}/.help-you-read/data`;

    return {
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
    };
});
