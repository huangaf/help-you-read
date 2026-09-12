# Phase 5 — App 层（React UI + Vite Core API 桥接）+ E2E 验收

> 状态：E2E 验收通过（4/4）。本文档记录 App 层架构、E2E 验收范围与本次修复。

## 1. 目标

在 `packages/app` 落地 v1 最小闭环的 UI：
导入 EPUB → 三栏阅读（书库 / Reader / Tab 面板）→ RIA 笔记 → SuperMemo 复习卡 → SM-2 评分 → 到期队列。

浏览器无法直接 import `@hyr/core`（依赖 `node:sqlite` / `child_process`），故通过 Vite 插件在 dev server 内注册 `POST /api/core` 桥接；EPUB 渲染（foliate-js Engine）在浏览器直接运行。

## 2. 架构

```
packages/app/
  core-service.ts        # 服务端：包装 @hyr/core 的 DB/AI/Skill/TTS，供插件调用
  vite-plugin-core.ts    # Vite 插件：注册 POST /api/core，分派到 CoreService
  src/services/core.ts   # 浏览器：HTTP 客户端（CoreClient）
  src/services/epub-store.ts  # 浏览器：IndexedDB 持久化 EPUB 字节（web 模式）
  src/App.tsx            # 三栏布局 + state 管理
  src/pages/{Library,Reader,AIChat,RiaNotes,ReviewQueue,Tts,Skills}.tsx
  tests/e2e.spec.ts      # Playwright E2E
  playwright.config.ts   # Playwright 配置（chromium headless）
```

**数据流**：
- 浏览器可运行的操作（EPUB 渲染、文本选中）→ 直接调 `@hyr/engine`。
- 需 Node 的操作（SQLite/AI/TTS）→ `CoreClient` → `POST /api/core` → `vite-plugin-core` → `CoreService` → `@hyr/core`。

## 3. 关键设计决策

### 3.1 web 模式 EPUB 持久化（IndexedDB）
`browser:` 前缀是虚拟路径（无真实文件系统路径）。原始设计仅把导入的 `File` 放在 React state 中，
页面刷新即丢失 → 重新打开已导入书籍必失败。

**决策**：导入时将 EPUB 字节写入 IndexedDB（`epub-store.ts`），Reader 在 `browser:` 路径且无 Blob prop 时回退读取。
Tauri 模式走真实文件路径，不经过本模块。

### 3.2 渲染管线初始化（Engine.init）
foliate-js `view.open(book)` 仅登记元数据，**不加载任何 section**；须 `view.init()` 触发首次导航，
渲染器才产出可渲染内容（`render()` 的前置条件）。

**决策**：新增 `Engine.init()` 门面方法（不改变 `loadBook` 契约——避免破坏 transform 测试对资源加载时序的假设）。
Reader 在 `loadBook` 后调用 `init()`，并轮询 `render()` 直至内容就绪。

### 3.3 合成 EPUB fixture ZIP 构建
`scripts/make-fixture.mjs` 手搓 ZIP 时存在两处 bug，产出损坏归档。

## 4. 本次变更对照

| 文件 | 变更 | 原因 |
|------|------|------|
| `scripts/make-fixture.mjs` | ① `deflateSync`→`deflateRawSync`；② 本地目录头补 `nameBuf.copy(localHeader, 30)` | ZIP method 8 要求 raw DEFLATE；本地头缺文件名导致归档损坏 |
| `packages/app/src/services/epub-store.ts` | 新增（IndexedDB put/get/delete） | web 模式 EPUB 字节持久化 |
| `packages/app/src/pages/Library.tsx` | 导入后 `putEpub(virtualPath, file)` | 持久化导入的 EPUB |
| `packages/app/src/pages/Reader.tsx` | ① `browser:` 路径回退读 IndexedDB；② 加载后 `engine.init()` + 轮询 `render()`；③ 清理旧 `foliate-view` | 修复刷新重开失败、首屏无内容、多书叠加 |
| `packages/app/src/App.tsx` | Reader 传递 `blob={importedBlob}` | 导入即时渲染走 data 模式 |
| `packages/engine/src/facade/Engine.ts` | 新增 `init()` 方法 | 门面暴露渲染管线初始化 |
| `packages/engine/src/facade/init.test.ts` | 新增（2 tests） | `init()` 的 TDD 覆盖 |
| `packages/app/tests/e2e.spec.ts` | 重写（4 tests） | E2E 验收 |
| `packages/app/playwright.config.ts` | 新增 | Playwright 配置 |

## 5. 验证结果

| 检查项 | 命令 | 结果 |
|--------|------|------|
| Engine 单测 | `cd packages/engine && npx vitest run` | **64/64 passed** |
| Core 单测 | `cd packages/core && npx vitest run` | **157/157 passed** |
| Engine typecheck | `cd packages/engine && npx tsc --noEmit` | exit 0 |
| App typecheck | `cd packages/app && npx tsc --noEmit` | 仅 6 个既有 foliate `.js` 声明缺失错误（非本次引入） |
| E2E | `cd packages/app && npx playwright test` | **5/5 passed** |
| Fixture 有效性 | `unzip -t books/fixture-*.epub` | OK |

### E2E 用例
- **S1 三栏布局渲染**：2 个 aside + 5 个 tab 按钮 + 书库标题。
- **S2 导入EPUB → Reader渲染 → 刷新重开**：filechooser 导入 → 正文渲染（pageText > 10）→ `page.reload()` → 重新点击 → 仍渲染（IndexedDB 持久化）。
- **S3 RIA → 复习卡 → SM-2 → 到期队列（API）**：`addNote(method=ria)` → `addReviewItem` → `scheduleReview(quality=5)`（intervalDays > 1）→ `listDueReviews`（新卡不在到期列表）。
- **S7 UI tab 切换**：5 个 tab 依次切换，布局稳定。
- **S8 选中→RIA→贴墙→复习池**：在正文 frame 内选中段落 → RIA 面板注入选区 → 填 I/A + 勾选贴墙 + 保存 → `listPinnedNotes` 含该笔记 + `listReviewItems` 含派生复习卡。

## 6. 已知问题

- `packages/app` 的 `tsc --noEmit` 会因 `@hyr/engine` 以源码形式引入而报 6 个 `../foliate/*.js` 声明缺失错误（engine 自身 tsconfig 设 `allowJs: true` 故不报）。属**既有**跨包配置问题，非本次引入。
- `vite build` 受 engine 内 `import.meta.glob('vendor/pdfjs/**')` 模式约束阻塞（既有问题）。

## 7. 未决事项

- git commit 待用户明确同意（AGENTS.md §9）。

## 8. A2「贴墙」+ 选区 API 实施记录（第二轮，已实施）

> 用户确认：A2 采用**方案 A**；选区采用**修法 ①（Engine API）**。均已 TDD 实施并通过验收。

### 8.1 A2「贴墙」（方案 A）

| 文件 | 变更 |
|------|------|
| `packages/core/src/db/schema.ts` | 迁移 v3：`ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0` |
| `packages/core/src/db/types.ts` | `Note.pinned?: boolean` |
| `packages/core/src/db/repositories/notes.ts` | `create`/`update`/`#toEntity` 支持 pinned + `setPinned(id, pinned)` + `listPinned(bookId?)` |
| `packages/core/src/db/repositories/review_items.ts` | `listByBook(bookId)` |
| `packages/app/core-service.ts` | `addNote` 支持 pinned；新增 `pinNote` / `listPinnedNotes` / `listReviewItems` |
| `packages/app/vite-plugin-core.ts` | 分派 `pinNote` / `listPinnedNotes` / `listReviewItems` |
| `packages/app/src/services/core.ts` | CoreClient 对应方法 |
| `packages/app/src/pages/RiaNotes.tsx` | 「贴墙（A2 长期卡片 → 进复习池）」勾选；保存时派生复习卡 |
| 测试 | notes pinned 4 例 + review_items `listByBook` 1 例 + E2E S8 |

### 8.2 选区修复（修法 ①：Engine API）

**根因**：foliate 正文渲染在 iframe（`paginator.js:213`），且其 `#root` 为 **closed** shadow root；
`Reader` 读主窗口 `window.getSelection()` 恒为空；foliate 亦不向宿主派发选区事件。

| 文件 | 变更 |
|------|------|
| `packages/engine/src/facade/types.ts` | 新增 `EngineSelection { text; cfi }` |
| `packages/engine/src/facade/Engine.ts` | 新增 `onSelectionChange(cb): () => void`（在内容 document 上监听 `selectionchange`，返回取消订阅函数） |
| `packages/engine/src/facade/selection.test.ts` | 3 例（未 loadBook 抛 EngineNotReady / 选区回调 / 取消订阅后不再回调） |
| `packages/app/src/pages/Reader.tsx` | 移除失效 `handleMouseUp`；改为订阅 `engine.onSelectionChange` |
| 测试 | E2E S8 验证 iframe 选区 → RIA 面板注入 |

### 8.3 验收
见 §5 验证结果表：E2E 5/5、Engine 64/64、Core 157/157、Engine tsc exit 0。


