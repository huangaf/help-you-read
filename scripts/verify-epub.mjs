#!/usr/bin/env node
// verify-epub.mjs — 验证 EPUB 文件结构（极简版）
// 用法: node scripts/verify-epub.mjs <path/to/file.epub> [path2 ...]
// 退出码: 0 = 通过, 非零 = 失败（输出原因）

import { readFile } from "node:fs/promises";
import { inflateSync, inflateRawSync } from "node:zlib";
import { resolve } from "node:path";

// ──────────────────────── 轻量 ZIP 解析器 ────────────────────────

class ZipReader {
	#buffer;

	constructor(buffer) {
		this.#buffer = buffer;
	}

	#u16(off) {
		return this.#buffer.readUint16LE(off);
	}

	#u32(off) {
		return this.#buffer.readUint32LE(off);
	}

	#str(off, len) {
		return this.#buffer.toString("utf-8", off, off + len);
	}

	entries() {
		const buf = this.#buffer;
		const len = buf.length;

		// 定位 EOCDR（从文件末尾往前搜索）
		let eocd = -1;

		for (let i = len - 22; i >= Math.max(len - 65557, 0); i--) {
			if (this.#u32(i) === 0x06054b50) {
				eocd = i;

				break;
			}
		}

		if (eocd === -1) {
			throw new Error("ZIP 文件无 EOCDR（非合法 ZIP）");
		}

		const cdOffset = this.#u32(eocd + 16);
		const cdCount = this.#u16(eocd + 10);

		const result = [];
		let off = cdOffset;

		for (let i = 0; i < cdCount; i++) {
			if (this.#u32(off) !== 0x02014b50) {
				throw new Error(`中央目录条目 ${i} 签名错误`);
			}

			const compressionMethod = this.#u16(off + 10);
			const nameLen = this.#u16(off + 28);
			const extraLen = this.#u16(off + 30);
			const commentLen = this.#u16(off + 32);
			const localOff = this.#u32(off + 42);

			result.push({
				name: this.#str(off + 46, nameLen),
				compressionMethod,
				storedSize: this.#u32(off + 20),
				localHeaderOffset: localOff,
			});

			off += 46 + nameLen + extraLen + commentLen;
		}

		return result;
	}

	readEntry(entry) {
		const buf = this.#buffer;
		const loff = entry.localHeaderOffset;

		if (this.#u32(loff) !== 0x04034b50) {
			throw new Error(`本地目录头签名错误: ${entry.name}`);
		}

		const nameLen = this.#u16(loff + 26);
		const extraLen = this.#u16(loff + 28);
		const dataOff = loff + 30 + nameLen + extraLen;

		let raw = buf.slice(dataOff, dataOff + entry.storedSize);

		if (entry.compressionMethod === 8) {
			// EPUBs may use either zlib-wrapped or raw DEFLATE
			try {
				raw = inflateSync(raw); // zlib format (Node.js deflateSync default)
			} catch {
				raw = inflateRawSync(raw); // raw DEFLATE (real EPUB format)
			}
		}

		return raw;
	}

	readText(entry) {
		return this.readEntry(entry).toString("utf-8");
	}

	has(name) {
		return this.entries().some((e) => e.name === name);
	}

	find(name) {
		return this.entries().find((e) => e.name === name);
	}

	findOne(pred) {
		return this.entries().find(pred);
	}
}

// ──────────────── 极简 XML 工具（仅用于 EPUB 结构验证） ───────────────

/**
 * 从 XML 文本中提取特定标签的属性。
 * @param {string} xml - XML 内容
 * @param {string} tag - 标签名（如 "rootfile", "item", "manifest"）
 * @returns {Array<{attrs: object}>} 匹配的属性列表
 */
function findTagAttrs(xml, tag) {
	const results = [];

	// 匹配 <tagname ...> 或 <tagname .../>
	const re = new RegExp(`<${tag}\\s([^>]*)[\\s>\\/]>`, "g");

	let m;

	while ((m = re.exec(xml)) !== null) {
		results.push({ attrs: parseAttrs(m[1]) });
	}

	return results;
}

/** 解析属性字符串 */
function parseAttrs(str) {
	const attrs = {};
	const attrRe = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

	let m;

	while ((m = attrRe.exec(str)) !== null) {
		attrs[m[1]] = m[2] ?? m[3];
	}

	return attrs;
}

/** 检查标签是否存在（开放或自关闭）*/
function hasTag(xml, tag) {
	const re = new RegExp(`<${tag}[\\s/>]`, "i");

	return re.test(xml);
}

/** 统计标签出现次数 */
function countTag(xml, tag) {
	const re = new RegExp(`<${tag}[^>]*/>|<${tag}[^>]*>(?:.*?)</${tag}>`, "gs");

	let count = 0;

	while (re.exec(xml) !== null) {
		count++;
	}

	return count;
}

/** 检查开放标签（非自关闭）是否存在 */
function hasOpenTag(xml, tag) {
	const re = new RegExp(`<${tag}\\s[^>]*>[^<]|<${tag}[^>]*>`, "i");

	return re.test(xml);
}

// ──────────────── 验证逻辑 ────────────────

async function verifyEpub(filePath) {
	const errors = [];

	let buffer;

	try {
		buffer = await readFile(filePath);
	} catch (err) {
		return { pass: false, message: `无法读取文件: ${err.message}` };
	}

	const zip = new ZipReader(buffer);

	try {
		zip.entries(); // 验证 ZIP 结构
	} catch (err) {
		return { pass: false, message: `ZIP 解析失败: ${err.message}` };
	}

	const entries = zip.entries();

	// Step 1: mimetype
	const mimetypeEntry = zip.find("mimetype");

	if (!mimetypeEntry) {
		errors.push("缺少 mimetype 条目");
	} else {
		if (mimetypeEntry.compressionMethod !== 0) {
			errors.push(`mimetype 未使用 STORED（方法=${mimetypeEntry.compressionMethod}，应为 0）`);
		}

		const content = zip.readText(mimetypeEntry).trim();

		if (content !== "application/epub+zip") {
			errors.push(`mimetype 内容错误: "${content}"（应为 "application/epub+zip"）`);
		}

		const first = entries[0];

		if (first?.name !== "mimetype") {
			errors.push(`mimetype 不是 ZIP 第一个条目（首个: "${first?.name}"）`);
		}
	}

	// Step 2: container.xml
	if (!zip.has("META-INF/container.xml")) {
		errors.push("缺少 META-INF/container.xml");
	} else {
		const containerText = zip.readText(zip.find("META-INF/container.xml"));

		const rootfiles = findTagAttrs(containerText, "rootfile");

		if (rootfiles.length === 0) {
			errors.push("container.xml 缺少 rootfile 元素");
		} else {
			const opfPath = rootfiles[0].attrs["full-path"];

			if (!opfPath) {
				errors.push("rootfile 缺少 full-path 属性");
			} else if (!zip.has(opfPath)) {
				errors.push(`rootfile 指向的 OPF 文件不存在: ${opfPath}`);
			}

			const mediaType = rootfiles[0].attrs["media-type"];

			if (!mediaType) {
				errors.push("rootfile 缺少 media-type 属性");
			}
		}
	}

	// Step 3: OPF（manifest + spine）
	const opfEntry = zip.findOne((e) => e.name.endsWith(".opf"));

	if (!opfEntry) {
		errors.push("缺少 .opf 文件");
	} else {
		const opfText = zip.readText(opfEntry);

		if (!hasOpenTag(opfText, "manifest")) {
			errors.push(`${opfEntry.name} 缺少 manifest`);
		} else {
			const manifestItems = findTagAttrs(opfText, "item");

			if (manifestItems.length === 0) {
				errors.push(`${opfEntry.name} manifest 中无 item`);
			} else {
				for (const item of manifestItems) {
					if (!item.attrs.id) {
						errors.push(`${opfEntry.name} manifest item 缺少 id`);
					}

					if (!item.attrs["media-type"]) {
						errors.push(`${opfEntry.name} manifest item 缺少 media-type`);
					}

					if (!item.attrs.href) {
						errors.push(`${opfEntry.name} manifest item 缺少 href`);
					}
				}
			}
		}

		if (!hasOpenTag(opfText, "spine")) {
			errors.push(`${opfEntry.name} 缺少 spine`);
		} else {
			const spineItems = findTagAttrs(opfText, "itemref");

			if (spineItems.length === 0) {
				errors.push(`${opfEntry.name} spine 中无 itemref`);
			} else {
				for (const ref of spineItems) {
					if (!ref.attrs.idref) {
						errors.push(`${opfEntry.name} spine itemref 缺少 idref`);
					}
				}
			}
		}

		if (!hasTag(opfText, "package")) {
			errors.push(`${opfEntry.name} 缺少 package`);
		}

		if (!hasTag(opfText, "metadata")) {
			errors.push(`${opfEntry.name} 缺少 metadata`);
		}
	}

	// Step 4: NAV document（EPUB3）或 NCX（EPUB2）
	const navEntry = zip.findOne((e) => e.name.includes("nav") && e.name.endsWith(".xhtml"));

	if (!navEntry) {
		// 也接受 NCX（EPUB2 导航文档）
		const ncxEntry = zip.findOne((e) => e.name.toLowerCase().endsWith(".ncx"));

		if (!ncxEntry) {
			errors.push("缺少导航文档（EPUB3 navDoc 或 EPUB2 NCX）");
		} else {
			const ncxText = zip.readText(ncxEntry);

			if (!ncxText.includes("<ncx")) {
				errors.push(`${ncxEntry.name} 缺少 ncx root element`);
			} else {
				const navItems = countTag(ncxText, "navPoint");

				if (navItems === 0) {
					errors.push(`${ncxEntry.name} 导航文档中无导航项 (navPoint)`);
				} else {
					console.log(`✅ ${filePath}: 通过（${entries.length} 个条目，使用 NCX）`);

					return { pass: true, message: `通过（${entries.length} 个条目，使用 NCX）` };
				}
			}
		}
	} else {
		const navText = zip.readText(navEntry);

		if (!hasTag(navText, "nav")) {
			errors.push(`${navEntry.name} 缺少 nav element`);
		} else {
			const navItems = findTagAttrs(navText, "nav");

			if (navItems.length > 0) {
				const navType = navItems[0].attrs.type;

				if (!navType) {
					errors.push(`${navEntry.name} nav element 缺少 type`);
				}

				const liCount = countTag(navText, "li");

				if (liCount === 0) {
					errors.push(`${navEntry.name} nav element 中无导航项 (li)`);
				}
			}
		}
	}

	if (errors.length === 0) {
		return { pass: true, message: `通过（${entries.length} 个条目）` };
	} else {
		return { pass: false, message: errors.join("\n  · ") };
	}
}

// ──────────────── 主入口 ────────────────

const args = process.argv.slice(2);

if (args.length === 0) {
	console.error("用法: node scripts/verify-epub.mjs <file.epub> [file2.epub ...]");
	process.exit(1);
}

const results = [];

for (const arg of args) {
	const filePath = resolve(arg);
	const result = await verifyEpub(filePath);

	results.push({ path: filePath, ...result });
}

for (const r of results) {
	const status = r.pass ? "✅" : "❌";

	if (r.pass) {
		console.log(`${status} ${r.path}: ${r.message}`);
	} else {
		console.error(`${status} ${r.path}: 失败`);

		for (const line of r.message.split("\n")) {
			console.error(`  · ${line}`);
		}
	}
}

const allPassed = results.every((r) => r.pass);

process.exit(allPassed ? 0 : 1);
