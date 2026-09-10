// T9 transform — RED 测试（TDD：先写失败测试，再实现 GREEN）
// 环境：browser（@vitest/browser Playwright Chromium）
// 原因：资源加载依赖 URL.createObjectURL + iframe src=，jsdom 缺失

import { describe, it, expect, beforeAll } from 'vitest';
import { Engine } from './Engine.js';

// transform 回调签名：接收资源加载事件 detail，返回变换后的 data
type TransformFn = (data: unknown, type: string, name: string) => Promise<unknown> | unknown;

// 加载 EPUB → File（browser 环境）
async function loadEpubFile(filename: string): Promise<File> {
    const buf = await fetch(`/books/${filename}`).then(r => r.blob());
    return new File([buf], filename, { type: 'application/epub+zip' });
}

// 从 Engine 内部获取 View（测试用，类型安全断言）
function getRawView(engine: Engine): import('../foliate/view.js').View {
    const eng = engine as unknown as { view?: import('../foliate/view.js').View };
    if (!eng.view) throw new Error('Engine 未 loadBook');
    return eng.view;
}

describe('transform（T9：transformTarget data 事件适配器）', () => {
    let engine: Engine;

    beforeAll(async () => {
        engine = new Engine();
        const file = await loadEpubFile('fixture-fixed-layout.epub');
        await engine.loadBook({ type: 'data', data: file });
    });

    it('未 loadBook 时调用 transform → EngineNotReadyError', async () => {
        const fresh = new Engine();
        await expect(
            fresh.transform(async (data, _type, _name) => data),
        ).rejects.toMatchObject({ code: 'EngineNotReady' });
    });

    it('已 loadBook 时 transform(fn) 注册成功（不抛错）', async () => {
        // 当前占位实现无论 _ready 是否 true 都抛 EngineNotReadyError → RED
        await engine.transform(async (data, _type, _name) => data);
    });

    it('注册 transform 后导航，fn 被资源加载触发', async () => {
        const calls: Array<{ name: string; type: string }> = [];

        // 注册 transform：记录调用参数，数据原样返回
        await engine.transform(async (data, type, name) => {
            calls.push({ name, type });
            return data;
        });

        // 导航到首页（触发资源加载：CSS/字体/图片）
        const view = getRawView(engine);
        await view.goTo(0);

        // 等待渲染管线完成（iframe load + fonts.ready）
        await new Promise(r => setTimeout(r, 1000));

        // fn 应被至少一次调用（fixture-fixed-layout 含 CSS/字体资源）
        expect(calls.length).toBeGreaterThan(0);
        // 调用参数结构正确
        for (const call of calls) {
            expect(typeof call.name).toBe('string');
            expect(typeof call.type).toBe('string');
        }
    });

    it('transform 改写 data：fn 返回值含注入标记（直接验证 detail.data）', async () => {
        const engine2 = new Engine();
        const file = await loadEpubFile('fixture-fixed-layout.epub');
        await engine2.loadBook({ type: 'data', data: file });

        // 记录 transform 调用结果（验证 fn 确实改写了 data）
        const transformed: Array<{ type: string; result: unknown }> = [];

        // 注册 transform：对 XHTML/HTML 资源在 data 末尾注入标记
        await engine2.transform(async (data, type, _name) => {
            if (type === 'application/xhtml+xml' || type === 'text/html') {
                const value = await data;
                // 在 </html> 前注入标记（避免 pre-html 状态被 parser 忽略）
                const result = (value as string).replace('</html>', '<p id="__transformed__"></p></html>');
                transformed.push({ type, result });
                return result;
            }
            return data;
        });

        // 导航到首页（触发 XHTML 资源加载 + transform）
        const view2 = getRawView(engine2);
        await view2.goTo(0);

        // 等待资源加载完成（createURL → blob URL）
        await new Promise(r => setTimeout(r, 1000));

        // 验证：至少一个 XHTML 资源被 transform 处理且结果含标记
        const xhtmlResults = transformed.filter(t => t.type === 'application/xhtml+xml');
        expect(xhtmlResults.length).toBeGreaterThan(0);

        // 验证：transform 返回值确实包含注入标记
        for (const { result } of xhtmlResults) {
            expect(String(result)).toContain('__transformed__');
        }
    });
});
