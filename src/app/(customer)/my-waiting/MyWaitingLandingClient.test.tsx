import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MyWaitingLandingClient from './MyWaitingLandingClient'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

describe('MyWaitingLandingClient', () => {
  beforeEach(() => {
    replace.mockReset()
    window.sessionStorage.clear()
  })

  it('redirects to the stored waiting page when one active waiting snapshot exists', async () => {
    window.sessionStorage.setItem('waiting:gangnam', JSON.stringify({
      phone: '010-1234-5678',
      pax: 2,
      queueNumber: 17,
      waitingId: 'w-1',
      waitingCount: 4,
      step: 3,
    }))

    render(<MyWaitingLandingClient />)

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/waiting/gangnam')
    })
  })

  it('renders a chooser when multiple active waiting snapshots exist', async () => {
    window.sessionStorage.setItem('waiting:gangnam', JSON.stringify({
      phone: '010-1234-5678',
      pax: 2,
      queueNumber: 17,
      waitingId: 'w-1',
      waitingCount: 4,
      step: 3,
    }))
    window.sessionStorage.setItem('waiting:jamsil', JSON.stringify({
      phone: '010-8765-4321',
      pax: 4,
      queueNumber: 3,
      waitingId: 'w-2',
      waitingCount: 1,
      step: 3,
    }))

    render(<MyWaitingLandingClient />)

    expect(await screen.findByText('어느 매장 대기인지 선택해 주세요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /gangnam/i })).toHaveAttribute('href', '/waiting/gangnam')
    expect(screen.getByRole('link', { name: /jamsil/i })).toHaveAttribute('href', '/waiting/jamsil')
  })
})
