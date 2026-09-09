#!/usr/bin/env node
// make-fixture.mjs — 生成合成 EPUB fixture 文件
// 用法: node scripts/make-fixture.mjs
// 输出: books/fixture-fixed-layout.epub, books/fixture-nav-hidden.epub
//
// 完全使用 Node.js built-in（zlib + fs），不依赖任何外部库。
// ZIP 格式：手动构建，确保 mimetype STORED + 首位。

import { writeFileSync } from "node:fs";
import { createWriteStream, appendFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { resolve } from "node:path";

const BOOKS_DIR = resolve(import.meta.dirname, "..", "books");

// ──────────────── ZIP 构建器（手搓，不依赖外部库） ────────────────

/**
 * 构建一个 ZIP 文件缓冲区。
 * @param {{ name: string, data: Uint8Array, stored?: boolean }[]} files
 * @returns {Buffer} 完整 ZIP 文件
 */
function buildZip(files) {
	// Phase 1: 为每个条目计算本地目录头 + 压缩数据，记录累积偏移
	const entries = []; // [{ nameBuf, header, compressedData, localOffset, uncompressedSize, crc }]

	let currentOffset = 0; // 下一个条目的起始偏移（从文件开头算）

	for (const file of files) {
		const nameBuf = Buffer.from(file.name, "utf-8");
		const data = file.data instanceof Uint8Array ? Buffer.from(file.data) : file.data;

		const isStored = file.stored || file.name === "mimetype";
		const compressionMethod = isStored ? 0 : 8; // 0=stored, 8=deflate

		const crc = computeCrc32(data);
		const uncompressedSize = data.length;
		const compressedData = isStored ? data : deflateSync(data);
		const compressedSize = compressedData.length;

		const dosTime = 0;
		const dosDate = 0;

		// 本地目录头 (30 bytes + name)
		const headerSize = 30 + nameBuf.length;

		const localHeader = Buffer.alloc(headerSize);
		localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
		localHeader.writeUInt16LE(20, 4); // version needed
		localHeader.writeUInt16LE(compressionMethod, 8);
		localHeader.writeUInt16LE(dosTime, 10);
		localHeader.writeUInt16LE(dosDate, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(compressedSize, 18);
		localHeader.writeUInt32LE(uncompressedSize, 22);
		localHeader.writeUInt16LE(nameBuf.length, 26);
		localHeader.writeUInt16LE(0, 28); // extra field length

		entries.push({
			nameBuf,
			header: localHeader,
			compressedData,
			localOffset: currentOffset, // 这个条目的本地目录头在文件中的偏移
			uncompressedSize,
			crc, // CRC-32 of original (uncompressed) data
			compressionMethod, // 压缩方法（0=stored, 8=deflate）
		});

		currentOffset += headerSize + compressedData.length; // 下一个条目的偏移
	}

	// Phase 2: 拼接所有本地目录头 + 数据
	const parts = [];

	for (const entry of entries) {
		parts.push(entry.header);
		parts.push(entry.compressedData);
	}

	// Phase 3: 中央目录（紧随所有条目之后）
	const cdParts = [];

	for (const entry of entries) {
		const cdEntry = Buffer.alloc(46 + entry.nameBuf.length);

		cdEntry.writeUInt32LE(0x02014b50, 0); // central dir signature
		cdEntry.writeUInt16LE(63, 4); // version made by (Unix/UTF-8)
		cdEntry.writeUInt16LE(20, 6); // version needed
		cdEntry.writeUInt16LE(entry.compressionMethod, 10); // compression method
		cdEntry.writeUInt16LE(0, 12); // dos time
		cdEntry.writeUInt16LE(0, 14); // dos date
		cdEntry.writeUInt32LE(entry.crc, 16); // CRC-32
		cdEntry.writeUInt32LE(entry.compressedData.length, 20); // compressed size
		cdEntry.writeUInt32LE(entry.uncompressedSize, 24); // uncompressed size
		cdEntry.writeUInt16LE(entry.nameBuf.length, 28); // file name length
		cdEntry.writeUInt16LE(0, 30); // extra field length
		cdEntry.writeUInt16LE(0, 32); // comment length
		cdEntry.writeUInt16LE(0, 34); // disk number start
		cdEntry.writeUInt16LE(0, 36); // internal file attributes
		cdEntry.writeUInt32LE(0, 38); // external file attributes
		cdEntry.writeUInt32LE(entry.localOffset, 42); // relative offset of local header

		entry.nameBuf.copy(cdEntry, 46);

		cdParts.push(cdEntry);
	}

	// Phase 4: EOCDR (End of Central Directory Record)
	const eocdPosition = currentOffset + cdParts.reduce((sum, p) => sum + p.length, 0);

	const eocdr = Buffer.alloc(22);

	eocdr.writeUInt32LE(0x06054b50, 0); // EOCDR signature
	eocdr.writeUInt16LE(0, 4); // disk number
	eocdr.writeUInt16LE(0, 6); // disk with central directory start
	eocdr.writeUInt16LE(entries.length, 8); // entries on this disk
	eocdr.writeUInt16LE(entries.length, 10); // total entries
	eocdr.writeUInt32LE(eocdPosition - currentOffset, 12); // size of central directory
	eocdr.writeUInt32LE(currentOffset, 16); // offset of start of central directory
	eocdr.writeUInt16LE(0, 20); // comment length (2 bytes)

	// Phase 5: 拼接
	parts.push(...cdParts);
	parts.push(eocdr);

	return Buffer.concat(parts);
}

/** 计算 CRC32（EPUB ZIP 必需）*/
function computeCrc32(data) {
	let crc = 0xffffffff;
	const table = getCrc32Table();

	for (let i = 0; i < data.length; i++) {
		crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	}

	return (crc ^ 0xffffffff) >>> 0;
}

function getCrc32Table() {
	const table = new Uint32Array(256);

	for (let i = 0; i < 256; i++) {
		let c = i;

		for (let j = 0; j < 8; j++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}

		table[i] = c;
	}

	return table;
}

// ──────────────── 文件内容生成器 ────────────────

/**
 * EPUB3 XHTML 页面模板（带 namespace）
 */
function xhtmlPage(title, bodyContent) {
	return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
</head>
<body>${bodyContent}
</body>
</html>`;
}

/**
 * 标准 EPUB3 NAV document（导航文档）
 */
function navDocument() {
	return xhtmlPage("Navigation", `
<nav epub:type="toc">
  <h1>目录</h1>
  <ol>
    <li><a href="chapter1.xhtml">第一章</a></li>
    <li><a href="chapter2.xhtml">第二章</a></li>
    <li><a href="hidden-content.xhtml">隐藏内容页</a></li>
  </ol>
</nav>`);
}

/**
 * 固定布局 EPUB 的 CSS（包含 @font-face、background-image、多列）
 */
function fixedLayoutCss() {
	// 用 base64 编码的 1x1 PNG 作为嵌入式背景图片
	const tinyPng = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"base64",
	);

	return `@font-face {
  font-family: "FixtureFont";
  src: url("data:font/ttf;base64,${tinyPng.toString("base64")}");
  font-weight: normal;
  font-style: normal;
}

body {
  font-family: "FixtureFont", serif;
  column-count: 3;
  column-gap: 2em;
  column-rule: 1px solid #ccc;
  background-image: url("bg.png");
  background-repeat: repeat;
  margin: 0;
  padding: 1em;
}

.chapter-title {
  font-size: 2em;
  text-align: center;
  page-break-before: always;
  color: #333;
}

p {
  text-indent: 2em;
  line-height: 1.6;
  margin-bottom: 0.5em;
}

.highlight {
  background-color: yellow;
  border-left: 3px solid orange;
  padding: 0.5em 1em;
  margin: 1em 0;
}

@media (max-width: 600px) {
  body { column-count: 1; }
}`;
}

/**
 * nav-hidden EPUB 的 CSS（包含 display:none 和 visibility:hidden）
 */
function hiddenCss() {
	return `body {
  font-family: serif;
  line-height: 1.6;
}

.hidden-display {
  display: none;
}

.hidden-visibility {
  visibility: hidden;
}`;
}

// ──────────────── EPUB 1: fixed-layout (富 CSS) ────────────────

function generateFixedLayoutEpub() {
	const bgPng = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"base64",
	);

	const cssContent = fixedLayoutCss();

	const chapter1Body = `
  <h1 class="chapter-title">第一章：开始</h1>
  <p>这是固定布局 EPUB 的第一章。文本会在多列中自动排版。</p>
  <p>第二段文字继续讲述故事的内容，展示多列布局的效果。CSS 中的 column-count: 3 会让文字分为三列显示。</p>
  <div class="highlight">这是一个高亮引用的段落，用于测试 CSS 背景和高亮样式。</div>
  <p>第三段文字。固定布局 EPUB（@page { size: landscape }）在阅读器中会使用固定的页面尺寸，不会根据设备自动重排。</p>
`;

	const chapter2Body = `
  <h1 class="chapter-title">第二章：进阶</h1>
  <p>这是固定布局 EPUB的第二章。本章继续展示多列布局和 CSS 渲染路径。</p>
  <p>@font-face 声明的自定义字体将用于所有文本渲染。背景图片 bg.png 会平铺在页面背景上。</p>
  <p>这是固定布局 EPUB的第二章。本章继续展示多列布局和 CSS 渲染路径。</p>
`;

	const files = [
		{ name: "mimetype", data: Buffer.from("application/epub+zip"), stored: true },
		{ name: "META-INF/container.xml", data: Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`), stored: false },
		{ name: "content.opf", data: Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="uid">urn:uuid:fixed-layout-001</dc:identifier>
    <dc:title>固定布局测试 EPUB</dc:title>
    <dc:language>zh-CN</dc:language>
    <meta property="pagination-progression">fixed</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="styles.css" media-type="text/css"/>
    <item id="bg" href="bg.png" media-type="image/png"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="nav">
    <itemref idref="chapter1"/>
    <itemref idref="chapter2"/>
  </spine>
</package>`), stored: false },
		{ name: "nav.xhtml", data: Buffer.from(navDocument()), stored: false },
		{ name: "styles.css", data: Buffer.from(cssContent), stored: false },
		{ name: "bg.png", data: bgPng, stored: true },
		{ name: "chapter1.xhtml", data: Buffer.from(xhtmlPage("第一章", chapter1Body)), stored: false },
		{ name: "chapter2.xhtml", data: Buffer.from(xhtmlPage("第二章", chapter2Body)), stored: false },
	];

	return buildZip(files);
}

// ──────────────── EPUB 2: nav-hidden（隐藏文本） ────────────────

function generateNavHiddenEpub() {
	const cssContent = hiddenCss();

	// 隐藏文本：display:none 元素中包含真实可读文字
	const chapter1Body = `
  <h1>第一章：可见内容</h1>
  <p>这是正常可见的第一章正文。阅读器和 AI 助手应该能读取这段文字。</p>
  <div class="hidden-display">
    <p>这是一段被 display:none 隐藏的文字。它确实存在于 DOM 中，但不会被渲染。</p>
    <p>这是隐藏段落中的第二句话。text-walker 的默认过滤函数会跳过这些节点。</p>
    <span aria-hidden="true">这是带有 aria-hidden 属性的隐藏文本，也应该被过滤。</span>
  </div>
  <p>这是可见的第三段。隐藏内容在此之后恢复。</p>
`;

	const chapter2Body = `
  <h1>第二章：更多隐藏</h1>
  <p>这是可见的第二章开头。</p>
  <div class="hidden-visibility">
    <p>这段文字使用 visibility:hidden 隐藏。它占据空间但不显示。</p>
    <p>这是 visibility 隐藏的第二个段落，包含更多测试文本。</p>
  </div>
  <p>这是第二章的结尾段落，完全可见。</p>
`;

	const files = [
		{ name: "mimetype", data: Buffer.from("application/epub+zip"), stored: true },
		{ name: "META-INF/container.xml", data: Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`), stored: false },
		{ name: "content.opf", data: Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="uid">urn:uuid:nav-hidden-001</dc:identifier>
    <dc:title>隐藏文本测试 EPUB</dc:title>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="styles.css" media-type="text/css"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="nav">
    <itemref idref="chapter1"/>
    <itemref idref="chapter2"/>
  </spine>
</package>`), stored: false },
		{ name: "nav.xhtml", data: Buffer.from(navDocument()), stored: false },
		{ name: "styles.css", data: Buffer.from(cssContent), stored: false },
		{ name: "chapter1.xhtml", data: Buffer.from(xhtmlPage("第一章", chapter1Body)), stored: false },
		{ name: "chapter2.xhtml", data: Buffer.from(xhtmlPage("第二章", chapter2Body)), stored: false },
	];

	return buildZip(files);
}

// ──────────────── 主入口 ────────────────

async function main() {
	console.log("📦 生成合成 EPUB fixtures...\n");

	// 1. fixed-layout
	const fixedLayoutPath = resolve(BOOKS_DIR, "fixture-fixed-layout.epub");

	console.log("  → fixture-fixed-layout.epub（富 CSS：@font-face、background-image、多列）");

	try {
		const fixedLayoutData = generateFixedLayoutEpub();

		writeFileSync(fixedLayoutPath, fixedLayoutData);
		console.log(`    ✓ 已写入 ${fixedLayoutPath}（${fixedLayoutData.length} bytes）`);
	} catch (err) {
		console.error(`  ✗ fixed-layout 生成失败: ${err.message}`);

		process.exit(1);
	}

	// 2. nav-hidden
	const navHiddenPath = resolve(BOOKS_DIR, "fixture-nav-hidden.epub");

	console.log("  → fixture-nav-hidden.epub（隐藏文本：display:none、visibility:hidden）");

	try {
		const navHiddenData = generateNavHiddenEpub();

		writeFileSync(navHiddenPath, navHiddenData);
		console.log(`    ✓ 已写入 ${navHiddenPath}（${navHiddenData.length} bytes）`);
	} catch (err) {
		console.error(`  ✗ nav-hidden 生成失败: ${err.message}`);

		process.exit(1);
	}

	console.log("\n✅ 全部生成完成！");
	console.log(`   文件位置: ${BOOKS_DIR}/`);
}

main().catch((err) => {
	console.error(`生成脚本出错: ${err.message}`);

	process.exit(1);
});
