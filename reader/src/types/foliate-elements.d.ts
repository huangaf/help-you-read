/**
 * foliate-js 自定义元素的全局类型增强
 *
 * 本文件必须是 module 文件（顶部 `export {}`）：
 * script 文件中的 `declare global` 块会被 TypeScript 忽略，
 * 导致 HTMLElementTagNameMap 增强不生效。
 * 与之配套的 ambient module 声明在 foliate.d.ts（script 文件）中，
 * 两者不可合并（module 文件里的 `declare module` 只算 augmentation）。
 */

export {}

declare global {
  /** 注册 <foliate-view> 自定义元素到 HTMLElementTagNameMap */
  interface HTMLElementTagNameMap {
    'foliate-view': import('foliate-js/view.js').View;
  }

  /** JSX 中也支持 <foliate-view /> 标签 */
  namespace JSX {
    interface IntrinsicElements {
      /** <foliate-view> 自定义元素 — 接受所有标准 HTML 属性 */
      'foliate-view': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}
