// @hyr/engine — jsdom 能力冒烟门（T5-T11 基础设施验证）
// 运行环境：jsdom（默认 vitest environment，无 `// @vitest-environment browser` 声明）
//
// 验证目标：确认 jsdom 24.x 中 foliate-js 依赖的 API 可用
// - createTreeWalker 三参数重载：document.createTreeWalker(root, filterObj) ✅
// - document.createRange() ✅
// - EventTarget + CustomEvent ✅（foliate 内部使用）
// - Blob ✅（文件读取路径）
// - MutationObserver ✅（DOM 变更检测）

describe('jsdom capability smoke gate', () => {
  it('document.createTreeWalker supports 3-arg filter object overload', () => {
    const root = document.createElement('div');
    const child1 = document.createElement('span');
    const child2 = document.createElement('p');
    root.appendChild(child1);
    root.appendChild(child2);

    // 三参数重载：createTreeWalker(root, filterObject)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, {
      acceptNode: (node: Node) => NodeFilter.FILTER_ACCEPT,
    });

    expect(walker).toBeDefined();
    expect(walker.currentNode).toBe(root);
    expect(walker.nextNode()).toBe(child1);
    expect(walker.nextNode()).toBe(child2);
  });

  it('document.createRange exists and works', () => {
    const range = document.createRange();
    expect(range).toBeDefined();

    // 验证基础 Range API 可用（foliate text selection 依赖）
    const el = document.createElement('p');
    el.textContent = 'Hello, 你好';
    document.body.appendChild(el);

    range.selectNodeContents(el);
    expect(range.toString()).toBe('Hello, 你好');
  });

  it('EventTarget + CustomEvent available', () => {
    const target = new EventTarget();
    let fired = false;

    target.addEventListener('custom-event', (e: Event) => {
      fired = true;
    });

    const customEvent = new CustomEvent('custom-event', {
      detail: { message: 'test' },
      bubbles: true,
    });

    target.dispatchEvent(customEvent);
    expect(fired).toBe(true);
  });

  it('Blob is available', () => {
    expect(Blob).toBeDefined();
    const blob = new Blob(['test content'], { type: 'text/plain' });
    expect(blob.size).toBeGreaterThan(0);
  });

  it('MutationObserver is available', () => {
    expect(MutationObserver).toBeDefined();

    const observer = new MutationObserver(() => {});
    expect(observer).toBeDefined();
    expect(typeof observer.disconnect).toBe('function');
  });
});
