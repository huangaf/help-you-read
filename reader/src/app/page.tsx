"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Book {
  id: string;
  title: string;
  author: string;
  format: string;
  status: string;
  totalChapters: number;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse {
  books: Book[];
}

interface UploadResponse {
  book: Book;
}

interface ErrorResponse {
  error: string;
}

export default function BookshelfPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取书籍列表
  const fetchBooks = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/books");
      if (!response.ok) {
        throw new Error("获取书籍列表失败");
      }
      const data: ApiResponse = await response.json();
      setBooks(data.books || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      console.error("Fetch books error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/books");
        if (!response.ok) {
          throw new Error("获取书籍列表失败");
        }
        const data = (await response.json()) as ApiResponse;
        setBooks(data.books || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "未知错误");
        console.error("Fetch books error:", err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // 处理文件上传
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/books", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData: ErrorResponse = await response.json();
        throw new Error(errorData.error || "上传失败");
      }

      const data: UploadResponse = await response.json();
      // 上传成功后刷新列表
      await fetchBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      // 清空 input，允许重复上传同一文件
      event.target.value = "";
    }
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // 格式化状态
  const formatStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: "待处理",
      processing: "处理中",
      ready: "就绪",
      error: "错误",
    };
    return statusMap[status] || status;
  };

  // 格式化格式
  const formatFormat = (format: string) => {
    return format.toUpperCase();
  };

  return (
    <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* 顶部标题区 */}
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
          AI 辅助阅读器
        </h1>
        <p className="text-sm md:text-base opacity-70">
          管理您的数字藏书，享受智能阅读体验
        </p>
      </header>

      {/* 上传区 */}
      <section className="mb-8">
        <div className="border-2 border-dashed border-foreground/20 rounded-lg p-6 md:p-8 text-center bg-background/50">
          <label
            htmlFor="file-upload"
            className="cursor-pointer block"
          >
            <div className="flex flex-col items-center gap-2">
              <svg
                className="w-12 h-12 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="text-sm font-medium">
                {uploading ? "上传中..." : "点击选择 EPUB 文件"}
              </span>
              <span className="text-xs opacity-50">
                支持格式：.epub
              </span>
            </div>
            <input
              id="file-upload"
              type="file"
              accept=".epub,application/epub+zip"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </section>

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 书籍列表 */}
      <section>
        <h2 className="text-xl font-semibold mb-4">我的书架</h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <svg
              className="w-16 h-16 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <p className="text-base">暂无书籍</p>
            <p className="text-sm mt-1 opacity-70">
              请上传您的第一本 EPUB 书籍
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {books.map((book) => (
              <Link
                key={book.id}
                href={`/read/${book.id}`}
                className="group block border border-foreground/10 rounded-lg p-4 hover:border-foreground/30 hover:shadow-md transition-all duration-200"
              >
                <div className="flex flex-col h-full">
                  {/* 封面占位 */}
                  <div className="aspect-[2/3] bg-foreground/5 rounded-md mb-3 flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
                    <svg
                      className="w-12 h-12 opacity-30"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      />
                    </svg>
                  </div>

                  {/* 书籍信息 */}
                  <h3 className="font-semibold text-base mb-1 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {book.title}
                  </h3>
                  <p className="text-sm opacity-70 mb-2">{book.author}</p>

                  {/* 元数据 */}
                  <div className="mt-auto pt-2 border-t border-foreground/10">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono bg-foreground/5 px-2 py-0.5 rounded">
                        {formatFormat(book.format)}
                      </span>
                      <span className="opacity-60">{formatStatus(book.status)}</span>
                    </div>
                    {book.totalChapters > 0 && (
                      <p className="text-xs opacity-50 mt-1">
                        共 {book.totalChapters} 章
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
