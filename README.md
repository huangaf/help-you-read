# help-you-read（帮你读）

AI 辅助电子书阅读器。导入 EPUB → 三栏阅读（原文 / 批注 / AI 对话）→ AI 全流程辅助（读前导览 · 读中注入 · 读后总结）→ 按读书方法沉淀笔记 → SuperMemo 间隔复习。

**核心立场**：local-first（数据默认本地）+ AI 全流程 + YAGNI。

## 技术栈

| 层 | 选型 |
|---|---|
| 语言 | TypeScript（strict，全栈） |
| UI | React 18 + Vite 5 |
| 桌面壳 | Tauri 2 |
| 数据 | SQLite（双库：main.db 可同步 / local.db 不同步） |
| EPUB 引擎 | foliate-js（vendor from main + patch layer） |
| AI | AIProvider 抽象（本地默认 / 外部可选）+ Hybrid FTS5 + 向量 RRF |
| 工作区管理 | pnpm workspace（monorepo） |
| 测试 | vitest（单测）+ Playwright（e2e） |

## 项目结构

```
help-you-read/
├── package.json              # pnpm workspace root（scripts: dev/build/test/typecheck）
├── pnpm-workspace.yaml      # workspace 配置（packages/*, onlyBuiltDependencies）
├── tsconfig.base.json       # TypeScript strict 基础配置（ES2022, bundler）
├── AGENTS.md                # AI 协作者上下文契约（技术栈/边界/规则）
├── docs/                    # 规格文档（需求/技术方案/研究报告）
│   ├── 需求文档.md
│   ├── 技术方案.md
│   ├── 读书工具研究报告.md
│   └── 持久数据模型对比.md
├── .omo/                    # AI 协作过程文档（plans/drafts）
└── packages/
    ├── engine/              # @hyr/engine — EPUB 引擎（foliate-js vendor + patch）
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts     # 门面入口（Engine class）
    │       ├── foliate/     # vendored foliate-js 源码（原样）
    │       └── patch/       # own patch layer
    ├── core/                # @hyr/core — 共享核心（零 UI 依赖）
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts     # 统一导出
    │       ├── db/          # SQLite 双库（main + local）
    │       ├── ai/          # AIProvider 抽象 + Hybrid RAG
    │       ├── skill/       # 技能系统（kind: prompt/agent/script）
    │       └── tts/         # TTS 本地合成
    └── app/                 # @hyr/app — React UI（Tauri 桌面）
        ├── package.json
        ├── tsconfig.json
        ├── vite.config.ts   # dev server :1420（strictPort）
        ├── index.html
        ├── src/
        │   ├── main.tsx     # React 入口（StrictMode）
        │   └── App.tsx      # 三栏布局 placeholder
        ├── src-tauri/       # Tauri 2 Rust 桌面壳
        │   ├── Cargo.toml
        │   ├── build.rs
        │   ├── tauri.conf.json  # productName, devUrl :1420, window 1200×800
        │   ├── capabilities/    # Tauri 2 permissions
        │   └── src/
        │       ├── main.rs
        │       └── lib.rs
        └── tests/           # Playwright e2e（v1 后期）
```

## 环境要求

### 前置依赖

| 依赖 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | >= 20 | TypeScript / Vite / React 运行时 |
| pnpm | >= 9（推荐 11+） | workspace 包管理 |
| Rust (stable) | >= 1.75 | Tauri 2 桌面壳编译 |
| Cargo | 随 Rust 工具链 | Rust 构建系统 |

### Linux（Ubuntu/Debian）系统依赖

Tauri on Linux 需要以下系统库（WebKitGTK + GTK3）：

```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libglib2.0-dev \
                 librsvg2-dev libdbus-1-dev
```

> **注意**：`libwebkit2gtk-4.0-dev` 不适用，Tauri 2 要求 `4.1`。
> Fedora: `sudo dnf install webkitgtk4.1 gtk3 glib2 librsvg dbus`

### macOS 系统依赖

```bash
# Xcode Command Line Tools（提供 clang、SDK）
xcode-select --install

# 验证
rustc --version && cargo --version
```

macOS 无需额外系统库（WebKit 随系统提供）。

### D-Bus Session Bus（Linux headless / SSH）

Tauri on Linux 需要 D-Bus session bus。桌面环境下 GNOME/KDE 自动提供；
**headless / SSH 环境**需手动启动：

```bash
dbus-daemon --session --print-address > /tmp/hyr-dbus-addr.txt &
export DBUS_SESSION_BUS_ADDRESS=$(cat /tmp/hyr-dbus-addr.txt)
```

## 本地开发启动

### Step 1: 克隆 + 安装依赖

```bash
git clone https://github.com/huangaf/help-you-read.git
cd help-you-read
pnpm install
```

### Step 2: 验证环境

```bash
# TypeScript strict typecheck（所有 package）
pnpm -r typecheck

# 确认 pnpm workspace 识别到 3 个包
pnpm ls --recursive --depth 0
# Expected: @hyr/engine, @hyr/core, @hyr/app
```

### Step 3: 启动开发环境（Vite + Tauri 桌面窗口）

```bash
# Linux headless / SSH：先启动 D-Bus（见上方说明）

# 正常桌面环境直接执行：
pnpm dev
```

**预期行为：**
1. Vite dev server 启动于 `http://localhost:1420`（strictPort）
2. Tauri 编译 Rust 壳（首次 ~3-5 min，后续增量 <1s）
3. 桌面窗口弹出：标题 "help-you-read"，尺寸 1200×800
4. 窗口加载 React app（当前为 placeholder 三栏布局）

> **Tauri dev 流程**：`pnpm dev` 触发 `beforeDevCommand: pnpm dev`（Vite），
> Tauri CLI 监听 :1420，编译 Rust → 启动 webview 窗口。

### Step 4（可选）: 仅前端开发（不弹桌面窗口）

```bash
# 只起 Vite dev server，浏览器访问 :1420
pnpm --filter @hyr/app dev

# 或
cd packages/app && pnpm dev
```

### Step 5（可选）: 仅 Rust / Tauri 侧调试

```bash
cd packages/app/src-tauri
cargo run          # 直接跑 Rust（需 Vite 已在 :1420）
cargo build        # 仅编译，不运行
```

## 可用命令速查

| 命令 | 作用 |
|------|------|
| `pnpm dev` | Vite + Tauri 桌面窗口（完整开发体验） |
| `pnpm build` | 所有 package 生产构建（tsc + vite build） |
| `pnpm test` | 所有 package 测试（vitest） |
| `pnpm typecheck` | 所有 package TypeScript strict 检查 |
| `pnpm --filter @hyr/app dev` | 仅 Vite（浏览器开发） |
| `pnpm --filter @hyr/app tauri dev` | 仅 Tauri（需 Vite 已运行） |
| `pnpm --filter @hyr/core test` | core 包单测 |
| `pnpm --filter @hyr/engine test` | engine 包单测 |

## 测试策略

- **单元测试**：vitest（各 package `src/*.test.ts`）
- **EPUB 回归语料**：`books/*.epub`（含芒格）+ 合成 EPUB fixture
- **E2E**：Playwright（`packages/app/tests/`，v1 后期启用）
- **完成定义**：lsp_diagnostics 干净 + build/test 通过

## 编码约定（MUST）

- TypeScript strict：禁 `any` / `as any` / `@ts-ignore`
- parse-don't-validate：外部数据用 schema 校验（zod）解析成 branded type
- typed errors：自定义错误类型（带 code），不吞异常、不留空 catch
- 函数短小；单文件 ~250 LOC 上限，超了拆模块
- 代码注释 / UI 文本：简体中文；标识符保持英文

## v1 范围

**IN（Phase1-6）**：
- #1 RIA 便签 + #6 SuperMemo 间隔复习
- 支撑：书库 / 三栏阅读 / AI 对话+RAG / TTS 本地 / 技能系统

**OUT（v2+）**：
- 其余 7 读书方法、跨书知识图谱、WebDAV 同步增强、FSRS
- PDF / MOBI / DOCX

> v1 完成 Phase6 验收前，不启动 v2+（YAGNI）。

## 文档索引

| 文档 | 内容 |
|------|------|
| `docs/需求文档.md` | 要什么（9 方法 → 读前/中/后/复习，v1 范围） |
| `docs/技术方案.md` | 怎么搭（架构 / 模块 / 接口 / schema DDL / 分阶段路线） |
| `docs/读书工具研究报告.md` | 为什么（四项目调研综合 + 竞品分析） |
| `docs/持久数据模型对比.md` | 四项目数据模型对比 + v1 schema 依据 |
| `.omo/plans/` | AI 协作执行计划（各 Phase） |

## Git 规则

- `git add`：自由使用
- `git commit` / `git push` / `git merge`：**须用户明确同意**
- 任何代码改动 → 同步更新对应方案文档（`.omo/plans/` 或 `docs/`）

## License

MIT（待定，Phase6 后正式确定）
