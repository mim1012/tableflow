import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import QRPanel from './QRPanel'

vi.mock('qrcode', () => ({
  default: {
    toCanvas: vi.fn().mockResolvedValue(undefined),
    toDataURL: vi.fn(async (url: string) => `data:${url}`),
  },
}))

const printSpy = vi.fn()

describe('QRPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('print', printSpy)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    vi.unstubAllGlobals()
  })


  it('includes waiting QR in 전체 인쇄 output', async () => {
    render(
      <QRPanel
        tables={[
          {
            id: 1,
            _realId: 'table-1',
            name: '홀 1',
            qrToken: 'qr-1',
            status: 'available',
            time: '',
            amount: 0,
            pax: 0,
          },
        ]}
        storeSlug="demo-store"
        onAddTable={vi.fn(async () => {})}
        onRenameTable={vi.fn(async () => {})}
        onDeleteTable={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /전체 인쇄/ }))

    await new Promise((resolve) => setTimeout(resolve, 80))

    await waitFor(() => {
      expect(document.body.querySelector('#__qr_print_all__')).toBeInTheDocument()
    })

    const printRoot = document.body.querySelector('#__qr_print_all__') as HTMLDivElement
    expect(printRoot.innerHTML).toContain('대기 접수')
    expect(printRoot.innerHTML).toContain('/waiting/demo-store')
  })
})
