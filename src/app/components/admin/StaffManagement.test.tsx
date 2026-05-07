import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StaffManagement } from './StaffManagement'
import type { StaffMemberSummary } from '@/lib/api/staffAdmin'

const staffAdminMocks = vi.hoisted(() => ({
  getStaffMembers: vi.fn(),
  createStaffMember: vi.fn(),
  updateStaffMember: vi.fn(),
  deleteStaffMember: vi.fn(),
  setStaffMemberActive: vi.fn(),
  resetStaffPassword: vi.fn(),
}))

vi.mock('@/lib/api/staffAdmin', () => staffAdminMocks)

const members: StaffMemberSummary[] = [
  {
    id: 'member-1',
    userId: 'user-1',
    email: 'staff1@example.com',
    name: '직원1',
    role: 'staff',
    isFirstLogin: true,
    isActive: true,
    createdAt: '2026-05-07T00:00:00Z',
  },
  {
    id: 'member-2',
    userId: 'user-2',
    email: 'staff2@example.com',
    name: '매니저2',
    role: 'manager',
    isFirstLogin: false,
    isActive: false,
    createdAt: '2026-05-07T00:01:00Z',
  },
]

describe('StaffManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
    staffAdminMocks.getStaffMembers.mockResolvedValue(members)
  })

  it('shows staff identity details and management actions', async () => {
    render(<StaffManagement storeId="store-1" currentUserId="owner-1" />)

    expect(await screen.findByText('staff1@example.com')).toBeInTheDocument()
    expect(screen.getByText('직원1')).toBeInTheDocument()
    expect(screen.getByText('매니저2')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /수정/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /비밀번호 초기화/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /비활성화/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /재활성화/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /삭제/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('can reset a staff password and reveal the new temporary password', async () => {
    staffAdminMocks.resetStaffPassword.mockResolvedValue({ tempPassword: 'Temp1234!' })

    render(<StaffManagement storeId="store-1" currentUserId="owner-1" />)

    fireEvent.click((await screen.findAllByRole('button', { name: /비밀번호 초기화/i }))[0])

    await waitFor(() => {
      expect(staffAdminMocks.resetStaffPassword).toHaveBeenCalledWith('user-1', 'store-1')
    })

    expect(await screen.findByText('Temp1234!')).toBeInTheDocument()
  })
})
