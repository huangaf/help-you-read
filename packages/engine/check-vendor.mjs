#!/usr/bin/env node
/**
 * check-vendor.mjs — 验证 foliate-js 闭包完整性。
 *
 * 扫描 src/foliate/ + vendor/ 下所有 .js / .mjs 文件，
 * 提取每处本地静态 import + 动态 await import，
 * 断言每个相对路径都解析到存在的文件。
 * 退出码：0 = 全部 resolve；1 = 存在 unresolved。
 */

import { readdir, stat, readFile } from 'node:fs/promises'
import { join, relative, dirname } from 'node:path'

const FOLIATE_DIR = new URL('./src/foliate/', import.meta.url)
const BASE = FOLIATE_DIR.pathname

// Collect all .js/.mjs files recursively (skip source maps)
async function collectFiles(dir) {
    const files = []
    for (const entry of await readdir(dir)) {
        const full = join(dir, entry)
        const st = await stat(full)
        if (st.isDirectory()) {
            files.push(...await collectFiles(full))
        } else if (/\.js$|\.mjs$/.test(entry) && !entry.endsWith('.map')) {
            files.push(full)
        }
    }
    return files
}

// Extract local import paths (static + dynamic) from a file's content
function extractImports(content, filePath) {
    const imports = []

    // Static: import ... from 'path' / "path"
    const staticRe = /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g
    for (const m of content.matchAll(staticRe)) {
        const p = m[1]
        if (/^\.\.?\//.test(p)) imports.push({ path: p, type: 'static', file: filePath })
    }

    // Dynamic: import('path') / await import('path')
    const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    for (const m of content.matchAll(dynamicRe)) {
        const p = m[1]
        if (/^\.\.?\//.test(p)) imports.push({ path: p, type: 'dynamic', file: filePath })
    }

    return imports
}

// Resolve a relative import path from a file's directory
function resolveImport(fromFile, relPath) {
    const dir = dirname(relative(BASE, fromFile))
    return join(BASE, dir, relPath)
}

async function main() {
    const files = await collectFiles(BASE)
    let allResolve = true
    const unresolved = []

    for (const file of files) {
        const content = await readFile(file, 'utf-8')

        for (const imp of extractImports(content, file)) {
            const resolved = resolveImport(file, imp.path)
            const exists = await stat(resolved).then(() => true).catch(() => false)

            if (!exists) {
                allResolve = false
                unresolved.push({ file: relative(BASE, file), importPath: imp.path, type: imp.type, resolved })
            }
        }
    }

    if (allResolve) {
        console.log(`OK: ${files.length} files scanned, all local imports resolve.`)
        process.exit(0)
    } else {
        console.error(`FAIL: ${unresolved.length} unresolved import(s):`)
        for (const u of unresolved) {
            console.error(`  ${u.file} → ${u.type} import("${u.importPath}") → ${u.resolved} (NOT FOUND)`)
        }
        process.exit(1)
    }
}

main().catch(e => { console.error(e); process.exit(1) })
