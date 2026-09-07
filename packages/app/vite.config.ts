import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 期望固定端口（与 tauri.conf.json devUrl 对齐）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
  },
});
