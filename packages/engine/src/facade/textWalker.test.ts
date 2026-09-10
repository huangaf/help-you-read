// T11 textWalker — RED 测试（TDD：先写失败测试，再实现 GREEN）
// 环境：jsdom（text-walker 仅用标准 DOM API，jsdom 可靠）

import { describe, it, expect } from 'vitest';
import { Engine } from './Engine.js';

// 构造含可见/隐藏文本的测试文档
function makeTestDoc(): Document {
    const doc = document.implementation.createHTMLDocument('test');

    // 可见段落
    const p1 = doc.createElement('p');
    p1.textContent = '这是可见文本 hello world';
    doc.body.appendChild(p1);

    // 隐藏段落（display:none）—— filterFunc 应跳过
    const p2 = doc.createElement('p');
    p2.textContent = '这是隐藏文本 should be skipped';
    p2.style.display = 'none';
    doc.body.appendChild(p2);

    // 可见段落 2
    const p3 = doc.createElement('p');
    p3.textContent = '第二段可见文本 foo bar';
    doc.body.appendChild(p3);

    return doc;
}

// 匹配函数：查找包含指定关键词的文本，yield 对应 Range
function makeMatcher(keyword: string) {
    return function* (strs: string[], makeRange: (si: number, so: number, ei: number, eo: number) => Range) {
        for (let i = 0; i < strs.length; i++) {
            const str = strs[i]!;
            const idx = str.indexOf(keyword);
            if (idx >= 0) {
                yield makeRange(i, idx, i, idx + keyword.length);
            }
        }
    };
}

describe('textWalker（T11：原生 re-export 封装）', () => {
    it('对 Document 收集文本、按 func 匹配、yield Range', async () => {
        const doc = makeTestDoc();

        // 未 loadBook — textWalker 是纯 DOM 操作，不应要求 _ready
        const engine = new Engine();

        const results: Range[] = [];
        for (const match of engine.textWalker(doc, makeMatcher('hello'))) {
            results.push(match as Range);
        }

        // 应找到 1 个匹配（p1 中的 'hello'）
        expect(results.length).toBe(1);
        // yield 的是 Range，其文本内容应包含关键词
        expect(results[0]!.toString()).toBe('hello');
    });

    it('filterFunc 跳过隐藏节点（display:none）', async () => {
        const doc = makeTestDoc();
        const engine = new Engine();

        // 自定义 filterFunc：跳过 display:none 的元素及其所有后代
        const skipHidden = (node: Node): number => {
            // 检查节点自身或任意祖先是否有 display:none（含文本节点的父链）
            let current: Node | null = node;
            while (current) {
                if (current.nodeType === 1 && (current as HTMLElement).style?.display === 'none') {
                    return 3; // NodeFilter.FILTER_REJECT
                }
                current = current.parentNode;
            }
            // 无隐藏祖先：元素 → FILTER_SKIP（不 yield 自身，遍历子节点）；文本 → FILTER_ACCEPT
            return node.nodeType === 1 ? 2 : 1;
        };

        const results: Range[] = [];
        for (const match of engine.textWalker(doc, makeMatcher('skipped'), skipHidden)) {
            results.push(match as Range);
        }

        // 'should be skipped' 在隐藏节点中 → 不应被 yield
        expect(results.length).toBe(0);
    });

    it('Range 输入（非 Document）：仅遍历 Range 覆盖的节点', async () => {
        const doc = makeTestDoc();

        // 构造仅覆盖 p1（第一个可见段落）的 Range
        const range = doc.createRange();
        const p1 = doc.body.firstChild!;
        range.selectNodeContents(p1);

        const engine = new Engine();
        const results: Range[] = [];
        for (const match of engine.textWalker(range, makeMatcher('foo'))) {
            results.push(match as Range);
        }

        // 'foo' 在 p3 中，不在 p1 的 Range 内 → 无匹配
        expect(results.length).toBe(0);

        // 改查 p1 中存在的文本
        const results2: Range[] = [];
        for (const match of engine.textWalker(range, makeMatcher('hello'))) {
            results2.push(match as Range);
        }
        expect(results2.length).toBe(1);
        expect(results2[0]!.toString()).toBe('hello');
    });

    it('未 loadBook 时调用不抛 EngineNotReadyError（纯 DOM 操作）', async () => {
        const doc = makeTestDoc();
        const engine = new Engine();

        // 不应抛错 — textWalker 是纯 DOM 操作，不依赖 loadBook
        const results: Range[] = [];
        for (const match of engine.textWalker(doc, makeMatcher('foo'))) {
            results.push(match as Range);
        }

        // p3 含 'foo'
        expect(results.length).toBe(1);
        expect(results[0]!.toString()).toBe('foo');
    });
});
