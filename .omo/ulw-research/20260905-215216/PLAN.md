# ULW 工作台账 — help-you-read（AI 辅助阅读器）需求+设计

Started: 2026-09-05（见 SESSION_DIR 目录时间戳）

## 格式契约（binding，用户已确认）
- 输出格式：纯 Markdown（工作稿），不渲染 PDF/DOCX
- 保存位置：help-you-read/docs/（AGENTS.md 放仓库根 help-you-read/）
- 研究报告组织：1 份合并大报告（三项目按章节），文件 help-you-read/docs/读书工具研究报告.md
- AGENTS.md：需要，研究完成后（P7）一并产出，放 help-you-read/AGENTS.md
- 需求文档：help-you-read/docs/（P5 产出）
- 技术方案：help-you-read/docs/（P6 产出）

## 目标（交付物，依赖链 1→2→3 + AGENTS.md）
- [ ] 交付1：ReadAny / sageread / omnigram 合并研究报告（技术文档+代码逻辑，含 file:line 引用）
- [ ] 交付2：help-you-read 需求文档（9种读书方法固化为功能、AI读前/读中/读后/复习全流程，借鉴 ReadAny+sageread）
- [ ] 交付3：help-you-read 分阶段技术方案（详细、可行）
- [?] AGENTS.md：为 help-you-read 仓库写开发指引（P7）

## 核心概念：9 种读书方法（源 help-you-read/docs/读书方法总结.md）
1. RIA便签（赵周）— 致用类书，知识→行动；I/A1/A2 三类便签
2. 四层次阅读（Adler《如何阅读一本书》）— 基础/检视/分析/主题；主动阅读4问
3. 三遍阅读（Paul Graham）— 非虚构；纵览5-10%→细节70-80%→笔记10-20%
4. 宝塔式（邹韬奋）— 浏览→选优→精读，避免平均用力
5. 麦肯锡高效（赤羽雄二）— 职场；保证时间/集中读/转数据库/多输出
6. SuperMemo间隔重复（Piotr Woźniak）— 遗忘曲线+间隔复习，SM-2/SM-20
7. 名人读书法 — 毛(不动笔墨不看书)/鲁迅(跳跃)/曾国藩(不二)/老舍(印象)/华罗庚(由薄到厚再由厚到薄)/爱因斯坦(总分合)/朱熹(三到)
8. 芒格多元思维 — 跨界构建思维模型，认知复利，逆向思维
9. 共振阅读（渡边康弘）— 20分钟读懂，低门槛，找"有用"的内容

## 初步阶段映射（假设，待研究验证）读前/读中/读后/复习
- 读前：#2检视(系统略读+粗浅) / #4选优汰劣 / #5不在无趣书上浪费时间 / #7爱因斯坦"总" / #9找有用内容
- 读中：#1 RIA便签(I/A1/A2) / #2主动阅读4问 / #3第二遍批判性细节 / #5集中读书法 / #7毛泽东批注·朱熹三到 / #9高效技巧(斜读跳读手指辅助)
- 读后：#3第三遍笔记转化 / #1 A2便签贴墙 / #5转数据库·输出 / #8逆向拆解
- 复习：#6 SuperMemo间隔重复 / #5讨论·行动 / #8终身阅读持续迭代
（注：9方法与4阶段并非一一对应，一个方法可跨多阶段；映射是"功能来源"而非"归属"）

## 三个项目身份（假设，待 explore agent 确认）
- ReadAny：EPUB 电子书阅读器（Foliate/foliate-js 基座）TS monorepo；特性 TTS/语音、webdav同步、stats、skills、CLI
- sageread：EPUB 阅读器（foliate-js）+ Rust 组件 + tabs；Rust 用途待确认
- omnigram：Flutter(跨平台) + Go 后端全栈应用；产品定位待确认（笔记/闪卡/阅读？）

## 阶段计划
- P0：拆解 + 格式门 ✅（已确认 Markdown / help-you-read/docs/ / 合并大报告 / AGENTS.md需要）
- P1：饱和研究波（4 agent 运行中）
- P2：EXPAND 收敛（对 EXPAND leads 追扩，>=2波）
- P3：验证有争议/未记录的关键论断（跑代码或权威源）
- P4：综合 SYNTHESIS → 填充合并研究报告（带引用）
- P5：需求文档（brainstorming 厘清意图 → help-you-read/docs/需求文档.md）
- P6：技术方案（writing-plans，分阶段、可执行 → help-you-read/docs/）
- P7：AGENTS.md（help-you-read 根）

## 约束
- 设计只借鉴 ReadAny + sageread（用户明示）；omnigram 仅研究，不强制借鉴
- 所有论断尽量带 file:line / URL 引用；区分 MEASURED vs INFERRED
- 中文撰写（用户语言）

## Now
P0 ✅ / P1 ✅（四份 draft）/ P2 ✅（docs/持久数据模型对比.md）/ P4 ✅（docs/读书工具研究报告.md）/ **P5 ✅ 需求文档已确认** / P6 ✅（技术方案 commit d9f73c3 + push）/ **P7 ✅ AGENTS.md commit 0f8e155 + push**
- **P6：技术方案已写盘并修正** `help-you-read/docs/技术方案.md`（writing-plans 纪律适配为设计文档：架构+模块划分+接口+schema DDL+分阶段路线）。spec self-review 已过，修 4 处：①§0 补隐私约束(NF5) ②skills DDL 对齐 SkillManifest(补 source/manifest_json) ③§3.5 公共类型 shape sketch 消除接口悬空引用 ④main.db 表计数 8→9（§3/§4/§5 三处同步）。**已 commit(d9f73c3)+push，工作树干净**。
- **P7：AGENTS.md 已写盘** `help-you-read/AGENTS.md`（83 行，12 节：项目定位/技术栈/monorepo边界/关键决策/数据模型/v1范围/编码约定/测试TDD/Git规则/文档同步/规格指针/语言规则）。内容与已修正的技术方案一致。**已 commit(0f8e155)+push**。
- **下一步（B 阶段）**：进入 writing-plans → Phase0 (scaffold) + Phase1 (engine layer) 逐任务 TDD 执行计划
