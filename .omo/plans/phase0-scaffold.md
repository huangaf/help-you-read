# Phase0: Monorepo Scaffold 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 pnpm workspace + tsconfig(strict) + Tauri2+React+Vite monorepo 骨架，使 `pnpm dev` 起桌面窗口、`tsc --noEmit` 零错。

**Architecture:** pnpm workspace monorepo（3 packages: engine/core/app）。engine 预留 foliate-js vendor + patch 目录；core 预留 db/ai/skill/tts 子模块目录；app 为 Vite+React 前端 + Tauri 2 Rust 桌面壳。Phase0 只搭骨架（config + placeholder），不填实现。

**Tech Stack:** TypeScript strict (ES2022, moduleResolution=bundler) + pnpm 11 workspace + React 18 + Vite 5 + Tauri 2 + Vitest

**Acceptance (from §5 Phase0):**
- `pnpm dev` 起桌面窗口（Tauri webview 加载 React app）
- `tsc --noEmit` 零错（所有 package）
- `pnpm -r typecheck` 全过

---

## File Structure（Phase0 创建/修改的文件）

```
help-you-read/
├── package.json              # [MODIFY] pnpm workspace root
├── pnpm-workspace.yaml       # [CREATE]
├── tsconfig.base.json        # [CREATE] strict + 共享编译选项
└── packages/
   ├── engine/                # [CREATE] @hyr/engine scaffold
   │   ├── package.json
   │   ├── tsconfig.json      # extends base
   │   └── src/
   │       ├── index.ts       # placeholder barrel
   │       ├── foliate/.gitkeep  # Phase1 填 foliate-js vendor
   │       └── patch/.gitkeep    # Phase1 填 own patch layer
   ├── core/                  # [CREATE] @hyr/core scaffold
   │   ├── package.json
   │   ├── tsconfig.json      # extends base
   │   └── src/
   │       ├── index.ts       # placeholder barrel
   │       ├── db/.gitkeep           # Phase2 填 DDL + repositories
   │       ├── ai/.gitkeep           # Phase3 填 providers + retrieval
   │       ├── skill/.gitkeep        # Phase4 填 manifest + catalog + runtime
   │       └── tts/.gitkeep          # Phase5 填 TTSEngine + local
   └── app/                   # [CREATE] @hyr/app — Vite+React+Tauri
       ├── package.json
       ├── tsconfig.json      # extends base
       ├── vite.config.ts     # Vite config (port 1420 for Tauri)
       ├── index.html         # Vite entry
       ├── src/
       │   ├── main.tsx       # React entry point
       │   └── App.tsx        # 最小占位组件
       ├── src-tauri/         # Tauri 2 Rust project
       │   ├── Cargo.toml
       │   ├── build.rs
       │   ├── tauri.conf.json
       │   ├── capabilities/
       │   │   └── default.json
       │   └── src/
       │       ├── main.rs
       │       └── lib.rs
```

---

## Tasks

### Task 1: Root Workspace Config

**Files:**
- Modify: `package.json`（root，当前不存在 → 创建）
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`

- [ ] **Step 1: RED — 确认 workspace 不可用**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm ls --depth 0
```
Expected: FAIL — "No package.json found" 或空输出（无 workspace）

- [ ] **Step 2: Create `package.json` (root)**

```json
{
  "name": "help-you-read",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @hyr/app dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "noEmit": true
  }
}
```

- [ ] **Step 5: GREEN — 验证 workspace 可用**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm install
```
Expected: SUCCESS — 安装 typescript，无 workspace package（尚未创建）

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm ls --depth 0
```
Expected: SUCCESS — 列出 help-you-read + typescript

- [ ] **Step 6: Commit**

```bash
cd /home/huangaf/projects/help-you-read
git add package.json pnpm-workspace.yaml tsconfig.base.json
git commit -m "feat(scaffold): pnpm workspace root + tsconfig strict base"
```

---

### Task 2: Engine Package Scaffold

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/index.ts`
- Create: `packages/engine/src/foliate/.gitkeep`
- Create: `packages/engine/src/patch/.gitkeep`

- [ ] **Step 1: RED — engine package 不存在**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm --filter @hyr/engine typecheck
```
Expected: FAIL — "No project named @hyr/engine found in workspace"

- [ ] **Step 2: Create `packages/engine/package.json`**

```json
{
  "name": "@hyr/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 3: Create `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/engine/src/index.ts` (placeholder barrel)**

```typescript
// @hyr/engine — EPUB 渲染引擎门面（Phase1 填充）
// 对外暴露: Engine, EpubSource, BookHandle, RenderOpts, RenderedPage, TextItem
// 内部: src/foliate/ (vendored foliate-js) + src/patch/ (own patch layer)
export {};
```

- [ ] **Step 5: Create `.gitkeep` files for Phase1 directories**

Create empty files:
- `packages/engine/src/foliate/.gitkeep`
- `packages/engine/src/patch/.gitkeep`

- [ ] **Step 6: GREEN — typecheck passes**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm install && pnpm --filter @hyr/engine typecheck
```
Expected: PASS — tsc 无错误（空 barrel + strict config）

- [ ] **Step 7: Commit**

```bash
cd /home/huangaf/projects/help-you-read
git add packages/engine/
git commit -m "feat(scaffold): @hyr/engine package scaffold (foliate+patch dirs reserved)"
```

---

### Task 3: Core Package Scaffold

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts` (placeholder barrel)
- Create: `.gitkeep` files for db/ai/skill/tts subdirectories

- [ ] **Step 1: RED — core package 不存在**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm --filter @hyr/core typecheck
```
Expected: FAIL — "No project named @hyr/core found in workspace"

- [ ] **Step 2: Create `packages/core/package.json`**

```json
{
  "name": "@hyr/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 3: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/core/src/index.ts` (placeholder barrel)**

```typescript
// @hyr/core — 共享核心（零 UI 依赖，可被桌面/移动/Web 复用）
// Phase2: db (schema + repositories + migrations)
// Phase3: ai (providers + retrieval)
// Phase4: skill (manifest + catalog + runtime + presets)
// Phase5: tts (TTSEngine abstraction + local impl)
export {};
```

- [ ] **Step 5: Create `.gitkeep` files for subdirectories**

Create empty files:
- `packages/core/src/db/.gitkeep`
- `packages/core/src/ai/.gitkeep`
- `packages/core/src/skill/.gitkeep`
- `packages/core/src/tts/.gitkeep`

- [ ] **Step 6: GREEN — typecheck passes**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm install && pnpm --filter @hyr/core typecheck
```
Expected: PASS — tsc 无错误

- [ ] **Step 7: Commit**

```bash
cd /home/huangaf/projects/help-you-read
git add packages/core/
git commit -m "feat(scaffold): @hyr/core package scaffold (db/ai/skill/tts dirs reserved)"
```

---

### Task 4: App Package — Vite + React

**Files:**
- Create: `packages/app/package.json`
- Create: `packages/app/tsconfig.json`
- Create: `packages/app/vite.config.ts`
- Create: `packages/app/index.html`
- Create: `packages/app/src/main.tsx`
- Create: `packages/app/src/App.tsx`

- [ ] **Step 1: RED — app package 不存在**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm --filter @hyr/app dev
```
Expected: FAIL — "No project named @hyr/app found in workspace"

- [ ] **Step 2: Create `packages/app/package.json`**

```json
{
  "name": "@hyr/app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hyr/core": "workspace:*",
    "@hyr/engine": "workspace:*",
    "@tauri-apps/api": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.8.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 3: Create `packages/app/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/app/vite.config.ts`**

```typescript
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
```

- [ ] **Step 5: Create `packages/app/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>help-you-read</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `packages/app/src/main.tsx`**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7: Create `packages/app/src/App.tsx`（最小占位）**

```typescript
// Phase0 占位组件 — 验证 Vite+React 管线可用
// Phase5 替换为完整三栏阅读 UI（Library / Reader / AIChat）
export default function App() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>help-you-read</h1>
      <p>Phase0 scaffold 验证成功。AI 辅助电子书阅读器。</p>
    </div>
  );
}
```

- [ ] **Step 8: GREEN — Vite dev server + typecheck**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm install
```
Expected: SUCCESS — 安装 react, vite, @vitejs/plugin-react, tauri deps

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm --filter @hyr/app typecheck
```
Expected: PASS — tsc 无错误

Run（浏览器验证）:
```bash
cd /home/huangaf/projects/help-you-read && pnpm --filter @hyr/app dev
```
Expected: Vite 启动于 port 1420，浏览器打开 http://localhost:1420 看到 "help-you-read" + "Phase0 scaffold 验证成功"

- [ ] **Step 9: Commit**

```bash
cd /home/huangaf/projects/help-you-read
git add packages/app/
git commit -m "feat(scaffold): @hyr/app Vite+React template (port 1420, Tauri-ready)"
```

---

### Task 5: App Package — Tauri 2 Desktop Shell

**Files:**
- Create: `packages/app/src-tauri/Cargo.toml`
- Create: `packages/app/src-tauri/build.rs`
- Create: `packages/app/src-tauri/tauri.conf.json`
- Create: `packages/app/src-tauri/capabilities/default.json`
- Create: `packages/app/src-tauri/src/main.rs`
- Create: `packages/app/src-tauri/src/lib.rs`

- [ ] **Step 1: RED — Tauri 不可用**

Run:
```bash
cd /home/huangaf/projects/help-you-read/packages/app && pnpm tauri --version
```
Expected: FAIL — "tsc: command not found" 或 tauri CLI 不可用（src-tauri 不存在）

- [ ] **Step 2: Create `packages/app/src-tauri/Cargo.toml`**

```toml
[package]
name = "help-you-read"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1" }
serde_json = { version = "1" }
```

- [ ] **Step 3: Create `packages/app/src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build().expect("error occurred while building tauri application")
}
```

- [ ] **Step 4: Create `packages/app/src-tauri/tauri.conf.json`**

```json
{
  "productName": "help-you-read",
  "version": "0.1.0",
  "identifier": "com.hyr.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "help-you-read",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": false
  }
}
```

- [ ] **Step 5: Create `packages/app/src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "permissions": ["core:default"]
}
```

- [ ] **Step 6: Create `packages/app/src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    help_you_read_lib::run()
}
```

- [ ] **Step 7: Create `packages/app/src-tauri/src/lib.rs`**

```rust
use tauri::Manager;

pub fn run() -> ! {
    tauri::Builder::default()
        .run(tauri::generate_context!(), |app, handle| {
            // Phase0: 无自定义 setup — 后续 phase 添加 commands/plugins
        })
        .expect("error while running tauri application");
}
```

- [ ] **Step 8: Add `tauri` script to app package.json**

Modify `packages/app/package.json` — add to `"scripts"`:
```json
"tauri": "tauri"
```

(即 `"scripts": { "dev": "vite", "build": "...", "preview": "vite preview", "typecheck": "tsc --noEmit", "tauri": "tauri" }`)

- [ ] **Step 9: GREEN — Tauri dev window**

Run（首次编译 Rust，可能需要几分钟下载依赖）:
```bash
cd /home/huangaf/projects/help-you-read/packages/app && pnpm tauri dev
```
Expected:
- Cargo 编译 tauri deps（首次 ~2-5 min）
- Vite dev server 启动于 port 1420
- Tauri desktop window 弹出，标题 "help-you-read"，显示 React App 内容（"Phase0 scaffold 验证成功"）

- [ ] **Step 10: Commit**

```bash
cd /home/huangaf/projects/help-you-read
git add packages/app/src-tauri/ packages/app/package.json
git commit -m "feat(scaffold): Tauri 2 desktop shell (window config + capabilities)"
```

---

### Task 6: Integration Verification

**Files:**（无新文件，纯验证）

- [ ] **Step 1: Cross-package import chain**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm -r typecheck
```
Expected: PASS — 所有 3 packages typecheck 通过（engine/core/app）

- [ ] **Step 2: Full workspace build**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm build
```
Expected: PASS — 所有 package build 成功（engine/core: tsc noEmit; app: tsc + vite build）

- [ ] **Step 3: Desktop window (final acceptance)**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm dev
```
Expected: Tauri desktop window 弹出，显示 "help-you-read" + "Phase0 scaffold 验证成功"

- [ ] **Step 4: Verify workspace graph**

Run:
```bash
cd /home/huangaf/projects/help-you-read && pnpm ls --recursive --depth 0
```
Expected: 列出 @hyr/engine, @hyr/core, @hyr/app + 各自 deps

- [ ] **Step 5: Commit（如有 fix）+ tag**

若 Step1-4 暴露问题需修复，修后:
```bash
cd /home/huangaf/projects/help-you-read
git add -A
git commit -m "fix(scaffold): integration fixes"
```

最终验证通过后:
```bash
cd /home/huangaf/projects/help-you-read
git tag phase0-complete
git commit -m "docs: Phase0 complete — monorepo scaffold verified" --allow-empty
```

---

## Verification Results (2026-07-11)

| # | 场景 | 结果 | 证据 |
|---|------|------|------|
| S1 | Workspace 可安装 | ✅ PASS | `pnpm install` exit 0, 3 packages linked |
| S2 | Engine typecheck clean | ✅ PASS | `tsc --noEmit` exit 0 (packages/engine) |
| S3 | Core typecheck clean | ✅ PASS | `tsc --noEmit` exit 0 (packages/core) |
| S4 | App Vite dev server 起 | ✅ PASS | Vite :1420 serves React page (curl verified) |
| S5 | App typecheck clean | ✅ PASS | `tsc --noEmit` exit 0 (packages/app) |
| S6 | Tauri desktop window 弹出 | ✅ PASS | `xwininfo` shows "help-you-read" (1200×800, class Help-you-read) |
| S7 | Cross-package typecheck | ✅ PASS | `pnpm -r typecheck` all 3 packages exit 0 |
| S8 | Full build pass | ✅ PASS | `pnpm -r run build` → Vite production build 851ms, tsc clean |

**Phase0 验收结论：全部通过。**

### 实施中发现的问题及修复

| 问题 | 修复 |
|------|------|
| pnpm 11 废弃 `package.json#pnpm` 字段 | 迁移到 `pnpm-workspace.yaml#onlyBuiltDependencies: [esbuild]` |
| Tauri 2 `tauri_build::build()` 返回 `()` 非 Result | build.rs 去掉 `.expect()` |
| Tauri 2 capabilities 需 `identifier` 字段 | default.json 添加 `"identifier": "default"` |
| Rust crate 名 hyphens→underscores | main.rs: `help_you_read::run()` |
| Tauri on Linux 需 D-Bus session bus | `dbus-daemon --session` + `DBUS_SESSION_BUS_ADDRESS` env |
| 窗口检测（GNOME） | `xwininfo -root -tree` 比 xdotool 可靠 |
| root `pnpm dev` 只起 Vite，不弹桌面窗口 | root `dev` 改为 `pnpm --filter @hyr/app tauri dev`，新增 `dev:web`（纯前端）；README 同步修正 |
| tauri dev panic "Too many open files"（inotify 实例耗尽，非真 fd） | `fs.inotify.max_user_instances` 128→512（/etc/sysctl.d/60-inotify.conf + sysctl --system）；README 故障排查章节 |

---

## Scenarios (Acceptance Contract)

| # | 场景 | Pass 条件（binary observable） | 验证方式 |
|---|------|-------------------------------|----------|
| S1 | Workspace 可安装 | `pnpm install` exit 0，无 error | Bash stdout |
| S2 | Engine typecheck clean | `pnpm --filter @hyr/engine typecheck` exit 0，无 tsc error | Bash stdout |
| S3 | Core typecheck clean | `pnpm --filter @hyr/core typecheck` exit 0，无 tsc error | Bash stdout |
| S4 | App Vite dev server 起 | `pnpm --filter @hyr/app dev` → browser :1420 显示 React page | Browser screenshot / curl |
| S5 | App typecheck clean | `pnpm --filter @hyr/app typecheck` exit 0 | Bash stdout |
| S6 | Tauri desktop window 弹出 | `pnpm tauri dev` → 桌面窗口出现，标题 "help-you-read"，内容正确 | Desktop screenshot / window title |
| S7 | Cross-package typecheck | `pnpm -r typecheck` 全部 exit 0 | Bash stdout |
| S8 | Full build pass | `pnpm -r build` 全部 exit 0 | Bash stdout |

---

## Notes / Constraints

- **Phase0 不填实现**：engine/src/foliate/ 和 core 子目录只放 .gitkeep，不写业务代码
- **Tauri dev 首次编译慢**：Cargo 需下载+编译 tauri crate（~3-5 min），属正常
- **端口固定 1420**：Tauri 默认期望的 dev server 端口，`strictPort: true` 防止冲突
- **React StrictMode**：保留（开发期双渲染检测副作用问题）
- **CSP null**：Phase0 不设 CSP（开发便利），Phase6 验收前收紧
- **bundle.active = false**：Phase0 不打包安装包，只验证 dev window
