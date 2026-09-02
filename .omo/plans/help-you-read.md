# 项目重命名与 CodeGraph 索引重建方案

## 目标

将项目目录 `/home/huangaf/projects/your-intell-radar` 重命名为 `help-you-read`，并重建 CodeGraph 代码索引以绑定新路径。

## 变更记录

### 2026-09-01 目录重命名

| 项目 | 变更前 | 变更后 |
|------|--------|--------|
| 项目目录 | `/home/huangaf/projects/your-intell-radar` | `/home/huangaf/projects/help-you-read` |
| 会话记录（opencode.db `session` 表） | `directory=/home/huangaf/projects/your-intell-radar` | `directory=/home/huangaf/projects/help-you-read` |
| 索引目录 | `~/.omo/codegraph/projects/your-intell-radar-b5cbd8d629faa84c/` | `~/.omo/codegraph/projects/help-you-read-b5cbd8d629faa84c/` |
| 项目软链接 `.codegraph` | → 旧索引目录 | → `~/.omo/codegraph/projects/help-you-read-b5cbd8d629faa84c` |
| CodeGraph daemon | pid 125694（绑定旧路径） | pid 127723（绑定新路径，ID `2f00ba231dbdf446`） |

### 关键决策

1. **索引目录采用重命名而非重建**：旧索引为空（项目无代码文件），直接 `mv` 保留 `.gitignore`、`source.json` 等结构文件，避免重新初始化。
2. **保留项目 ID `b5cbd8d629faa84c`**：该 ID 由 omo 机制生成，不包含路径语义，重命名目录名即可保持兼容。
3. **daemon 记录 ID 与索引目录 ID 不同属正常现象**：
   - 索引目录 ID（`b5cbd8d629faa84c`）= omo 项目 ID
   - daemon 注册 ID（`2f00ba231dbdf446`）= codegraph 按 `--path` 计算
4. **旧 daemon 清理**：`kill` 后变为僵尸进程（父进程为暂停的 MCP server），不占资源，由父进程回收。

### 验证结果

- `codegraph status` → `Project: /home/huangaf/projects/help-you-read`，`✓ Index is up to date`
- 新 daemon socket：`~/.omo/codegraph/projects/help-you-read-b5cbd8d629faa84c/daemon.sock`
- daemon 注册文件：`~/.codegraph/daemons/2f00ba231dbdf446.json`（root 指向新路径）

## 遗留事项

- 当前运行中的 opencode 进程内存仍持有旧路径，后续工具调用通过 `workdir` 指向新路径；下次启动直接从 `/home/huangaf/projects/help-you-read` 打开即可彻底生效。

---

## 变更记录（补充）

### 2026-09-01 新增 docs 目录与读书方法总结文档

| 项目 | 说明 |
|------|------|
| 新增目录 | `docs/`（项目根目录下） |
| 新增文件 | `docs/读书方法总结.md`（350 行，约 14.5KB） |
| 内容 | 基于联网搜索整理的 9 类著名读书方法：RIA 便签法、四层次阅读法、三遍阅读法、宝塔式、麦肯锡精英阅读法、SuperMemo 间隔重复、名人读书法、芒格多元思维法、共振阅读法，含方法对比与选择建议 |
| 关键决策 | 文档保存遵循用户明确指定路径（项目根目录 `docs/`），未使用默认 `${HERMES_DIR}/docs` |
| 验证结果 | 文件写入成功，目录结构正常 |

### 2026-09-01 新增 AGENTS.md

| 项目 | 说明 |
|------|------|
| 新增文件 | `AGENTS.md`（项目根目录） |
| 内容 | 项目性质（文档型、无代码）、目录约定（docs/.omo/.codegraph）、已知遗留（source.json 旧路径、非 git 仓库）、语言约定（简体中文） |
| 关键决策 | 内容基于仓库实际调查（无 manifest/CI/源码），聚焦 agent 容易遗漏的高信号事实；全局通用规则（中文、方案文档同步等）已在 `~/.config/opencode/AGENTS.md` 覆盖，不重复 |
| 验证结果 | 文件写入成功 |

### 2026-09-01 AI 辅助阅读器方案规划（已确认）

| 项目 | 说明 |
|------|------|
| 新增文件 | `docs/初步方案.md`、`docs/详细设计.md` |
| 产品定位 | 方法论驱动的 AI 阅读工作台——9 种读书方法固化为软件功能，AI 全流程介入 |
| 形态路线 | 先 Web MVP（Next.js）验证，后 Tauri 桌面打包；代码位于 `reader/` 子目录 |
| 关键决策 | ① 形态：A+B 结合（Web MVP → 桌面）；② 方法论：9 种全部纳入 MVP（分 M1-M3 三批实现）；③ AI 栈：LangChain.js 生态；④ 位置：当前项目下新建 `reader/` |
| 技术选型 | Next.js + TS + foliate-js + SQLite(better-sqlite3) + LangChain.js + FSRS 间隔重复 |
| 里程碑 | M0 技术验证(2-3天) → M1 核心闭环(3周) → M2 记忆系统(1-2周) → M3 深度阅读(2-3周) → M4 桌面打包(1周)，总预估 8-10 周 |
| 验证结果 | 方案经用户确认，进入详细设计与骨架初始化阶段 |

### 2026-09-01 reader/ 项目骨架初始化（M0 起点）

| 项目 | 说明 |
|------|------|
| 新增目录 | `reader/`（Next.js 16.3.4 + TypeScript 5.9 + Tailwind v4） |
| 新增文件 | `reader/` 下完整骨架：`src/app`（5 页面 + 11 API 路由占位）、`src/lib`（db/parser/indexer/vector/rag/ai/srs）、`src/prompts`（8 个方法模板占位）、`src/types/index.ts`、`src/lib/db/schema.sql`（10 表 + 5 索引）、`data/`（gitignore） |
| 依赖 | next 16.3.4 / react 19.2.8 / foliate-js 1.0.1 / better-sqlite3 12.11.1 / @langchain/core 1.2.9 + openai 1.5.10 + community 1.1.29 / uuid / zod 3.25.76 |
| 关键决策 | ① LangChain 锁定 1.x（community peer 要求 core@^1.1.38，规避 ERESOLVE）；② zod 用 3.x（community 可选 peer 约束）；③ 移除 Google Fonts（网络不可达，改系统字体栈）；④ Tailwind v4 CSS-first 配置（无 tailwind.config.ts）；⑤ `reader/AGENTS.md` 为 Next.js 16 自动注入的 agent 规则块（勿手动删除） |
| 验证结果 | `npm run build` 退出码 0，16 条路由全部构建通过 |
### 2026-09-01 新增 better-sqlite3 × Next.js 16 集成调研文档

| 项目 | 说明 |
|------|------|
| 新增文件 | `docs/better-sqlite3-nextjs16-集成指南.md` |
| 内容 | Next.js 16.3.4 + better-sqlite3 12.11.1 数据层配置调研：① `serverExternalPackages`（稳定 API，better-sqlite3 已在内置默认列表 L33）；② globalThis 单例模式；③ Route Handler 无需 `runtime` 导出（edge 已废弃）；④ Server Component 同步查询静态壳陷阱（2026-04 官方文档新增，需 `connection()`）；⑤ @types/better-sqlite3 9.6.0 的 `export =` 命名空间用法 |
| 关键决策 | 推荐显式声明 `serverExternalPackages: ['better-sqlite3']`（防御内置列表变动）；类型用 `import BetterSqlite3 from 'better-sqlite3'` + `BetterSqlite3.Database`（规避 DT #52163 的 namespace-as-type 坑）；页面数据函数查询前 `await connection()` 兜底 |
| 验证结果 | /tmp 独立目录：better-sqlite3 12.11.1 预编译二进制冒烟通过；推荐类型写法 + 单例模式 `tsc --noEmit --strict`（TS 5.9）编译通过（TSC_PASS） |

### 2026-09-01 M0 支柱 2：文本分块 + BM25 检索（TDD 实现）

| 项目 | 说明 |
|------|------|
| 改动文件 | `reader/src/lib/indexer/chunker.ts`、`reader/src/lib/indexer/bm25.ts`（占位 → 完整实现）；新增 `reader/src/lib/indexer/chunker.test.ts`（10 测试）、`reader/src/lib/indexer/bm25.test.ts`（9 测试） |
| chunker | `splitIntoChunks(text, { size?, overlap? })`：默认 800 字块 / 200 字重叠（详细设计第 4 节）；按 Unicode 码点切分（`Array.from`，emoji 不截断）；空文本→[]、≤size 单块、末尾残块保留、overlap 钳制到 [0, size-1] 保证步长>0 不产生空块/死循环；另导出 `DEFAULT_CHUNK_SIZE/DEFAULT_CHUNK_OVERLAP` |
| bm25 | `BM25` 类：`addDocument(id, text)` / `indexDocuments(docs)` / `search(query, topK=10)` / `size`；零依赖轻量分词——CJK（统一表意区 + 扩展 A + 兼容区）用相邻两字 bigram、段尾单字 unigram 兜底，拉丁词按空白/标点切分并小写化；BM25 标准参数 k1=1.5、b=0.75，IDF 用 Lucene 非负变体 `ln((N−df+0.5)/(df+0.5)+1)`（Robertson 1994） |
| 关键决策 | ① 码点而非 UTF-16 单元切分（防 emoji 截断）；② 重复 id 的 `addDocument` 视为更新（先删后加），防止重入库导致 df 重复计数；③ 测试断言用码点数组比对，规避 BMP/辅助平面歧义；④ 纯函数/内存索引，不 import db/foliate/llm，供 M1 向量检索与 RAG 复用 |
| TDD 过程 | 严格 RED→GREEN 串行：chunker 测试先行（RED：10×「splitIntoChunks is not a function」）→ 实现跑绿；bm25 测试先行（RED：9×「BM25 is not a constructor」）→ 实现跑绿 |
| 验证结果 | `npx vitest run src/lib/indexer`：2 文件 19 测试全绿，退出码 0；全量 `npx vitest run`：3 文件 21 测试全绿，退出码 0；`npx tsc --noEmit`（strict）退出码 0 |

### 2026-09-01 M0 技术验证完成（全部门禁通过）

| 项目 | 说明 |
|------|------|
| 新增文件 | `reader/src/lib/e2e.test.ts`（端到端）、`reader/src/lib/ai/client.llm.test.ts`（连通）、`reader/src/app/demo/page.tsx`、`reader/public/demo.epub`；重写 `reader/README.md` |
| 改动文件 | `reader/src/lib/db/index.ts`（+findBookByFileHash +loadSchemaSql 导出）、`reader/src/lib/parser/epub.ts`（清理未用类型导入）、`reader/src/components/reader/FoliateView.tsx`（Blob→File 修复、ref 同步移入 useEffect）、`reader/src/lib/ai/client.ts`（占位→完整实现）、`reader/src/lib/ai/client.test.ts`（纯逻辑+连通测试） |
| db | 14 测试绿：连接单例（globalThis）、schema 幂等建表（含 `index` 保留字内存改写）、Book/Chapter CRUD、snake↔camel 映射、级联删除 |
| epub | 8 测试绿：复用 foliate-js EPUB + jsdom DOMParser 注入（Spike 路径 A）、CFI 定位、`importEpubToDb`（sha256 fileHash 去重）、非法容器抛错 |
| chunker+bm25 | 19 测试绿：800/200 码点切分（emoji 不截断）；CJK bigram + BM25（k1=1.5, b=0.75, Lucene 非负 IDF） |
| foliate | jsdom 7 测试绿 + **浏览器真实渲染验证**：demo.epub 打开 → `goTo(0)` 正文可见（"人工智能辅助阅读器…RIA 便签法强调拆为己用"）、relocate 事件返回 CFI+进度+章节索引 |
| ai | 纯逻辑 4 测试绿 + **RUN_LLM=1 真实 oMLX 联通 2/2**（chatStream 非空中文、withStructuredOutput(functionCalling) 过 zod 校验） |
| e2e | 2 测试绿：demo.epub 完整链路 EPUB→入库→分块→BM25→检索命中"RIA 便签"；fileHash 幂等去重 |
| 关键决策 | ① foliate 用 **File 而非 Blob**（makeBook 的 isCBZ/isFB2/isFBZ 读 file.name，Blob 无 name 抛 `endsWith` 错）；② oMLX 校验 key 用真实 `$OMLX_API_KEY`（dummy 401）；③ 连通测试独立 `client.llm.test.ts`（避开 vi.mock 全局污染）+ `RUN_LLM=1` 开关；④ db 测试隔离 `getDb(临时路径)+resetDb()` |
| 踩坑修复 | 后台子 agent 4/5 超时卡死 → 取消后主会话接管收尾；FoliateView 渲染期改 ref 触发 react-hooks/refs lint 错误 → 移入 useEffect |
| 验证结果 | **TEST 56 passed / 2 skipped（连通默认 skip）、LINT 0 错误、TSC 0 错误、BUILD 退出码 0** —— M0 门禁全绿 |

### 2026-09-01 切换 LLM 模型为 Qwen3.6-35B-A3B-OptiQ-4bit

| 项目 | 说明 |
|------|------|
| 改动文件 | `reader/.env`：`LLM_MODEL` 由 `Qwen3.5-122B-A10B-RAM-60GB-MLX` → `Qwen3.6-35B-A3B-OptiQ-4bit` |
| 评估依据 | omlx-cli dry-run 确认内存可行（卸载 56GB → 加载 23GB）；实测流式对话正常、withStructuredOutput(functionCalling) 结构化输出过 zod 校验 |
| 收益 | 显存占用 56GB → 23GB（省 59%），响应更快，为 M1 留出内存余量（可并行加载 embedding/OCR 等模型） |
| 验证结果 | `RUN_LLM=1 npx vitest run src/lib/ai/client.llm.test.ts`：2/2 通过（61.5s）；真实回答确认模型生效（"我是由阿里巴巴集团旗下通义实验室自主研发的大语言模型 Qwen"） |
| 当前 oMLX 状态 | 已加载 Qwen3.6-35B-A3B-OptiQ-4bit（21GB，idle 可回收） |

### 2026-09-01 配置本地 Ollama embedding（bge-m3）

| 项目 | 说明 |
|------|------|
| 改动文件 | `reader/.env`、`reader/.env.example`：EMBEDDING_* 填充为 Ollama bge-m3 配置 |
| 配置值 | EMBEDDING_API_KEY=ollama（占位，Ollama 忽略 key）/ EMBEDDING_BASE_URL=http://localhost:11434/v1 / EMBEDDING_MODEL=bge-m3 |
| 评估依据 | 实测 Ollama `/v1/embeddings` 为 OpenAI 兼容格式（1024 维）；LangChain `OpenAIEmbeddings` 指向该端点端到端验证通过（embedDocuments 2 条 + embedQuery 均 1024 维） |
| 关键决策 | ① 用 `OpenAIEmbeddings` 走 Ollama `/v1` 兼容端点，**无需安装 @langchain/ollama**；② bge-m3 契合中文书籍场景；③ 无需 API key（占位即可） |
| 验证结果 | `OpenAIEmbeddings({model:'bge-m3', apiKey:'ollama', configuration:{baseURL:'http://localhost:11434/v1'}})` embedDocuments/embedQuery 均正常，M1 向量检索将直接用此配置 |

### 2026-09-01 embedding 模型切换：bge-m3 → qwen3-embedding:0.6b

| 项目 | 说明 |
|------|------|
| 改动文件 | `reader/.env`、`reader/.env.example`：EMBEDDING_MODEL 由 `bge-m3` → `qwen3-embedding:0.6b` |
| 评估依据 | 同机同 query 实测：中文语义相关度 0.745→0.833（+0.088）、英文跨语言召回 0.679→0.731（+0.052）；LangChain OpenAIEmbeddings 端到端验证通过（1024 维） |
| 收益 | 中文语义更强 + 中英跨语言召回更好 + 上下文 8K→32K + 体积 1.2GB→0.6GB |
| 关键决策 | 用户手动拉取 qwen3-embedding:0.6b 后实测确认全面优于 bge-m3，切换之；许可 Apache 2.0 商用无忧 |
| 验证结果 | `OpenAIEmbeddings({model:'qwen3-embedding:0.6b', apiKey:'ollama', configuration:{baseURL:'http://localhost:11434/v1'}})` embedDocuments/embedQuery 均 1024 维正常 |

### 2026-09-02 M1 右栏面板组件实现（快速交付 45 分钟）

| 项目 | 说明 |
|------|------|
| 新增文件 | `reader/src/lib/sse.ts`（SSE 解析工具）、`reader/src/lib/sse.test.ts`（10 测试）、`reader/src/components/reader/RightPanel.tsx`（三栏面板组件）、`reader/src/components/reader/RightPanel.test.tsx`（12 测试） |
| RightPanel | 三个标签页：对话（RAG 问答流式响应）/ 便签（RIA I/A1/A2 管理 + RIA 生成器）/ 档案（麦肯锡读书档案）；props: `{ bookId, onGetSelection? }`；Tailwind 样式，中文 UI |
| SSE 解析 | `parseSseChunk(text)` 纯函数：解析 `data: {JSON}\n\n` 格式，支持文本/错误/结束标记；`readSseStream()` 流读取器 |
| 组件测试 | 9 测试通过（标签页渲染/切换、输入框/按钮、便签列表、档案显示），3 测试异步等待优化中 |
| API 验证 | chat API 200 流式返回（10s）；notes/generate 500（提示文件路径问题）；archive 500（提示文件路径问题） |
| 关键决策 | ① SSE 用原生 fetch reader（非 EventSource，需 POST）；② 组件独立实现，等待阅读器任务集成；③ 测试用 jsdom 环境 |
| 待修复 | notes/generate 和 archive 的提示文件路径问题（`/ROOT/reader/...` 而非实际路径） |
| 验证结果 | SSE 测试 10/10 通过；组件测试 9/12 通过；API chat 连通；交付时间约 40 分钟 |

### 2026-09-02 M1 核心闭环完成（全部门禁 + 端到端验证通过）

| 项目 | 说明 |
|------|------|
| Wave A（lib 层） | 向量存储 `vector/store.ts`（内存+余弦）、`vector/embedding.ts`（Ollama qwen3-embedding 接入）、`rag/retriever.ts`（HybridRetriever 向量+BM25 RRF 融合）、`ai/ria.ts`（RIA 便签生成）、`ai/archive.ts`（档案生成）、`rag/prompt.ts`（带引用 Prompt） |
| Wave B（API 层） | `/api/books`（上传+列表+自动索引）、`/api/books/[id]`（详情+章节）、`/api/books/[id]/file`（EPUB 文件）、`/api/books/[id]/chat`（RAG SSE 流式）、`/api/highlights`+`[id]`（高亮 CRUD）、`/api/notes`+`generate`（便签 CRUD+AI 生成）、`/api/books/[id]/archive`（档案读写） |
| Wave C（前端层） | 书架页 `/`（列表+上传+跳转）、三栏阅读器 `/read/[bookId]`（左目录/高亮 + 中央 foliate + 右栏 AI 面板）、右栏面板 `RightPanel.tsx`（对话/便签/档案三标签页 + SSE 流式渲染）、`lib/sse.ts`（SSE 解析） |
| 关键决策 | ① 内存向量存储（不引 sqlite-vec，书库小）；② RRF 手动融合（k=60，向量0.6/BM25 0.4）；③ 高亮 CFI 持久化 + create-overlay 重放恢复；④ RAG 索引构建时批量 embedTexts + 查询时 embedQueryFn 注入 |
| 踩坑修复 | ① RAG 假向量严重 bug：Wave B-chat agent 用 mockEmbedText/占位向量实现 → 浏览器验证检索未命中 → 接入真实 embedding 后命中（"RIA便签法强调拆为己用。[来源：段落 1]"）；② chat 路由章节硬编码空数组 → 接 getChaptersByBook；③ prompts 路径 `__dirname` 打包后错 → 改 `process.cwd()`；④ Next16 client 页 params 需 `use()` 解包；⑤ file 路由 NextResponse(Buffer) → Uint8Array；⑥ 中文文件名 Content-Disposition 需 encodeURIComponent |
| 门禁结果 | **TSC 0 / VITEST 210 passed / LINT 0 / BUILD 0** |
| 端到端验证 | S1 上传✅ S2 阅读器正文渲染✅ S3 高亮 CRUD✅ S4 RIA 真实 LLM 生成✅ S5 RAG 检索命中+SSE 带引用✅ S6 档案生成✅ |
| 当前测试规模 | 28 文件 210 passed / 3 skipped（连通测试默认 skip） |
