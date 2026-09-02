# AI 辅助阅读器（reader/）

方法论驱动的 AI 阅读工作台 Web MVP——把《读书方法总结》中的 9 种读书方法固化为软件功能，AI 在"读前 / 读中 / 读后 / 复习"全流程介入。

> 方案与详细设计见项目根目录 `docs/初步方案.md`、`docs/详细设计.md`、`docs/M0-技术验证-任务分解.md`

## 当前状态（M1 核心闭环已完成）

### M1 已实现功能

| 功能 | 入口 | 说明 |
|------|------|------|
| 书架 | `/` | 书籍列表 + EPUB 上传（multipart → 入库 → 自动向量化索引） |
| 三栏阅读器 | `/read/[bookId]` | 左栏目录/高亮 + 中央 foliate 渲染 + 右栏 AI 面板 |
| 高亮系统 | 阅读器内 | 五色高亮 + 批注，CFI 持久化到 DB，重开恢复 |
| RIA 便签 | 右栏"便签" | 选中原文 → AI 生成 I/A1/A2 便签 → 编辑保存 |
| RAG 问答 | 右栏"对话" | 向量+BM25 混合检索（RRF 融合）→ SSE 流式回答（带引用） |
| 读书档案 | 右栏"档案" | AI 生成摘要/收获/行动计划/输出建议 |

### M0 基础（已交付）

| 模块 | 文件 | 说明 |
|------|------|------|
| 数据层 | `src/lib/db/` | SQLite（better-sqlite3）连接单例 + CRUD + snake/camel 映射 |
| EPUB 解析 | `src/lib/parser/epub.ts` | 复用 foliate-js EPUB + jsdom DOMParser，含 CFI；`importEpubToDb` 去重入库 |
| 分块 | `src/lib/indexer/chunker.ts` | 800 字块 / 200 字重叠，Unicode 码点切分 |
| BM25 检索 | `src/lib/indexer/bm25.ts` | CJK bigram 分词 + BM25（k1=1.5, b=0.75） |
| 向量检索 | `src/lib/vector/` | 内存向量存储 + Ollama qwen3-embedding（1024 维） |
| 混合检索 | `src/lib/rag/` | HybridRetriever（向量+BM25 RRF 融合）+ RAG Prompt（带引用） |
| 渲染组件 | `src/components/reader/FoliateView.tsx` | `<foliate-view>` React 封装（useEffect 动态 import，File 而非 Blob） |
| AI 客户端 | `src/lib/ai/client.ts` | ChatOpenAI 多模型（oMLX/DeepSeek/OpenAI 兼容）+ 流式 + 结构化输出 |
| AI 方法引擎 | `src/lib/ai/ria.ts` + `archive.ts` | RIA 便签生成 + 读书档案生成（prompts 模板驱动） |

## 快速开始

```bash
# 1. 配置 .env（复制 .env.example 填写；oMLX 本地网关需真实 API key）
cp .env.example .env

# 2. 安装依赖
npm install

# 3. 开发服务器
npm run dev        # http://localhost:3000

# 4. 浏览器验证 foliate 渲染（demo 页）
open http://localhost:3000/demo
```

## 测试

```bash
npm run test            # 全部测试（连通测试默认 skip）
npm run test:watch      # 监听模式

# AI 真实连通测试（需 oMLX 可达 + .env 配置）
export $(grep -v '^#' .env | xargs) && RUN_LLM=1 npx vitest run src/lib/ai/client.llm.test.ts
```

## 质量门禁

```bash
npm run test && npm run lint && npm run build   # 三绿 = M0 门禁通过
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `LLM_API_KEY` | LLM API key（oMLX 网关校验 key，不可用 dummy） |
| `LLM_BASE_URL` | OpenAI 兼容端点，如 `http://100.126.215.3:8090/v1` |
| `LLM_MODEL` | 模型名，如 `Qwen3.5-122B-A10B-RAM-60GB-MLX` |
| `EMBEDDING_*` | 向量模型（M1 使用，暂空） |

## 技术栈

Next.js 16.3.4 + TypeScript 5.9 + Tailwind v4 + better-sqlite3 12.11 + foliate-js 1.0.1 + LangChain.js 1.x + Vitest 4

## 已知注意点

- **foliate-js 1.0.1 无 Book/Viewer 类**：是 `<foliate-view>` 自定义元素；必须 `useEffect` 动态 import（浏览器专属副作用，SSR 会崩）；`ArrayBuffer` 需包装为 `File`（非 Blob，格式探测读 `file.name`）
- **better-sqlite3 是原生模块**：已配 `serverExternalPackages`；只能服务端 import；测试用 `getDb(临时路径)` + `resetDb()` 隔离
- **`index` 是 SQLite 保留字**：schema 执行时已做内存改写（`loadSchemaSql` 导出供复用）
- **oMLX 校验 API key**：`apiKey:"dummy"` 会 401，必须真实 key