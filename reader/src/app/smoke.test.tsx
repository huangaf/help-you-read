// @vitest-environment jsdom
// 此测试需要 jsdom 环境（浏览器 DOM API），文件级覆盖 vitest.config.ts 的全局 node 环境
/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react'

describe('Smoke Test', () => {
  it('1 + 1 = 2', () => {
    expect(1 + 1).toBe(2)
  })

  it('渲染 div 并显示文本', () => {
    render(<div>你好</div>)
    expect(screen.getByText('你好')).toBeInTheDocument()
  })
})
