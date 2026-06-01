import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CustomerMenuClient, { type MenuItem } from './CustomerMenuClient'
import { createStaffCall } from '@/lib/api/staffCall'

vi.mock('@/lib/api/staffCall', () => ({
  createStaffCall: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('CustomerMenuClient staff call options', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders saved staff call options in the customer call modal', async () => {
    render(
      <CustomerMenuClient
        store={{
          id: 'store-1',
          owner_id: 'owner-1',
          name: '테스트 매장',
          slug: 'test-store',
          address: null,
          phone: null,
          logo_url: null,
          created_at: '2026-01-01T00:00:00.000Z',
          subscription_start: '2026-01-01T00:00:00.000Z',
          subscription_end: '2099-01-01T00:00:00.000Z',
          is_active: true,
        }}
        table={{
          id: 'table-1',
          store_id: 'store-1',
          table_number: 7,
          name: 'A-7',
          capacity: 4,
          status: 'available',
          qr_token: 'qr-1',
          created_at: '2026-01-01T00:00:00.000Z',
        }}
        categories={[]}
        items={[] satisfies MenuItem[]}
        staffCallOptionNames={['직원만 호출', '앞접시 주세요', '수저 더 주세요']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '호출 직원 호출' }))

    expect(screen.getByRole('button', { name: '앞접시 주세요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '수저 더 주세요' })).toBeInTheDocument()
  })

  it('creates a staff call when a customer selects an option', async () => {
    vi.mocked(createStaffCall).mockResolvedValue({ staffCallId: 'staff-call-1' })

    render(
      <CustomerMenuClient
        store={{
          id: 'store-1',
          owner_id: 'owner-1',
          name: '테스트 매장',
          slug: 'test-store',
          address: null,
          phone: null,
          logo_url: null,
          created_at: '2026-01-01T00:00:00.000Z',
          subscription_start: '2026-01-01T00:00:00.000Z',
          subscription_end: '2099-01-01T00:00:00.000Z',
          is_active: true,
        }}
        table={{
          id: 'table-1',
          store_id: 'store-1',
          table_number: 7,
          name: 'A-7',
          capacity: 4,
          status: 'available',
          qr_token: 'qr-1',
          created_at: '2026-01-01T00:00:00.000Z',
        }}
        categories={[]}
        items={[] satisfies MenuItem[]}
        staffCallOptionNames={['직원만 호출', '앞접시 주세요']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '호출 직원 호출' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '앞접시 주세요' }))
      await Promise.resolve()
    })

    expect(createStaffCall).toHaveBeenCalledWith({
      storeId: 'store-1',
      tableId: 'table-1',
      optionName: '앞접시 주세요',
    })
  })
})
