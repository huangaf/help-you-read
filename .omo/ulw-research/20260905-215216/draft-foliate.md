# Foliate / foliate-js 研究草稿（待 P4 汇编）

> [MEASURED]=直接读源码/官方文档；[INFERRED]=基于已测证据推理。来源：bg_e18e5a49（librarian）。
> 访问日期 2026-09-05；foliate-js 本地克隆 HEAD=78914aef（main, 2026-05-01）。

## Folite vs foliate-js（关系）
- [MEASURED] Folite = GNOME/Linux GTK4 成品阅读器（GPL v3.0, release 3.3.0@2025-04-01, last push 2026-04-08, 维护者 johnfactotum，活跃）
- [MEASURED] foliate-js = 从 Folite 抽出的「浏览器渲染引擎库」（MIT, npm 1.0.1@2025-04-21，官方自述"not stable, expect it to break, use at your own risk"）
- [INFERRED] 同一维护者；foliate-js = Folite 的渲染核心，供其他宿主复用——这正是 ReadAny/sageread 选它做底座的原因

## foliate-js API surface（嵌入时真正用到的）
- **View class**（`foliate-view` 主入口，view.js）方法：open/close/goToTextStart/`init({lastLocation,showTextStart})`（从存盘位置恢复）/addAnnotation/deleteAnnotation/showAnnotation/getCFI/resolveCFI/resolveNavigation/goTo/goToFraction/select/deselect/getSectionFractions/getProgressOf/getTOCItemOf/prev/next/goLeft/goRight（RTL感知）/`search(opts)→AsyncGenerator`/clearSearch/initTTS/startMediaOverlay
- **事件**（宿主 addEventListener）：`relocate`(lastLocation={progress,tocItem,pageItem,cfi,range}; reason=snap/page/scroll) / load / **`create-overlay`**(重播该节已存标注的钩子) / **`draw-annotation`**({draw,annotation,doc,range} 注入自定义绘制+选项，AI/主题定制点) / show-annotation / link / external-link(cancelable) / popstate / index-change
- **Book interface**：.sections[](每节 load/unload/createDocument/size/linear/cfi/id) / .dir / .toc[] / .pageList / .metadata(≈webpub manifest) / .rendition(`layout==='pre-paginated'`→走fixed-layout) / .resolveHref/.resolveCFI/.isExternal / .splitTOChref / **`.transformTarget`(= loader.eventTarget，内容管道钩子)**。最少只需 .sections+.load()
- **Renderer interface**：open/goTo/prev/next + 事件 load/relocate/create-overlayer
- **Loader interface**（Zip系）：entries/loadText/loadBlob/getSize（epub/comic-book 需外部 zip 库，官方推荐 zip.js）

## 能力矩阵（foliate-js 有 vs 仅 full Folite）
- EPUB/MOBI-KF8-AZW3/FB2/CBZ 解析：foliate-js ✅；PDF 实验(需PDF.js)
- **文本层/全文抽取**：foliate-js ✅（非独立TextLayer，靠 `section.createDocument()→Document` + **text-walker.js** 做 string↔Range 桥）[INFERRED]
- **标注/高亮/笔记**：foliate-js ✅（overlayer.js SVG overlay，可插拔 `draw`；持久化/同步不在 foliate-js）
- 搜索：✅（search.js，Intl.Collator+Segmenter，**"extremely slow"**）
- **TTS钩子**：✅（tts.js 只产 SSML + mark高亮，不做语音合成）
- **自定义样式**：有限（`::part(filter)/head/foot` + `--overlayer-highlight-*` CSS变量 + transformTarget）[INFERRED：closed shadow+iframe 双层屏障，宿主CSS无法穿透书内部]
- 词典 dict.js / 脚注 footnotes.js / OPDS opds.js / 金句 quote-image.js：foliate-js ✅（README未全列）
- **跨设备同步**：❌ 无内建（Folite仅本地JSON"拷文件即同步"；云同步需宿主自建）
- **AI辅助(RAG/对话)**：❌ 无内建 [INFERRED]（只给原料：createDocument+text-walker, CFI, SSML）

## 集成模式（真实消费者）
- **ReadAny**(codedogQBY/dolonater)：Tauri2+Expo/RN, React19+TS; AI=LangChain/LangGraph, 嵌入=Transformers.js；foliate-js渲染 + DocumentLoader(magic-bytes探测→分发解析器) + createDocument()做RAG文本抽取
- **readest**(fork)：DocumentLoader最精细，nativeFilePath触发Rust `parse_epub_full`预取(iOS init 1.5s→0.3s) + in-flight dedupe(避免nav管线重复zip.js inflate, 百章书省300-500ms)
- **SageRead**(xincmm, AGPL-3.0)：vendored workspace `packages/foliate-js` + `wrappedFoliateView`适配器 + TS declare module补丁；fork并改addAnnotation签名(indicatorType/indicatorOptions)
- **react-ebook**(npm react-ebookjs)：React组件封装(Reader/useBookNavigator/useSearch/loadEPUB…)

## 对 help-you-read gotchas（关键）
- **引入策略**[INFERRED]：用 vendor-from-main + 自有patch层，别 `npm install foliate-js@1.0.1`。npm release 停在2025-04，main(HEAD 78914aef, 2026-05)已含scrolled-mode/fb2 isExternal等——npm会漏掉你要的特性且更旧。代价是需rebase（SageRead/readest都在这么干）。
- **安全**[MEASURED+INFERRED]：iframe默认`sandbox="allow-same-origin allow-scripts"`(WebKit Bug 218086使sandbox失效)→读来路不明EPUB有脚本执行风险，必须显式配CSP阻断非`'self'`脚本；跨桌面/移动(WKWebView vs Chromium)行为要分别实测。
- **AI数据管道**[INFERRED]：foliate-js无内建AI/sync，只给三类原料——`createDocument()`+text-walker.js(RAG文本)、**CFI**(把LLM输出映射回精确DOM位置，注意MOBI/FB2/CBZ是**伪CFI**跨设备一致性弱)、**SSML**(TTS)；`transformTarget`/loader.eventTarget是内容预处理(实时翻译/内联富化)官方注入点。
- **架构**[MEASURED]：双层屏障 foliate-view(closed shadow)→renderer(closed shadow #root)→iframe，书内容渲染在跨realm iframe；搜索"extremely slow"(AI语义检索别依赖search.js，走向量库)。

## EXPAND（本来源高价值 leads）
- npm@1.0.1 落后 main(HEAD 78914aef) — 选型须在"npm稳定但旧" vs "vendor-from-main新但不稳需rebase"间定策略 — 查 v1.0.1..main 破坏性API变更(view.js/epub.js方法签名+事件名)
- transformTarget=loader.eventTarget(data预处理注入点) — 精读epub.js #loader.eventTarget dispatch时机+type/name，验证能否在"章节HTML加载前"拦截
- text-walker.js(string↔Range桥, search/tts复用) — AI功能地基(按CFI取上下文窗口+SSML mark对齐)
- epubcfi.js(CFI parse/sort, 可任意环境独立用)+伪CFI回退 — CFI是标注/进度/AI跨书引用通用稳定寻址；查MOBI/FB2/CBZ伪CFI语义
- 宿主侧标注数据模型+sync参考(ReadAny annotation-exporter/WebDAV, SageBook BookNote{cfi}+Zustand) — 设计help-you-read自有标注schema(对齐Folite JSON)+sync策略
- footnotes.js/dict.js/opds.js/quote-image.js — "免费拿"辅助能力，评估集成成本
- Media Overlays(view.js mediaOverlay/startMediaOverlay) — 有声书/伴读场景，SMIL子集
- 非浏览器可移植性(epubcfi.js可直接用；其余需polyfill Blob/TextDecoder/DOMParser/XMLSerializer/URL) — 无DOM服务端离线全文抽取/RAG索引的polyfill成本
- 替代引擎对比(Epub.js/Readium/react-ebookjs) — foliate-js硬限制成瓶颈时的Plan B
- 许可证：foliate-js=MIT(vendor可自由patch), Folite本体=GPL-3.0 — 闭源/商用只需遵守foliate-js的MIT

## 一句话总结（INFERRED）
foliate-js = 稳定度自认不足、但功能面宽(解析/渲染/标注/搜索/TTS-SSML/词典/脚注/OPDS/金句)的MIT渲染引擎；把寻址(CFI)、文本抽取(createDocument+text-walker)、标注绘制(overlayer可插拔draw)做成事件驱动钩子，而UI/持久化同步/AI编排/CSP安全全留给宿主。help-you-read正确姿势：**vendor-from-main+自有patch层(非npm)**，用transformTarget/createDocument+text-walker喂AI、CFI做稳定寻址，显式配CSP堵脚本风险。
