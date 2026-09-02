/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RightPanel from './RightPanel';

// Mock fetch
global.fetch = vi.fn();

// 测试数据
const mockBookId = 'test-book-123';
const mockNotes = [
  {
    id: 'note-1',
    bookId: mockBookId,
    type: 'I',
    content: 'RIA 便签法强调将知识转化为行动',
    sourceQuote: '读书不是为了记忆，而是为了改变',
    highlightId: null,
    chapterId: null,
    status: 'active',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'note-2',
    bookId: mockBookId,
    type: 'A1',
    content: '这让我想起之前学习的费曼技巧',
    sourceQuote: '读书不是为了记忆，而是为了改变',
    highlightId: null,
    chapterId: null,
    status: 'active',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'note-3',
    bookId: mockBookId,
    type: 'A2',
    content: '本周内用 RIA 方法重读一章书',
    sourceQuote: '读书不是为了记忆，而是为了改变',
    highlightId: null,
    chapterId: null,
    status: 'active',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
];

const mockArchive = {
  id: 'archive-1',
  bookId: mockBookId,
  purpose: '学习如何高效阅读非虚构类书籍',
  keyTakeaways: '1. 三栏阅读器促进主动阅读\n2. RIA 便签法将知识转化为行动\n3. 读书档案帮助总结核心收获',
  actionPlan: '1. 每天使用 RIA 方法阅读一章\n2. 每周整理读书档案\n3. 每月回顾行动进展',
  output: '已完成《如何阅读一本书》的阅读档案',
  aiDraft: '{"I":"...","A1":"...","A2":"..."}',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

// Mock SSE stream
function createMockSSEStream(data: string[]) {
  const encoder = new TextEncoder();
  const chunks = data.map(d => encoder.encode(`data: ${d}\n\n`));
  
  let index = 0;
  const stream = new ReadableStream({
    start(controller) {
      const push = () => {
        if (index < chunks.length) {
          controller.enqueue(chunks[index]);
          index++;
          setTimeout(push, 50);
        } else {
          controller.close();
        }
      };
      push();
    },
  });
  
  return stream;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RightPanel', () => {
  it('渲染三个标签页导航', () => {
    render(<RightPanel bookId={mockBookId} />);
    
    expect(screen.getByText('对话')).toBeInTheDocument();
    expect(screen.getByText('便签')).toBeInTheDocument();
    expect(screen.getByText('档案')).toBeInTheDocument();
  });

  it('默认显示对话标签页', () => {
    render(<RightPanel bookId={mockBookId} />);
    
    // 对话标签页应该有激活样式
    const chatTab = screen.getByText('对话');
    expect(chatTab).toHaveClass('text-blue-600');
  });

  describe('对话标签页', () => {
    it('显示输入框和发送按钮', () => {
      render(<RightPanel bookId={mockBookId} />);
      
      expect(screen.getByPlaceholderText('输入问题...（Enter 发送，Shift+Enter 换行）')).toBeInTheDocument();
      expect(screen.getByText('发送')).toBeInTheDocument();
    });

    it('切换标签页到便签', async () => {
      render(<RightPanel bookId={mockBookId} />);
      
      const notesTab = screen.getByText('便签');
      fireEvent.click(notesTab);
      
      // 便签标签页应该激活
      await waitFor(() => {
        expect(notesTab).toHaveClass('text-blue-600');
      });
    });

    it('发送消息后调用 chat API', async () => {
      // Mock SSE stream response
      const sseData = [
        JSON.stringify({ text: '这本书' }),
        JSON.stringify({ text: '主要讲了' }),
        JSON.stringify({ text: '三个要点' }),
        '[DONE]',
      ];
      
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        body: createMockSSEStream(sseData) as ReadableStream,
      } as Response);
      
      render(<RightPanel bookId={mockBookId} />);
      
      // 输入问题
      const input = screen.getByPlaceholderText('输入问题...（Enter 发送，Shift+Enter 换行）');
      fireEvent.change(input, { target: { value: '这本书讲了什么' } });
      
      // 发送
      const sendButton = screen.getByText('发送');
      fireEvent.click(sendButton);
      
      // 验证调用了 API
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/books/${mockBookId}/chat`,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });
  });

  describe('便签标签页', () => {
    beforeEach(async () => {
      // Mock notes API  BEFORE rendering
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notes: mockNotes }),
      } as Response);
      
      render(<RightPanel bookId={mockBookId} />);
      
      // 切换到便签标签页
      const notesTab = screen.getByText('便签');
      fireEvent.click(notesTab);
      
      // 等待数据加载
      await waitFor(() => {
        expect(screen.getByText('RIA 便签法强调将知识转化为行动')).toBeInTheDocument();
      });
    });

    it('显示便签列表', async () => {
      // 便签应该已经通过 beforeEach 加载
      expect(screen.getByText('RIA 便签法强调将知识转化为行动')).toBeInTheDocument();
      expect(screen.getByText('这让我想起之前学习的费曼技巧')).toBeInTheDocument();
      expect(screen.getByText('本周内用 RIA 方法重读一章书')).toBeInTheDocument();
    });

    it('按类型分组显示便签', async () => {
      // I 类型便签
      expect(screen.getByText('I - 重述')).toBeInTheDocument();
      expect(screen.getByText('A1 - 关联')).toBeInTheDocument();
      expect(screen.getByText('A2 - 行动')).toBeInTheDocument();
    });

    it('显示 sourceQuote', async () => {
      // 3 个便签都有相同的 sourceQuote（组件用弯引号包裹），按内容匹配
      const quotes = screen.getAllByText(/读书不是为了记忆，而是为了改变/);
      expect(quotes).toHaveLength(3);
    });

    it('生成 RIA 便签', async () => {
      // Mock RIA generate API
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          I: '这是关于高效阅读的方法',
          A1_question: '这与我之前学的速读技巧有何异同？',
          A2: '明天用此方法阅读一章书',
        }),
      } as Response);
      
      const riaInput = screen.getByPlaceholderText('输入原文摘录...');
      fireEvent.change(riaInput, { target: { value: 'RIA 便签法强调拆为己用' } });
      
      const generateButton = screen.getByText('生成 RIA');
      fireEvent.click(generateButton);
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/notes/generate',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quote: 'RIA 便签法强调拆为己用',
              bookId: mockBookId,
            }),
          })
        );
      });
    });
  });

  describe('档案标签页', () => {
    it('显示未生成状态和生成按钮', () => {
      render(<RightPanel bookId={mockBookId} />);
      
      // 切换到档案标签页
      const archiveTab = screen.getByText('档案');
      fireEvent.click(archiveTab);
      
      expect(screen.getByText('尚未生成读书档案')).toBeInTheDocument();
      expect(screen.getByText('生成档案')).toBeInTheDocument();
    });

    it('生成档案', async () => {
      render(<RightPanel bookId={mockBookId} />);
      
      // 切换到档案标签页
      const archiveTab = screen.getByText('档案');
      fireEvent.click(archiveTab);
      
      // Mock archive API
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ archive: mockArchive }),
      } as Response);
      
      const generateButton = screen.getByText('生成档案');
      fireEvent.click(generateButton);
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/books/${mockBookId}/archive`,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('显示已生成的档案内容', async () => {
      // Mock archive API 返回已有档案 BEFORE rendering
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ archive: mockArchive }),
      } as Response);
      
      render(<RightPanel bookId={mockBookId} />);
      
      // 切换到档案标签页
      const archiveTab = screen.getByText('档案');
      fireEvent.click(archiveTab);
      
      await waitFor(() => {
        expect(screen.getByText('核心收获')).toBeInTheDocument();
        expect(screen.getByText('行动计划')).toBeInTheDocument();
        expect(screen.getByText('输出记录')).toBeInTheDocument();
      });
    });
  });
});
