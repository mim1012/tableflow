'use client'

import React, { useState } from 'react'
import { Settings, Users, LayoutDashboard, UtensilsCrossed, BarChart4, QrCode, Receipt } from 'lucide-react'
import SettingsPanel, { type StaffCallOption } from '@/app/components/admin/panels/SettingsPanel'

const navItems = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'orders', label: '주문', icon: Receipt },
  { id: 'waiting', label: '웨이팅', icon: Users },
  { id: 'analytics', label: '매출 분석', icon: BarChart4 },
  { id: 'menu', label: '메뉴 관리', icon: UtensilsCrossed },
  { id: 'qr', label: 'QR', icon: QrCode },
  { id: 'settings', label: '설정', icon: Settings },
]

export default function AdminSettingsPreview() {
  const [staffCallOptions, setStaffCallOptions] = useState<StaffCallOption[]>([
    { id: 1, name: '직원만 호출' },
    { id: 2, name: '물/얼음물 주세요' },
    { id: 3, name: '물티슈 주세요' },
  ])
  const [waitingMinutesPerTeam, setWaitingMinutesPerTeam] = useState(5)
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')

  return (
    <div className="h-[100dvh] bg-zinc-50 flex flex-col lg:flex-row font-sans overflow-hidden">
      <aside className="hidden lg:flex w-64 border-r border-zinc-200 bg-white p-4 flex-col gap-2">
        <div className="px-3 py-4">
          <div className="text-lg font-black text-zinc-900">TableFlow Admin</div>
          <div className="text-xs text-zinc-500 mt-1">local preview</div>
        </div>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${item.id === 'settings' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
          >
            <item.icon className={`w-4 h-4 ${item.id === 'settings' ? 'text-orange-500' : ''}`} />
            {item.label}
          </button>
        ))}
      </aside>

      <main className="flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">
        <div className="max-w-5xl mx-auto">
          <SettingsPanel
            staffCallOptions={staffCallOptions}
            setStaffCallOptions={setStaffCallOptions}
            isStaffCallOptionsSaving={false}
            waitingMinutesPerTeam={waitingMinutesPerTeam}
            setWaitingMinutesPerTeam={setWaitingMinutesPerTeam}
            isWaitingMinutesLoading={false}
            isWaitingMinutesSaving={false}
            handleSaveWaitingMinutesPerTeam={async (e) => { e.preventDefault() }}
            pwNew={pwNew}
            setPwNew={setPwNew}
            pwConfirm={pwConfirm}
            setPwConfirm={setPwConfirm}
            pwLoading={false}
            handleChangePassword={async (e) => { e.preventDefault() }}
            handleAddCallOption={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const value = String(formData.get('name') ?? '').trim()
              if (!value) return
              setStaffCallOptions((prev) => [...prev, { id: Date.now(), name: value }])
              e.currentTarget.reset()
            }}
            handleRemoveCallOption={(id) => {
              setStaffCallOptions((prev) => prev.filter((option) => option.id !== id))
            }}
          />
        </div>
      </main>
    </div>
  )
}
