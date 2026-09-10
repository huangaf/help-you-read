# foliate-js@main 公开 API 研究（引擎门面 Phase1 输入）

> 访问/核对日期：2026-09-08
> 参考仓库：**`johnfactotum/foliate-js`**（main 分支，**非** npm@1.0.1）
> main HEAD SHA：`78914aef4466eb960965702401634c2cb348e9b1`
> 本地克隆：`/tmp/foliate-js`（main，已 `git fetch` 确认与远端一致，无新提交）
> Permalink base：https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/

## 结论速览（TL;DR）

| 方法 | foliate-js@main 原生存在？ | 稳定性 | Phase1 处置 |
|------|--------------------------|--------|-------------|
| `loadBook` | ❌ 不存在（是 Foliate **app** 层概念，非 foliate-js） | — | 门面建薄封装 → `view.open(book)` |
| `render` | ⚠️ 部分/脆弱（Paginator 有公开无参 `render()`；FixedLayout 为私有 `#render(side)`） | 不稳定（未入文档接口） | **不要**直接调 `renderer.render()`；用 open/goTo + (reflowable) setStyles |
| `currentCfi` | ❌ 无同名 getter，但**能力原生存在**（`getCFI` + `lastLocation.cfi` / `relocate` 事件） | 稳定（核心 View API） | 门面建薄封装 → `view.lastLocation?.cfi` |
| `goToCfi` | ❌ 无同名方法，但**能力原生存在**（`goTo(cfiString)` 自动路由到 `resolveCFI`） | 稳定（核心 View API） | 门面建薄封装 → `view.goTo(cfi)` |
| `transform` / `transformTarget` | ⚠️ **语义陷阱**：`transformTarget` 是 **EventTarget 属性**（非函数）；无独立 `transform` | 稳定（book interface 可选项） | 门面建适配器：在 `book.transformTarget` 上挂 `'data'` 监听器 |
| `textWalker` | ✅ **完全原生**，无需 patch（生成器函数） | 稳定（核心辅助模块） | **直接 import 使用**，无需 patch |

**对 Phase1 的关键战略结论**：6 个方法里 **2 个开箱即用/薄封装**（textWalker、currentCfi）、**1 个薄封装**（goToCfi）、**1 个薄封装**（loadBook→open）、**2 个需注意语义/脆弱性**（transformTarget 是 EventTarget 非函数、render 未文档化）。
→ **验证了决策 D1（vendor-as-is + thin patch layer）**：patch 层主要是**适配器/命名封装**，**无需 fork 修改 foliate-js 内部源码**。这显著降低 Phase1 风险。

> ⚠️ 全局风险（README "Current Status"）：foliate-js 自述 *"not stable, expect it to break and the API to change at any time. Use it at your own risk."* —— 所有"稳定"均为相对说法，建议以 git submodule vendor + 锁 SHA，并保留 patch 层隔离面。

---

## 逐方法详解（含源码引用）

### 1. `loadBook` — ❌ 不存在，需门面封装

**foliate-js@main 中无任何 `loadBook` 方法**（对全部 `*.js` grep 无命中）。
`loadBook` 是 **Foliate 桌面 app**（`johnfactotum/foliate`）的应用层 API，不属于 foliate-js 库。

**原生等价物：`View.open(book)`**
- 源码：[view.js#L233](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L233)；`makeBook` 工厂：[view.js#L79](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L79)
- **精确签名**：`open(book: string | File | Blob | { isDirectory } | BookInterface): Promise<void>`（async）
- **入参语义**：URL/路径字符串、File/Blob 对象（有 `arrayBuffer`）、目录（`isDirectory`），或已实现 "book interface" 的对象。前三种会被 `makeBook()` 归一化为 book；最后一种跳过归一化。
- **稳定性**：稳定/核心 —— 是 README "Basic Usage" 钦定的唯一入口（`await view.open('example.epub')`）。

**判定**：`loadBook` 需**门面建薄封装**：`loadBook(fileOrUrl) { return this.view.open(fileOrUrl) }`。能力原生存在，仅缺命名 → **patch = 薄封装**（非重写）。
- 文档：README "Basic Usage"。

---

### 2. `render` — ⚠️ 部分存在且脆弱，勿直接依赖

**foliate-js@main 的"文档化 renderer 接口"不含 `render`**（README "The Renderers"：接口为 `.open(book)` / `.goTo({index, anchor})` / `.prev()` / `.next()`）。

**实际源码里 `render` 的状态（两 renderer 不对称）：**
- **Paginator（reflowable）**：[paginator.js#L754](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb9609657024016348e9b1/paginator.js#L754) —— **公开、无参** `render()`：
  ```js
  render() {
      if (!this.#view) return
      this.#view.render(this.#beforeRender({ vertical: this.#vertical, rtl: this.#rtl }))
      this.#scrollToAnchor(this.#anchor)
  }
  ```
  → 本质是"重排内部 layout + 滚动回锚点"的**未文档化内部步骤**，恰好是 public。
- **FixedLayout（固定版式）**：[fixed-layout.js#L106](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/fixed-layout.js#L106) —— **私有** `#render(side)`（带 `side` 参数）。

**语义 vs 朴素假设的差异（flag）**：
- 朴素假设"render(options)"是**错的**。真实语义：**初次渲染发生在 `open()` 内部隐式完成**；改样式/transform 后的重排走**文档化**的 `setStyles(styles)`（触发 relocate→重渲染）。
- **`setStyles` 仅存在于 reflowable Paginator**：[paginator.js#L1100](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/paginator.js#L1100)；**FixedLayout 无 `setStyles`**（grep 无命中）。跨 renderer 不统一。

**判定**：**不要**在门面里暴露一个直调 `renderer.render()` 的 `render`（脆弱、依赖具体 renderer）。渲染在 open/goTo 中隐式完成；重排用 `setStyles`（仅 reflowable）或重新 `open`。若门面**必须**有 `render` 动词，应实现为"应用待生效的样式/transform 变更并重排"——**由我们 patch 实现**，在可用时委托 `setStyles`。
- **flag：语义偏差 + 脆弱性**。

---

### 3. `currentCfi` — ❌ 无同名 getter，但能力原生存在

**foliate-js@main 中无 `currentCfi` 方法/属性**。但"当前位置 CFI"**原生可得**，两条路径：

**(a) 同步属性 `lastLocation.cfi`**
- `View.getCFI(index, range)`：[view.js#L431](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L431)
  ```js
  getCFI(index, range) {
      const baseCFI = this.book.sections[index].cfi ?? CFI.fake.fromIndex(index)
      if (!range) return baseCFI
      return CFI.joinIndir(baseCFI, CFI.fromRange(range))   // epubcfi.js#L288
  }
  ```
- `#onRelocate`：[view.js#L329](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb9609657024016348e9b1/view.js#L329) 计算 `cfi = this.getCFI(index, range)`，写入**公开属性** `lastLocation`：[view.js#L224](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb9609657024016348e9b1/view.js#L224) / [view.js#L334](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L334)
  ```js
  this.lastLocation = { ...progress, tocItem, pageItem, cfi, range }
  ```

**(b) 事件驱动：监听 View 的 `relocate` 事件**
- [view.js#L337](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb9609657024016348e9b1/view.js#L337)：`this.#emit('relocate', this.lastLocation)` —— 事件 detail **含 `cfi`**。

**⚠️ 关键注意（flag）**：`lastLocation` 只在**首次 relocate 触发后**才有值；之前为 `null`（`close()` 里置 null，[view.js#L304](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L304)）。朴素假设"currentCfi 是标准 getter、随时可读"**不成立**——它是派生值，仅在已 load 并定位后有效。

**稳定性**：`getCFI`/`lastLocation` 属核心 View API（相对稳定；但见全局"expect it to break"风险）。

**判定**：`currentCfi()` 需**门面建薄封装**：同步版 `return this.view.lastLocation?.cfi ?? null`，或监听 `relocate` 事件缓存 `.detail.cfi`。→ **patch = 薄封装**（**不要**从零实现 CFI 计算——foliate 已做）。
- **flag：派生语义 + load 前为 null**。

---

### 4. `goToCfi` — ❌ 无同名方法，但能力原生存在

**foliate-js@main 中无 `goToCfi` 方法**。但"按 CFI 导航"**原生支持**：

- `View.goTo(target)`：[view.js#L460](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L460)
  ```js
  async goTo(target) {
      const resolved = this.resolveNavigation(target)   // [view.js#L446]
      await this.renderer.goTo(resolved)
      this.history.pushState(target)
      return resolved
  }
  ```
- `resolveNavigation(target)`：[view.js#L446](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L446) 按类型自动路由：
  ```js
  if (typeof target === 'number') return { index: target }               // section index
  if (typeof target.fraction === 'number') { ... getSection(fraction) }   // fraction
  if (CFI.isCFI.test(target)) return this.resolveCFI(target)             // CFI 字符串 ← 关键
  return this.book.resolveHref(target)                                     // href
  ```
- `View.resolveCFI(cfi)`：[view.js#L436](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L436) → 委托 `book.resolveCFI`（[epub.js#L1045](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epub.js#L1045)）或回退 `CFI.parse`/`toRange`。
- CFI 识别正则：[epubcfi.js#L9](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L9) `isCFI = /^epubcfi\((.*)\)$/`。

**所以按 CFI 导航原生支持**：直接 `view.goTo(cfiString)`（cfiString 形如 `epubcfi(/6/4!/2,/2,/4)`）。
**返回类型**：`goTo` 返回 resolved `{ index, anchor }`（anchor 是函数 `(doc) => Element | Range`）。

**稳定性**：核心 API（相对稳定）。

**判定**：`goToCfi(cfi)` 需**门面建薄封装**：`return this.view.goTo(cfi)`。→ **patch = 薄封装**。库已能按 CFI 导航，门面只需显式命名（并可顺带用 epubcfi.js `wrap` 规范化/校验 CFI 串）。
- **flag：朴素假设"goToCfi 是独立 API"** —— 实为 `goTo` 传 CFI 型参数，路由自动完成。

---

### 5. `transform` / `transformTarget` — ⚠️ 语义陷阱（最大偏差点）

**`transformTarget` 原生存在，但它是 EventTarget 属性（非函数）。无独立 `transform`。**

- **epub.js**：[epub.js#L978](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epub.js#L978) `this.transformTarget = this.#loader.eventTarget`
- **mobi.js**：[mobi.js#L944](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/mobi.js#L944) `transformTarget = new EventTarget()`；[mobi.js#L1093](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/mobi.js#L1093) `this.transformTarget.dispatchEvent(event)`

**README 明确（"The Main Interface for Books"）**：
> the `.transformTarget`, if present, can be used to transform the contents of the book as it loads. It is an `EventTarget` with a custom event `"data"`, whose `.detail` is `{ data, type, name }`, where `.data` is either a string or `Blob`, or a `Promise` thereof, `.type` the content type string, and `.name` the identifier of the resource. **Event handlers should mutate `.data` to transform the data.**

**⚠️ 朴素假设 `transformTarget(target, transform)`（传 target+transform 函数的 API）是错的** —— 那是 epubjs/ReadAny 的心智模型。foliate-js 的做法不同：**在 `book.transformTarget` 上注册 `'data'` 事件监听器**，在 handler 里**改写 `detail.data`**（及可选 detail.type/name）来转换加载中的内容。
- 实际用法样例：[reader.js#L114](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/reader.js#L114)
  ```js
  book.transformTarget?.addEventListener('data', ({ detail }) => {
      // 在此改写 detail.data 以转换内容
  })
  ```

**稳定性**：`transformTarget` 属文档化 "book interface" 的**可选项**（"if present"）；epub/mobi 提供，机制为 EventTarget。

**判定**：门面的 transform 能力映射为：**在 `view.book.transformTarget` 上挂 `'data'` 监听器**（或暴露 `setTransform(fn)` 封装之）。→ **patch = 我们建适配器**，但只是对原生 EventTarget 机制的薄适配，**非重写**。
- **⚠️ flag：作用域限制 —— `transformTarget` 只在"资源加载时"触发（CSS/图片/SVG 等，`detail={data,type,name}`），不是通用"转换已渲染 DOM"的 API。** 若 Phase1 需转换**渲染后的文本/DOM**（如注入批注标记、剥离元素），`transformTarget` 是**错误的工具**——那应走 post-load DOM transform 或 `textWalker`。

---

### 6. `textWalker` — ✅ 完全原生，无需 patch

- **text-walker.js**：[text-walker.js#L30](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/text-walker.js#L30)
  ```js
  export const textWalker = function* (x, func, filterFunc) {
      const root = x.commonAncestorContainer ?? x.body ?? x
      const walker = document.createTreeWalker(root, filter, { acceptNode: filterFunc || acceptNode })
      const walk = x.commonAncestorContainer ? walkRange : walkDocument
      const nodes = walk(x, walker)
      const strs = nodes.map(node => node.nodeValue ?? '')
      const makeRange = (startIndex, startOffset, endIndex, endOffset) => { /* 造 Range */ }
      for (const match of func(strs, makeRange)) yield match
  }
  ```
- **精确签名**：`textWalker(x, func, filterFunc)` —— **生成器函数（generator）**。
  - `x`：`Range`（有 `commonAncestorContainer`）或 `Document`/`DocumentFragment`（有 `body`）。据此决定走 `walkRange` 还是 `walkDocument`。
  - `func`：`(strs, makeRange) => Iterable<match>` —— 在拼接后的文本节点字符串上运算，可调用 `makeRange(startIndex, startOffset, endIndex, endOffset)` 取回 DOM Range。
  - `filterFunc`：可选 `acceptNode` NodeFilter 函数（默认：拒绝 script/style、跳过元素、接受文本）。
  - **返回**：生成器，yield `func` yield 的内容（通常是 Range 或匹配对象）。
- **这正是 RAG/批注/TTS 管道所需的 string↔Range 桥**。
- **原生消费方**：[search.js#L114](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/search.js#L114)、[tts.js](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/tts.js)、[view.js#L548](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L548) / [view.js#L588](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L588)。

**稳定性**：核心辅助模块（相对稳定，README 称"a small DOM utility"）。

**判定**：`textWalker` **无需 patch** —— 直接 `import { textWalker } from '.../text-walker.js'` 使用。
- **⚠️ flag：依赖真实 DOM**（`document.createTreeWalker` / `document.createRange`）—— 非浏览器环境（如 Tauri Rust 侧、headless）不可用；须在存在 Document 的 **webview/JS 上下文**运行。对本项目（Tauri）而言，textWalker 落在 **webview(JS)侧**即可，与引擎门面同侧，无冲突。

---

## 附：CFI 模块（epubcfi.js）可用原语

门面 `currentCfi`/`goToCfi` 的底层积木，全部原生：
- [epubcfi.js#L9](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L9) `isCFI = /^epubcfi\((.*)\)$/`
- [epubcfi.js#L16](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L16) `joinIndir(...xs)`（拼 indirection）
- [epubcfi.js#L107](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L107) `parse(cfi)`
- [epubcfi.js#L288](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L288) `fromRange(range, filter)`（Range → CFI 串）
- [epubcfi.js#L296](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L296) `toRange(doc, parts, filter)`（CFI → Range）
- [epubcfi.js#L317](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L317) `fromElements` / [epubcfi.js#L329](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L329) `toElement`
- [epubcfi.js#L333](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L333) `fake`（含 `fromIndex(index)`，无真实 CFI 时的占位）
- [epubcfi.js#L346](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/epubcfi.js#L346) `fromCalibreHighlight`（读 Calibre 内嵌高亮）

> README："epubcfi.js can be used as is in any environment if you only need to parse or sort CFIs." —— 即 **CFI 解析/排序可在任意（含非浏览器）环境用**；但 `fromRange`/`toRange` 依赖 DOM。

---

## Phase1 落地建议（引擎门面 API 草图）

```ts
// packages/engine/src/Engine.ts —— 门面对外 API（薄适配，不 fork foliate-js）
class Engine {
  // (1) loadBook: 薄封装 → view.open
  async loadBook(src: string | File | Blob): Promise<void> { return this.view.open(src) }

  // (2) currentCfi: 薄封装 → view.lastLocation?.cfi（load 前返回 null）
  currentCfi(): string | null { return this.view.lastLocation?.cfi ?? null }
  //   或事件驱动：view.addEventListener('relocate', e => this._lastCfi = e.detail.cfi)

  // (3) goToCfi: 薄封装 → view.goTo(cfi)（库自动路由到 resolveCFI）
  async goToCfi(cfi: string): Promise<{ index:number, anchor:(doc:Document)=>(Element|Range) }> {
    return this.view.goTo(cfi)   // 可先用 epubcfi wrap() 规范化/校验
  }

  // (4) transform: 适配器 —— 在 view.book.transformTarget 挂 'data' 监听器
  //     ⚠️ 仅作用于"资源加载时"（CSS/图片/SVG），非渲染后 DOM
  setTransform(fn: (detail:{data:string|Blob,type?:string,name?:string}) => void): void {
    this.view.book.transformTarget?.addEventListener('data', e => fn(e.detail))
  }

  // (5) textWalker: 直接 import，无需 patch（在 webview/JS 侧调用）
}
```

**注意**：`render` **不**纳入门面公开 API（脆弱/未文档化）；重排需求用 `setStyles`（仅 reflowable）或重新 `open`。

---

## 未覆盖/后续需确认（超出本任务 SCOPE，供 Phase1+ 参考）

- `prev()` / `next(distance)`：[paginator.js#L1072](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/paginator.js#L1072) / [paginator.js#L1075](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/paginator.js#L1075)（翻页）
- `goToFraction(frac)`：[view.js#L471](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L471)（按进度分数定位）
- `addAnnotation` / `showAnnotation` / `deleteAnnotation`：[view.js#L368](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/view.js#L368) 等（批注，#1 RIA 便签将用到）
- `search.js` / `tts.js`（全文搜索 / TTS，v1 支撑项）

> 以上非本任务要求的 6 方法，仅列作 Phase1 后续集成时的已知原生入口。

---
*本报告基于 main@78914aef 实测（非 npm@1.0.1）。所有"稳定"为相对说法；foliate-js 自述 API 随时可能变动，建议 submodule + 锁 SHA + patch 隔离。*
