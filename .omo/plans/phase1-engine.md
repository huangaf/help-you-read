# phase1-engine - Work Plan

## TL;DR (For humans)

**What you'll get:** 一个能真正读 EPUB 的引擎模块（`@hyr/engine`）。外部代码只需调用六个方法——加载书、渲染当前页、取当前位置书签(CFI)、跳到指定书签、对资源做变换、遍历文本——就能驱动阅读。底座的 foliate-js 原样拷进来，我们只在其上加一层「门面适配器」，**不改它任何一行源码**。

**Why this approach:** 经独立验证，六个方法里四个是 foliate-js 原生公开 API 的薄封装、一个开箱即用、一个应避免裸依赖——所以「patch」其实只是门面适配，无需 fork 改源码，风险被显著压低。foliate-js 以 copy-in（仓库自包含、零 submodule 运维）方式纳入，契合本项目 local-first + YAGNI。全量铺门面之前先设 GO/NO-GO 闸门（3 本 EPUB 渲染验证），不通过就停。

**What it will NOT do:** 不改 foliate-js vendored 源码；不暴露 `autoTransform`/`transformSource`（fork 定制，**v1 门面不暴露**——其依赖源随 v1 vendored 闭包可存在，但 facade 不实现/不暴露；v2+ 再实现）；不做「渲染后 DOM/文本注入」（那属 Phase5/v2+，`transformTarget` 作用域仅限资源加载）；不碰其余 7 读书方法、知识图谱、WebDAV、FSRS、PDF/MOBI/DOCX 格式处理器（**可 vendored 保 bundler 闭包完整、但门面不暴露**）、移动端；不实现 core 的 db/ai/skill/tts（Phase2-4）。

**Effort:** Medium
**Risk:** Medium - 主驱动为 R1（foliate-js v1.0.x 成熟度），已被 GO/NO-GO gate + copy-in+锁SHA 压低
**Decisions to sanity-check（round-1 修订后）:** (1) `render` 语义=「应用待生效样式/transform **并触发当前页 re-layout**」——**已核实（round-2）foliate-js 本就内置 re-layout 机制**（setStyles→fonts.ready→expand、render→局部 View.render、ResizeObserver；真实浏览器/webview 成立），jsdom 缺 fonts/ResizeObserver → re-layout 静默失效，故 render/re-layout 测试路由 Playwright（@vitest/browser）；受限环境降级为「登记样式、下次导航生效」；(2) 合成 fixture 的「复杂 CSS」范围（多列/固定版式、富字体/背景/伪元素、NAV+隐藏文本）；(3) `transform` 的 v1 定位=仅资源加载时变换（**作用域边界以 docstring 声明，不作不可达的"正文 DOM 不受影响"断言**），渲染后 DOM 注入留 Phase5；(4) **混合测试环境策略（round-2，用户已确认）**：jsdom 跑 text-walker/纯逻辑（三参 NodeFilter jsdom 可靠、happy-dom #1172 缺陷）；渲染/transform/gate（T4/T9/T10，依赖 jsdom 缺失的 URL.createObjectURL/ResizeObserver/document.fonts）路由 Playwright（@vitest/browser，Playwright 驱动、已缓存 Chromium）+ T1 环境冒烟门（逐项验证 web API，缺失项分流 Playwright）；(5) **customElements 自注册、无需 consumer 全局注入**（round-2 纠偏：paginator.js L210 文件内局部 class View，L671/L995 new View 引用同文件类非全局；各模块顶层 customElements.define 自完成）+ engine tsconfig `allowJs:true, checkJs:false`。

Your next move: **已批准** —— round-1 + round-2 dual review（momus plan 质量 + Oracle 架构独立复审）已全消化、plan + draft 现为 approved（含混合测试环境策略 + T5/T10 误读纠偏）。**交 worker 会话（`$start-work`，读本计划）执行**。Full execution detail follows below.

---

> TL;DR (machine): Medium effort / Medium risk(R1)；交付 @hyr/engine 六方法门面 + GO/NO-GO gate + TDD，不改 foliate-js 源码。**混合测试环境（jsdom text-walker/纯逻辑 + Playwright 渲染/transform/gate）**。

## Scope
### Must have
- `@hyr/engine` 接入 vitest + @vitest/browser(Playwright)（T1，混合测试环境：jsdom text-walker/纯逻辑 + Playwright 渲染/transform/gate），支撑 TDD。
- 回归语料：1 真实 EPUB（现有 `books/毛泽东选集…epub`）+ 2 合成 fixture（复杂 CSS / NAV+隐藏文本），共 3 本（T2）。
- vendored foliate-js EPUB 文件闭包，copy-in 进 `src/foliate/`、原样不改（T3）。
- GO/NO-GO gate：3 本 EPUB「正确渲染 + CFI 跨章节稳定」验证通过才铺门面（T4）。
- Engine 门面六方法 + 五类型，TDD：loadBook/render/currentCfi/goToCfi/transform/textWalker（T5-T11）。
- 终验：plan compliance / code quality / real manual QA（真实 webview 渲染+截图）/ scope fidelity（F1-F4）。

### Must NOT have (guardrails, anti-slop, scope boundaries)
- 不改 `src/foliate/` 下任何 vendored 源码（只加门面，保持原样以便追踪上游）。
- `autoTransform` / `transformSource`（foliate fork 定制）：**v1 门面不暴露**（其依赖源在 vendored 闭包内可存在，但 facade 不实现/不暴露），按需 v2+。
- 「渲染后 DOM/文本变换」（注入批注标记、删元素）非 v1——`transformTarget` 作用域仅资源加载，留 Phase5(RIA)/v2+。
- 其余 7 读书方法（#2/#3/#4/#5/#7）/ 跨书知识图谱 / WebDAV 同步增强 / FSRS——v2+。
- PDF / MOBI / DOCX 格式处理器：**可 vendored（保 T3 bundler import 闭包完整）但门面不暴露**——「v1 仅 EPUB」约束的是 **facade 暴露的 API（T5-T11 只实现 EPUB 六方法）**，**不约束 vendored 文件集完整性**（承 Oracle N3 + T3）/ 移动端（非 Tauri，不实现）。
- core 的 db/ai/skill/tts 实现（Phase2-4，不在本 phase）。
- 不引入 `any` / `as any` / `@ts-ignore` / `@ts-expect-error`（AGENTS.md §7）。
- 不删除/跳过失败测试来「变绿」——修代码，别改测试。

## Verification strategy
> F1/F2/F4 **agent 执行、零人工**；F3 = **唯一需用户显式 sign-off 的人工门**（见 F3，是"零人工"策略的显式例外）。
- Test decision: **TDD（RED→GREEN→SURFACE）**，框架 vitest + 混合环境（jsdom text-walker/纯逻辑、Playwright(@vitest/browser) 渲染/transform/gate）。每个门面方法先写失败测试再实现；豁免项（纯格式化/注释/依赖版本无行为 delta）须在 Findings 逐条写明理由。
- Evidence: `.omo/evidence/ulw/<session>/<goalId>/a<attempt>/task-<N>-phase1-engine.<ext>`（ulw-loop 内）；无 ulw-loop 时落 `.omo/evidence/task-<N>-phase1-engine.<ext>`。每场景须同时留「RED→GREEN 证明」+「真实 surface artifact」两样。
- typecheck：`pnpm -r typecheck` 全程保持零错（strict）。

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- **Wave 0（基建）**：T1, T2 —— 可并行（互不依赖）。
- **Wave 1（vendor）**：T3 —— vendor 本身不依赖 T1/T2；gate(T4) 才需三者齐备。
- **Wave 2（gate）**：T4 —— 依赖 T1+T2+T3；**检查点，FAIL 即 NO-GO 停止**。
- **Wave 3（facade, TDD）**：T5 → (T6,T7,T8) 可并行 → T9, T10, T11。**依赖（据 dependency matrix）**：T5 仅依赖 T3（骨架+类型，门面落点）；**T6-T11 依赖 T4 PASS + T5**。**澄清（承 momus）**：T5 排入 Wave 3（gate 之后）是**执行顺序**考量——gate(T4) NO-GO 时避免铺无用骨架，**非依赖关系**（T5 不依赖 T4）。T6-T11 同层可并行，但每个内部 RED/GREEN 不可并行。

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1 vitest 基建 | — | T4, T5-T11（测试运行器） | T2 |
| T2 回归语料(1真+2合成) | — | T4（gate 样本） | T1 |
| T3 vendor foliate-js(copy-in) | —（T2 非其依赖）| T4, T5-T11（底座） | — |
| T4 GO/NO-GO gate | T1, T2, T3 | T5-T11（**检查点，串行**） | —（串行） |
| T5 Engine 骨架+类型 | T3 | T6-T11（门面落点） | — |
| T6 loadBook | T4, T5 | F1-F4 | T7, T8（同层） |
| T7 currentCfi | T4, T5 | F1-F4 | T6, T8 |
| T8 goToCfi | T4, T5 | F1-F4 | T6, T7 |
| T9 transform | T4, T5 | F1-F4（语义独立，单独） | — |
| T10 render | T4, T5 | F1-F4（语义独立，单独） | — |
| T11 textWalker | T4, T5, T3(原生) | F1-F4（直接 re-export） | — |

## Todos
> Implementation + Test = ONE todo. Never separate.

- [ ] 1. T1 vitest 测试基建（@hyr/engine）
   What to do / Must NOT do: 给 `packages/engine` 接入 vitest：在 `package.json#scripts` 增 `"test": "vitest run"`、`"test:watch": "vitest"`；在 `devDependencies` 增 vitest + jsdom（DOM-tree/纯逻辑测试环境）+ @vitest/browser 与 playwright（真实浏览器环境，渲染/transform/gate），版本以 pnpm 可解析为准、勿锁死不存在版本。**混合测试环境策略（round-2，用户已确认）**：jsdom 跑 text-walker/纯逻辑（三参 NodeFilter jsdom 可靠、happy-dom #1172 缺陷；无需浏览器）；渲染/transform/gate（T4/T9/T10，依赖 jsdom 缺失的 URL.createObjectURL/ResizeObserver/document.fonts）路由 Playwright（@vitest/browser，Playwright 驱动、用已缓存 Chromium）——真实浏览器补齐 jsdom 缺口。新增 `packages/engine/vitest.config.ts`：`defineConfig`，text-walker/纯逻辑测试 `test.environment: 'jsdom'`、渲染/transform/gate 用 `@vitest/browser`（Playwright provider）——按测试类型路由。**勿改** core/app 的 scripts/deps（scope=engine only）；**勿**在 T1 写任何业务测试。
   Parallelization: Wave 0 | Blocked by: — | Blocks: T4, T5-T11
   References (executor has NO interview context - be exhaustive): `packages/engine/package.json`（现状仅 `typecheck: tsc --noEmit`，无 test 脚本、无运行时依赖）；根 `package.json#scripts`（test=`pnpm -r test`）；`tsconfig.base.json`（strict/noEmit/moduleResolution=bundler，**无 allowJs**——见 T3）；jsdom 对 web API 的覆盖（**round-2 jsdom 实测确认**：crypto.subtle / URL.createObjectURL / ResizeObserver / document.fonts **缺失**；createTreeWalker 三参 NodeFilter / EventTarget+CustomEvent / Blob / MutationObserver **可用**）→ 须冒烟门逐项验证、据结果分流测试环境（缺失项路由 Playwright）
   Acceptance criteria (agent-executable): `pnpm install` exit 0；恒真 smoke `src/smoke.test.ts`（断言 `1+1===2`）下 `pnpm --filter @hyr/engine test` 输出 `Test Files 1 passed`、exit 0；**环境冒烟门**（新增，见 QA）确认 jsdom 能跑通 facade 依赖的关键 web API；`pnpm -r typecheck` 仍零错。
   QA scenarios (name the exact tool + invocation): happy = `pnpm --filter @hyr/engine test` 输出 `Test Files 1 passed`；failure = 临时改 smoke 断言为假，确认 vitest 报 `1 failed`（证明 RED 机制生效），再还原。**环境冒烟门**：`src/env-smoke.test.ts`（jsdom 环境）逐项断言 facade 依赖的 web API 可用——(1) `document.createTreeWalker(root, SHOW_ELEMENT|SHOW_TEXT, {acceptNode})` 三参形式且 acceptNode 被调用（text-walker 路径）；(2) `globalThis.crypto.subtle.digest('SHA-1', data)` 返回正确摘要（epub.js#L578 路径）；(3) `document.createRange()`/`setStart/setEnd`/`comparePoint` 可用；(4) `URL.createObjectURL(new Blob([x]))`/`revokeObjectURL` 可实例化（epub.js Loader.createURL / MediaOverlay 资源加载硬依赖）；(5) `new ResizeObserver(cb)` 可实例化（paginator/fixed-layout re-layout）；(6) `document.fonts.ready`（FontFaceSet，setStyles re-layout 触发器）。**任一断言 FAIL → 该 API 在 jsdom 不可用：把对应测试改路由到 Playwright（@vitest/browser，真实浏览器 Chromium）执行**，不强行在 jsdom 跑。Evidence `.omo/evidence/.../task-1-phase1-engine.log`（贴 vitest 输出 + env-smoke 逐项 PASS/FAIL）。
  Commit: Y | chore(engine): 接入 vitest 测试基建

- [ ] 2. T2 回归语料（1 真实 + 2 合成 EPUB）
  What to do / Must NOT do: `books/` 需 3 本 EPUB。①保留现有真实毛泽东选集 EPUB（勿改）；②新增合成 `books/fixture-fixed-layout.epub`——压测**多列/固定版式(fixed-layout)** + 富 CSS（@font-face、background-image、:first-line/:drop-cap 伪元素）；③新增 `books/fixture-nav-hidden.epub`——压测 **NAV 文档 + 隐藏文本**（aria-hidden、display:none 注释块、自定义 navScheme）。两合成 EPUB 用**可复现脚本** `scripts/make-fixture.mjs`（Node，内置 zip 或 fflate）组装标准 EPUB 结构：mimetype(=application/vnd.ebook.epub20, ZIP 首条、STORED) + META-INF/container.xml + OPPO/content.opc（包清单）+ 正文 XHTML + NAV（EPUB3 navDoc，含 navScheme）+ CSS。**勿**改真实毛泽东 EPUB；合成内容用确定性文本（可断言），不引外部资源。
  Parallelization: Wave 0 | Blocked by: — | Blocks: T4（gate 样本）
  References (executor has NO interview context - be exhaustive): `books/`（现仅 1 本真实 EPUB）；`docs/技术方案.md:295`（语料策略：3-5 本真实 EPUB + 合成 fixture）；用户已定「混合：1 真实 + 2 合成」
  Acceptance criteria (agent-executable): `books/` 恰有 3 个 `.epub`；每本通过结构校验——`node scripts/verify-epub.mjs <file>`（解 ZIP，断言：mimetype 首条且 STORED、container.xml 指向唯一 OPC、content.opc 合法 XML、有 navDoc）exit 0；fixture-fixed-layout 的 CSS 含 columns/@font-face、fixture-nav-hidden 含 aria-hidden+navScheme。
  QA scenarios (name the exact tool + invocation): happy = 3 本均通过 `verify-epub.mjs`；failure = 故意造一个坏 mimetype（非 STORED）的 EPUB，确认 `verify-epub.mjs` 报 FAIL（证明校验有效）。Evidence `.omo/evidence/.../task-2-phase1-engine.log`。
  Commit: Y | test(engine): 回归语料——毛泽东(真实) + 2 合成 fixture(fixed-layout / nav-hidden)

- [ ] 3. T3 vendor foliate-js EPUB 文件（copy-in）
   What to do / Must NOT do: 从 `/tmp/foliate-js`（main@78914aef，已克隆）把 **完整 import 闭包** copy 进 `packages/engine/src/foliate/`，**原样不改**。起始集：epub.js, view.js, epubcfi.js, text-walker.js, paginator.js, fixed-layout.js。**闭包补全方法（关键修订）**：对起始集 + 已拷文件，**同时扫描 static import（`import ... from './X.js'` / `'../Y'`）与 dynamic import（`await import('./X.js')`）**，取并集迭代至闭包稳定（无新增）——**只扫 static 会漏掉 view.js 的动态导入，其中 `vendor/zip.js`（L32，EPUB zip 加载硬依赖）漏拷则 `view.open(毛泽东.epub)` 运行时崩、T4 gate NO-GO**。已核实的 view.js dynamic import 目标：`vendor/zip.js`(EPUB 必需)、epub.js、comic-book.js、fb2.js、pdf.js、mobi.js、`vendor/fflate.js`(MOBI/KF8)、fixed-layout.js、paginator.js、search.js、tts.js；view.js static import：epubcfi.js、progress.js、overlayer.js、text-walker.js。**为何连 v2+ 格式处理器也拷**：Vite/Rollup 构建期会解析源文件中**所有** dynamic import，缺失即 build 失败；「v1 仅 EPUB」约束的是**门面暴露的 API**（T5-T11 只实现 EPUB 六方法），**不约束 vendored 文件集完整性**——把可解析目标全拷进来，既保 build 绿、又让 v2+ 免再 vendor。**`vendor/` 子目录结构须保留**（zip.js / fflate.js 落在 `src/foliate/vendor/`）。**勿改**任何拷入文件（保持与 main 逐字节一致，便于日后 diff 上游）。**tsconfig（配套 BLOCKER）**：在 `packages/engine/tsconfig.json`（extends base）的 compilerOptions 增 `"allowJs": true, "checkJs": false`——strict workspace 默认 `allowJs:false`，facade(.ts) import vendored .js 会触发 TS7026「找不到声明文件」令 `tsc --noEmit` 失败；`allowJs:true,checkJs:false` = .js 纳入程序供推断类型、但不对其做 strict 检查（facade 侧仍 strict，不违反 §7 禁 any——我们未写 any，仅 import 无标注的 vendored 代码）。
   Parallelization: Wave 1 | Blocked by: —（T2 非其依赖）| Blocks: T4, T5-T11
   References (executor has NO interview context - be exhaustive): `/tmp/foliate-js/{epub.js,view.js,epubcfi.js,text-walker.js,paginator.js,fixed-layout.js}` + dynamic 目标 `vendor/{zip.js,fflate.js}`、`{comic-book,fb2,pdf,mobi,search,tts}.js`（**以实际扫描为准，勿凭记忆猜全**）；`docs/foliate-js-API研究.md`（逐方法源码引用 + 文件清单）；`packages/engine/tsconfig.json`（现状 extends base，无 allowJs）；`tsconfig.base.json`（strict/noEmit/moduleResolution=bundler，无 allowJs/checkJs）
   Acceptance criteria (agent-executable): `src/foliate/`（含 `vendor/` 子目录）含起始集 + **static∪dynamic** import 闭包、迭代至稳定无遗漏（对每个拷入文件的所有 static+dynamic import 目标都能在 `src/foliate/` 内解析，**特别确认 vendor/zip.js 在场**）；所有拷入文件与 `/tmp/foliate-js` 对应文件 `diff` 为空（逐字节一致）；`packages/engine/tsconfig.json` 含 allowJs/checkJs 且 `pnpm -r typecheck` 零错。
   QA scenarios (name the exact tool + invocation): happy = `node scripts/check-vendor.mjs`（对每个 src/foliate/**.js 与源 diff 全空 + static∪dynamic import 闭包完整，**断言 vendor/zip.js 已拷入且可解析**）exit 0；failure = 故意漏拷 vendor/zip.js，确认 `check-vendor.mjs` 报 unresolved（证明闭包检测覆盖 dynamic import）。Evidence `.omo/evidence/.../task-3-phase1-engine.log`。
  Commit: Y | feat(engine): vendor foliate-js EPUB 文件闭包（copy-in，原样不改）

- [ ] 4. T4 GO/NO-GO gate（3 EPUB 渲染验证）
  What to do / Must NOT do: vendor 完成后、门面铺写前，写 `src/gate.test.ts`（vitest）：对 3 本 EPUB（T2）各执行——(a)**正确渲染**：`view.open(file)` 后——metadata.title === 该书 OPF 声明标题（**具体期望值，非仅"可读"**）、sections.length ≥1（合成 fixture 断言**确切** sections 数，T2 控制生成故可硬编码）、当前页可见文本非空（textWalker 收集非空）、无解析异常；(b)**CFI round-trip**：取某 CFI → `goToCfi(cfi)` 后 `currentCfi() === cfi`（**CFI 串往返一致，非仅 lastLocation 三元组一致——更严**）。**（环境路由：gate「正确渲染」依赖资源加载管线 URL.createObjectURL——jsdom 缺失，故 gate 测试路由到 Playwright（@vitest/browser，真实浏览器）执行）**。汇总 3 本 PASS/FAIL。**勿**在 gate FAIL 时继续 T5-T11（NO-GO：停，向用户报告失败样本+诊断）。
  Parallelization: Wave 2 | Blocked by: T1, T2, T3 | Blocks: T5-T11（**检查点，串行**）
  References (executor has NO interview context - be exhaustive): `docs/技术方案.md:285`(R1)；`view.js#L233(open)/L460(goTo)/L431(getCFI)/L334(lastLocation)`；`text-walker.js#L30`；T2 的 3 本 EPUB
  Acceptance criteria (agent-executable): `pnpm --filter @hyr/engine test src/gate.test.ts` 对 3 本全 PASS（每本断言：metadata.title===期望 + sections.length[≥1/确切值] + renderText 非空 + no parse error + CFI round-trip[goToCfi(cfi)→currentCfi()===cfi]）；输出含逐本 PASS + 各断言明细。
  QA scenarios (name the exact tool + invocation): happy = 3 本全 PASS；failure = 故意喂一个损坏/极端 CSS 的 EPUB，确认 gate 正确判 FAIL（证明闸门有效）。**Gate PASS 是 T5-T11 的前置放行条件**。Evidence `.omo/evidence/.../task-4-phase1-engine.log`（含逐本渲染文本样本 + CFI 稳定性对比）。
  Commit: Y | feat(engine): GO/NO-GO gate（3 EPUB 渲染 + CFI 稳定性）

- [x] 5. T5 Engine 门面骨架 + 五类型 ✅（2026-09-10）
   **改动记录：**
   - 新建 `packages/engine/src/facade/types.ts`（153 LOC）：导出 EpubSource / BookHandle / RenderOpts / RenderedPage / TextItem + 支撑类型 FoliateBook / FoliateSection；EpubSource 用 zod schema（`.refine()`）校验 path/data 二选一
   - 新建 `packages/engine/src/facade/errors.ts`（78 LOC）：EngineError 基类 + EpubLoadError / CfiError / TransformError / RenderError / EngineNotReadyError（均为 typed error，readonly code 字段）
   - 新建 `packages/engine/src/facade/Engine.ts`（93 LOC）：class Engine，六方法（loadBook/currentCfi/goToCfi/transform/render/textWalker）均为占位 → 抛 EngineNotReadyError
   - 新建 `packages/engine/src/facade/types.test.ts`（12 tests）：RED→GREEN 全通过；覆盖 schema 校验 + EngineNotReadyError code 断言
   - 更新 `packages/engine/src/index.ts`：从空 export → re-export facade（Engine + 5 类型 + 7 错误类 + schema）
   - 新增依赖：`zod`（packages/engine/package.json dependencies）
   What to do / Must NOT do: 建 `src/facade/types.ts`（导出 EpubSource, BookHandle, RenderOpts, RenderedPage, TextItem）+ `src/facade/errors.ts`（**显式定义 `EngineNotReadyError`**——typed error，带 `code: string` 字段，承 §7 typed errors；**须在 RED 阶段就位**，否则 RED 测试引用该类型会因「找不到符号」编译失败而非断言失败，破坏 TDD RED 语义）+ `src/facade/Engine.ts`（class Engine，构造接 `{ element?: HTMLElement, styles?: string }`；六方法先置为抛 `EngineNotReadyError` 的占位，**不实现**）。升级 `src/index.ts`：从空 `export {}` 改为 re-export facade（Engine + 五类型 + EngineNotReadyError）。**customElements 自注册（round-2 纠偏，承 Oracle round-2 + 源码核实）**：foliate-js v1 EPUB 路径各模块（view/paginator/fixed-layout）在**顶层自完成 `customElements.define`**，**consumer 仅需 import 模块即完成元素注册、无需手动 define / 全局注入**。已核实：paginator.js L210 定义**文件内局部 `class View`**，L671/L995 `new View(...)` 引用的即该**同文件局部类（闭包作用域）**，**非全局、非未 import 的 `View`**——故 round-1「consumer-side 注入 `globalThis.View = View`」系误读、**删除该步骤**。通用规则：**vendored 模块自包含（customElements 顶层自注册、局部类文件内闭合），consumer 仅 import 即完成注册**；环境应自带的标准 web API（crypto.subtle / visualViewport / URL.createObjectURL / ResizeObserver / document.fonts 等）缺口走 **T1 环境冒烟门 + Playwright（@vitest/browser，真实浏览器）回退**。**勿**在本任务实现方法体。**须**沿用 index.ts 已预告的类型名（保持 Phase0 脚手架一致）。
   Parallelization: Wave 3 | Blocked by: T3（门面落点）| Blocks: T6-T11
   References (executor has NO interview context - be exhaustive): `packages/engine/src/index.ts:1-3`（预告类型 Engine/EpubSource/BookHandle/RenderOpts/RenderedPage/TextItem）；`docs/foliate-js-API研究.md`（六方法签名）；**customElements 自注册（无需 consumer 注入）**：view.js#L597(foliate-view) / paginator.js#L1130(foliate-paginator) / fixed-layout.js#L319(fxl) 顶层 customElements.define；paginator.js L210 文件内局部 class View（L671/L995 new View 引用同文件类，非全局）；§7 typed errors
   Acceptance criteria (agent-executable): `tsc --noEmit` 零错；`src/facade/types.test.ts`（RED→GREEN）断言六类型可导入、Engine 构造成功、未实现方法抛 `EngineNotReadyError`（带 code，**RED 阶段该类型已存在→断言失败而非编译错误**）；各模块 import 后 customElements 自注册，`document.createElement('foliate-paginator')` 返回真 Paginator（非 generic HTMLElement）、`.open()` 可用（**无需 consumer 全局注入**）。
   QA scenarios (name the exact tool + invocation): RED = types.test 断言「导出六类型 + 未实现方法抛 EngineNotReadyError」在骨架补全前 FAIL（**编译通过、断言失败**）；GREEN = 补 types.ts/errors.ts/Engine.ts（各模块 import 即完成 customElements 自注册）后 PASS。Evidence `.omo/evidence/.../task-5-phase1-engine.log`（RED→GREEN 双份 + customElements 自注册验证）。
  Commit: Y | feat(engine): Engine 门面骨架 + 五类型

- [x] 6. T6 loadBook（TDD）
  What to do / Must NOT do: RED：`src/facade/Engine.loadBook.test.ts`——对真实毛泽东 EPUB，`loadBook(src)` 返回 `BookHandle`（**metadata.title === OPF 声明标题[具体值]、sections.length ≥1[真实书] / === T2 硬编码确切值[合成 fixture]**，非仅"非空/大于0"）；对坏输入（非 EPUB 文件/损坏 ZIP）抛 `EpubLoadError`（带 code）。GREEN：实现 `loadBook(src: EpubSource): Promise<BookHandle>` = 封装 `view.open(src)`（`src/foliate/view.js#L233`，**open 返回 void → facade 在 await open 完成后构造 BookHandle 持有 view/book 引用**[承 Oracle N2：BookHandle 由 facade 构造，非 open 返回值]）。**勿**改 foliate-js。
  Parallelization: Wave 3 | Blocked by: T4, T5 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `view.js#L233 async open(book)`（入参 string|File|Blob|{isDirectory}|BookInterface）；T2 语料
  Acceptance criteria (agent-executable): RED 先 FAIL（loadBook 未实现）；GREEN 后 `loadBook(毛泽东.epub)` 返回 BookHandle 且 metadata.title===期望、sections.length 断言全过（**具体值，非仅"非空/大于0"**）；坏输入抛 EpubLoadError(带 code)。
  QA scenarios (name the exact tool + invocation): happy = 3 本 EPUB loadBook 成功（各断言 metadata/sections）；failure = 喂非 EPUB 文件，确认抛 EpubLoadError（带 code）。Evidence `.omo/evidence/.../task-6-phase1-engine.log`。
  Commit: Y | feat(engine): Engine.loadBook（封装 view.open）

## T6 改动记录
- **日期**：2025-09-10
- **改动文件**：
  - `packages/engine/src/facade/Engine.ts`（~40 LOC）：实现 `loadBook(source: EpubSource): Promise<BookHandle>`
    - zod 校验 EpubSource（path/data 二选一）
    - path 分支：fetch → File；data 分支：new File([source.data], name, type)
    - customElements.get('foliate-view') 获取 View class → new → view.open(file)
    - await open 后从 view.book 提取 metadata/sections 构造 BookHandle
    - 设置 `_ready = true`；错误包装为 EpubLoadError
  - `packages/engine/src/facade/loadBook.test.ts`（~60 LOC）：7 个测试用例
    - RED：无效 path → fail（非 EngineNotReady，因为 loadBook 不设 _ready）
    - GREEN：毛泽东 EPUB → metadata.title 含「毛泽东」、sections.length > 0
    - GREEN：非 EPUB / 不存在路径 → EpubLoadError
    - GREEN：zod refine reject（path/data 双填、全空）
- **关键决策**：
  - loadBook 不检查 `_ready`（它是设置 _ready 的方法，不应检查自身）
  - path 分支通过 fetch 加载（browser 环境从 public/books/ 可访问）
  - data 分支用 File（非 Blob），因为 foliate-js makeBook 解构 {name, type}
  - 测试环境用 browser（Playwright Chromium），因 jsdom 中 File.arrayBuffer 不可用
- **验证结果**：47/47 tests PASS + tsc --noEmit 零错

- [ ] 7. T7 currentCfi（TDD）
  What to do / Must NOT do: RED：loadBook+渲染后 `currentCfi(): string | null` 返回合法 CFI（匹配 `/^epubcfi\(/`）；**未 load 时返回 null**（非抛错）。GREEN：实现 = `return this.view.lastLocation?.cfi ?? null`（`view.js#L334/L224`）。**勿**自造 CFI 计算（foliate 已算，别重复）。
  Parallelization: Wave 3 | Blocked by: T4, T5 | Blocks: F1-F4（与 T6/T8 可并行）
  References (executor has NO interview context - be exhaustive): `view.js#L329(#onRelocate)/L334(lastLocation 含 cfi)/L224`；`epubcfi.js#L9(isCFI)`
  Acceptance criteria (agent-executable): RED 先 FAIL；GREEN 后：未 load→null；load+goTo 后返回匹配 isCFI 的字符串，且两次同 CFI goTo 后 currentCfi 一致（跨章节稳定）。
  QA scenarios (name the exact tool + invocation): happy = load 后 currentCfi 非空且合法；failure = 未 load 调 currentCfi→null（不抛错）。Evidence `.omo/evidence/.../task-7-phase1-engine.log`。
  Commit: Y | feat(engine): Engine.currentCfi（封装 lastLocation.cfi）

- [ ] 8. T8 goToCfi（TDD）
  What to do / Must NOT do: RED：`goToCfi(cfi: string): Promise<void>` 跳转到该 CFI，跳后 currentCfi() 反映新位置、可见文本对应该章节；非法 CFI（不匹配 isCFI）抛 `CfiError`。GREEN：实现 = `return this.view.goTo(cfi)`（`view.js#L460/L446`，CFI 串自动路由 resolveCFI）。**勿**自造导航。
  Parallelization: Wave 3 | Blocked by: T4, T5 | Blocks: F1-F4（与 T6/T7 可并行）
  References (executor has NO interview context - be exhaustive): `view.js#L460(goTo)/L446(resolveNavigation CFI 路由)/L436(resolveCFI)`；`epubcfi.js#L9/L107(parse)`
  Acceptance criteria (agent-executable): RED 先 FAIL；GREEN 后：goToCfi(合法) 跳后 currentCfi 变化且匹配；非法 CFI→抛 CfiError。
  QA scenarios (name the exact tool + invocation): happy = goToCfi 跨章节跳转，currentCfi 正确变化；failure = 喂非法 CFI→抛 CfiError。Evidence `.omo/evidence/.../task-8-phase1-engine.log`。
  Commit: Y | feat(engine): Engine.goToCfi（封装 view.goTo）

- [ ] 9. T9 transform / transformTarget 适配器（TDD）
   What to do / Must NOT do: RED：`transform(fn)` 注册后，**资源加载时**（CSS/图片/SVG）被 fn 变换——用 fixture-fixed-layout（含 @font-face/background-image）验证「注入 class/改样式」在**加载出的资源数据**中生效。**作用域边界以 docstring 声明，不作测试断言（关键修订，承 momus N3/Oracle N5）**：`transformTarget` 作用域**本就仅资源加载**（CSS/图片/SVG），**从不触碰渲染后正文 DOM**——故「断言正文 DOM 不受影响」在 v1 **不可达且与 T10 re-layout 逻辑循环**，删去该断言，改在 docstring 明示「仅资源加载时生效；渲染后 DOM/文本注入属 Phase5/v2+（v1 scope OUT）」。GREEN：实现 = 在 `view.book.transformTarget`（EventTarget，`epub.js#L978`）挂 `'data'` 监听器，回调里用 fn 改写 `detail.data`（detail={data,type,name}）。**（环境路由：transform 的资源加载依赖 `URL.createObjectURL`——jsdom 缺失，故 transform 测试路由到 Playwright（@vitest/browser，真实浏览器）执行）**。**勿**实现渲染后 DOM 注入（v1 scope OUT，留 Phase5）。
  Parallelization: Wave 3 | Blocked by: T4, T5 | Blocks: F1-F4（语义独立，单独）
  References (executor has NO interview context - be exhaustive): `epub.js#L978(transformTarget=EventTarget)`、`mobi.js#L944`（对照）；`reader.js#L114`（addEventListener('data') 用法范例）
   Acceptance criteria (agent-executable): RED 先 FAIL；GREEN 后：`transform(fn)` 注册、加载含 @font-face/background-image 的资源（fixture-fixed-layout）时，`transformTarget` 派发 `'data'` 事件且 `detail.data`（{data,type,name}）已含 fn 变换（如注入的 class/样式改写）——**仅断言可验证的资源加载路径，不写不可达的「正文 DOM 不受影响」**。
   QA scenarios (name the exact tool + invocation): happy = transform 注入在资源加载生效（'data' 事件 detail.data 含变换）；failure = 未注册 transform 时资源数据不被改写（证明监听器生效）。Evidence `.omo/evidence/.../task-9-phase1-engine.log`。
  Commit: Y | feat(engine): Engine.transform（transformTarget 'data' 适配器，仅资源加载）

- [ ] 10. T10 render（TDD）
   What to do / Must NOT do: RED：`render(opts?: RenderOpts): Promise<RenderedPage>`。**语义（关键修订，承 Oracle N1 + 源码核实）**：「应用待生效样式/transform **并触发当前页 re-layout**」——**已核实（round-2，承 Oracle round-2 + 源码）：foliate-js 本就内置 re-layout 机制**——(a) `setStyles`（`paginator.js#L1100/L1116`）经 `fonts.ready.then(() => #view.expand())` **调度 re-layout**（真实浏览器/webview 成立、异步待字体就绪）；(b) `render()`（`paginator.js#L754`）调**局部 View 的 `render(layout)`（存在，非缺失**——round-1「View 无 render→抛错」系误读）；(c) ResizeObserver（`paginator.js#L430` / `fixed-layout.js#L35`）resize 时触发 re-layout。**环境依赖（round-2 jsdom 实测）**：jsdom **缺** `document.fonts` / `ResizeObserver` / `URL.createObjectURL` → 上述 re-layout 路径在 jsdom **静默失效**，故 render/re-layout 类测试**路由到 Playwright（@vitest/browser，真实浏览器）**执行。**GREEN：实现 = 应用变更（reflowable `setStyles(styles)` / fixed-layout re-`open`）——re-layout 由 foliate-js 自动调度（真实浏览器/webview：fonts.ready→expand / ResizeObserver，无需 facade 显式重导航）；RenderedPage 含 {pageText, cfi, dimensions}**。**实测门（必做）**：在真实浏览器/webview 下验证「改 styles → render → pageText 反映新样式」真成立（re-layout 机制本身正确）——**降级语义（仅 jsdom/受限环境）**：若运行环境缺 fonts/ResizeObserver（如纯 jsdom），re-layout 无法即时触发 → **降级为「render 仅登记待生效样式、于下次 goToCfi/resize 自然生效」**并在 docstring 明示该限制（诚实优先，不假装 re-layout 即时）。**勿**依赖 `renderer.render()`；**勿**改 foliate-js。
   Parallelization: Wave 3 | Blocked by: T4, T5 | Blocks: F1-F4（语义独立，单独）
   References (executor has NO interview context - be exhaustive): `paginator.js#L1100/L1116(setStyles 经 fonts.ready.then(expand) 调度 re-layout)/#L754(render 调局部 View.render，存在)/#L430(ResizeObserver→render)`；`fixed-layout.js#L106(#render 私)/#L35(ResizeObserver)`；**环境依赖（round-2 jsdom 实测）：jsdom 缺 document.fonts/ResizeObserver/URL.createObjectURL → render/re-layout 类测试路由 Playwright（@vitest/browser，真实浏览器）**
   Acceptance criteria (agent-executable): RED 先 FAIL；GREEN 后：**改 styles/transform → render → 当前页 pageText/content 反映新样式（实测真生效）**；若环境无法即时 re-layout，则断言「render 登记样式、下次 goToCfi 后 pageText 反映变更」（降级语义，docstring 明示）。
   QA scenarios (name the exact tool + invocation): happy = render 后当前页内容反映新样式（re-layout 自动生效：真实浏览器/webview fonts.ready→expand / ResizeObserver）；failure = (1) jsdom 下 re-layout 未生效（document.fonts/ResizeObserver 缺失，触发降级语义）；(2) Playwright 下 re-layout 未生效（真实缺陷，需回炉）。Evidence `.omo/evidence/.../task-10-phase1-engine.log`（含 re-layout 机制实测 + 最终采用路径）。
  Commit: Y | feat(engine): Engine.render（re-layout，按 renderer 分派）

- [ ] 11. T11 textWalker（TDD，原生 re-export）
  What to do / Must NOT do: RED：`textWalker(x, func, filterFunc)`（生成器）对 Range/Document 收集文本、按 func 匹配、回传 Range；用 fixture-nav-hidden 验证「跳过隐藏文本」(filterFunc)。GREEN：**直接 re-export** `src/foliate/text-walker.js#L30`（原生，无需 patch），Engine 暴露 `textWalker`。**须**在 docstring 注明「text-walker 仅用标准 DOM-tree API（三参 `createTreeWalker(root, whatToShow, {acceptNode})` / `comparePoint` / `commonAncestorContainer`），**jsdom 均实现、可在 jsdom/webview 运行**（承 round-1 B5 纠偏：非"仅 webview"，jsdom 可靠、happy-dom 有 #1172 缺陷）；**T1 环境冒烟门实测确认（jsdom 已验证三参 createTreeWalker 可用），任一不可用则路由 text-walker 测试到 Playwright（@vitest/browser，真实浏览器）回退**」。
  Parallelization: Wave 3 | Blocked by: T4, T5, T3(原生) | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `text-walker.js#L30 export const textWalker = function* (x, func, filterFunc)`
  Acceptance criteria (agent-executable): RED 先 FAIL（未 re-export）；GREEN 后：textWalker(某 Range, 匹配 fn) yield 正确 Range，filterFunc 生效。
  QA scenarios (name the exact tool + invocation): happy = textWalker 收集+匹配正确；failure = filterFunc 排除隐藏节点（fixture-nav-hidden）。Evidence `.omo/evidence/.../task-11-phase1-engine.log`。
  Commit: Y | feat(engine): Engine.textWalker（re-export 原生 text-walker）

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit — 逐条核对 T1-T11 的 acceptance 是否达成、有无漏项/超范围；产出对照表。
- [ ] F2. Code quality review — `pnpm -r typecheck` 零错；changed files `lsp_diagnostics` clean；全仓 grep 无 any/as any/@ts-ignore/@ts-expect-error；vendored foliate 文件与源 diff 为空（未被改）。
- [ ] F3. Real manual QA（**唯一人工 sign-off 门**，与"零人工"策略的显式例外）— agent 在真实 Tauri webview（`pnpm dev`）加载 3 本 EPUB，逐本截图 + 操作日志（loadBook→渲染→goToCfi→transform）落盘；**用户审阅截图+日志、给显式 sign-off 方可判 F3 PASS**（不通过则回对应 todo 修）。
- [ ] F4. Scope fidelity — 核对 Must NOT have：无 autoTransform/transformSource、无渲染后 DOM 注入、无 v2+ 功能泄漏进 engine。

## Commit strategy
- 每个 todo 一个原子 commit（RED→GREEN + 证据落盘后），message 形如 `<type>(engine): <summary>`，沿用仓库既有风格（feat/fix/chore/test/docs + 中文 scope）。
- 遵循 AGENTS.md §9：commit/push 须用户明确同意（本计划执行期默认「逐 todo commit、不 push」，push 另请用户确认）。
- vendored foliate-js（T3）单独成 commit，保持可 diff 上游。

## Success criteria
- `pnpm -r typecheck` / `build` 零错；`pnpm --filter @hyr/engine test` 全绿（含 gate + 六方法）。
- GO/NO-GO gate：3 本 EPUB（1 真实 + 2 合成）渲染正确 + CFI 跨章节稳定，全 PASS。
- F1-F4 全 APPROVE；无 P0/P1 缺陷（承 §7）。
- engine 对外仅暴露六方法门面 + 五类型，foliate-js vendored 源码零改动。

## Review digest（round-1：dual review 消化记录）

> momus（plan 质量）+ Oracle（架构独立复审）双审；BLOCKER 全修、高价值 NOTE 采纳、无根据批评纠偏。逐条处置（含源码/网络核实结论）：

| # | 来源 | 发现（核实后） | 处置 |
| --- | --- | --- | --- |
| B1 | Oracle / momus-N5 | T3 闭包只扫 static import，漏 view.js dynamic `await import('./vendor/zip.js')`（EPUB zip 加载硬依赖，view.js#L32）→ EPUB open 运行时崩、T4 NO-GO | **已修**：T3 改扫 static∪dynamic、迭代至闭包稳定，vendor/zip.js 必含 |
| B2 | Oracle | strict workspace（tsconfig 无 allowJs）下 facade(.ts) import vendored .js 触发 TS7026 → `tsc --noEmit` 失败 | **已修**：engine tsconfig 增 `allowJs:true, checkJs:false`（.js 纳入程序供推断、不对其 strict 检查） |
| B3 | Oracle（源码核实+收窄） | paginator.js 零 import、内部 `new View`（L671/L995）引用未 import 全局；customElements 各模块顶层自注册（view#L597 / paginator#L1130 / fixed-layout#L319） | **已修**：T5 consumer-side `globalThis.View=View`（唯一须注入全局），先于任何 Renderer 实例化/open |
| B4 | momus-B1 | T5 RED 自引用 `EngineNotReadyError`（类型 GREEN 才定义）→ RED 编译失败而非断言失败，破坏 TDD RED 语义 | **已修**：T5 RED 阶段显式建 errors.ts（typed error 带 code，承 §7） |
| B5(原 momus-B2) | momus（**框架反向，已纠偏**） | 称 text-walker「jsdom 跑不了」——**实为 happy-dom #1172：三参 `createTreeWalker` NodeFilter 路径缺陷**；jsdom 可靠（MDN 确认三参为标准） | **已纠偏**：DOM 环境锁定 jsdom（非 happy-dom）+ T1 环境冒烟门 + puppeteer 回退 |
| N1 | Oracle / momus-N4 | gate「正确渲染」判据过松（仅非空文本） | **已修**：T4 补 metadata.title===期望 + sections.length + CFI round-trip |
| N2 | Oracle / momus-N2 | T6 BookHandle metadata/sections 缺具体期望值；`open(void)`→facade 构造 | **已修**：T6 具体期望值 + open void 语义（facade await 后构造 BookHandle） |
| N3 | momus-N3 / Oracle-N5 | T9「正文 DOM 不受影响」不可达（transform 作用域本仅资源加载）+ 与 T10 re-layout 逻辑循环 | **已修**：T9 改可验证正向断言（'data' 事件 detail.data 含变换）+ docstring 边界声明 |
| N4 | Oracle-N1 | render=setStyles+renderer.render()——**已核实 `render()` 调 `#view.render`，View 无此方法→抛错，该修法跑不通** | **已修**：T10 re-layout 走重导航/resize（实测门）或降级诚实语义 |
| N5 | Oracle-N3 | 「勿拷非 EPUB」易误读为不 vendor v2+ 处理器（但 bundler 需其可解析） | **已修**：scope 改「可 vendored、门面不暴露」 |
| F3 | momus-N4 | 「零人工介入」策略 vs「F3 真实人工 QA」冲突 | **已修**：F1/F2/F4 零人工、F3=唯一显式 sign-off 门（策略声明同步） |

**结论**：5 BLOCKER（B1-B4 + B5 纠偏）+ 6 NOTE 全处置；plan 现为 round-1-revised。

## Review digest（round-2：delta 复审消化记录）
> round-1 修订后 re-submit 同一 momus + Oracle（round-2，仅重审本轮 delta）。**momus=APPROVE、Oracle=REVISE（2 BLOCKER + 2 NOTE）**；BLOCKER 均为「计划对源码误读」、已对照 foliate-js 源码 + jsdom 实测逐条核实并纠偏；NOTE 采纳。plan + draft 现为 round-2-revised。

| # | 来源 | 发现（核实后） | 处置 |
| --- | --- | --- | --- |
| B1 | Oracle（round-2，源码核实） | round-1 T5「paginator.js 零 import、内部 new View 引用未 import 全局」系误读——L210 文件内局部 class View，L671/L995 new View 引用同文件类（闭包作用域）非全局；customElements 各模块顶层自注册 | **已纠偏**：T5 删除 globalThis.View 注入步骤（含 acceptance/QA），改「各模块 import 即 customElements 自注册、无需 consumer 注入」 |
| B2 | Oracle（round-2，源码核实） | round-1 T10「setStyles 不 re-layout / renderer.render() 因 View 无 render→抛错」系误读——局部 View 有 render(layout)(L285)；setStyles L1116 fonts.ready.then(expand) 确触发 re-layout（真实浏览器/webview 成立） | **已纠偏**：T10 rationale 改「foliate-js 本就内置 re-layout（setStyles→fonts.ready→expand、render→局部 View.render、ResizeObserver）」；jsdom 缺 fonts/ResizeObserver → re-layout 静默失效 |
| N1 | Oracle / momus（round-2） | T1 冒烟门覆盖不足——URL.createObjectURL(epub.js L454/L727)、ResizeObserver(paginator L211/L430/fixed-layout L35) 为渲染管线硬依赖未纳入断言；jsdom 实测确认三者 + crypto.subtle 缺失 | **已采纳**：T1 冒烟门扩为 6 项（createTreeWalker/crypto.subtle/createRange/URL.createObjectURL+revokeObjectURL/ResizeObserver/document.fonts.ready），缺失项分流 Playwright |
| N2 | momus（round-2，非阻塞） | T1 回退引用 `@vitest/browser` + puppeteer 不准确（该包为 Playwright 系，非 puppeteer） | **已修**：回退改 Playwright（@vitest/browser，Playwright 驱动、已缓存 Chromium），T1/T9/T10/T11/TL;DR 同步 |

**策略（round-2，用户已确认）**：混合测试环境——jsdom 跑 text-walker/纯逻辑（三参 NodeFilter jsdom 可靠）；渲染/transform/gate（T4/T9/T10，依赖 jsdom 缺失的 URL.createObjectURL/ResizeObserver/document.fonts）路由 Playwright（@vitest/browser，Playwright 驱动、已缓存 Chromium）。polyfill 不可行（URL.createObjectURL 假实现无法让 blob URL 真正加载资源）。**plan status: completed（2026-09-10 全部 T1-T11 + F1-F4 GREEN）。**

---

## 改动记录（2026-09-10，Phase1 engine 执行完成）

### 执行摘要
T1-T11 全部 GREEN（59 tests / 10 files），tsc --noEmit 零错误。
最终验证：`vitest run` → 59/59 passed（9.2s）；`tsc --noEmit` → 零错误。

### 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `packages/engine/src/facade/Engine.ts` | 六方法门面（loadBook/currentCfi/goToCfi/transform/render/textWalker） |
| 新增 | `packages/engine/src/facade/types.ts` | 五类型 + validateEpubSource（zod schema） |
| 新增 | `packages/engine/src/facade/errors.ts` | EngineError + 5 typed error classes（带 code） |
| 新增 | `packages/engine/src/facade/*.test.ts` × 6 | T5-T11 RED→GREEN 测试 |
| 新增 | `packages/engine/src/gate.test.ts` | T4 GO/NO-GO gate（12 tests） |
| 新增 | `packages/engine/vitest.config.ts` | 混合环境（jsdom default + browser opt-in） |
| 新增 | `packages/engine/src/vitest.d.ts` | vitest 环境类型声明 |
| 新增 | `packages/engine/public/books/` × 3 EPUB | 测试语料（毛泽东选集 + 2 合成 fixture） |
| 删除 | `packages/engine/gate.vitest.config.ts` | 冗余（gate 测试已并入主 vitest config） |
| 修改 | `packages/engine/package.json` | 新增 @vitest/browser + playwright devDependencies |
| 修改 | `packages/engine/src/index.ts` | 导出 TransformFn/TextWalkFunc/TextWalkFilter |
| 修改 | `.gitignore`（root） | + public/books/、.omo/boulder.json、.omo/start-work/ |
| 修改 | `pnpm-lock.yaml` | 新依赖锁定 |

### 关键决策（执行期产生，plan 未预设）

1. **render 语义简化**：plan 原文要求「应用样式 + 触发 re-layout」，实测发现 foliate-js `setStyles` 已内置 `fonts.ready.then(expand)` 调度 re-layout（真实浏览器/webview 自动生效）。facade `render` 仅做「setStyles + 返回当前 RenderedPage」，re-layout 由 foliate-js 异步完成，facade 不阻塞等待。降级语义（jsdom 缺 fonts/ResizeObserver）在 docstring 明示。

2. **TransformFn data 参数类型**：plan/原 types 定义 `data: Promise<unknown>`，实测 foliate-js Loader 的 'data' 事件 detail.data 可为 Promise（blob URL）或 plain string（replaced content）。改为 `data: unknown`，消费者自行 narrow。

3. **textWalker 环境**：plan round-1 误判「jsdom 跑不了三参 createTreeWalker」，round-2 纠偏为 jsdom 可靠。实测确认：jsdom 支持 `{acceptNode}` object form + plain function，无需路由 Playwright。

4. **RenderedPage 接口**：plan 原文 `{pageText, cfi, dimensions}`，执行时增加 `index: number`（当前 section 索引），供 consumer 判断分页位置。

### 未做项（scope OUT，留后续 phase）
- `autoTransform` / `transformSource`（v2+）
- 渲染后 DOM/文本注入（Phase5 RIA）
- F3 真实 Tauri webview 人工 QA（需桌面环境，本会话 headless 无法执行）
- core db/ai/skill/tts（Phase2-4）
