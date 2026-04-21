import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  requestNotificationPermission,
  notifyNewOrder,
  notifyOrderStatusChanged,
  __resetStaffAlertAudioContextForTests,
} from './useOrderNotification'

class MockAudioParam {
  value = 0
  setValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
}

class MockOscillatorNode {
  type = 'sine'
  frequency = new MockAudioParam()
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class MockGainNode {
  gain = new MockAudioParam()
  connect = vi.fn()
}

class MockAudioContext {
  currentTime = 1
  destination = {}
  resume = vi.fn().mockResolvedValue(undefined)
  createOscillator = vi.fn(() => new MockOscillatorNode())
  createGain = vi.fn(() => new MockGainNode())
}

const sharedAudioContext = new MockAudioContext()
const audioContextCtor = vi.fn(function MockAudioContextCtor() {
  return sharedAudioContext as unknown as AudioContext
})

describe('requestNotificationPermission', () => {
  const originalNotification = globalThis.Notification

  afterEach(() => {
    Object.defineProperty(globalThis, 'Notification', {
      value: originalNotification,
      writable: true,
      configurable: true,
    })
  })

  it('should return undefined if Notification API not available', async () => {
    // @ts-expect-error — intentionally removing Notification for test
    delete (globalThis as Record<string, unknown>).Notification
    // Also remove from window (jsdom aliases globalThis → window)
    // @ts-expect-error
    delete (window as Record<string, unknown>).Notification
    const result = await requestNotificationPermission()
    expect(result).toBeUndefined()
  })

  it('should request permission when status is default', async () => {
    const mockRequestPermission = vi.fn().mockResolvedValue('granted')
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'default', requestPermission: mockRequestPermission },
      writable: true,
      configurable: true,
    })
    const result = await requestNotificationPermission()
    expect(mockRequestPermission).toHaveBeenCalledOnce()
    expect(result).toBe('granted')
  })

  it('should return current permission if already granted', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted', requestPermission: vi.fn() },
      writable: true,
      configurable: true,
    })
    const result = await requestNotificationPermission()
    expect(result).toBe('granted')
  })

  it('should return current permission if denied', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'denied', requestPermission: vi.fn() },
      writable: true,
      configurable: true,
    })
    const result = await requestNotificationPermission()
    expect(result).toBe('denied')
  })
})

describe('notifyNewOrder', () => {
  let notificationSpy: ReturnType<typeof vi.fn>
  let vibrateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    __resetStaffAlertAudioContextForTests()
    sharedAudioContext.createOscillator.mockClear()
    sharedAudioContext.createGain.mockClear()
    sharedAudioContext.resume.mockClear()
    audioContextCtor.mockClear()
    notificationSpy = vi.fn()
    Object.defineProperty(globalThis, 'Notification', {
      value: Object.assign(notificationSpy, { permission: 'granted' }),
      writable: true,
      configurable: true,
    })
    vibrateSpy = vi.fn()
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'AudioContext', {
      value: audioContextCtor,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should play an alert tone on new order', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })

    notifyNewOrder('T1', 'order-123')
    await Promise.resolve()
    await Promise.resolve()

    expect(audioContextCtor).toHaveBeenCalled()
    expect(sharedAudioContext.createOscillator).toHaveBeenCalled()
    expect(sharedAudioContext.createGain).toHaveBeenCalled()
    expect(vibrateSpy).toHaveBeenCalledWith([200, 100, 200, 100, 400])
  })

  it('should not play an alert tone when sound is disabled', () => {
    localStorage.setItem('staff-alert-sound-enabled', 'false')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })

    notifyNewOrder('T1', 'order-123')

    expect((globalThis.AudioContext as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('should show browser notification when tab is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })

    notifyNewOrder('T1', 'order-123')
    expect(notificationSpy).toHaveBeenCalledWith(
      '새 주문 — T1',
      expect.objectContaining({ body: '주문이 접수되었습니다. 확인해주세요.' }),
    )
  })

  it('should NOT show browser notification when tab is visible', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })

    notifyNewOrder('T1')
    expect(notificationSpy).not.toHaveBeenCalled()
  })
})

describe('notifyOrderStatusChanged', () => {
  let notificationSpy: ReturnType<typeof vi.fn>
  let vibrateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __resetStaffAlertAudioContextForTests()
    notificationSpy = vi.fn()
    Object.defineProperty(globalThis, 'Notification', {
      value: Object.assign(notificationSpy, { permission: 'granted' }),
      writable: true,
      configurable: true,
    })
    vibrateSpy = vi.fn()
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should map status to Korean label', () => {
    notifyOrderStatusChanged('T1', 'order-1', 'confirmed')
    expect(notificationSpy).toHaveBeenCalledWith(
      '주문 확인됨 — T1',
      expect.objectContaining({ body: '주문 상태가 변경되었습니다.' }),
    )
  })

  it('should play a distinct alert tone for ready status', async () => {
    notifyOrderStatusChanged('T1', 'order-1', 'ready')
    await Promise.resolve()
    await Promise.resolve()

    expect(sharedAudioContext.createOscillator).toHaveBeenCalled()
    expect(vibrateSpy).toHaveBeenCalledWith([400, 100, 400])
  })

  it('should NOT vibrate for non-ready status', () => {
    notifyOrderStatusChanged('T1', 'order-1', 'confirmed')
    expect(vibrateSpy).not.toHaveBeenCalled()
  })

  it('should use raw status string for unknown statuses', () => {
    notifyOrderStatusChanged('T1', 'order-1', 'custom-status')
    expect(notificationSpy).toHaveBeenCalledWith(
      'custom-status — T1',
      expect.any(Object),
    )
  })
})
