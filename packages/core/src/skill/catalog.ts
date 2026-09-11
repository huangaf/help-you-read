// Capability Catalog — 工具注册表 + access 分级拦截（Phase 4）

import type { CapabilityTool, AccessLevel } from './types.js';
import { canAccess } from './types.js';

/**
 * 工具注册表：管理 Capability Catalog 中所有可用工具。
 * 支持按名称解析、access 分级拦截、白名单过滤。
 */
export class CapabilityCatalog {
    #tools: Map<string, CapabilityTool> = new Map();

    /** 注册一个工具（按 name 去重，后者覆盖前者） */
    register(tool: CapabilityTool): void {
        this.#tools.set(tool.name, tool);
    }

    /** 按名称解析工具，未注册返回 null */
    resolve(name: string): CapabilityTool | null {
        return this.#tools.get(name) ?? null;
    }

    /** 列出所有已注册工具 */
    list(): CapabilityTool[] {
        return [...this.#tools.values()];
    }

    /**
     * access 分级拦截：判定持有 skillAccess 权限的主体能否调用该工具。
     * 规则：skillAccess 数值 >= tool.access 数值 → 放行
     */
    checkAccess(skillAccess: AccessLevel, tool: CapabilityTool): boolean {
        return canAccess(skillAccess, tool.access);
    }

    /**
     * 按 manifest.tools 白名单过滤已注册工具。
     * 未注册的名称静默跳过（不报错），返回实际可用的子集。
     */
    getToolsForSkill(whitelist: string[]): CapabilityTool[] {
        const result: CapabilityTool[] = [];
        for (const name of whitelist) {
            const tool = this.#tools.get(name);
            if (tool !== undefined) {
                result.push(tool);
            }
        }
        return result;
    }

    /** 移除已注册工具 */
    unregister(name: string): void {
        this.#tools.delete(name);
    }

    /** 清空所有已注册工具 */
    clear(): void {
        this.#tools.clear();
    }

    /** 已注册工具数量 */
    get size(): number {
        return this.#tools.size;
    }
}
