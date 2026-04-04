import { describe, it, expect } from 'vitest'
import { canTransition, getNextStatuses } from './orderStatus'

describe('canTransition', () => {
  it('allows forward transitions', () => {
    expect(canTransition('created', 'confirmed')).toBe(true)
    expect(canTransition('confirmed', 'preparing')).toBe(true)
    expect(canTransition('preparing', 'ready')).toBe(true)
    expect(canTransition('ready', 'served')).toBe(true)
  })

  it('allows cancellation from any active state', () => {
    expect(canTransition('created', 'cancelled')).toBe(true)
    expect(canTransition('confirmed', 'cancelled')).toBe(true)
    expect(canTransition('preparing', 'cancelled')).toBe(true)
    expect(canTransition('ready', 'cancelled')).toBe(true)
  })

  it('blocks backward transitions', () => {
    expect(canTransition('served', 'created')).toBe(false)
    expect(canTransition('ready', 'confirmed')).toBe(false)
    expect(canTransition('preparing', 'created')).toBe(false)
  })

  it('blocks transitions from terminal states', () => {
    expect(canTransition('served', 'preparing')).toBe(false)
    expect(canTransition('cancelled', 'preparing')).toBe(false)
    expect(canTransition('cancelled', 'created')).toBe(false)
  })

  it('allows created → preparing (KDS 조리 시작)', () => {
    expect(canTransition('created', 'preparing')).toBe(true)
  })

  it('blocks skip transitions', () => {
    expect(canTransition('created', 'ready')).toBe(false)
    expect(canTransition('created', 'served')).toBe(false)
    expect(canTransition('confirmed', 'served')).toBe(false)
  })
})

describe('getNextStatuses', () => {
  it('returns valid next states', () => {
    expect(getNextStatuses('created')).toEqual(['confirmed', 'preparing', 'cancelled'])
    expect(getNextStatuses('preparing')).toEqual(['ready', 'cancelled'])
  })

  it('returns empty array for terminal states', () => {
    expect(getNextStatuses('served')).toEqual([])
    expect(getNextStatuses('cancelled')).toEqual([])
  })
})
