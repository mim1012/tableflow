/**
 * useOrderNotification
 * - Web Notifications API: 탭이 백그라운드여도 브라우저 알림 표시
 * - Vibration API: 모바일 진동
 * - Web Audio API: 직원용 짧은 알림음 재생
 * - 권한 요청은 최초 1회 (사용자 인터랙션 필요)
 */

type StaffAlertToneKind = 'new-order' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled'

type OrderStatus = 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled'

const STAFF_ALERT_SOUND_KEY = 'staff-alert-sound-enabled'

const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: StaffAlertToneKind }> = {
  confirmed: { label: '주문 확인됨', tone: 'confirmed' },
  preparing: { label: '조리 중', tone: 'preparing' },
  ready: { label: '조리 완료', tone: 'ready' },
  served: { label: '서빙 완료', tone: 'served' },
  cancelled: { label: '주문 취소', tone: 'cancelled' },
}

const TONE_PRESETS: Record<StaffAlertToneKind, { notes: number[]; duration: number; gap: number; gain: number; waveform: OscillatorType }> = {
  'new-order': { notes: [880, 1175], duration: 0.14, gap: 0.06, gain: 0.04, waveform: 'sine' },
  confirmed: { notes: [740], duration: 0.12, gap: 0.04, gain: 0.03, waveform: 'triangle' },
  preparing: { notes: [660], duration: 0.12, gap: 0.04, gain: 0.03, waveform: 'triangle' },
  ready: { notes: [988, 1319], duration: 0.13, gap: 0.05, gain: 0.05, waveform: 'square' },
  served: { notes: [622], duration: 0.12, gap: 0.04, gain: 0.025, waveform: 'sine' },
  cancelled: { notes: [392, 330], duration: 0.14, gap: 0.05, gain: 0.04, waveform: 'sawtooth' },
}

let staffAudioContext: AudioContext | null = null

export function isStaffAlertSoundEnabled() {
  if (typeof window === 'undefined') return true
  try {
    const stored = localStorage.getItem(STAFF_ALERT_SOUND_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

export function setStaffAlertSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STAFF_ALERT_SOUND_KEY, String(enabled))
  } catch {
    // ignore storage failures
  }
}

export async function primeStaffAlertAudio() {
  if (!isStaffAlertSoundEnabled()) return false
  return Boolean(await ensureStaffAudioContextReady())
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission()
    return result
  }
  return Notification.permission
}

export function notifyNewOrder(tableLabel: string, orderId?: string) {
  // 탭이 포커스된 경우 브라우저 알림 불필요 (toast로 충분)
  // 백그라운드이거나 다른 탭 활성화 시 브라우저 알림 표시
  notifyIfBackground(`새 주문 — ${tableLabel}`, '주문이 접수되었습니다. 확인해주세요.', orderId)

  vibrate([200, 100, 200, 100, 400])
  void playStaffAlertSound('new-order')
}

export function notifyOrderStatusChanged(tableLabel: string, orderId: string, status: string) {
  const meta = ORDER_STATUS_META[status as OrderStatus]
  const label = meta?.label ?? status

  notifyIfBackground(`${label} — ${tableLabel}`, '주문 상태가 변경되었습니다.', orderId)

  if (status === 'ready') {
    vibrate([400, 100, 400])
  } else if (status === 'cancelled') {
    vibrate([500, 100, 200, 100, 500])
  }

  if (meta) {
    void playStaffAlertSound(meta.tone)
  }
}

export async function playStaffAlertSound(kind: StaffAlertToneKind) {
  if (!isStaffAlertSoundEnabled()) return false

  const context = await ensureStaffAudioContextReady()
  if (!context) return false

  const preset = TONE_PRESETS[kind]
  const start = context.currentTime + 0.02

  preset.notes.forEach((frequency, index) => {
    const offset = index * (preset.duration + preset.gap)
    const oscillator = context.createOscillator()
    const gainNode = context.createGain()

    oscillator.type = preset.waveform
    oscillator.frequency.setValueAtTime(frequency, start + offset)
    gainNode.gain.setValueAtTime(0.0001, start + offset)
    gainNode.gain.exponentialRampToValueAtTime(preset.gain, start + offset + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + offset + preset.duration)

    oscillator.connect(gainNode)
    gainNode.connect(context.destination)
    oscillator.start(start + offset)
    oscillator.stop(start + offset + preset.duration + 0.03)
  })

  return true
}

export function __resetStaffAlertAudioContextForTests() {
  staffAudioContext = null
}

function getStaffAudioContext() {
  if (typeof window === 'undefined') return null
  if (staffAudioContext) return staffAudioContext

  const ctor = getAudioContextConstructor()
  if (!ctor) return null

  staffAudioContext = new ctor()
  return staffAudioContext
}

async function ensureStaffAudioContextReady() {
  const context = getStaffAudioContext()
  if (!context) return null

  if (context.state === 'suspended') {
    try {
      await context.resume()
    } catch {
      return null
    }
  }

  return context
}

function getAudioContextConstructor() {
  if (typeof window === 'undefined') return null
  const webWindow = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? webWindow.webkitAudioContext ?? null
}

function showBrowserNotification(title: string, body: string, orderId?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const tag = orderId ? `order-alert-${orderId}` : 'order-alert'

  new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag,        // 같은 주문ID는 덮어쓰기 방지, 다른 주문은 구분
    ...({ renotify: true } as any),
  })
}

function notifyIfBackground(title: string, body: string, orderId?: string) {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'visible' && !document.hidden) return
  showBrowserNotification(title, body, orderId)
}

function vibrate(pattern: number[]) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  navigator.vibrate(pattern)
}
