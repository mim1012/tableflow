import { describe, expect, it } from 'vitest'

import { getMyWaitingRouteDecision } from './session'

describe('getMyWaitingRouteDecision', () => {
  it('redirects to the matching waiting page when exactly one active waiting snapshot exists', () => {
    const storage = {
      'waiting:gangnam': JSON.stringify({
        phone: '010-1234-5678',
        pax: 2,
        queueNumber: 17,
        waitingId: 'w-1',
        waitingCount: 4,
        step: 3,
      }),
    }

    expect(getMyWaitingRouteDecision(storage)).toEqual({
      type: 'redirect',
      href: '/waiting/gangnam',
      staleKeys: [],
      entry: {
        storeSlug: 'gangnam',
        phone: '010-1234-5678',
        pax: 2,
        queueNumber: 17,
        waitingId: 'w-1',
        waitingCount: 4,
      },
    })
  })

  it('returns a chooser state when multiple active waiting snapshots exist', () => {
    const storage = {
      'waiting:gangnam': JSON.stringify({ phone: '010-1234-5678', pax: 2, queueNumber: 17, waitingId: 'w-1', waitingCount: 4, step: 3 }),
      'waiting:jamsil': JSON.stringify({ phone: '010-8765-4321', pax: 4, queueNumber: 3, waitingId: 'w-2', waitingCount: 1, step: 3 }),
    }

    expect(getMyWaitingRouteDecision(storage)).toEqual({
      type: 'choose',
      staleKeys: [],
      entries: [
        {
          storeSlug: 'gangnam',
          phone: '010-1234-5678',
          pax: 2,
          queueNumber: 17,
          waitingId: 'w-1',
          waitingCount: 4,
        },
        {
          storeSlug: 'jamsil',
          phone: '010-8765-4321',
          pax: 4,
          queueNumber: 3,
          waitingId: 'w-2',
          waitingCount: 1,
        },
      ],
    })
  })

  it('ignores incomplete or malformed snapshots and reports them as stale', () => {
    const storage = {
      'waiting:broken-json': '{oops',
      'waiting:step-two': JSON.stringify({ phone: '010-1111-2222', step: 2 }),
      'waiting:missing-id': JSON.stringify({ phone: '010-3333-4444', queueNumber: 5, step: 3 }),
    }

    expect(getMyWaitingRouteDecision(storage)).toEqual({
      type: 'empty',
      entries: [],
      staleKeys: ['waiting:broken-json', 'waiting:missing-id', 'waiting:step-two'],
    })
  })
})
