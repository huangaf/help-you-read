// @hyr/core/skill — 技能系统（Phase 4）
// manifest + catalog + runtime + presets

export { SkillManifestError, parseSkillManifest } from './manifest.js';
export type { ChatProvider, SkillRuntimeOptions } from './runtime.js';
export { SkillRuntime } from './runtime.js';
export { CapabilityCatalog } from './catalog.js';
export type { SkillKind, AccessLevel, SkillManifest, CapabilityTool, SkillRunContext, SkillResult } from './types.js';
export { accessOrder, canAccess, SKILL_KINDS, ACCESS_LEVELS } from './types.js';
export { promptExample } from './presets/prompt_example.js';
export { agentExample } from './presets/agent_example.js';
export { scriptExample } from './presets/script_example.js';
