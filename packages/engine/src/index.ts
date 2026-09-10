// @hyr/engine — EPUB 渲染引擎门面（Phase1 填充）
// 对外暴露: Engine, EpubSource, BookHandle, RenderOpts, RenderedPage, TextItem
// 内部: src/foliate/ (vendored foliate-js) + src/patch/ (own patch layer)

// Facade 类型与类
export { Engine } from './facade/Engine.js';
export type {
  BookHandle,
  EpubSource,
  EpubSourceType,
  FoliateBook,
  FoliateSection,
  LayoutMode,
  RenderOpts,
  RenderedPage,
  TextItem,
  TransformFn,
  TextWalkFunc,
  TextWalkFilter,
} from './facade/types.js';

// Facade schema / 校验函数
export { epubSourceSchema, validateEpubSource } from './facade/types.js';

// Facade 错误类
export {
  CfiError,
  EngineError,
  EngineNotReadyError,
  EpubLoadError,
  RenderError,
  TransformError,
} from './facade/errors.js';
