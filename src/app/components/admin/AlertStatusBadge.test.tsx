import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlertStatusBadge } from './AlertStatusBadge'

describe('AlertStatusBadge', () => {
  it('summarizes enabled notification, sound, and realtime state', () => {
    render(
      <AlertStatusBadge
        notificationPermission="granted"
        soundEnabled={true}
        realtimeConnected={true}
      />,
    )

    expect(screen.getByLabelText('운영 알림 상태: 알림 허용, 소리 ON, 실시간 ON')).toBeInTheDocument()
    expect(screen.getByText('알림 허용')).toBeInTheDocument()
    expect(screen.getAllByText('ON')).toHaveLength(2)
  })

  it('surfaces blocked notification and disabled sound state', () => {
    render(
      <AlertStatusBadge
        notificationPermission="denied"
        soundEnabled={false}
        realtimeConnected={false}
      />,
    )

    expect(screen.getByLabelText('운영 알림 상태: 알림 차단, 소리 OFF, 실시간 점검')).toBeInTheDocument()
    expect(screen.getByText('알림 차단')).toBeInTheDocument()
    expect(screen.getByText('OFF')).toBeInTheDocument()
    expect(screen.getByText('점검')).toBeInTheDocument()
  })
})
