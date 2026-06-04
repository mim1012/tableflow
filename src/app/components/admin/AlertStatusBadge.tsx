import React from 'react'
import { Bell, Volume2, Wifi } from 'lucide-react'
import type { PermissionState } from '@/hooks/useNotificationPermission'

type Props = {
  notificationPermission: PermissionState
  soundEnabled: boolean
  realtimeConnected?: boolean
  compact?: boolean
}

function notificationLabel(permission: PermissionState) {
  if (permission === 'granted') return '알림 허용'
  if (permission === 'denied') return '알림 차단'
  if (permission === 'unsupported') return '알림 미지원'
  return '알림 대기'
}

function statusTone(permission: PermissionState) {
  if (permission === 'granted') return 'bg-green-50 text-green-700 border-green-200'
  if (permission === 'denied') return 'bg-red-50 text-red-700 border-red-200'
  if (permission === 'unsupported') return 'bg-zinc-50 text-zinc-500 border-zinc-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

export function AlertStatusBadge({
  notificationPermission,
  soundEnabled,
  realtimeConnected = true,
  compact = false,
}: Props) {
  const notificationText = notificationLabel(notificationPermission)
  const soundText = soundEnabled ? '소리 ON' : '소리 OFF'
  const realtimeText = realtimeConnected ? '실시간 ON' : '실시간 점검'

  return (
    <div
      className={`hidden lg:flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-black ${statusTone(notificationPermission)}`}
      title={`${notificationText} · ${soundText} · ${realtimeText}`}
      aria-label={`운영 알림 상태: ${notificationText}, ${soundText}, ${realtimeText}`}
    >
      <Bell className="h-3.5 w-3.5" />
      <span>{compact ? notificationText.replace('알림 ', '') : notificationText}</span>
      <span className="h-3 w-px bg-current opacity-20" />
      <Volume2 className="h-3.5 w-3.5" />
      <span>{soundEnabled ? 'ON' : 'OFF'}</span>
      <span className="h-3 w-px bg-current opacity-20" />
      <Wifi className="h-3.5 w-3.5" />
      <span>{realtimeConnected ? 'ON' : '점검'}</span>
    </div>
  )
}
