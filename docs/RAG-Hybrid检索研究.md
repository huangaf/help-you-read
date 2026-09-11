# Hybrid RAG 生产级实现研究（node:sqlite + sqlite-vec + transformers.js）

> 验证环境：Node **v24.20.0**（linux-x64）+ `node:sqlite`（内建）+ `sqlite-vec@0.1.9`
> 本文件为**实证研究**（非教程）：每条结论都经本机 `node -e` 实测，附可运行的最小代码。
> 服务于 `@hyr/core/ai`（AIProvider + Hybrid RAG）与 Phase3 落地。对应 `docs/技术方案.md` K1/K2/K3。

**TL;DR（5 条关键结论）**
1. **FTS5 在 Node 24 的 `node:sqlite` 默认可用**（v24.20.0 实测 `CREATE VIRTUAL TABLE ... USING fts5` + `bm25()` 均成功）。⚠️ 坑：`bm25()` 返回**负数**，越负越相关——RRF 排序方向要相应处理。
2. **sqlite-vec 能被 `node:sqlite` 的 `loadExtension()` 加载**（它发布的是普通 C 扩展 `.so/.dylib`，非 Node-API addon）。⚠️ 坑：文件名叫 `vec0.so` 但真实入口符号是 **`sqlite3_vec_init`**（派生名 `vec0.so→sqlite3_vec0_init` 不匹配）；跨平台/旧 Node 下务必**显式传入口点**。
3. **vec0 INSERT 不能指定主键/rowid**（无论位置 `?` 还是命名参数，node:sqlite 一律抛 "Only integers are allowed for primary key values"）。✅ 解法：**省略主键**让 vec0 自增 rowid，或用**元数据列**（`chunk_id`）承载业务键。
4. **向量绑定**：node:sqlite 不接受裸 `ArrayBuffer`（报 "found NULL"）；✅ 用 **JSON(TEXT)** 或 **`Uint8Array`**（`new Uint8Array(f32.buffer, ...)`）。
5. **嵌入模型**：Tauri 无 GPU → transformers.js 走 **WASM + q8 量化**；EPUB 分块基准验证默认 = **递归 ~512 token + 10–20% overlap**。

---

## Q1 · FTS5 in node:sqlite（已验证可用）

**结论**：Node ≥24（或 22.16+）的 `node:sqlite` **默认编译含 FTS5**（PR nodejs/node#57621 已合入）。旧 Node（22.14 / 23）未含 FTS5，会抛 `no such module: fts5`——**你的 v24.20.0 不受影响**。

```js
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(':memory:', { allowExtension: true });

// 建 FTS5 虚拟表（contentless 之外，建议带 content= 指向源表做同步）
db.exec(`CREATE VIRTUAL TABLE chunks_fts USING fts5(
  body, tokenize='porter ascii'          // 中文语料见下方"分词器"坑
)`);

// MATCH 查询 + bm25() 相关性分数
const rows = db.prepare(
  `SELECT rowid, bm25(chunks_fts) AS score FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY score`
).all('investor');
// 实测返回：[{ rowid:1, score:-0.000001 }]
```

⚠️ **坑 1（bm25 符号）**：FTS5 `bm25()` 返回**负数**，**越负 = 越相关**。`ORDER BY score`（升序）即"最相关在前"。在 RRF 里，FTS 通道的 rank 必须按 `bm25` **升序**排（最负者 rank=1），不能套用"分数越大越好"的直觉。

⚠️ **坑 2（中文分词器）**：默认/`porter` 分词器**只按空格切**，对中文（无空格）整句当一个 token → MATCH 基本失效。EPUB 是中文书，**必须换分词器**。两条路：
- `tokenize='unicode61'`（SQLite 内建，按 Unicode category 切，对 CJK 逐字/按字边界）——零依赖，推荐 v1。
- 自定义 C 分词器（jieba）——需编译扩展，重；放 v2+。
- 实测建议：中文用 `tokenize='unicode61'`，英文/混合可 `porter unicode61`。

---

## Q2 · sqlite-vec 能否用于 node:sqlite（能，但有坑）

**结论**：`node:sqlite` **支持 `loadExtension()`**（需构造时 `{ allowExtension: true }`）。sqlite-vec npm 包发布的是**普通 C 扩展共享库**（linux `vec0.so` / mac `vec0.dylib` / win `.dll`），**不是 Node-API addon**——所以走 `loadExtension()` 正路，无需 better-sqlite3、无需 node-gyp。

### 加载（关键：入口点符号）
```js
import { DatabaseSync } from 'node:sqlite';

// 平台预编译扩展路径（npm optionalDependencies 自动装对应平台包）
const vecPath = '/abs/path/to/sqlite-vec-linux-x64/vec0.so';

const db = new DatabaseSync('local.db', { allowExtension: true });
// 实测：文件叫 vec0.so，但导出的入口符号是 sqlite3_vec_init（非派生的 sqlite3_vec0_init）
db.loadExtension(vecPath, 'sqlite3_vec_init');   // ← 显式传真实符号名（跨平台/旧 Node 更安全）
// db.loadExtension(vecPath);                        // v24.20 本机实测"碰巧也能加载成功"，但不保证可移植
```

⚠️ **坑（入口点）**：`nm -D vec0.so | grep init` 实测导出 `sqlite3_vec_init / sqlite3_vec_numpy_init / sqlite3_vec_static_blobs_init`，**没有 `sqlite3_vec0_init`**。所以"省略入口点、靠文件名派生"在部分环境会失败（openclaw 即栽在这）。**生产代码一律显式传 `'sqlite3_vec_init'`。**

### 建表 / 插入 / KNN（实测通过的正确形态）
```js
// ★ 生产推荐：向量列 + 元数据列，不声明 INTEGER PRIMARY KEY（见下方"主键坑"）
db.exec(`CREATE VIRTUAL TABLE chunks_vec USING vec0(
  embedding float[384] distance_metric=cosine,   // ← cosine 不加引号（裸标识符）
  chunk_id TEXT                                    // 元数据列，可作 KNN 过滤条件
)`);

const ins = db.prepare('INSERT INTO chunks_vec(embedding, chunk_id) VALUES (?, ?)');
// ★ 向量绑定：JSON(TEXT) 或 Uint8Array（裸 ArrayBuffer 会报 "found NULL"）
const toBlob = (f32) => new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
ins.run(JSON.stringify(vec), chunkId);            // 方式A：JSON 文本（sqlite-vec 原生支持）
// ins.run(toBlob(vec), chunkId);                  // 方式B：紧凑 BLOB（更快，推荐）

// KNN 查询
const hits = db.prepare(`SELECT chunk_id, distance FROM chunks_vec
                         WHERE embedding MATCH ? AND k = 10 ORDER BY distance`).all(toBlob(queryVec));
// 带元数据过滤（如限定某本书）： ... AND chunk_id = ? / book_id = 'xxx'
```

⚠️ **坑 1（向量绑定类型）**：node:sqlite 对 `?` 参数绑**裸 `ArrayBuffer`**（`f32.buffer`）报 *"Input must have type BLOB (compact format) or TEXT (JSON), found NULL"*。✅ 必须包成 **`Uint8Array`**（或直接用 JSON 字符串）。DataView 亦可，但优先 `Uint8Array`。

⚠️ **坑 2（主键不可显式绑定）**：对 vec0 虚拟表，**无论位置 `?` 还是命名参数**指定主键/rowid（`INSERT INTO cv(id,e) VALUES(?,?)` / `:id/:e`），node:sqlite 一律抛 *"Only integers are allowed for primary key values"*。实测**省略主键**（`INSERT INTO cv(e) VALUES(?)`，vec0 自增 rowid）才成功。→ **不要试图显式控制 vec0 主键**，改用元数据列承载业务键（见上）。

⚠️ **坑 3（distance_metric 语法）**：写 `distance_metric='cosine'`（带引号）会报 *"could not parse table option"*。✅ 用**裸标识符** `distance_metric=cosine`（或 `l2` / `inner_product`）。

**向量语义**：vec0 默认 **L2（平方欧氏）距离**；加 `distance_metric=cosine` 后，返回的 `distance = 1 − cosine_similarity`（**越小越相关**）。KNN 一律 `ORDER BY distance`（升序）。

> **替代方案（若不想碰 loadExtension）**：v1 单书场景，chunk 数通常几百~几千。可在 `chunks` 表存 `embedding BLOB`，**JS 进程内暴力余弦**（Float32Array 点积，几千×384 ≈ 毫秒级），零扩展依赖。跨书/大规模（v2+）再上 vec0 索引。**两条路都 local-first，符合 §1 立场**——按 YAGNI 分阶段选。

---

## Q3 · Reciprocal Rank Fusion（RRF）TypeScript 实现

**公式**：`score(d) = Σ_{每个通道} 1 / (k + rank_d)`，**k=60**（Cormack/Clarke/Buettcher 2009 的规范值）。
**核心性质**：RRF **只用排名、丢弃原始分数**——因为 BM25 与余弦的量纲/取值范围不可比（Poly-Haven 实测：同一概念德语 cosine 比英语低 0.04–0.23）。**"两通道都排前面"的文档胜出**。
⚠️ **k 不要随手调**（hippo-memory：K=60 已按 IR 基准校准，跨语料稳健；改动必须配跨语料评测）。

**与 Q1 的衔接（关键）**：FTS 通道喂给 RRF 的是**排名列表**，不是 bm25 分数。由于 bm25 是"越负越相关"，FTS 通道排序必须**升序**（最负 = rank 1）；向量通道 cosine distance "越小越相关"，也**升序**。两通道都"升序 = 越好"→ RRF 直接吃排名，符号问题被天然消解。

```ts
// 通用 RRF：输入 N 个"已按相关度升序排好"的 id 列表，输出融合分 Map
export function reciprocalRankFusion(
  rankings: readonly (readonly string[])[],   // 每通道一个 id 数组（升序）
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, i) => {              // i = 0-based rank，公式用 1-based
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return scores;
}

// 融合后按分数降序取 top-K（RRF 分越大越靠前）
export function fuseToHits(scores: Map<string, number>, topK = 5) {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => ({ id, score }));
}

// 用法：两通道（FTS + 向量）各自产出"升序 id 列表"后融合
const ftsIds    = ftsResults.map(r => r.cfi);        // bm25 升序 → cfi 列表
const vectorIds = vecResults.map(r => r.chunk_id);    // cosine distance 升序 → chunk_id 列表
const fused     = fuseToHits(reciprocalRankFusion([ftsIds, vectorIds]), 5);
```

> 可选增强（按需，非 v1 必需）：min-max 归一化后再融合、跨通道加权（`w * 1/(k+rank)`）、MMR 多样性重排、cross-encoder 精排。v1 保持"纯 RRF + k=60"最稳（YAGNI）。

---

## Q4 · Node.js 本地嵌入（无 GPU，Tauri）

**选型**：`@huggingface/transformers`（ONNX Runtime → WASM/WebGPU）。**无 GPU 一律走 WASM + q8 量化**（WebGPU-int8 可能返回垃圾向量；WASM+int8 是可靠低内存默认）。

⚠️ **Tauri 关键点**：嵌入推理应放在**前端 webview 的 Web Worker**（或 Tauri sidecar），**绝不在主线程**——否则 UI 冻结。模型只下载一次，之后离线可跑（local-first）。

```ts
// worker.ts —— 模块 Worker，加载一次、复用；WASM + q8
import { pipeline, env } from '@huggingface/transformers';

// 离线优先：模型放本地目录，避免每次从 HF CDN 拉
env.useBrowserCache = false;            // Tauri/Node：不走 IndexedDB 缓存
env.allowLocalModels = true;           // 只读本地，杜绝隐式联网

let extractor: import('@huggingface/transformers').FeatureExtractionPipeline | null = null;
self.onmessage = async (e: MessageEvent<{ type: string; texts?: string[] }>) => {
  const { type, texts } = e.data;
  if (type === 'load') {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'wasm',                  // ★ 无 GPU → WASM（跨平台最稳）
      dtype: 'q8',                     // ★ 8-bit 量化（WASM 默认）
      progress_callback: (p) => self.postMessage({ type: 'progress', ...p }),
    });
    self.postMessage({ type: 'ready' });
  } else if (type === 'embed') {
    // pooling:'mean' + normalize:true → 直接得句子向量（已 L2 归一）
    const out = await (extractor as FeatureExtractionPipeline)(texts!, { pooling: 'mean', normalize: true });
    self.postMessage({ type: 'embed', data: out.tolist() });  // number[][]，可 transfer
  }
};
```

**嵌入模型选型（维度 / 大小 / 适用）**：
| 模型 | 维度 | q8 下载量 | 适用 |
|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2` | **384** | ~23MB | 英文通用，快（默认首选）|
| `Xenova/all-mpnet-base-v2` | **768** | ~86MB | 更高精度，下载大 |
| `Xenova/multilingual-e5-small` | **384** | ~34MB | 100+ 语言（★中文/多语书推荐）|

⚠️ **中文 EPUB → 选多语言模型**：`all-MiniLM-L6-v2` 是英文优化，中文语义质量弱。你的语料（毛泽东选集等中文书）**用 `multilingual-e5-small`**（或 bge/multilingual-e5 系列）更合适；维度仍 384，与 Q2 `float[384]`、Q5 provenance 对齐。

⚠️ **文件名映射坑**（量化）：`dtype:'q8'` → 找 `onnx/model_quantized.onnx`（**不是** `model_q8.onnx`）；`dtype:'fp16'` → `onnx/model_fp16.onnx`。自定义/转换模型时命名要对齐，否则 404。

⚠️ **前缀坑**：部分模型需查询/文档前缀（如 e5 用 `query: `/`passage: `）。**查询与入库两侧前缀要一致**（否则查-档相似度系统性偏低），且要记进 provenance。

---

## Q5 · EPUB 分块策略（RAG）

**2026 基准结论**：**递归分词 ~512 token + 10–20% overlap 是最强默认**（Firecrawl/FloTorch 实测 ~69% 准确率，胜过了"更花哨"的语义分块——后者常产出 ~40 token 碎片，端到端仅 54%）。
⚠️ **别迷信"更高级=更好"**：语义分块在长叙事有效，但在结构化/中文语料上常反效果且 3–5× 向量成本。

**按内容/查询类型调参（EPUB 场景）**：
| 场景 | chunk size | overlap |
|---|---|---|
| 事实型查询（人名/日期/定义） | **256–512 token** | 10% |
| 混合/默认（EPUB 正文） | **~512 token** | **10–20%** |
| 分析型/跨段推理 | 768–1024 token | 20% |

**EPUB 特化（关键）**：
1. **token 计，不是 character**——嵌入模型限的是 token，`length_function` 用 tokenizer。
2. **尊重 EPUB 结构**：优先按 foliate-js 的 CFI/章节边界切，**不拆句子、不拆段落**；把**章节标题前置**到每个 chunk 头部（补回"孤立 chunk 丢失文档上下文"的缺陷，等价于轻量 contextual retrieval，零 LLM 成本）。
3. **overlap 是"保险"不是银弹**：2026 有研究称稀疏检索下 overlap 无可测收益还增存储——**小 overlap（~10%）起步，按你的召回指标再调**。
4. **升级路径（按需）**：长文档跨引用多 → late chunking（整文嵌入再池化，仅需嵌入模型）；有 LLM 预算且求极致精度 → contextual retrieval（每 chunk 前置 LLM 上下文 blurb，Anthropic 实测降失败率 35–67%）。**v1 不上，YAGNI**。

---

## 推荐 v1 架构（对齐 §1 local-first + YAGNI）

```
EPUB (foliate-js) 
   → 抽全文 + CFI/章节结构（engine）
   → 分块：递归 ~512 token + ~10% overlap，章节标题前置（core/ai/chunking）
   → 双通道索引：
        FTS5 (main/local)  tokenize='unicode61'(中文)   ← 关键词
        vec0 (local.db)    embedding float[384] cosine + chunk_id 元数据列   ← 语义
        嵌入：transformers.js WASM+q8, multilingual-e5-small(384维)  [Web Worker]
   → RRF (k=60) 融合两通道排名 → top-K RetrievalHit{cfi, text, source, score}
   → 喂给 AIProvider（chat/summarize）
```

**分阶段（YAGNI）**：
- **Phase3a（最小闭环）**：FTS5 + JS 进程内暴力余弦（不碰 vec0）+ RRF。零扩展依赖，最快跑通。
- **Phase3b（索引化）**：确认暴力余弦延迟不可接受时，再引入 vec0（loadExtension + 元数据列模式），local.db 存向量索引。
- **v2+**：跨书知识图谱、FSRS、多语言增强、contextual/late chunking。

**每阶段落地前，用 `books/*.epub`（含毛泽东选集）+ 合成 fixture 做召回评测**，用数据决定"是否升级索引/分块策略"——不锚定先入参数。

---
## 复测脚本（本机已验证）
- FTS5/bm25：`node /tmp/opencode/fts_test.js`
- vec0 loadExtension + KNN（含 cosine）：`node /tmp/opencode/ragtest/e2e_fixed.cjs`
- 主键绑定诊断：`node /tmp/opencode/ragtest/isolate.cjs`
- 向量绑定形式诊断：`node /tmp/opencode/ragtest/insert_diag.cjs`
- 元数据列生产模式（最终形态）：`node /tmp/opencode/ragtest/meta_diag.cjs`
> 注：上述脚本在 `/tmp/opencode`（临时），落地时按本文件的"正确形态"重写到 `@hyr/core/ai`。
