import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import WaitingPanel from './WaitingPanel'

const noop = vi.fn(async () => {})
const getStaffCallTableLabel = vi.fn((tableId: string | null) => (tableId ? '5번 테이블' : '테이블 미지정'))

describe('WaitingPanel', () => {
  it('renders staff calls plus waiting and called entries in separate sections with status-specific actions', () => {
    render(
      <WaitingPanel
        waitings={[
          {
            id: 'w1',
            queue_number: 1,
            phone: '01012345678',
            party_size: 2,
            created_at: '2026-05-05T10:00:00.000Z',
            status: 'waiting',
          },
          {
            id: 'w2',
            queue_number: 2,
            phone: '01087654321',
            party_size: 4,
            created_at: '2026-05-05T10:05:00.000Z',
            status: 'called',
          },
        ] as any}
        staffCalls={[
          {
            id: 'sc1',
            store_id: 'store-1',
            table_id: 'table-1',
            option_name: '물티슈 주세요',
            status: 'pending',
            requested_at: '2026-05-05T10:10:00.000Z',
            resolved_at: null,
          },
        ] as any}
        callWaiting={noop}
        completeWaiting={noop}
        resolveStaffCall={noop}
        getStaffCallTableLabel={getStaffCallTableLabel}
        onOpenKioskMode={() => {}}
      />,
    )

    expect(screen.getAllByText(/직원 호출/).length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('staff-call-resolve')).toHaveLength(1)
    expect(screen.getByText(/현재 대기/)).toBeInTheDocument()
    expect(screen.getByText(/호출 완료 \/ 입장 대기/)).toBeInTheDocument()
    expect(screen.getAllByTestId('waiting-call')).toHaveLength(1)
    expect(screen.getAllByTestId('waiting-seat')).toHaveLength(1)
  })
})
