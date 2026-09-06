# SageRead 研究草稿（待 P4 汇编）

> [MEASURED]=文档/代码明确陈述；[INFERRED]=由代码推断。来源：bg_fbfe8b66（explore，42m33s）。
> 仓库：/home/huangaf/projects/sageread

## 产品定位
- [MEASURED] SageRead = "一款支持 AI 对话的电子书阅读器"（README.md:5）
- [MEASURED] License AGPL-3.0；平台 macOS(Intel+Apple Silicon)+Windows（README.md:7）
- [INFERRED] 核心 = "reader + RAG assistant" 混合体：导入 EPUB → 向量化章节 → 基于书内容的搜索/问答
- [MEASURED] 核心特性（README.md:21-31）：EPUB(滚动+分页) / AI对话(RAG) / 笔记高亮书签 / 阅读分析(热力图+进度) / 自定义AI技能提示词 / 全文搜索(混合:向量+BM25) / TTS(foliate-js) / 主题字体版式 / 隐私优先(本地存储+自部署AI)
- [MEASURED] AI配置流程（README.md:46-69）：配模型provider(OpenAI/Anthropic/OpenRouter/DeepSeek) → 配embedding/vector(本地仅macOS或在线API) → "向量化"导入书 = 核心RAG管线

## monorepo 结构（pnpm workspace, packages/*）
- foliate-js：vendored EPUB渲染库（git submodule from johnfactotum/foliate-js，MIT）；SageRead 只消费不改源码
  - view.js(22KB)=<foliate-view>主入口；epub.js(43KB)=解析/book接口；epubcfi.js=CFI状态机；paginator.js(40KB)=CSS多栏重排分页；fixed-layout.js=固定版式(CBZ/PDF)；overlayer.js(10KB)=SVG高亮批注；search.js=Intl.Collator/Segmenter搜索；tts.js(10KB)=SSML生成；text-walker.js=DOM文本节点→Range；dict.js=离线StarDict词典；opds.js=OPDS1.x→2.0；mobi.js(48KB)=MOBI/KF8/AZW3；comic-book.js=CBZ；fb2.js=FictionBook2；progress.js=阅读进度；quote-image.js=可分享引用图
  - 依赖：@zip.js/zip.js, fflate, pdfjs-dist（devDeps，Rollup打包）
- app：主 Tauri 应用（React19 + TS 前端 / Rust 后端）
  - 前端：Vite, Tailwind4+Radix, Zustand(状态), React Query(数据), AI SDK(@ai-sdk/react等)LLM对话, markmap思维导图, recharts分析
  - 后端：Tauri2.8 Rust（见Rust组件）；SQLite(rusqlite)+sqlite-vec(向量)；插件 tauri-plugin-epub/tauri-plugin-llamacpp
- app-tabs：Chrome风格多标签UI，封装 chrome-tabs JS类为React hooks（useChromeTabs + Tabs）；独立tsc构建

## Rust 组件（~77 .rs，4个Cargo包）
1. SageRead主：Tauri应用入口+核心业务（src/core/mod.rs）
   - core模块：books/note/tags/threads/skills/fonts/llama/state/database（各含models.rs+commands.rs）
   - 依赖：tauri2.8, rusqlite+sqlite-vec, tokio-full, reqwest-stream, sqlx0.8.6, chrono+uuid
2. tauri-plugin-epub（核心RAG引擎）：EPUB解析/分块/向量化/搜索
   - 依赖：epub2.1.4, epub2mdbook0.15.0, rusqlite+sqlite-vec0.1.6(vec0虚拟表), tiktoken-rs0.7.0(gpt-4o/o200k), reqwest0.12, roxmltree0.20
   - 管线（pipeline.rs:16-404）：读EPUB→提取元数据+章节 → epub2mdbook转MDBook → 解析TOC(nav.md/toc.ncx)扁平化 → 章节文本写chapters/ → 生成metadata.md(元数据+TOC供LLM) → 按源分组MD分块(Markdown-aware chunker,含overlap+句子切分) → 外部embedding API向量化(OpenAI/Ollama) → 批量插入SQLite vec0 → Tauri事件发进度
   - 搜索（pipeline.rs:409-469 + hybrid.rs）：查询向量化 → 向量搜索(sqlite-vec余弦)+BM25并行 → min-max归一化[0,1] → 按chunk_id合并加权分 → 三模式vector/bm25/hybrid可配权重
   - 关键文件：chunker.rs(677行), bm25.rs(254行,SQL实现TF/IDF), hybrid.rs(186行)
3. tauri-plugin-llamacpp：fork from Jan AI（menloresearch/jan）；本地LLM进程管理
   - load/unload llama模型, get devices, find session（commands.rs:40-319）
   - process.rs：spawn/monitor stdout/stderr/graceful terminate；"server is listening on"就绪信号(180s超时)
   - gguf/：GGUF模型元数据(types,commands,helpers)
4. jan-utils（共享库）：crypto(HMAC-SHA256/base64), fs, http/network, path, config

WHY Rust [INFERRED]：
1. embedding API需快速批量（JS逐条调用慢且阻塞UI；tokio async高效）
2. sqlite-vec需原生代码（C扩展sqlite3_vec_init经unsafe FFI，connection.rs:39-41）
3. 本地LLM进程管理（跨平台进程API经tokio::process/nix）
4. EPUB大规模解析（epub2mdbook+自定义chunker处理复杂XML/HTML；Rust所有权模型防内存问题）
5. Tauri插件架构（2.x推荐功能拆为独立Rust crate）

## 对 help-you-read 可借鉴（读前/读中/读后/复习）
- foliate-js渲染【高】：同为EPUB渲染需求；CSP安全处理关键
- Rust epub→MDBook管线【高】：适配读前（EPUB解析/TOC提取/章节chunking+overlap）
- Markdown-aware chunker【高】：适配读中（markdown结构感知分块+句子切分+overlap）
- sqlite-vec向量库【高】：适配读后/复习（每书SQLite+vec0表）
- 混合搜索(向量+BM25)【高】：适配复习（评分合并归一化，权重可调）
- embedding API抽象【中】：OpenAI+Ollama格式；中文NLP需补provider
- AI threads模型【中】：book→thread映射读中/读后Q&A
- 自定义skills/prompts【高】：扩展读前prep提示词/读后summary模板
- llama.cpp进程管理【中】：Jan fork提供subprocess生命周期；自部署LLM时有用
- tab管理(app-tabs)【低】：仅当多书阅读是特性时
- use-foliate-viewer架构【中】：manager模式+单次init+轻量style更新（React架构教训）
- 阅读分析(热力图)【高】：直接复用，映射复习频率分析

## .cursor/rules 约定（basic.mdc + commit.mdc）
- 沟通优先：始终用feedback工具，不静默试多方案
- 任务聚焦：未明确要求不跑pnpm/cargo命令
- git commit消息<20字符，简洁
- 每步最终动作：调feedback工具确认
- 技术约束：不跑测试命令(dev/start/test)用户自验；不建分支/未授权commit；Tailwind用neutral色系；"不要添加过多注释"
- commit.mdc：Conventional Commits（feat/fix/refactor/docs/style/perf/test/chore/revert），<type>: <desc>(≤40字符)，祈使句，中文描述，末尾无句号，生成3条候选commit供选择
