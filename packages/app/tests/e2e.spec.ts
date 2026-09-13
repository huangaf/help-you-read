// E2E 验收：导入EPUB → Reader渲染 → RIA笔记 → 复习卡 → SM-2评分 → 到期队列
// 前置：dev server 运行于 :1420，AIConfig 使用 oMLX endpoint
// 策略：UI 交互用 Playwright selectors，AI/DB 操作通过 /api/core HTTP（绝对 URL）

import { test, expect } from 'playwright/test';

const BASE_URL = 'http://localhost:1420';
const API_URL = `${BASE_URL}/api/core`;
const EPUB_PATH = '/home/huangaf/projects/help-you-read/books/fixture-nav-hidden.epub';
const BOOK_ID = 'browser:fixture-nav-hidden.epub';

test.describe('Phase 5 E2E: v1 最小闭环', () => {
    test.setTimeout(90_000);

    // S1: 页面加载 — 三栏布局 + tab 按钮渲染
    test('S1: 三栏布局渲染', async ({ page }) => {
        await page.goto(BASE_URL);

        // 两个 aside（左栏 Library + 右栏 TabPanel）
        await expect(page.locator('aside')).toHaveCount(2, { timeout: 10_000 });

        // Library 标题
        await expect(page.locator('h3:has-text("书库")')).toBeVisible();

        // Tab 按钮（5个）
        await expect(page.locator('button:has-text("AI 对话")')).toBeVisible();
        await expect(page.locator('button:has-text("RIA 笔记")')).toBeVisible();
        await expect(page.locator('button:has-text("复习队列")')).toBeVisible();
        await expect(page.locator('button:has-text("朗读")')).toBeVisible();
        await expect(page.locator('button:has-text("技能")')).toBeVisible();
    });

    // S2: 导入 EPUB → Reader 渲染 → 刷新后重新打开仍可渲染（IndexedDB 持久化）
    test('S2: 导入EPUB → Reader渲染 → 刷新重开', async ({ page }) => {
        await page.goto(BASE_URL);

        // 导入 EPUB（Playwright filechooser 拦截 app 的 input.click()）
        const importBtn = page.locator('button:has-text("导入 EPUB")');
        await expect(importBtn).toBeVisible({ timeout: 10_000 });
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            importBtn.click(),
        ]);
        await fileChooser.setFiles(EPUB_PATH);

        // 书库列表出现该书籍
        const bookEntry = page.locator('li button').filter({ hasText: /fixture|nav/i });
        await expect(bookEntry).toBeVisible({ timeout: 20_000 });

        // 导入即自动选中 → Reader 渲染文本（pre-wrap div）
        const contentDiv = page.locator('div[style*="pre-wrap"]');
        await expect(contentDiv).toBeVisible({ timeout: 30_000 });
        const text = await contentDiv.textContent();
        expect((text ?? '').length).toBeGreaterThan(10);

        // 刷新页面（清空 React state，但 IndexedDB 保留 EPUB 字节）
        await page.reload();
        await expect(bookEntry).toBeVisible({ timeout: 10_000 });

        // 重新点击书籍 → Reader 从 IndexedDB 读取并再次渲染
        await bookEntry.first().click();
        await expect(contentDiv).toBeVisible({ timeout: 30_000 });
        const textAfterReload = await contentDiv.textContent();
        expect((textAfterReload ?? '').length).toBeGreaterThan(10);
    });

    // S3-S6: RIA笔记 → 复习卡 → SM-2评分 → 到期队列（通过 /api/core）
    test('S3: RIA → 复习卡 → SM-2 → 到期队列 (API)', async ({ page }) => {
        await page.goto(BASE_URL);

        // 确保存在可关联的书籍（SQLite 持久；无则通过 API 导入）
        let booksRes = await page.request.post(API_URL, {
            headers: { 'Content-Type': 'application/json' },
            data: { method: 'listBooks', params: {} },
        });
        let booksBody = await booksRes.json();
        expect(booksBody.ok).toBe(true);
        let bookList = booksBody.data as Array<{ id: string }>;

        if (bookList.length === 0) {
            const impRes = await page.request.post(API_URL, {
                headers: { 'Content-Type': 'application/json' },
                data: { method: 'importBook', params: { filePath: 'browser:fixture-nav-hidden.epub' } },
            });
            const impBody = await impRes.json();
            expect(impBody.ok).toBe(true);
            bookList = [impBody.data as { id: string }];
        }

        const bookId = bookList[0]!.id;

        // RIA note 创建
        const noteRes = await page.request.post(API_URL, {
            headers: { 'Content-Type': 'application/json' },
            data: {
                method: 'addNote',
                params: {
                    bookId,
                    title: 'RIA: E2E 验证',
                    content: 'Read: fixture EPUB\nInterpret: 测试闭环\nApply: 验证 RIA',
                    method: 'ria',
                },
            },
        });
        const noteBody = await noteRes.json();
        expect(noteBody.ok).toBe(true);
        expect((noteBody.data as { method: string }).method).toBe('ria');

        // 复习卡创建
        const reviewRes = await page.request.post(API_URL, {
            headers: { 'Content-Type': 'application/json' },
            data: { method: 'addReviewItem', params: { bookId, content: 'E2E复习卡：fixture' } },
        });
        const reviewBody = await reviewRes.json();
        expect(reviewBody.ok).toBe(true);
        const reviewId = (reviewBody.data as { id: string }).id;

        // SM-2 评分（quality=5 → interval 增长）
        const scoreRes = await page.request.post(API_URL, {
            headers: { 'Content-Type': 'application/json' },
            data: { method: 'scheduleReview', params: { reviewId, quality: 5 } },
        });
        const scoreBody = await scoreRes.json();
        expect(scoreBody.ok).toBe(true);
        const scored = scoreBody.data as { intervalDays: number; easeFactor: number };
        expect(scored.intervalDays).toBeGreaterThan(1);

        // 到期队列（新卡 dueDate 在未来，不应出现在 due 列表）
        const dueRes = await page.request.post(API_URL, {
            headers: { 'Content-Type': 'application/json' },
            data: { method: 'listDueReviews', params: {} },
        });
        const dueBody = await dueRes.json();
        expect(dueBody.ok).toBe(true);
        const dueItems = dueBody.data as Array<{ id: string }>;
        expect(dueItems.some(i => i.id === reviewId)).toBe(false);
    });

    // S7: UI tab 切换验证
    test('S7: UI tab 切换', async ({ page }) => {
        await page.goto(BASE_URL);

        for (const label of ['RIA 笔记', '复习队列', 'AI 对话', '技能', '朗读']) {
            await page.locator(`button:has-text("${label}")`).click();
            await page.waitForTimeout(300);
        }

        await expect(page.locator('aside')).toHaveCount(2);
    });

    // S8: 选中正文 → RIA 面板注入选区 → 贴墙 → 复习卡进池
    test('S8: 选中→RIA→贴墙→复习池', async ({ page }) => {
        await page.goto(BASE_URL);

        // 导入 EPUB（Reader 渲染 + blob 可用）
        const importBtn = page.locator('button:has-text("导入 EPUB")');
        await expect(importBtn).toBeVisible({ timeout: 10_000 });
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            importBtn.click(),
        ]);
        await fileChooser.setFiles(EPUB_PATH);

        // 等待 Reader 渲染正文
        await expect(page.locator('div[style*="pre-wrap"]')).toBeVisible({ timeout: 30_000 });

        // 切到 RIA tab（未选中时应显示提示）
        const rightPanel = page.locator('aside').nth(1);
        await page.locator('button:has-text("RIA 笔记")').click();
        await expect(rightPanel.locator('text=请先在阅读器中选中一段文字')).toBeVisible({ timeout: 5000 });

        // 在正文 frame 内程序化选中一段文本（触发 Engine.onSelectionChange）
        const contentFrame = page.frames().find(f => f.url().startsWith('blob:http://localhost:1420/'));
        expect(contentFrame).toBeTruthy();
        await contentFrame!.evaluate(() => {
            const paragraph = document.querySelector('p');
            if (!paragraph) throw new Error('正文段落不可用');
            const range = document.createRange();
            range.selectNodeContents(paragraph);
            const selection = document.getSelection();
            if (!selection) throw new Error('selection 不可用');
            selection.removeAllRanges();
            selection.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
        });

        // 选区注入 RIA 面板：提示消失（R 原文出现）
        await expect(rightPanel.locator('text=请先在阅读器中选中一段文字')).toBeHidden({ timeout: 5000 });

        // 填写 I / A + 勾选贴墙 + 保存
        const textareas = rightPanel.locator('textarea');
        await textareas.nth(0).fill('E2E 解读');
        await textareas.nth(1).fill('E2E 应用内容');
        await rightPanel.locator('input[type="checkbox"]').check();
        await rightPanel.locator('button:has-text("保存并贴墙")').click();

        // 验证：贴墙笔记存在
        const pinnedRes = await page.request.post(API_URL, {
            headers: { 'Content-Type': 'application/json' },
            data: { method: 'listPinnedNotes', params: {} },
        });
        const pinnedBody = await pinnedRes.json();
        expect(pinnedBody.ok).toBe(true);
        const pinned = pinnedBody.data as Array<{ content: string; pinned: boolean }>;
        expect(pinned.some(n => n.pinned && n.content.includes('E2E 应用内容'))).toBe(true);

        // 验证：复习卡从贴墙笔记派生并进池
        const reviewRes = await page.request.post(API_URL, {
            headers: { 'Content-Type': 'application/json' },
            data: { method: 'listReviewItems', params: { bookId: BOOK_ID } },
        });
        const reviewBody = await reviewRes.json();
        expect(reviewBody.ok).toBe(true);
        const cards = reviewBody.data as Array<{ question: string }>;
        expect(cards.some(c => c.question.includes('E2E 应用内容'))).toBe(true);
    });

    // S9: AI 对话全链路（索引 → RAG 检索 → SSE 流式回复）
    test('S9: AI 对话 RAG 流式', async ({ page }) => {
        test.setTimeout(150_000);
        await page.goto(BASE_URL);

        // 导入 EPUB（建立 book + thread）
        const importBtn = page.locator('button:has-text("导入 EPUB")');
        await expect(importBtn).toBeVisible({ timeout: 10_000 });
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            importBtn.click(),
        ]);
        await fileChooser.setFiles(EPUB_PATH);
        await expect(page.locator('div[style*="pre-wrap"]')).toBeVisible({ timeout: 30_000 });

        // 索引正文（RAG 前置）
        const indexRes = await page.request.post(API_URL, {
            headers: { 'Content-Type': 'application/json' },
            data: {
                method: 'indexBook',
                params: {
                    bookId: BOOK_ID,
                    text: '第一章：可见内容。投资哲学强调长期价值与安全边际。芒格主张逆向思维与多元思维模型。',
                },
            },
        });
        const indexBody = await indexRes.json();
        expect(indexBody.ok).toBe(true);
        expect((indexBody.data as { chunks: number }).chunks).toBeGreaterThan(0);

        // 切到 AI 对话 tab，记录既有 AI 消息数（DB 持久，含历史）
        await page.locator('button:has-text("AI 对话")').click();
        const rightPanel = page.locator('aside').nth(1);
        const aiLabel = rightPanel.locator('strong:has-text("AI:")');
        await page.waitForTimeout(800);
        const before = await aiLabel.count();

        // 发送问题
        await rightPanel.locator('input[placeholder="输入问题…"]').fill('投资哲学强调什么');
        await rightPanel.locator('button:has-text("发送")').click();

        // 等待新增一条 assistant 流式回复（真实 LLM，慢）
        await expect(aiLabel).toHaveCount(before + 1, { timeout: 120_000 });
        const bubble = rightPanel.locator('div:has(> strong:text-is("AI:"))').last();
        const text = await bubble.textContent();
        expect((text ?? '').length).toBeGreaterThan(3);
    });
});
