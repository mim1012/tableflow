'use client';

import React from 'react';
import { Users, Volume2, Check, Bell, AlertTriangle, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { minutesAgo } from '../types';
import type { StaffCallRow, WaitingStatus } from '@/types/database';

interface WaitingEntry {
  id: string;
  queue_number: number;
  phone: string;
  party_size: number;
  created_at: string;
  status: WaitingStatus;
}

interface FailedWaitingNotificationEntry {
  id: string;
  waitingId: string;
  event: 'waiting_created' | 'waiting_called';
  createdAt: string;
  errorMessage: string | null;
  queueNumber: number | null;
  phone: string | null;
  waitingStatus: WaitingStatus | null;
  retryable: boolean;
}

interface WaitingPanelProps {
  waitings: WaitingEntry[];
  staffCalls: StaffCallRow[];
  failedNotifications: FailedWaitingNotificationEntry[];
  callWaiting: (waitingId: string, queueNumber: number) => Promise<void>;
  completeWaiting: (waitingId: string, queueNumber: number) => Promise<void>;
  resolveStaffCall: (staffCallId: string, optionName: string) => Promise<void>;
  retryWaitingNotification: (notificationId: string) => Promise<void>;
  getStaffCallTableLabel: (tableId: string | null) => string;
  onOpenKioskMode: () => void;
}

function WaitingList({
  title,
  accentClassName,
  emptyMessage,
  entries,
  renderAction,
}: {
  title: string;
  accentClassName: string;
  emptyMessage: string;
  entries: WaitingEntry[];
  renderAction: (waiting: WaitingEntry) => React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl md:rounded-3xl border border-zinc-200 overflow-hidden shadow-sm">
      <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <span className="font-extrabold text-zinc-800">{title} <span className={accentClassName}>{entries.length}</span>팀</span>
      </div>

      {entries.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 font-medium">
          {emptyMessage}
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          <AnimatePresence>
            {entries.map((w) => (
              <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -50 }} key={w.id} className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-zinc-50/50 transition-colors">
                <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center font-black text-xl md:text-2xl shrink-0">
                    {w.queue_number}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-black text-lg md:text-xl text-zinc-900">{w.phone.replace(/(\d{3}[-]?)\d{4}([-]?\d{4})/, '$1****$2')}</h4>
                      <span className="bg-zinc-100 text-zinc-600 text-xs font-bold px-2 py-1 rounded-md">{minutesAgo(w.created_at)}분 전 등록</span>
                    </div>
                    <p className="text-sm font-bold text-zinc-500 flex items-center gap-1"><Users className="w-4 h-4"/> 인원: {w.party_size}명</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                  {renderAction(w)}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export default function WaitingPanel({
  waitings,
  staffCalls,
  failedNotifications,
  callWaiting,
  completeWaiting,
  resolveStaffCall,
  retryWaitingNotification,
  getStaffCallTableLabel,
  onOpenKioskMode,
}: WaitingPanelProps) {
  const waitingEntries = waitings.filter((waiting) => waiting.status === 'waiting')
  const calledEntries = waitings.filter((waiting) => waiting.status === 'called')

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-zinc-900">웨이팅 관리</h2>
          <p className="text-xs md:text-sm text-zinc-500 mt-0.5 md:mt-1">직원 호출은 바로 처리하고, 대기중 고객은 호출한 뒤 입장 완료까지 이어서 관리하세요.</p>
        </div>
        <button onClick={onOpenKioskMode} className="bg-orange-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors shadow-sm self-start md:self-auto">
          웨이팅 기기 모드 띄우기
        </button>
      </div>

      <div className="bg-white rounded-2xl md:rounded-3xl border border-zinc-200 overflow-hidden shadow-sm">
        <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center justify-between">
          <span className="font-extrabold text-zinc-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> 알림 재시도 필요 <span className="text-red-500">{failedNotifications.length}</span>건
          </span>
        </div>

        {failedNotifications.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 font-medium">
            전송 실패한 웨이팅 알림이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            <AnimatePresence>
              {failedNotifications.map((notification) => (
                <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -50 }} key={notification.id} className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-start gap-4 md:gap-6 w-full md:w-auto">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="font-black text-lg md:text-xl text-zinc-900">
                          {notification.event === 'waiting_created' ? '대기 등록 알림 실패' : '입장 호출 알림 실패'}
                        </h4>
                        <span className="bg-zinc-100 text-zinc-600 text-xs font-bold px-2 py-1 rounded-md">{minutesAgo(notification.createdAt)}분 전 실패</span>
                      </div>
                      <p className="text-sm font-bold text-zinc-600">
                        대기번호 {notification.queueNumber ?? '-'} · 전화번호 {notification.phone ?? '-'}
                      </p>
                      <p className="text-sm text-red-600 break-all">{notification.errorMessage ?? '알 수 없는 오류'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button
                      data-testid="waiting-notification-retry"
                      disabled={!notification.retryable}
                      onClick={() => void retryWaitingNotification(notification.id)}
                      className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-zinc-900 text-white px-6 py-3 md:py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-colors shadow-md disabled:bg-zinc-200 disabled:text-zinc-500 disabled:shadow-none"
                    >
                      <RotateCcw className="w-4 h-4" /> {notification.retryable ? '알림 재시도' : '재시도 불가'}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl md:rounded-3xl border border-zinc-200 overflow-hidden shadow-sm">
        <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
          <span className="font-extrabold text-zinc-800 flex items-center gap-2">
            <Bell className="w-4 h-4 text-orange-500" /> 직원 호출 <span className="text-orange-500">{staffCalls.length}</span>건
          </span>
        </div>

        {staffCalls.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 font-medium">
            현재 처리할 직원 호출이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            <AnimatePresence>
              {staffCalls.map((staffCall) => (
                <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -50 }} key={staffCall.id} className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-start gap-4 md:gap-6 w-full md:w-auto">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center shrink-0">
                      <Bell className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-1">
                        <h4 className="font-black text-lg md:text-xl text-zinc-900">{staffCall.option_name}</h4>
                        <span className="bg-zinc-100 text-zinc-600 text-xs font-bold px-2 py-1 rounded-md">{minutesAgo(staffCall.requested_at)}분 전 접수</span>
                      </div>
                      <p className="text-sm font-bold text-zinc-500">{getStaffCallTableLabel(staffCall.table_id)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button data-testid="staff-call-resolve" onClick={() => void resolveStaffCall(staffCall.id, staffCall.option_name)} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-zinc-900 text-white px-6 py-3 md:py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-colors shadow-md">
                      <Check className="w-4 h-4" /> 처리 완료
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <WaitingList
        title="현재 대기"
        accentClassName="text-orange-500"
        emptyMessage="현재 대기중인 고객이 없습니다."
        entries={waitingEntries}
        renderAction={(waiting) => (
          <button data-testid="waiting-call" onClick={() => void callWaiting(waiting.id, waiting.queue_number)} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-blue-50 text-blue-600 px-4 py-3 md:py-2.5 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors">
            <Volume2 className="w-4 h-4" /> 호출하기
          </button>
        )}
      />

      <WaitingList
        title="호출 완료 / 입장 대기"
        accentClassName="text-zinc-900"
        emptyMessage="현재 호출 후 입장 대기중인 고객이 없습니다."
        entries={calledEntries}
        renderAction={(waiting) => (
          <button data-testid="waiting-seat" onClick={() => void completeWaiting(waiting.id, waiting.queue_number)} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-zinc-900 text-white px-6 py-3 md:py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-colors shadow-md">
            <Check className="w-4 h-4" /> 입장 완료
          </button>
        )}
      />
    </motion.div>
  );
}
