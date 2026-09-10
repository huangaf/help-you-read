---
slug: phase1-engine
status: approved（round-1+round-2 dual review 已 completed+消化，plan + draft 已修订：混合测试环境策略[用户确认] + T5/T10 误读纠偏 + 冒烟门扩充；用户已批准，待交 worker 执行）
intent: clear
review_required: true
plan_path: .omo/plans/phase1-engine.md
plan_sha256: null（round-2 提交前重算）
review_round_id: round-2（completed+digested；round-1 亦 completed+digested）
pending-action: round-1 + round-2 dual review（momus+Oracle）已 completed 并消化；plan + draft 现为 approved（混合测试环境策略[用户确认] + T5/T10 误读纠偏 + 冒烟门扩充）。**下一步：交 worker 会话执行（$start-work，读 .omo/plans/phase1-engine.md）；执行期逐 todo commit、不 push（承 AGENTS §9），push 另请确认**
review:
  momus:
    status: completed（round-1）
    workspace_root: /home/huangaf/projects/help-you-read
    runtime_home: null
    target: .omo/plans/phase1-engine.md
    round_id: round-1
    plan_sha256: null（round-1 提交时未记录）
    launch_id: bg_12b4081e
    session: ses_f80f0484dffeH8UqT6CVrKWdhu
    result: 2 BLOCKER（B1 T5 RED 自引用 EngineNotReadyError；B2 textWalker/jsdom[已纠偏]）+ 6 NOTE（gate 判据过松、BookHandle 缺具体值、T9 正文 DOM 不可达、F3 零人工冲突、T3 dynamic import、render 语义）——全消化，见 plan Review digest
  independent:
    status: completed（round-1）
    workspace_root: /home/huangaf/projects/help-you-read
    runtime_home: null
    target: .omo/plans/phase1-engine.md
    round_id: round-1
    plan_sha256: null（round-1 提交时未记录）
    launch_id: bg_7dfd5142
    session: ses_f80ed41b3ffeLkBhpy30CixZ8b
    result: 3 BLOCKER（B1 dynamic import 漏 vendor/zip.js；B2 allowJs；B3 globalThis.View[已收窄]）+ 6 NOTE（render=open-void、scope-creep、gate CFI round-trip、T9 jsdom 盲区）——全消化，见 plan Review digest
approach: 在 @hyr/engine vendor foliate-js（from main@78914aef）+ 叠加「门面适配器」层（非源码级 patch），暴露 Engine 六方法 loadBook/render/currentCfi/goToCfi/transform/textWalker。全量 facade 之前先过 R1 GO/NO-GO gate：3 本 EPUB（1 真实毛泽东 + 2 合成）渲染验证通过才全面铺 facade。TDD：每个门面方法先 RED 再 GREEN，surface=真实/合成 EPUB 渲染。
---

# Draft: phase1-engine

## Components (topology ledger)
<!-- id | outcome（一句话）| status: active|deferred | evidence path -->

- **C0 测试基建** | `@hyr/engine` 接入 vitest（test script + config），支撑 TDD | active | `packages/engine/package.json`（现无 test 脚本）、`vitest.config.ts`
- **C1 vendor foliate-js** | 把 `johnfactotum/foliate-js@main(78914aef)` 的 EPUB 相关文件落到 `src/foliate/`，原样不改 | active（**已定：copy-in**，承 round-1；配套 `tsconfig allowJs:true,checkJs:false`）| 源 `/tmp/foliate-js/{epub.js,view.js,epubcfi.js,text-walker.js,paginator.js,fixed-layout.js,...}`
- **C2 门面适配器层** | `src/patch/`（或 `src/facade/`）新增 Engine 门面：6 方法薄封装/适配器，**不改 foliate-js 源码** | active（gate 通过后铺）| 已验证：open(233)/getCFI(431)/goTo(460) 公开、transformTarget=EventTarget(epub.js:978)、textWalker 原生
- **C3 GO/NO-GO gate** | vendor 后、facade 前，抽 3 本 EPUB（1 真实+2 合成）验证「正确渲染 + CFI 跨章节稳定」，通过才全面铺 facade | active（前置 gate）| `docs/技术方案.md:285`(R1)
- **C4 回归语料** | 3 本 EPUB = 现有 `毛泽东选集`（真实）+ 2 本合成 fixture（受控复杂 CSS / NAV / 隐藏文本）| active | `books/`（现仅 1 本真实）、用户已定「混合」策略
- **C5 门面类型** | index.ts 注释已预告：`Engine/EpubSource/BookHandle/RenderOpts/RenderedPage/TextItem`，facade 沿用它命名 | active | `packages/engine/src/index.ts:1-3`

## Open assumptions (announced defaults)
<!-- assumption | adopted default | rationale | reversible? -->

- **render 语义**（round-1 修订，承 Oracle N1 + 源码核实）：**已核实两条朴素修法均不成立**——(a) `setStyles`（paginator.js#L1100）本身不 re-layout 当前页，仅存 #styles、下次导航/resize 才生效；(b) `renderer.render()`（paginator.js#L754）调 `this.#view.render(...)` 而 View 类无 render 方法→抛错，不可依赖。故 re-layout 走**重导航到当前位置（goTo(currentCfi)）或容器 resize 触发 ResizeObserver**；jsdom/webview 实测门验证，若环境无法即时 re-layout 则降级为「render 仅登记待生效样式、于下次导航自然生效」并 docstring 明示。 | default：按此（重导航/resize + 实测门 + 降级）实现 render，不依赖 renderer.render() | 规避 View 无 render / setStyles 不即时 re-layout 的脆弱性（round-1 核实）| reversible
- **facade 类型命名**：沿用 index.ts 已预告的 `EpubSource/BookHandle/RenderOpts/RenderedPage/TextItem`，不另造名。 | default：沿用 scaffold 已承诺的类型名 | 保持 Phase0 脚手架一致性，降低下游（Phase2+）认知成本 | reversible
- **GO/NO-GO gate 判据**（round-1 修订，承 momus N4 / Oracle N4）：「正确渲染」= metadata.title === OPF 声明标题 + sections.length ≥1（合成 fixture 断言确切值）+ 当前页可见文本非空 + 无解析异常；「CFI round-trip」= goToCfi(cfi) → currentCfi() === cfi（**CFI 串往返一致，非仅 lastLocation 三元组——更严**）。 | default：以此判据（含具体期望值）+ PASS/FAIL 可观测 + 逐本明细 | R1 要求「验证渲染」，需 binary observable；判据须可验证、非仅「非空」 | reversible
- **TDD**：每个门面方法先写失败测试（RED）再实现（GREEN），承 AGENTS.md §8。 | default：严格 TDD，无豁免 | 项目硬规则 | —

## Findings (cited - path:lines)
- **engine 现状 = 纯脚手架，零实现**（explore `bg_202a3138`）：`package.json`(仅 typecheck script、无 test/build/运行时依赖) + `tsconfig.json`(extends base, strict/noEmit)；`src/index.ts` 空 `export {}`（注释预告 Phase1 API）；`src/foliate/`、`src/patch/` 均空 `.gitkeep`；无 test/vitest/README。→ Phase1 从近乎空白起步，需同时补 vendor + facade + test 基建。
- **语料缺口**（`books/`）：仅 1 本真实 EPUB `毛泽东选集一至七卷 (Z-Library).epub`（2.9MB 超大卷本），无「含复杂 CSS 的小体量真实 EPUB」。R1 gate（`docs/技术方案.md:285`）需 3 本 → **混合策略（用户已定）**：1 真实 + 2 合成。
- **foliate-js API 映射**（librarian `bg_7105eebe`，已独立抽验）：参考 `johnfactotum/foliate-js@main(78914aef)`（已 git fetch 确认与远端一致，非 npm@1.0.1）。主门面 `view.js`（View extends HTMLElement）+ 各格式 book + CFI 路由。
  - loadBook：❌ 非原生（Foliate app 概念）→ facade 薄封装 `view.open(src)`（[view.js#L233]）
   - render：⚠️ **round-2 纠偏（承 Oracle round-2 + 源码核实）**——foliate-js **本就内置 re-layout 机制**：(a) `setStyles`（[paginator.js#L1100/L1116]）经 `fonts.ready.then(() => #view.expand())` 调度 re-layout（真实浏览器/webview 成立、异步待字体就绪）；(b) `render()`（[paginator.js#L754]）调**局部 View 的 render(layout)（存在，非缺失**——round-1「View 无 render→抛错」系误读）；(c) ResizeObserver（[paginator.js#L430] / [fixed-layout.js#L35]）resize 触发 re-layout。**环境依赖（round-2 jsdom 实测）**：jsdom **缺** document.fonts/ResizeObserver/URL.createObjectURL → re-layout 路径在 jsdom 静默失效，故 render/re-layout 测试**路由 Playwright（@vitest/browser，真实浏览器）**；受限环境降级为「render 仅登记待生效样式、于下次导航自然生效」
  - currentCfi：❌ 无同名 getter，能力原生 → `view.lastLocation?.cfi ?? null`（[view.js#L233/334/431]，load 前为 null）
  - goToCfi：❌ 无同名方法，能力原生 → `view.goTo(cfi)`（[view.js#L460/446]，CFI 串自动路由 resolveCFI）
  - transform/transformTarget：⚠️ 语义陷阱（EventTarget 属性非函数 [epub.js#L978]；作用域仅资源加载，非渲染后 DOM）→ 适配器挂 'data' 监听器改写 detail.data
  - textWalker：✅ 完全原生 → re-export（[text-walker.js#L30]）。**round-1 纠偏**：用标准 DOM-tree API（三参 createTreeWalker NodeFilter / comparePoint / commonAncestorContainer），**jsdom 均实现、可在 jsdom/webview 运行**——原「须 webview/JS 侧」系误判（实为 happy-dom #1172 三参 NodeFilter 缺陷，jsdom 可靠）→ DOM 环境：text-walker/纯逻辑用 jsdom（三参 NodeFilter jsdom 可靠），渲染/transform/gate 路由 Playwright（@vitest/browser，真实浏览器）+ T1 冒烟门实测
- **三个必须纠正的朴素假设**（Phase1 最易踩坑）：① `transformTarget(target, transform)` 错（实为 EventTarget 挂 'data'）；② transformTarget 作用域仅资源加载，改不了渲染后文本/DOM（那是 textWalker/post-load 的活）；③ currentCfi/goToCfi 非独立 API（派生值 / goTo 自动路由）。
- **全局风险**：foliate-js README 自述 *"not stable, expect it to break"* → 所有「稳定」为相对说法；**已定：copy-in（from main@78914aef）+ 门面适配器层（非源码级 patch）**，勿 npm@1.0.1（缺 transformSource/textWalker 且冻结）。**round-2 补充风险面**：(a) vendored .js 在 strict TS workspace 需 `allowJs:true,checkJs:false`（否则 TS7026）；(b) **customElements 自注册、无需 consumer 全局注入**（round-2 纠偏：paginator.js L210 文件内局部 class View，L671/L995 new View 引用同文件类非全局）；(c) jsdom web API 缺口（**实测确认缺失**：crypto.subtle / URL.createObjectURL / ResizeObserver / document.fonts；**可用**：createTreeWalker 三参 / EventTarget+CustomEvent / Blob / MutationObserver）→ T1 环境冒烟门 + Playwright（@vitest/browser，真实浏览器）回退。
- **完整研究报告**：`docs/foliate-js-API研究.md`（244 行，librarian 产出）。

## Decisions (with rationale)
- **D1 vendor-from-main**（已锁定，承 AGENTS.md §4）：从 `johnfactotum/foliate-js@main(78914aef)` vendor，拒绝冻结的 npm@1.0.1（缺 transformSource/textWalker）。
- **无源码级 patch**（已独立验证）：6 方法中 4 个薄封装/适配器 + 1 原生(textWalker) + 1 避免(render)。→ **patch 层 = 门面适配器，不改 foliate-js 内部源码**。显著降低 Phase1 风险（R1 缓解）。
- **K1 facade 暴露范围**（已锁定，承 `docs/技术方案.md:280`；round-1 修订）：v1 facade **仅暴露** transform + CFI + textWalker（六方法中的 v1 子集）；autoTransform/transformSource **v1 门面不暴露**（fork 定制，其依赖源随 v1 vendored 闭包可存在、但 facade 不实现/不暴露），按需 v2+。
- **GO/NO-GO gate 前置**（承 R1）：vendor 后、facade 前，3 本 EPUB 渲染验证通过才全面铺 facade；否则 NO-GO 回炉。
- **（已定）vendoring 机制**：copy-in（from main@78914aef，用户已确认）+ `tsconfig allowJs:true,checkJs:false`（承 round-1 B2）+ 完整 static∪dynamic import 闭包（含 vendor/zip.js，承 round-1 B1）。**不再是 open question**。

## Scope IN
- `@hyr/engine`：vitest 测试基建 + vendored foliate-js（from main）+ 门面适配器层。
- Engine 六方法：`loadBook` / `render` / `currentCfi` / `goToCfi` / `transform`(=transformTarget 适配器) / `textWalker`。
- 门面类型：`EpubSource` / `BookHandle` / `RenderOpts` / `RenderedPage` / `TextItem`（沿用 index.ts 预告命名）。
- 回归语料：1 真实(毛泽东) + 2 合成 fixture（复杂 CSS / NAV / 隐藏文本）。
- TDD：每方法先 RED 再 GREEN，surface=真实/合成 EPUB 渲染。
- GO/NO-GO gate：3 本 EPUB 渲染验证通过才全面铺 facade。

## Scope OUT (Must NOT have)
- `autoTransform` / `transformSource`（foliate fork 定制）— **v1 门面不暴露**（其依赖源随 v1 vendored 闭包可存在、但 facade 不实现/不暴露），按需 v2+。
- 渲染后 DOM/文本变换（注入批注标记、删元素）— 非 v1；transformTarget 作用域不含此，留 Phase5(RIA) 或 v2+。
- 其余 7 读书方法（#2/#3/#4/#5/#7）— v2+。
- 跨书知识图谱 / WebDAV 同步增强 / FSRS — v2+。
- PDF / MOBI / DOCX 格式处理器 — **可 vendored（保 T3 bundler import 闭包完整）但门面不暴露**——「v1 仅 EPUB」约束的是 facade 暴露的 API、不约束 vendored 文件集完整性（承 Oracle N3 + T3）；v2+ 再暴露。
- 移动端（非 Tauri）— v2+；v1 仅桌面。
- core 的 db/ai/skill/tts 实现 — Phase2-4，不在本 phase。
- **不改 foliate-js vendored 源码**（只加门面适配器，保持 vendor 原样以便追踪上游）。

## Open questions
- **（已定）回归语料策略**：混合 = 1 真实(毛泽东) + 2 合成 fixture（用户已确认）。
- **（已定）vendoring 机制**：copy-in（把 .js 直接拷进 `src/foliate/`，完全自控、上游更新需手动 re-vendor）——用户已确认；配套 `tsconfig allowJs:true,checkJs:false`（承 round-1 B2）+ 完整 static∪dynamic import 闭包（含 vendor/zip.js，承 round-1 B1）。

## Approval gate
status: round-2-revised（round-1+round-2 dual review 已消化，plan + draft 已修订：混合测试环境策略[用户确认] + T5/T10 误读纠偏 + 冒烟门扩充；待用户最终批准）
<!-- round-1 + round-2 dual review（momus+Oracle）已 completed 并消化（见下方 Round-1/Round-2 digest）；plan + draft 已同步。下一步：待用户最终批准 → status: approved、呈 approval brief、交 worker 执行（$start-work）。 -->

## Round-1 review digest（改动记录）
> round-1 dual review（momus plan 质量 + Oracle 架构独立复审）消化记录。BLOCKER 全修、高价值 NOTE 采纳、无根据批评纠偏；plan + draft 已同步。

| # | 来源 | 发现（核实后） | 处置（plan + draft 已同步） |
| --- | --- | --- | --- |
| B1 | Oracle / momus-N5 | T3 闭包只扫 static import，漏 view.js dynamic `await import('./vendor/zip.js')`（EPUB zip 加载硬依赖，view.js#L32）→ EPUB open 运行时崩、T4 NO-GO | **已修**：T3 改扫 static∪dynamic、迭代至闭包稳定，vendor/zip.js 必含 |
| B2 | Oracle | strict workspace（tsconfig 无 allowJs）下 facade(.ts) import vendored .js 触发 TS7026 → `tsc --noEmit` 失败 | **已修**：engine tsconfig 增 `allowJs:true, checkJs:false`（.js 纳入程序供推断、不对其 strict 检查） |
| B3 | Oracle（round-1；**round-2 已纠偏**） | [round-1] paginator.js 零 import、内部 `new View`（L671/L995）引用未 import 全局 | **round-2 纠偏**：实为 L210 文件内局部 class View，L671/L995 new View 引用同文件类（闭包作用域）非全局；customElements 各模块顶层自注册 → **T5 删除 globalThis.View 注入**（详见 Round-2 digest B1）|
| B4 | momus-B1 | T5 RED 自引用 `EngineNotReadyError`（类型 GREEN 才定义）→ RED 编译失败而非断言失败，破坏 TDD RED 语义 | **已修**：T5 RED 阶段显式建 errors.ts（typed error 带 code，承 §7） |
| B5(原 momus-B2) | momus（**框架反向，已纠偏**） | 称 text-walker「jsdom 跑不了」——实为 happy-dom #1172：三参 `createTreeWalker` NodeFilter 路径缺陷；jsdom 可靠（MDN 确认三参为标准） | **已纠偏**：DOM 环境锁定 jsdom（非 happy-dom）+ T1 环境冒烟门 + puppeteer 回退 |
| N1 | Oracle / momus-N4 | gate「正确渲染」判据过松（仅非空文本） | **已修**：T4 补 metadata.title===期望 + sections.length + CFI round-trip |
| N2 | Oracle / momus-N2 | T6 BookHandle metadata/sections 缺具体期望值；`open(void)`→facade 构造 | **已修**：T6 具体期望值 + open void 语义（facade await 后构造 BookHandle） |
| N3 | momus-N3 / Oracle-N5 | T9「正文 DOM 不受影响」不可达（transform 作用域本仅资源加载）+ 与 T10 re-layout 逻辑循环 | **已修**：T9 改可验证正向断言（'data' 事件 detail.data 含变换）+ docstring 边界声明 |
| N4 | Oracle-N1（round-1；**round-2 已纠偏**） | [round-1] render=setStyles+renderer.render()——「View 无此方法→抛错，该修法跑不通」 | **round-2 纠偏**：局部 View 有 render(layout)(L285)；setStyles L1116 fonts.ready.then(expand) 确触发 re-layout（真实浏览器/webview 成立）→ **T10 rationale 修正**（详见 Round-2 digest B2）|
| N5 | Oracle-N3 | 「勿拷非 EPUB」易误读为不 vendor v2+ 处理器（但 bundler 需其可解析） | **已修**：scope 改「可 vendored、门面不暴露」 |
| F3 | momus-N4 | 「零人工介入」策略 vs「F3 真实人工 QA」冲突 | **已修**：F1/F2/F4 零人工、F3=唯一显式 sign-off 门（策略声明同步） |

**结论**：5 BLOCKER（B1-B4 + B5 纠偏）+ 6 NOTE 全消化；plan + draft 现为 round-1-revised。

## Round-2 review digest（改动记录）
> round-1 修订后 re-submit 同一 momus + Oracle（round-2，仅重审 delta）。**momus=APPROVE、Oracle=REVISE（2 BLOCKER + 2 NOTE）**；BLOCKER 均为「计划对源码误读」、已对照 foliate-js 源码 + jsdom 实测逐条核实并纠偏；NOTE 采纳。plan + draft 现为 round-2-revised。

| # | 来源 | 发现（核实后） | 处置 |
| --- | --- | --- | --- |
| B1 | Oracle（round-2，源码核实） | round-1 T5「paginator.js 零 import、内部 new View 引用未 import 全局」系误读——L210 文件内局部 class View，L671/L995 new View 引用同文件类（闭包作用域）非全局；customElements 各模块顶层自注册 | **已纠偏**：T5 删除 globalThis.View 注入步骤（含 acceptance/QA），改「各模块 import 即 customElements 自注册、无需 consumer 注入」 |
| B2 | Oracle（round-2，源码核实） | round-1 T10「setStyles 不 re-layout / renderer.render() 因 View 无 render→抛错」系误读——局部 View 有 render(layout)(L285)；setStyles L1116 fonts.ready.then(expand) 确触发 re-layout（真实浏览器/webview 成立） | **已纠偏**：T10 rationale 改「foliate-js 本就内置 re-layout（setStyles→fonts.ready→expand、render→局部 View.render、ResizeObserver）」；jsdom 缺 fonts/ResizeObserver → re-layout 静默失效 |
| N1 | Oracle / momus（round-2） | T1 冒烟门覆盖不足——URL.createObjectURL(epub.js L454/L727)、ResizeObserver(paginator L211/L430/fixed-layout L35) 为渲染管线硬依赖未纳入断言；jsdom 实测确认三者 + crypto.subtle 缺失 | **已采纳**：T1 冒烟门扩为 6 项（createTreeWalker/crypto.subtle/createRange/URL.createObjectURL+revokeObjectURL/ResizeObserver/document.fonts.ready），缺失项分流 Playwright |
| N2 | momus（round-2，非阻塞） | T1 回退引用 `@vitest/browser` + puppeteer 不准确（该包为 Playwright 系，非 puppeteer） | **已修**：回退改 Playwright（@vitest/browser，Playwright 驱动、已缓存 Chromium），T1/T9/T10/T11/TL;DR 同步 |

**策略（用户已确认）**：混合测试环境——jsdom 跑 text-walker/纯逻辑（三参 NodeFilter jsdom 可靠）；渲染/transform/gate（T4/T9/T10，依赖 jsdom 缺失的 URL.createObjectURL/ResizeObserver/document.fonts）路由 Playwright（@vitest/browser，Playwright 驱动、已缓存 Chromium）。polyfill 不可行（URL.createObjectURL 假实现无法让 blob URL 真正加载资源）。**待用户最终批准 → plan status: approved、交 worker 执行。**
