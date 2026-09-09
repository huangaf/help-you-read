// @vitest-environment browser
// @hyr/engine — Browser (Chromium) 能力冒烟门（T5-T11 基础设施验证）
// 运行环境：Playwright headless Chromium（`// @vitest-environment browser` docblock）
//
// 验证目标：确认真实浏览器中 foliate-js 依赖的 API 可用
// - URL.createObjectURL / revokeObjectURL ✅（Blob URL 生成）
// - ResizeObserver ✅（元素尺寸变化检测）
// - document.fonts.ready ✅（字体加载 Promise）
// - crypto.subtle ✅（加密哈希，RAG 指纹用）

describe('browser capability smoke gate', () => {
  it('URL.createObjectURL and revokeObjectURL are functions', () => {
    expect(typeof URL.createObjectURL).toBe('function');
    expect(typeof URL.revokeObjectURL).toBe('function');

    // 实际验证：创建并撤销 Blob URL
    const blob = new Blob(['test'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    expect(url).toMatch(/^blob:http:\/\/localhost/);

    URL.revokeObjectURL(url);
  });

  it('ResizeObserver is a constructor', () => {
    expect(ResizeObserver).toBeDefined();
    expect(typeof ResizeObserver).toBe('function');

    const observer = new ResizeObserver(() => {});
    expect(typeof observer.disconnect).toBe('function');
    expect(typeof observer.observe).toBe('function');
  });

  it('document.fonts.ready is a Promise', () => {
    expect(document.fonts).toBeDefined();
    expect(document.fonts.ready).toBeInstanceOf(Promise);
  });

  it('crypto.subtle is available for hash computation', () => {
    expect(crypto).toBeDefined();
    expect(crypto.subtle).toBeDefined();

    // 实际验证：SHA-256 哈希（RAG chunk fingerprinting 依赖）
    const encoder = new TextEncoder();
    const data = encoder.encode('test content');
    crypto.subtle.digest('SHA-256', data).then((hashBuffer: ArrayBuffer) => {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      expect(hashHex.length).toBe(64); // SHA-256 = 32 bytes = 64 hex chars
    });
  });
});
