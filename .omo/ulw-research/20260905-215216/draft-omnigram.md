# Omnigram 研究草稿（待 P4 汇编）

> [MEASURED]=文档/代码明确陈述；[INFERRED]=由代码推断。来源：bg_8c452866（explore，40m27s）。
> 仓库：/home/huangaf/projects/omnigram

## 产品定位
- [MEASURED] Omnigram = "AI-native, self-hosted book library and reading service"（README.md:16-20）
- [MEASURED] 口号："Jellyfin for videos. Immich for photos. Omnigram for books."
- [INFERRED] 定位 = AI原生的、自部署(NAS/HomeServer)的电子书书库管理+阅读服务；**不是**闪卡/间隔重复，**不是**纯笔记
- 核心：书库管理(目录扫描/元数据提取/多格式) + 沉浸式阅读(EPUB/PDF/MOBI/AZW3/FB2/TXT) + AI隐形集成(自动摘要/标签/语义搜索/知识网络/跨书关联) + TTS语音(Kokoro/Edge服务端+sherpa-onnx设备端) + 多设备同步(进度/笔记高亮/书签)

## 前端（Flutter app/）
- [MEASURED] Flutter3.41+/Dart3.8+, Riverpod v2, sqflite+sqflite_common_ffi(本地SQLite), dio(HTTP), flutter_html(AI回复渲染), fl_chart+graphview(图表+知识图谱), flutter_tts(forked), audio_service+shelf(后台音频)
- 四Tab导航（home_page.dart）：Reading Desk(继续阅读/随机推荐/最近阅读) / Library(书架:列表/分类标签/搜索) / Insights(阅读叙事/知识图谱graphview) / Settings(AI/TTS/阅读偏好/同步/服务器连接)
- 关键页：immersive_reader(foliate-js沉浸阅读), book_detail, book_notes, audiobook+sync_listening(句子同步聆听), search(语义搜索), stealth(隐身书房隐私空间), onboarding
- Provider（100+ files）：companion, current_reading/last_read_book/desk, book_list/book_notes/bookmark, sync/sync_status, tts_player_session/audiobook, ai_chat/ai_history/ai_providers, knowledge_graph
- AI集成（service/ai/）：companion_prompt(TARS性格:主动性/风格/深度/温度可配), tools/book_content_search_tool
- 主题（theme/liquid_glass/）：20+ Liquid Glass组件，iOS26风格

## 后端（Go server/）
- [MEASURED] Go1.23 + Gin + GORM, BadgerDB(KV,AI cache), SQLite/PostgreSQL+pgvector(向量)
- Service分层（service/）：auth / reader(核心:书籍CRUD/同步/AI/知识网络/笔记高亮/统计/标签/书架) / sys(目录扫描) / ai(LLM调用+向量嵌入) / tts(Kokoro/Edge/OpenAI TTS,有声书,句子级对齐) / opds(目录协议) / user(AI伴侣配置)
- 数据模型（schema/）：Book(元数据+EPUB/PDF/FB2/MOBI/AZW3提取), ReadProgress(progress_index/para_position/progress+预计完成日ExptEndDate), Annotation(笔记高亮书签:CFI定位/选中文本/颜色), ConceptTag+ConceptEdge(知识网络:AI从笔记提取概念节点+跨书关联边), CompanionChat+MarginNote(AI伴侣对话+页边批注跨书提示), CompanionProfile(TARS性格proactivity/style/depth/warmth+自动开关), Shelf/ShelfBook, Tag/BookTagShip, AiResult(生成结果缓存contextBar/summary/autoTag/glossary/narrative), User/Role, Session(refresh_token+设备信息), ApiKey, tts, audiobook
- 中间件（middleware/）：basic_auth/cors/logger/rate_limit
- 存储层（store/）：orm/store(GORM封装), badgerdb(KV,AI cache), localdir/kv

## API表面（OpenAPI, 2583行, 6 Tag组）
- /auth/*：login/token/refresh/logout/apikeys/reset
- /admin/*, /user/*：用户管理
- /reader/*（核心）：index/books/recent/fav/books{id}CRUD/upload/download/progress/stats/annotations/rating/tags/shelves/ai/companion/chat/margin-notes/search/sessions/stats{overview,daily,books}/batch/knowledge
- /sync/*：full(SSE流式)/delta(基于utime增量)/annotations/ai/cache/sync/books/batch/version
- /sys/*：ping/info/scan{status,run,stop}
- 语音（/m4t/*, /v1/*）：tts/speakers/tts/stream(SSE)/v1/tts(OpenAI兼容)
- /img/covers/{id}：封面

## 测试策略（testing-strategy.md）
- 核心原则：外部视角优先(爬虫/HTTP验证,非AI写逻辑断言同源偏差) / 零token工具优先(静态分析/自动爬虫/fuzz) / 声明式>编程式(Hurl/Maestro) / 冒烟>全覆盖 / 自动发现>Schemathesis+Robo
- 测试金字塔：L1 flutter analyze / go vet+staticcheck(零)；L2 Firebase Robo+go test+Schemathesis fuzz(零)；L3 Golden Test(UI截图diff)+Hurl smoke(一次性低)；L4 Maestro E2E+Dart API integration(低)
- AI服务测试：Fixture回放(VCR), server/service/ai/testdata/*.json

## 开发/CI工作流（Makefile + docker-compose.yml）
- Makefile：app-deps/flutter pub get, app-codegen/gen-l10n+build_runner, app-analyze/flutter analyze, app-test/flutter test, app-build-apk, server-build/go build, server-test/go test ./..., server-swagger, docker, test
- docker-compose：omnigram-server(Go+PostgreSQL+pgvector), tts(Kokoro-FastAPI Sidecar,可换Qwen3-TTS/Chatterbox Turbo), 挂载/books+/metadata
- CI（.github/workflows/）：test-api(Docker自建→Hurl smoke→Dart integration→Schemathesis fuzz), test-robo(Flutter build APK→Firebase Robo自动爬虫), test-app(常规Flutter+Golden), build-{android,ios,windows,macos}, deploy-testflight/playstore

## ⚠️ 关键发现：Omnigram **没有**间隔重复/闪卡/复习系统
- [MEASURED] 对全部Go(.go)+Dart(.dart)搜索 review|spaced-repetition|flashcard|supermemo|sm-2|interval.*repeat：
- [INFERRED] Omnigram完全没有SM-2/Anki式复习调度。只有：阅读进度追踪(ReadProgress:百分比+CFI), 阅读会话记录(POST /reader/sessions), 每日统计(GET /reader/stats/daily)
- AI伴侣PostChapterQuestions(companion_profile.go:19)="章节读后提问"，是AI对话功能非间隔复习

## 对 help-you-read 可复用
### ✅ 高度可复用
- EPUB元数据提取（schema/book.go:438-477）：Go端EPUB OPF解析逻辑直接复用
- 书库管理（service/sys/scan.go）：目录扫描模式可借鉴
- 阅读进度模型（ReadProgress:CFI+百分比+para_position）：完全适合读中/读后
- 笔记高亮系统（Annotation:CFI+选中文本+颜色+类型）：RIA便签(I/A1/A2)可直接映射Annotation.Type
- 知识网络（ConceptTag+ConceptEdge:AI从笔记提取概念,跨书关联）：读后知识网络化绝佳参考
- 同步协议（Delta+Full SSE流式+批量）：多端同步直接复用
- AI伴侣性格模型（TARS:proactivity/style/depth/warmth+autoChapterRecap/crossBookAlerts）："AI读前/读中/读后介入"性格配置可借鉴
- TTS集成（Sidecar Kokoro+sherpa-onnx设备端TTS+句子级对齐）：有声书功能可复用
- 隐私空间（Stealth library隐身书房+生物识别）："某些书不便被知道"场景相同
### ❌ Omnigram没有、help-you-read需自研
- 间隔重复/闪卡：完全没有SM-2/Anki式复习调度
- RIA便签系统：只有通用highlight/note，无I/A1/A2分类
- 四层次阅读法：无检视/分析阅读自动化支持
- 读前AI介入：只有导入时自动摘要/标签，无"读前导览"
- 主题阅读：有书架/标签，但无"多书并行读后笔记整合"
### 🔥 最值得关注的数据模型
- schema/annotation.go:11-26 Annotation ≈ RIA便签（Type→I/A1/A2, SelectedText→原文摘录, CFI→EPUB定位）
- schema/concept.go:9-36 知识网络模型 ≈ 读后知识整合

## EXPAND（见 expansion-log.md）
