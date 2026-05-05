import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import WaitingPanel from './WaitingPanel'

const noop = vi.fn(async () => {})

describe('WaitingPanel', () => {
  it('renders waiting and called entries in separate sections with status-specific actions', () => {
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
        callWaiting={noop}
        completeWaiting={noop}
        onOpenKioskMode={() => {}}
      />,
    )

    expect(screen.getByText(/현재 대기/)).toBeInTheDocument()
    expect(screen.getByText(/호출 완료 \/ 입장 대기/)).toBeInTheDocument()
    expect(screen.getAllByTestId('waiting-call')).toHaveLength(1)
    expect(screen.getAllByTestId('waiting-seat')).toHaveLength(1)
  })
})
