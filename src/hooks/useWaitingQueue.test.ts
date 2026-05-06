import { describe, expect, it } from 'vitest'

import type { WaitingRow } from '@/types/database'
import {
  applyWaitingOverrides,
  applyWaitingUpdate,
  clearConfirmedWaitingOverrides,
} from './useWaitingQueue'

function makeWaitingRow(overrides: Partial<WaitingRow>): WaitingRow {
  return {
    id: 'w1',
    store_id: 's1',
    queue_number: 1,
    phone: '01012345678',
    party_size: 2,
    status: 'waiting',
    table_id: null,
    called_at: null,
    seated_at: null,
    completed_at: null,
    created_at: '2026-05-05T10:00:00.000Z',
    ...overrides,
  }
}

describe('applyWaitingUpdate', () => {
  it('keeps called waitings in the list', () => {
    const prev = [makeWaitingRow({ id: 'w1', status: 'waiting' })]
    const updated = makeWaitingRow({ id: 'w1', status: 'called', called_at: '2026-05-05T10:01:00.000Z' })

    expect(applyWaitingUpdate(prev, updated)).toEqual([updated])
  })

  it('removes terminal waitings from the list', () => {
    const prev = [makeWaitingRow({ id: 'w1', status: 'called' })]
    const updated = makeWaitingRow({ id: 'w1', status: 'completed', completed_at: '2026-05-05T10:02:00.000Z' })

    expect(applyWaitingUpdate(prev, updated)).toEqual([])
  })

  it('adds active rows that are missing locally and keeps queue order', () => {
    const prev = [
      makeWaitingRow({ id: 'w2', queue_number: 2, status: 'called' }),
      makeWaitingRow({ id: 'w3', queue_number: 3, status: 'waiting' }),
    ]
    const updated = makeWaitingRow({ id: 'w1', queue_number: 1, status: 'called', called_at: '2026-05-05T10:01:00.000Z' })

    expect(applyWaitingUpdate(prev, updated)).toEqual([
      updated,
      prev[0],
      prev[1],
    ])
  })
})

describe('applyWaitingOverrides', () => {
  it('moves a waiting row into the called section immediately', () => {
    const waitings = [
      makeWaitingRow({ id: 'w1', queue_number: 1, status: 'waiting' }),
      makeWaitingRow({ id: 'w2', queue_number: 2, status: 'waiting' }),
    ]

    expect(applyWaitingOverrides(waitings, new Map([['w1', 'called']]))).toEqual([
      makeWaitingRow({ id: 'w1', queue_number: 1, status: 'called' }),
      makeWaitingRow({ id: 'w2', queue_number: 2, status: 'waiting' }),
    ])
  })

  it('hides a completed row before realtime removes it', () => {
    const waitings = [
      makeWaitingRow({ id: 'w1', queue_number: 1, status: 'called' }),
      makeWaitingRow({ id: 'w2', queue_number: 2, status: 'waiting' }),
    ]

    expect(applyWaitingOverrides(waitings, new Map([['w1', 'completed']]))).toEqual([
      makeWaitingRow({ id: 'w2', queue_number: 2, status: 'waiting' }),
    ])
  })
})

describe('clearConfirmedWaitingOverrides', () => {
  it('drops a called override once realtime confirms the called status', () => {
    const overrides = new Map<string, 'called' | 'completed'>([['w1', 'called']])
    const waitings = [makeWaitingRow({ id: 'w1', status: 'called' })]

    expect(clearConfirmedWaitingOverrides(overrides, waitings)).toEqual(new Map())
  })

  it('drops a completed override once realtime removes the row from the active list', () => {
    const overrides = new Map<string, 'called' | 'completed'>([['w1', 'completed']])
    const waitings = [makeWaitingRow({ id: 'w2', status: 'waiting' })]

    expect(clearConfirmedWaitingOverrides(overrides, waitings)).toEqual(new Map())
  })
})
