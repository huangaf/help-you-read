// EPUB Blob 持久化（浏览器 IndexedDB）
// web 模式下保存导入的 EPUB 字节，使页面刷新后仍可重新打开书籍。
// Tauri 模式使用真实文件系统路径，不经过本模块。

const DB_NAME = 'hyr-epub-store';
const STORE_NAME = 'epubs';
const DB_VERSION = 1;

/** 打开（或创建）IndexedDB 数据库 */
function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
    });
}

/** 保存 EPUB Blob（key = bookId） */
export async function putEpub(bookId: string, blob: Blob): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(blob, bookId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 写入失败'));
        });
    } finally {
        db.close();
    }
}

/** 读取 EPUB Blob（key = bookId）；不存在返回 null */
export async function getEpub(bookId: string): Promise<Blob | null> {
    const db = await openDb();
    try {
        return await new Promise<Blob | null>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(bookId);
            req.onsuccess = () => {
                const result = req.result as Blob | undefined;
                resolve(result ?? null);
            };
            req.onerror = () => reject(req.error ?? new Error('IndexedDB 读取失败'));
        });
    } finally {
        db.close();
    }
}

/** 删除 EPUB Blob（key = bookId） */
export async function deleteEpub(bookId: string): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(bookId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 删除失败'));
        });
    } finally {
        db.close();
    }
}
