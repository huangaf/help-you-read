# EXPAND 线索台账（P2 收敛用）

> 记录各研究agent返回的 EXPAND leads，去重，标注状态与所服务的阶段。
> 状态：unchecked（未追扩）/ done（已追扩）/ closed-duplicate / dead-end

## 来源：sageread（bg_fbfe8b66）
- [unchecked] sanitizer.rs 文本净化 — WHY: 影响embedding质量与RAG检索(读中上下文) — ANGLE: grep "sanitizer"，读全文
- [unchecked] gguf/ 模块 GGUF元数据 — WHY: 多本地模型时GGUF解析决定能力发现(上下文长度/量化/架构) — ANGLE: 读gguf/types.rs+helpers.rs
- [unchecked] 前端pages结构 — WHY: sageread UX模型直接指导help-you-read页面架构(读前/中/后) — ANGLE: glob packages/app/src/pages/**
- [unchecked] operations.rs 批量插入策略 — WHY: 大规模导入时插入性能决定UX(向量化时长) — ANGLE: 读operations.rs,量batch size
- [unchecked] notes/tags models.rs 数据schema — WHY: 笔记/标签架构决定读中批注+复习闪卡建模 — ANGLE: 读models.rs
- [unchecked] skills/models.rs AI技能模型 — WHY: skills直接映射读前prep提示词/读后summary模板 — ANGLE: 读skills/models.rs+commands.rs
- [unchecked] threads/models.rs AI对话结构 — WHY: thread模型决定读中Q&A组织(每书/每章/全局) — ANGLE: 读threads/models.rs
- [unchecked] fonts/commands.rs 字体转换 — WHY: 字体支撑读中可读性 — ANGLE: 读fonts/commands.rs
- [unchecked] database.rs SQLite schema — WHY: DB设计是数据模型基础(books/notes/progress/AI对话) — ANGLE: 读database.rs+迁移文件
- [unchecked] config/search.rs 混合搜索权重策略 — WHY: 检索质量是复习骨干 — ANGLE: 读config/search.rs+mod.rs
- [unchecked] reader.rs EPUB文本提取 — WHY: 读前/读中AI理解依赖提取质量(尤其中文+混合内容) — ANGLE: 全文读reader.rs
- [unchecked] toc_parser.rs 嵌套TOC处理 — WHY: TOC结构决定导航UX+章节级AI摘要边界 — ANGLE: 读toc_parser.rs
- [unchecked] device.rs GPU设备检测 — WHY: 自部署AI时设备检测决定模型可行性(显存) — ANGLE: 读device.rs

## 来源：omnigram（bg_8c452866）
- [unchecked] provider.go AI prompt模板/调用链 — WHY: help-you-read"AI读前/中/后介入"需理解prompt设计(上下文条触发/何时调LLM) — ANGLE: 读provider.go+handler_ai.go,搜contextBar/autoTag/glossary
- [unchecked] immersive_reader.dart foliate-js集成 — WHY: 阅读器核心体验(翻页/CFI解析/高亮交互)依赖foliate-js封装 — ANGLE: explore app/lib/page/reader/,搜foliate/cfi/renderer
- [unchecked] handler_sync.go delta sync完整实现 — WHY: 多端同步的conflict resolution/增量检测是关键设计点 — ANGLE: 全文读handler_sync.go
- [unchecked] tts/alignment.go+sentence_splitter.go TTS句子级对齐 — WHY: 听书同步阅读(类SuperMemo音频辅助记忆)需句子级精确定位 — ANGLE: explore server/service/tts/
- [unchecked] read_process.go ExptEndDate(预计完成日)计算 — WHY: 读后复盘需知用户是否按计划读完；ExptEndDate暗示阅读计划追踪 — ANGLE: 搜ExptEndDate用法,理解reading plan
- [unchecked] companion_prompt.dart TARS性格prompt engineering — WHY: 需为读前导览/读中问答/读后总结设计不同AI prompt — ANGLE: 读companion_prompt.dart+搜prompt templates
- [unchecked] superpowers/specs/ 架构设计文档 — WHY: sync-architecture/onboarding/cross-book-connections揭示产品决策+架构演进上下文 — ANGLE: 读sync-architecture.md, cross-book-connections-design.md, ambient-ai-reading-design.md
- [unchecked] insights_page.dart 阅读叙事实现 — WHY: Omnigram"not data, self-awareness"理念如何实现 — ANGLE: 读insights_page.dart+搜narrative/insight
- [unchecked] ExptEndDate结合间隔重复 → 独特复习触发机制 — WHY: "预计完成日+实际进度"结合SM-2可造独特复习触发 — ANGLE: 设计review trigger(超期N天→提示复习)

## 高价值优先（服务需求文档 item2）
- 数据模型：sageread notes/tags/skills/threads models + omnigram annotation/concept/companion schema
- AI prompt设计：omnigram provider.go + companion_prompt.dart
- 同步协议：omnigram handler_sync.go
- 复习机制：omnigram ExptEndDate（唯一接近"复习触发"的现有实现）
- 页面/UX结构：sageread pages + omnigram four-tab nav

## Now
P1 完成 sageread+omnigram；待 ReadAny(续跑)+Foliate(librarian) → P2 追扩高价值线索
