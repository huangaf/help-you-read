# draft-readany.md — ReadAny（AI 阅读助手，monorepo）

> 来源：本地 repo `/home/huangaf/projects/ReadAny`（README.md / README_CN.md 直接读取；monorepo/sync 由 explore agent bg_1f98cfb8/bg_21fb54ba 完成；skill 系统由主 agent 直接读 docs/skills-design.md）。
> 状态：**P1 完成**（product / monorepo / AI / EPUB / sync / skill 六节已填；TTS 代码细节延后到 P6 技术方案）。
> 标注：`[MEASURED]`=代码/文档直接证实；`[INFERRED]`=由架构推断。

---

## 1. Product positioning（产品定位）[MEASURED]

- **一句话**：`AI 阅读助手，而不是传统 PDF/EPUB 阅读器`（README_CN.md:3）[MEASURED]。
- **定位**：本地优先（local-first）、开源、跨平台（桌面 + 移动）的 AI 阅读助手。
- **支持格式**：EPUB、PDF（MOBI/DOCX 标注"计划中"）。
- **核心卖点**：
  - AI 对话（基于当前选中/章节，RAG 风格）[MEASURED]
  - AI 摘要（整书/章节）[MEASURED]
  - TTS 听书（多种引擎 + 声音选择）[MEASURED]
  - 划线高亮 / AI 批注 [MEASURED]
  - AI 笔记（自动/手动）[MEASURED]
  - WebDAV 云同步（多设备数据同步，可选）[MEASURED]
  - 技能系统（Skills：自定义 AI 工作流，**对话即可创建 skill**）[MEASURED]
- **架构**：monorepo，6 个 package（见 §2）[MEASURED]。
- **技术栈**：React + TypeScript；桌面 Tauri / 移动 Expo React Native（共享 `@readany/core`）[MEASURED]。
- **数据**：本地 SQLite；WebDAV 同步为可选 [MEASURED]。
- **许可**：MIT（README.md:13）[MEASURED]——比 sageread 的 AGPL-3.0 **更宽松**，对商业/闭源集成友好。

> 对本项目：ReadAny 是"功能最全的 AI 阅读器参考实现"，其**技能系统（§6）正是"9 种读书方法固化为功能"的落地范式**——这是 item 2 需求文档最直接的借鉴来源。

## 2. Monorepo structure（6 packages）[MEASURED]

| package | 角色 / 关键内容 |
|---|---|
| `packages/core` (`@readany/core`) | 共享核心：数据层（SQLite：books/highlights/notes/tags/messages/skills）、AI provider 抽象、阅读器引擎、**TTS 引擎抽象**（`src/tts/`）、WebDAV 同步、类型定义 [MEASURED] |
| `packages/app` (`@readany/app`) | 桌面 React app（Tauri）：Library/Reader/Skills/Settings/TestDB 页面；`src/services/{ai,tts,db,sync}.ts`；Tauri 命令（`src/tauri-commands.ts`）[MEASURED] |
| `packages/app-expo` (`@readany/app-expo`) | 移动 Expo app：Books/Reader/Screens（Library/Settings）；`src/services/{ai,tts,db}.ts`；**无 sync 服务**（移动端暂不支持 WebDAV）[MEASURED] |
| `packages/server` (`@readany/server`) | **独立 Node 后端**：Express + TS，提供 AI API（`/api/ai/chat|summarize|annotate`）、TTS 代理、**本地 LLM provider（Ollama/LM Studio）**；非 Tauri/Expo 的一部分，可独立运行 [MEASURED] |
| `packages/preset-skills` (`@readany/preset-skills`) | 预置技能：`src/skills/*.ts`（12 个 skill），通过 `generatePresets()` 生成 preset SQL，供 core/app/app-expo 共享 [MEASURED] |
| `packages/foliate-reader` (`@readany/foliate-reader`) | 阅读器引擎封装（`src/engine.ts`），基于 vendored foliate-js [MEASURED] |

**关键洞察（对本项目）**：
- `@readany/core` 是跨桌面/移动共享层——**新引擎（foliate-js）应落在 core，而非 app 里复制**（§7 EXPAND-01）。
- **AI provider 抽象 + 独立 Node server**：ReadAny 支持"本地 LLM（Ollama/LM Studio）/ 外部 API / server 代理"三种 AI 路径 [MEASURED]——对本项目"AI 全程介入"的 provider 抽象是可直接借鉴的模式。
- **preset-skills 用 SQL preset 共享**：`generatePresets()`（packages/preset-skills/src/index.ts:13）[MEASURED]——"9 种读书方法 → 预置 skill（SQL/manifest）"可直接套用此模式。
- **TTS 引擎抽象在 core**（`src/tts/`）[MEASURED]——多引擎可插拔。

## 3. AI engine（AI 能力）[INFERRED + MEASURED]

- **Provider 抽象**（core/src/ai/types.ts）[MEASURED]：`AIProvider` 接口 = `chat(messages, tools?, opts?) → AIChatResult` + `summarize(content) → string`，**故意不暴露 embeddings()**（注释明确："providers that don't support embeddings can still be used for chat and summarization"，types.ts:32-48）[MEASURED]。
  - **三种 provider**（README.md:21-30）[MEASURED]：
    - **Built-in**：Tauri/Expo 内建，用本地 SQLite FTS5 + LIKE 做"RAG"（非向量库）[INFERRED]
    - **External API**：OpenAI-compatible chat completions（任何兼容端点，含本地代理）[MEASURED]
    - **Local LLM**：Ollama / LM Studio，经 `packages/server` 代理 [MEASURED]
- **FTS5 + LIKE 检索**（非向量）[INFERRED，与 sageread 的向量库形成对比]：ReadAny 走"全文检索 + LLM"，不依赖 embedding 模型——**部署更简单（无需向量库/embedding）**。
- **AI 能力面**（README）：对话、整书摘要、章节摘要、选中内容解释/翻译/总结、AI 笔记 [MEASURED]。
- **技能系统（§6）是 AI 能力的"可组合层"**：把固定工作流封装成 skill，用户对话即可创建/调用 [MEASURED]。

> 对本项目：AI provider 的"三种路径 + FTS5 非向量检索"是务实选择；但**若要承载 #6 SuperMemo 间隔重复 / #8 芒格逆向（需强语义检索）**，可能仍需引入向量 RAG（sageread 模式）——见 §7 EXPAND-02。

## 4. EPUB engine（EPUB_CONVERSION_PLAN.md，1316 行）[MEASURED]

- **问题**：旧引擎 `epubjs` 对真实 EPUB（大量 CSS/JS、复杂 layout）静默失败——章节丢失、内容损坏、渲染慢 [MEASURED]（EPUB_CONVERSION_PLAN.md:7-19）。
- **方案**：用 `foliate-js`（v1.0.1，MIT）替换 epubjs。选它因：(1) 更健壮的 CSS 处理（解析完整 CSS cascade，含 specificity、媒体查询、`@supports`）；(2) 对 `<script>`/CSS `url()` 更强消毒（默认剥脚本、CSP）；(3) `transformTarget` API 支持自定义 DOM transform [MEASURED]（:21-40）。
- **foliate-js 关键 API** [MEASURED]：`createDocument(html, options)`、`parseStylesheet(css)`（:56-78）；`transformTarget(target, transform, options)`（:120-149，含 `removeElements`/`replaceElements` 选择器）；CSP（:153-182，默认 `script 'none';`）；`createDocument(html, {csp})`。
- **实施**（6 阶段）[MEASURED]：Phase0 验证 foliate-js 能否渲染真实 EPUB → Phase1 DocumentLoader 类（:327-450）→ Phase2 接 Engine → Phase3 高亮（:617-740）→ Phase4 TTS 集成 → Phase5 移除 epubjs。
- **高亮策略**：不用 epubjs 的 Cove 标注，改为"CSS class + data attribute"（`.readany-highlight`）——foliate 的 transformTarget 注入 class，高亮数据存 DB，按 CFI 定位（:617-695）[MEASURED]。
- **风险** [INFERRED/MEASURED]：foliate-js v1.0.1 成熟度（mitigated——活跃维护、MIT）；移动端性能（大 EPUB，需测）；`transformTarget` 语义需实测；CSS 兼容性（旧 EPUB 的怪异 CSS）[MEASURED :923-1015]。
- **决策**：Phase 0 GO/NO-GO gate——先抽 3 个真实 EPUB（含复杂 CSS）验证 foliate-js，通过才全面替换 [MEASURED :1026-1073]。

> 对本项目：**直接确认"vendor foliate-js + own patch layer，而非 npm@1.0.1"** 的决策（用户已确认）——ReadAny 的 EPUB_CONVERSION_PLAN 是"如何把 foliate-js 接进自定义阅读器"的**现成路线图**（DocumentLoader + transformTarget + CFI 高亮），可整套借鉴到本项目引擎层。

## 5. Sync / WebDAV（WebDAV 云同步）[MEASURED]

- **定位**：可选的云同步（`SyncMode: off | local-only | cloud-sync`，三者互斥，sync/modes.ts:14-26）[MEASURED]。默认后端 = WebDAV（本地实现，无额外依赖；可加其它 backend）[MEASURED]。
- **同步哪些表**：books, book_files, highlights, notes, tags（sync/index.ts:12-18）[MEASURED]。`sync_runs` 记录每次运行；`conflict_log` 记录冲突 [MEASURED]。
- **数据形态**：整库 JSON 快照 `{version, deviceId, syncAt, tables:{...}}`（sync/types.ts）[MEASURED]——**单文件快照，非逐表增量流**。
- **同步引擎（5 步 pipeline）** [MEASURED]：
  1. collectLocalData()——读本地 SQLite，组装 LocalSnapshot（每行带 updatedAt）
  2. fetchRemoteSnapshot()——从 backend 拉远端快照（WebDAV GET）
  3. compareSnapshots()——按 (table, id) 对齐，逐行比 version/updatedAt，产出 applyItems + conflicts
  4. applyRemoteChanges() + resolveConflicts()——写本地、解冲突（含 delete tombstone）
  5. persistSyncResult()——更新 lastSyncAt、写 sync_runs、上传远端快照
- **冲突解决**：4 策略 `local-wins / remote-wins / latest-by-updatedAt / manual`，可按表覆盖（conflictResolution JSON），默认 `latest-by-updatedAt`（sync/conflicts.ts:10-23）[MEASURED]。
  - **关键语义** [INFERRED]：`updatedAt` 相同仍可能冲突（两台设备离线各自改同一行，时间戳打平）→ latest-by-updatedAt 在"相同 updatedAt + 不同 dataHash"时**不能自动解**，落到 manual。**这是 WebDAV 快照方案的根本弱点**（无向量时钟/Lamport）。
- **增量 vs 全量**：远端 `syncAt < 本地 lastSyncAt` → delta（changedSince，只拉变更行）；否则 full replace [MEASURED]。
- **时间旅行**：`sync_runs` 存 before/after 快照，`restoreSyncRun()` 可回滚（但只能回到某次同步点）[MEASURED]。
- **设备身份**：deviceId 每设备唯一；`sync_devices`（active/revoked），被动注册，可手动 revoke [MEASURED]。
- **WebDAV backend**：本地实现，auth 支持 basic/digest/bearer/token（sync/webdav.ts）；digest 用 MD5 [MEASURED]。
- **限制** [INFERRED/MEASURED]：单文件 JSON 快照（大库 → 大文件、全量慢）；并发同步有竞态（无锁，靠 latest-by-updatedAt 兜底，可能互相覆盖）；**无端到端加密**（快照明文存 WebDAV，:354-360）。

> 对本项目：**跨设备同步（#复习 的多设备场景）可直接借鉴此 5-step pipeline + 冲突策略**；但"相同 updatedAt 冲突需 manual"是硬弱点——若本项目要自动同步，应引入**向量时钟或 per-row 单调 counter（Lamport）**，而非纯 updatedAt。见 §7 EXPAND-03。

## 6. Skill system（技能系统——"9 种读书方法固化为功能"的落地范式）[MEASURED]

> **这是 item 2（需求文档）最直接的借鉴来源。** ReadAny 把"AI 能力"抽象成 **Skill**，用户可对话创建、启用/禁用、同步、导入导出。9 种读书方法 → 各自封装成一个 Skill，正是"固化为软件功能"的现成模式。

- **现状**：skill = prompt-only AI 能力模板（`Skill` 类型 + `skills` 表：id/name/description/icon/enabled/parameters/prompt/builtIn，skill.ts:12-28、skill-queries.ts:14-35）[MEASURED]。
- **升级设计（skills-design.md）**——目录式 Skill Bundle + 工具能力目录 [MEASURED]：
  - **三种 kind**（types/skill.ts:14）：`prompt`（=legacy，纯提示词）/ `agent`（prompt + 声明 tools，模型决定调用）/ `script`（确定性本地自动化）[MEASURED]。
  - **Skill Bundle**（目录式，仿 Claude Skills/Agent Skills）：`SKILL.md` + `readany.skill.json`(manifest) + `scripts/` + `references/` + `assets/`（skills-design.md §4.2）[MEASURED]。
  - **Manifest 字段**（§6）：schemaVersion / id / kind / source(builtin|user|imported) / trusted / access / parameters / tools(白名单) / prompt.path / script / 时间戳 [MEASURED]。
- **Capability Catalog（能力目录）**（§8）：AI 创建 skill 时看到的**稳定工具 API**，不是裸 DB——`reader.getCurrentBook / books.search / highlights.listByBook / notes.create / messages.search / skills.create / db.query ...`（第一批 ~17 个工具，§8）[MEASURED]。
  - **Access level**（§4.5/§8）：`none / read / write / full`，映射到工具权限；`full` 才允许 `db.query/db.execute` [MEASURED]。
- **AI 自然语言创建 skill**（§9）：用户说"帮我创建一个 xxx skill" → AI 判断信息是否足够，缺关键项只问 1-3 个问题 → 生成草稿（名称/作用/访问级别/工具）→ 用户确认后才 `skills.create` [MEASURED]。
- **脚本运行时**（§10）：`readany-js`，注入 `ReadAnySkillAPI`（reader/books/highlights/notes/tags/messages/skills/db/ai/log，§10）；运行限制：默认超时 10s、写操作事务包裹、`full` access 才开放 db、第三方 skill 默认 `trusted=false` 未信任不跑脚本 [MEASURED]。
- **同步/导入导出**（§13）：`skill_files` 表存 bundle 文件（hash 用于冲突判断）；导出 zip；导入第三方 skill → 检查 schemaVersion → 用户确认信任后启用 [MEASURED]。
- **6-phase 实现路线**（§14）：P0 补强 → P1 manifest 兼容层 → P2 capability catalog → P3 对话创建 skill → P4 script runtime → P5 bundle 导入导出 → P6 高级（skill pack/版本/定时/分享）[MEASURED]。
- **兼容原则**（§7）：旧 Skill 类型/表/UI 全保留，新旧双向映射（`legacySkillToManifest` / `manifestToLegacySkill`）[MEASURED]。

> **对本项目（关键设计决策）**：
> 1. **"9 种读书方法 → 9 个预置 Skill"** 是本项目"AI 全程介入"的核心落地机制：每种方法（#1 RIA、#2 四层次、#3 三遍、#6 SuperMemo…）封装成一个 Skill（kind=prompt/agent/script），通过 Capability Catalog 暴露稳定工具 API，用户对话即可创建/调用。
> 2. **按读前/读中/读后/复习 组织 skill**：每个阶段提供对应方法的 skill（如"读前·快速定位"skill、"读中·RIA 批注"skill、"复习·间隔重复"skill）——**阶段 = skill 的分类维度**。
> 3. **preset-skills 用 SQL/manifest preset 共享**（ReadAny `generatePresets()` 模式）——9 个读书方法 skill 可作为 preset 随库分发。
> 4. **Access level（none/read/write/full）** 对应"AI 介入的深度"：读前/读中多 read，读后写笔记用 write，#8 芒格逆向/数据迁移用 full——**权限分级 = AI 介入边界**。

## 7. TTS / Voice（听书）[产品层 MEASURED；代码细节 → P6]

- **产品层**（README.md:24, README_CN.md:15）[MEASURED]：TTS 听书，**多种引擎 + 声音选择**。
- **引擎抽象在 core**（`src/tts/`）[MEASURED]：多引擎可插拔。
- **代码细节**（具体引擎列表、voices 数据结构、流式合成）：**延后到 P6 技术方案**（读 docs/system-voice-design.md + TTS_FOLIATE_NATIVE_MIGRATION.md 时再展开）。
- **已知背景**（TTS_FOLIATE_NATIVE_MIGRATION.md）：ReadAny 正在做"TTS 从 epub.js 切到 foliate-native"的迁移 [MEASURED，文件存在]。

> 对本项目：#听书（读中）的 TTS 引擎抽象可借鉴 ReadAny"多引擎可插拔 + core 层"设计；具体引擎选型在 P6 定。

## EXPAND（未展开线索）

- **EXPAND-01**：`@readany/core` 作为跨桌面/移动共享层——**新引擎（foliate-js）应落 core，不在 app 里复制**。
- **EXPAND-02**：AI 检索是 FTS5+LIKE（非向量）——#6/#8 若要强语义检索，评估是否需引入向量 RAG（对比 sageread）。
- **EXPAND-03**：WebDAV 同步"相同 updatedAt 冲突需 manual"是硬弱点——跨设备自动同步应引入向量时钟/per-row Lamport counter。
- **EXPAND-04**：skill 脚本运行时 `readany-js`（QuickJS vs eval）开放问题（skills-design.md §15）。
- **EXPAND-05**：TTS 引擎具体列表 + foliate-native 迁移细节（→ P6）。
- **EXPAND-06**：preset-skills 的 12 个预置 skill 具体清单（packages/preset-skills/src/skills/*.ts）——可对照"9 种读书方法"看覆盖度。
